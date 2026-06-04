// Deck Compare — results page (redesign)
(function () {
  const BOARD_LABEL = { commanders: "CMD", mainboard: "MAIN", sideboard: "SIDE" };
  const imgUrl = (name, version) =>
    `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=${version}`;
  const esc = (s) => { const d = document.createElement("span"); d.textContent = s; return d.innerHTML; };

  function sendToBackground(msg) {
    return new Promise(resolve => chrome.runtime.sendMessage(msg, resolve));
  }

  // ===== boot =====
  document.addEventListener("DOMContentLoaded", async () => {
    document.getElementById("loading").textContent = t("loading");

    const { compareData } = await chrome.storage.local.get("compareData");
    if (!compareData) {
      document.getElementById("loading").textContent = t("noData");
      return;
    }

    const { deckA, deckB } = compareData;
    const cmp = buildComparison(deckA, deckB);
    const M = cmp.metrics;

    // Translate static UI
    document.getElementById("ring-label").textContent = t("similar");
    document.getElementById("col-a-title").textContent = `${t("onlyIn")} ${deckA.name}`;
    document.getElementById("col-b-title").textContent = `${t("onlyIn")} ${deckB.name}`;
    document.getElementById("shared-title").textContent = t("sharedCards");
    document.getElementById("srow-head-a").textContent = deckA.name;
    document.getElementById("srow-head-card").textContent = t("card");
    document.getElementById("srow-head-b").textContent = deckB.name;
    document.getElementById("hover-hint").textContent = t("hoverHint");
    document.getElementById("stat-title").textContent = t("matchupBreakdown");
    document.getElementById("footnote").textContent = t("cardImages");
    document.getElementById("lg-a-label").textContent = `${t("onlyIn")} ${deckA.name}`;
    document.getElementById("lg-s-label").textContent = t("sharedCardsLabel");
    document.getElementById("lg-b-label").textContent = `${t("onlyIn")} ${deckB.name}`;

    document.getElementById("loading").style.display = "none";
    document.getElementById("content").style.display = "block";

    renderMatchup(deckA, deckB, M);
    renderColumn("col-a-body", cmp.uniqueA, "aQty");
    renderColumn("col-b-body", cmp.uniqueB, "bQty");
    renderShared(cmp.shared, M);
    renderStats(deckA, deckB, M);
    document.getElementById("col-a-count").textContent = M.uniqueACount;
    document.getElementById("col-b-count").textContent = M.uniqueBCount;

    initLazy();
    initPreview(deckA, deckB);
    initControls();
  });

  // ===== name normalization (DFC, split cards) =====
  // "Brazen Borrower // Petty Theft" → "Brazen Borrower"
  // "Wear // Tear" → "Wear // Tear" (split cards keep both halves)
  // Also trims whitespace
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

  // ===== comparison engine =====
  function buildComparison(deckA, deckB) {
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
    const distinctTotal = result.uniqueA.length + result.uniqueB.length + distinctShared;
    const similarity = distinctTotal ? Math.round((distinctShared / distinctTotal) * 100) : 0;
    const qtyDiffs = result.shared.filter(e => e.aQty !== e.bQty).length;

    result.metrics = { similarity, distinctShared, distinctTotal,
      uniqueACount: result.uniqueA.length, uniqueBCount: result.uniqueB.length, qtyDiffs };
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

    // overlap bar
    const total = M.uniqueACount + M.distinctShared + M.uniqueBCount || 1;
    document.querySelector(".overlap-seg.a").style.flexBasis = (M.uniqueACount / total) * 100 + "%";
    document.querySelector(".overlap-seg.s").style.flexBasis = (M.distinctShared / total) * 100 + "%";
    document.querySelector(".overlap-seg.b").style.flexBasis = (M.uniqueBCount / total) * 100 + "%";
    document.getElementById("lg-a").textContent = M.uniqueACount;
    document.getElementById("lg-s").textContent = M.distinctShared;
    document.getElementById("lg-b").textContent = M.uniqueBCount;
  }

  // ===== card grids =====
  function cardSlot(e, qtyKey) {
    const qty = e[qtyKey];
    const badge = qty > 1 ? `<span class="qty-badge">${qty}</span>` : "";
    const board = e.board !== "mainboard" ? `<span class="board-tag">${BOARD_LABEL[e.board]}</span>` : "";
    return `<div class="card-slot is-loading board-${e.board}"
        data-name="${esc(e.name)}" data-a="${e.aQty}" data-b="${e.bQty}" data-board="${e.board}">
        ${badge}${board}
        <span class="proxy-name">${esc(e.name)}</span>
        <img alt="${esc(e.name)}" data-src="${imgUrl(e.name, "small")}">
      </div>`;
  }

  function renderColumn(elId, entries, qtyKey) {
    const el = document.getElementById(elId);
    if (!entries.length) {
      el.innerHTML = `<div class="col-empty">${t("noExclusive")}</div>`;
      return;
    }
    el.innerHTML = `<div class="card-grid">${entries.map(e => cardSlot(e, qtyKey)).join("")}</div>`;
  }

  // ===== shared list =====
  function renderShared(shared, M) {
    const body = document.getElementById("shared-body");
    body.innerHTML = shared.map(e => {
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
    }).join("");
    document.getElementById("shared-count").textContent = M.distinctShared;
    document.getElementById("qty-diff-note").textContent =
      `${M.qtyDiffs} ${M.qtyDiffs === 1 ? t("qtyMismatch") : t("qtyMismatches")}`;
  }

  // ===== stat panel =====
  function renderStats(deckA, deckB, M) {
    const rows = [
      [t("matchScore"), M.similarity + "%", "accent-s", "var(--match)"],
      [t("sharedCardsLabel"), M.distinctShared, "accent-s", "var(--match)"],
      [`${t("onlyIn")} ${deckA.name}`, M.uniqueACount, "accent-a", "var(--a)"],
      [`${t("onlyIn")} ${deckB.name}`, M.uniqueBCount, "accent-b", "var(--b)"],
      [t("qtyMismatchesLabel"), M.qtyDiffs, "accent-w", "var(--warn)"],
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

    // Process in batches of BATCH
    (async () => {
      for (let i = 0; i < imgs.length; i += BATCH) {
        const batch = imgs.slice(i, i + BATCH);
        await Promise.all(batch.map(loadOne));
      }
    })();
  }

  // ===== hover preview =====
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
      const cached = imageCache.get(name);
      if (cached) {
        img.src = cached;
        stage.classList.add("has-img");
      } else {
        sendToBackground({ type: "FETCH_IMAGE", url: imgUrl(name, "normal") }).then(resp => {
          if (resp?.dataUrl && current === name) {
            img.src = resp.dataUrl;
            stage.classList.add("has-img");
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
        document.documentElement.style.setProperty("--card-w",
          v === "large" ? "118px" : v === "small" ? "74px" : "92px");
      });
    });
  }
})();
