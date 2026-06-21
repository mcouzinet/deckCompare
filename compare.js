// Deck Compare — results page (redesign)
(function () {
  const BOARD_LABEL = { commanders: "CMD", mainboard: "MAIN", sideboard: "SIDE" };
  const imgUrl = (name, version) =>
    `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=${version}`;
  const esc = (s) => { const d = document.createElement("span"); d.textContent = s; return d.innerHTML; };

  function sendToBackground(msg) {
    return new Promise(resolve => {
      chrome.runtime.sendMessage(msg, resp => {
        if (chrome.runtime.lastError) resolve(null);
        else resolve(resp);
      });
    });
  }

  // ===== boot =====
  document.addEventListener("DOMContentLoaded", async () => {
    document.getElementById("loading").textContent = chrome.i18n.getMessage("loading");

    const { compareData } = await chrome.storage.local.get("compareData");
    if (!compareData) {
      document.getElementById("loading").textContent = chrome.i18n.getMessage("noData");
      return;
    }

    const { deckA, deckB } = compareData;
    const cmp = buildComparison(deckA, deckB);
    const M = cmp.metrics;

    const allNames = [...new Set([
      ...cmp.uniqueA.map(e => e.name),
      ...cmp.uniqueB.map(e => e.name),
      ...cmp.shared.map(e => e.name)
    ])];
    // Service worker may be sleeping on first load — retry once if no response
    let typeResp = await sendToBackground({ type: 'FETCH_CARD_TYPES', names: allNames });
    if (!typeResp?.lands && allNames.length) {
      await new Promise(r => setTimeout(r, 700));
      typeResp = await sendToBackground({ type: 'FETCH_CARD_TYPES', names: allNames });
    }
    const landSet = new Set(typeResp?.lands || []);
    const creatureSet = new Set(typeResp?.creatures || []);

    // Translate static UI
    document.getElementById("ring-label").textContent = chrome.i18n.getMessage("similar");
    document.getElementById("col-a-title").textContent = `${chrome.i18n.getMessage("onlyIn")} ${deckA.name}`;
    document.getElementById("col-b-title").textContent = `${chrome.i18n.getMessage("onlyIn")} ${deckB.name}`;
    document.getElementById("shared-title").textContent = chrome.i18n.getMessage("sharedCards");
    document.getElementById("srow-head-a").textContent = deckA.name;
    document.getElementById("srow-head-card").textContent = chrome.i18n.getMessage("card");
    document.getElementById("srow-head-b").textContent = deckB.name;
    document.getElementById("hover-hint").textContent = chrome.i18n.getMessage("hoverHint");
    document.getElementById("stat-title").textContent = chrome.i18n.getMessage("matchupBreakdown");
    document.getElementById("footnote").textContent = chrome.i18n.getMessage("cardImages");
    const rateLink = document.getElementById("rate-link");
    rateLink.textContent = chrome.i18n.getMessage("rateExtension");
    rateLink.href = `https://chromewebstore.google.com/detail/${chrome.runtime.id}`;

    document.getElementById("lg-a-label").textContent = `${chrome.i18n.getMessage("onlyIn")} ${deckA.name}`;
    document.getElementById("lg-s-label").textContent = chrome.i18n.getMessage("sharedCardsLabel");
    document.getElementById("lg-b-label").textContent = `${chrome.i18n.getMessage("onlyIn")} ${deckB.name}`;

    document.getElementById("loading").style.display = "none";
    document.getElementById("content").style.display = "block";

    renderMatchup(deckA, deckB, M);
    renderColumn("col-a-body", cmp.uniqueA, "aQty", landSet, creatureSet);
    renderColumn("col-b-body", cmp.uniqueB, "bQty", landSet, creatureSet);
    renderShared(cmp.shared, M, landSet, creatureSet);
    renderStats(deckA, deckB, M);
    document.getElementById("col-a-count").textContent = M.uniqueACount;
    document.getElementById("col-b-count").textContent = M.uniqueBCount;

    initLazy();
    initPreview(deckA, deckB);
    initControls();
  });

  // ===== name normalization =====
  // Strips the back-face of DFCs so "Brazen Borrower // Petty Theft" → "Brazen Borrower",
  // which matches the front-face name Scryfall returns in /cards/named and /cards/collection.
  function normalizeName(name) {
    return name.split(' // ')[0].trim();
  }

  // Normalize a board's card map: merge entries that share the same front-face name
  function normalizeBoard(cards) {
    const merged = {};
    for (const [name, qty] of Object.entries(cards)) {
      const norm = normalizeName(name);
      merged[norm] = (merged[norm] || 0) + qty;
    }
    return merged;
  }

  // Heuristic: in Commander/Duel Commander decks (~100 cards), if the sideboard
  // has only 1-2 cards and no commanders section exists, treat sideboard as commanders.
  function fixCommanderHeuristic(deck) {
    const mainCount = Object.values(deck.mainboard || {}).reduce((s, q) => s + q, 0);
    const sideCount = Object.values(deck.sideboard || {}).reduce((s, q) => s + q, 0);
    const cmdrCount = Object.values(deck.commanders || {}).reduce((s, q) => s + q, 0);

    if (cmdrCount === 0 && sideCount >= 1 && sideCount <= 2 && mainCount >= 90) {
      deck.commanders = { ...(deck.commanders || {}), ...(deck.sideboard || {}) };
      deck.sideboard = {};
    }
    return deck;
  }

  // ===== comparison engine =====
  function buildComparison(deckA, deckB) {
    fixCommanderHeuristic(deckA);
    fixCommanderHeuristic(deckB);
    const result = { uniqueA: [], uniqueB: [], shared: [] };
    for (const board of ["commanders", "mainboard", "sideboard"]) {
      const aCards = normalizeBoard(deckA[board] || {});
      const bCards = normalizeBoard(deckB[board] || {});
      const names = new Set([...Object.keys(aCards), ...Object.keys(bCards)]);
      for (const name of names) {
        const aQty = aCards[name] || 0;
        const bQty = bCards[name] || 0;
        if (aQty === 0 && bQty === 0) continue;
        const entry = { name, aQty, bQty, board, diff: aQty - bQty };
        if (aQty > 0 && bQty > 0) result.shared.push(entry);
        else if (aQty > 0) result.uniqueA.push(entry);
        else result.uniqueB.push(entry);
      }
    }
    const boardRank = { commanders: 0, mainboard: 1, sideboard: 2 };
    const sorter = (a, b) => boardRank[a.board] - boardRank[b.board] || a.name.localeCompare(b.name);
    result.uniqueA.sort(sorter);
    result.uniqueB.sort(sorter);
    result.shared.sort(sorter);

    const distinctShared = result.shared.length;
    const qtyDiffs = result.shared.filter(e => e.aQty !== e.bQty).length;

    // Count total cards (by quantity, not distinct names)
    const uniqueAQty = result.uniqueA.reduce((s, e) => s + e.aQty, 0);
    const uniqueBQty = result.uniqueB.reduce((s, e) => s + e.bQty, 0);
    const sharedQty = result.shared.reduce((s, e) => s + Math.min(e.aQty, e.bQty), 0);
    const totalA = uniqueAQty + result.shared.reduce((s, e) => s + e.aQty, 0);
    const totalB = uniqueBQty + result.shared.reduce((s, e) => s + e.bQty, 0);
    const deckSize = Math.max(totalA, totalB, 1);
    const similarity = Math.round((sharedQty / deckSize) * 100);

    result.metrics = { similarity, distinctShared,
      uniqueACount: uniqueAQty, uniqueBCount: uniqueBQty, sharedQty, qtyDiffs };
    return result;
  }

  // ===== matchup header =====
  function renderMatchup(deckA, deckB, M) {
    const nameA = document.getElementById("deck-a-name");
    const nameB = document.getElementById("deck-b-name");
    nameA.textContent = deckA.name;
    nameB.textContent = deckB.name;
    if (deckA.url) nameA.href = deckA.url;
    else nameA.removeAttribute("href");
    if (deckB.url) nameB.href = deckB.url;
    else nameB.removeAttribute("href");
    document.getElementById("deck-a-src").textContent = deckA.source || "?";
    document.getElementById("deck-b-src").textContent = deckB.source || "?";

    // similarity ring — insert SVG without destroying .ring-val
    const R = 38, C = 2 * Math.PI * R;
    const finalOffset = C * (1 - M.similarity / 100);
    const ringEl = document.getElementById("ring");
    const oldSvg = ringEl.querySelector("svg");
    if (oldSvg) oldSvg.remove();
    ringEl.insertAdjacentHTML("afterbegin", `
      <svg width="88" height="88" viewBox="0 0 88 88">
        <circle cx="44" cy="44" r="${R}" fill="none" stroke="var(--ink-3)" stroke-width="7"/>
        <circle cx="44" cy="44" r="${R}" fill="none" stroke="var(--match)" stroke-width="7"
          stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${finalOffset}"/>
      </svg>`);
    document.getElementById("ring-num").innerHTML = `${M.similarity}<span>%</span>`;

    // overlap bar (uses total card quantities, not distinct names)
    const total = M.uniqueACount + M.sharedQty + M.uniqueBCount || 1;
    document.querySelector(".overlap-seg.a").style.flexBasis = (M.uniqueACount / total) * 100 + "%";
    document.querySelector(".overlap-seg.s").style.flexBasis = (M.sharedQty / total) * 100 + "%";
    document.querySelector(".overlap-seg.b").style.flexBasis = (M.uniqueBCount / total) * 100 + "%";
    document.getElementById("lg-a").textContent = M.uniqueACount;
    document.getElementById("lg-s").textContent = M.sharedQty;
    document.getElementById("lg-b").textContent = M.uniqueBCount;
  }

  // ===== card grids =====
  function cardSlot(e, qtyKey) {
    const qty = e[qtyKey];
    const badge = qty > 1 ? `<span class="qty-badge">${qty}</span>` : "";
    const board = e.board !== "mainboard" ? `<span class="board-tag">${BOARD_LABEL[e.board]}</span>` : "";
    return `<div class="card-slot is-loading board-${e.board}"
        data-name="${esc(e.name)}" data-a="${e.aQty}" data-b="${e.bQty}" data-board="${e.board}" data-qty="${qty}">
        ${badge}${board}
        <span class="proxy-name">${esc(e.name)}</span>
        <img alt="${esc(e.name)}" data-src="${imgUrl(e.name, "small")}">
      </div>`;
  }

  function renderColumn(elId, entries, qtyKey, landSet, creatureSet) {
    const el = document.getElementById(elId);
    if (!entries.length) {
      el.innerHTML = `<div class="col-empty">${chrome.i18n.getMessage("noExclusive")}</div>`;
      return;
    }

    const hasTypes = landSet.size || creatureSet.size;
    if (!hasTypes) {
      el.innerHTML = `<div class="card-grid">${entries.map(e => cardSlot(e, qtyKey)).join("")}</div>`;
      return;
    }

    const sections = [
      { key: "creatures", cards: entries.filter(e => !landSet.has(e.name) && creatureSet.has(e.name)) },
      { key: "spells",    cards: entries.filter(e => !landSet.has(e.name) && !creatureSet.has(e.name)) },
      { key: "lands",     cards: entries.filter(e => landSet.has(e.name)) },
    ].filter(s => s.cards.length);

    const multi = sections.length > 1;
    el.innerHTML = sections.map(s =>
      `${multi ? `<div class="type-divider"><span>${chrome.i18n.getMessage(s.key)}</span></div>` : ""}
      <div class="card-grid">${s.cards.map(e => cardSlot(e, qtyKey)).join("")}</div>`
    ).join("");
  }

  // ===== shared list =====
  function renderShared(shared, M, landSet, creatureSet) {
    const body = document.getElementById("shared-body");

    const renderRow = (e) => {
      const diff = e.aQty !== e.bQty;
      const delta = e.diff > 0 ? `+${e.diff}` : e.diff < 0 ? `${e.diff}` : "=";
      const bt = e.board !== "mainboard" ? `<span class="bt">${BOARD_LABEL[e.board]}</span>` : "";
      return `<div class="srow ${diff ? "diff" : ""} board-${e.board}"
          data-name="${esc(e.name)}" data-a="${e.aQty}" data-b="${e.bQty}" data-board="${e.board}">
          <span class="qa">${e.aQty}×</span>
          <span class="nm">${esc(e.name)}${bt}</span>
          <span class="delta">${delta}</span>
          <span class="qb">${e.bQty}×</span>
        </div>`;
    };

    const hasTypes = landSet.size || creatureSet.size;
    if (!hasTypes) {
      body.innerHTML = shared.map(renderRow).join("");
    } else {
      const sections = [
        { key: "creatures", cards: shared.filter(e => !landSet.has(e.name) && creatureSet.has(e.name)) },
        { key: "spells",    cards: shared.filter(e => !landSet.has(e.name) && !creatureSet.has(e.name)) },
        { key: "lands",     cards: shared.filter(e => landSet.has(e.name)) },
      ].filter(s => s.cards.length);

      const multi = sections.length > 1;
      body.innerHTML = sections.map(s =>
        `${multi ? `<div class="srow-type-divider"><span>${chrome.i18n.getMessage(s.key)}</span></div>` : ""}
        ${s.cards.map(renderRow).join("")}`
      ).join("");
    }

    document.getElementById("shared-count").textContent = M.sharedQty;
    document.getElementById("qty-diff-note").textContent =
      `${M.qtyDiffs} ${M.qtyDiffs === 1 ? chrome.i18n.getMessage("qtyMismatch") : chrome.i18n.getMessage("qtyMismatches")}`;
  }

  // ===== stat panel =====
  function renderStats(deckA, deckB, M) {
    const rows = [
      [chrome.i18n.getMessage("matchScore"), M.similarity + "%", "accent-s", "var(--match)"],
      [chrome.i18n.getMessage("sharedCardsLabel"), M.sharedQty, "accent-s", "var(--match)"],
      [`${chrome.i18n.getMessage("onlyIn")} ${deckA.name}`, M.uniqueACount, "accent-a", "var(--a)"],
      [`${chrome.i18n.getMessage("onlyIn")} ${deckB.name}`, M.uniqueBCount, "accent-b", "var(--b)"],
      [chrome.i18n.getMessage("qtyMismatchesLabel"), M.qtyDiffs, "accent-w", "var(--warn)"],
    ];
    document.getElementById("stat-rows").innerHTML = rows.map(
      ([k, v, cls, sw]) =>
        `<div class="stat-row ${cls}"><span class="k"><span class="sw" style="background:${sw}"></span>${esc(String(k))}</span><span class="v">${v}</span></div>`
    ).join("");
  }

  // ===== image loading — 10 concurrent via background =====
  const imageCache = new Map();

  function initLazy() {
    const imgs = [...document.querySelectorAll("img[data-src]")];
    const BATCH = 10;

    function settle(img, ok) {
      const slot = img.closest(".card-slot");
      if (!slot) return;
      slot.classList.remove("is-loading");
      if (!ok) slot.classList.add("is-proxy");
    }

    async function loadOne(img) {
      const url = img.dataset.src;
      delete img.dataset.src;
      if (!url) return;

      const name = img.alt;
      let dataUrl = imageCache.get(name);
      if (!dataUrl) {
        const resp = await sendToBackground({ type: "FETCH_IMAGE", url });
        dataUrl = resp?.dataUrl;
        if (dataUrl) imageCache.set(name, dataUrl);
      }

      if (dataUrl) { img.src = dataUrl; settle(img, true); }
      else settle(img, false);
    }

    (async () => {
      for (let i = 0; i < imgs.length; i += BATCH) {
        const batch = imgs.slice(i, i + BATCH);
        await Promise.all(batch.map(loadOne));
      }
    })();
  }

  // ===== hover preview (always loads "normal" version) =====
  const previewCache = new Map();

  function initPreview(deckA, deckB) {
    const stage = document.getElementById("preview-stage");
    const img = document.getElementById("preview-img");
    const nameEl = document.getElementById("preview-name");
    const qtyEl = document.getElementById("preview-qty");
    let current = null;

    function show(el) {
      const name = el.dataset.name;
      if (name === current) return;
      current = name;
      const a = +el.dataset.a, b = +el.dataset.b;
      nameEl.textContent = name;
      const parts = [];
      if (a > 0) parts.push(`<span class="pq a">${a}× <i>${esc(deckA.name)}</i></span>`);
      if (b > 0) parts.push(`<span class="pq b">${b}× <i>${esc(deckB.name)}</i></span>`);
      qtyEl.innerHTML = parts.join("");

      stage.classList.remove("has-img");
      const cached = previewCache.get(name);
      if (cached) {
        img.src = cached;
        stage.classList.add("has-img");
      } else {
        sendToBackground({ type: "FETCH_IMAGE", url: imgUrl(name, "normal") }).then(resp => {
          if (resp?.dataUrl) {
            previewCache.set(name, resp.dataUrl);
            if (current === name) {
              img.src = resp.dataUrl;
              stage.classList.add("has-img");
            }
          }
        });
      }
    }

    document.addEventListener("mouseover", e => {
      const el = e.target.closest(".card-slot, .srow");
      if (el) show(el);
    });
  }

  // ===== controls: board filter + view toggle =====
  function initControls() {
    // Hide filter buttons for boards that have zero cards
    const boardsPresent = new Set();
    document.querySelectorAll("[data-board]").forEach(el => boardsPresent.add(el.dataset.board));
    document.querySelectorAll("[data-board-filter]").forEach(btn => {
      const f = btn.dataset.boardFilter;
      if (f !== "all" && !boardsPresent.has(f)) btn.style.display = "none";
    });

    document.querySelectorAll("[data-board-filter]").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("[data-board-filter]").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const f = btn.dataset.boardFilter;
        document.querySelectorAll("[data-board]").forEach(el => {
          el.classList.toggle("hide", f !== "all" && el.dataset.board !== f);
        });
      });
    });

    document.querySelectorAll("[data-view]").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("[data-view]").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const v = btn.dataset.view;
        if (v === "list") {
          document.body.classList.add("view-list");
        } else {
          document.body.classList.remove("view-list");
          document.documentElement.style.setProperty("--card-w",
            v === "large" ? "180px" : v === "small" ? "96px" : "130px");
        }
      });
    });
  }
})();
