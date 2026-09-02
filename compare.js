// Deck Compare — results page (redesign)
(function () {
  const BOARD_LABEL = { commanders: "CMD", mainboard: "MAIN", sideboard: "SIDE" };
  // Fallback only. This is api.scryfall.com — the rate-limited API, which 302s to the
  // CDN — so it is used just for cards the /cards/collection batch could not resolve
  // (or, deferred, when the batch itself fails — see promoteFallbackImages).
  const imgUrl = (name, version) =>
    `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=${version}`;
  // Escapes quotes too — esc() output is used inside HTML attributes (data-name, alt)
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  function sendToBackground(msg) {
    return new Promise(resolve => {
      chrome.runtime.sendMessage(msg, resp => {
        if (chrome.runtime.lastError) resolve(null);
        else resolve(resp);
      });
    });
  }

  // ===== boot =====
  // The pair currently on screen. Swap and "compare another" re-render from it rather
  // than opening another tab, so a second comparison no longer costs a full round trip
  // back through the popup.
  let CURRENT = null;
  let currentFilter = "all";
  // name -> Scryfall CDN url, from the same batch that resolves card types.
  let CARD_IMAGES = new Map();
  // Last resolved type lookup, keyed by the sorted name union. Swap keeps the same
  // names, so it must not pay a background round trip and a second repaint.
  let LAST_TYPES = null;
  // False while a type batch is in flight: slots without a CDN url then defer
  // their api.scryfall.com fallback instead of firing requests the repaint
  // discards seconds later (see promoteFallbackImages / render).
  let TYPES_READY = false;
  // Set by initPreview; render() calls it so the preview's dedup memo cannot
  // survive into a different comparison.
  let resetPreview = () => {};
  // Bumped at each render() so in-flight lookups can tell they were superseded.
  // Deck identity is not enough: Swap twice restores the exact same objects, and
  // an old late apply must still lose to the newer render's result.
  let RENDER_GEN = 0;

  document.addEventListener("DOMContentLoaded", async () => {
    Shared.setDocumentLang();
    document.getElementById("loading").textContent = chrome.i18n.getMessage("loading");
    translateStaticUI();

    const { compareData } = await chrome.storage.local.get("compareData");
    if (!compareData) {
      document.getElementById("loading").textContent = chrome.i18n.getMessage("noData");
      return;
    }

    // Delegated listeners and topbar wiring are page-level, not per-comparison.
    initPreview();
    initControls();
    initTopbar();

    await render(compareData.deckA, compareData.deckB);
  });

  async function render(deckA, deckB) {
    const gen = ++RENDER_GEN;
    const cmp = buildComparison(deckA, deckB);
    CURRENT = { deckA, deckB, cmp };
    resetPreview();

    const allNames = [...new Set([
      ...cmp.uniqueA.map(e => e.name),
      ...cmp.uniqueB.map(e => e.name),
      ...cmp.shared.map(e => e.name)
    ])];
    const namesKey = allNames.slice().sort().join("\n");

    // Swap (or re-comparing the same pair) cannot change the name union: reuse the
    // resolved types instead of a background round trip and a second repaint.
    if (LAST_TYPES && LAST_TYPES.key === namesKey) {
      TYPES_READY = true;
      paint(deckA, deckB, cmp, LAST_TYPES.lands, LAST_TYPES.creatures);
      revealContent();
      return;
    }

    // Paint before the network. The diff and the similarity score are computed locally,
    // so there is nothing to wait for; the type lookup only adds the Creatures/Spells/
    // Lands dividers, and both render paths already handle its absence. Waiting on it
    // meant a cold cache showed unstyled text for seconds, and a Scryfall outage showed
    // "Loading…" forever.
    TYPES_READY = false;
    paint(deckA, deckB, cmp, new Set(), new Set());
    revealContent();

    const apply = (types) => {
      // A newer render may have replaced this one while the lookup was in flight.
      if (gen !== RENDER_GEN) return;
      CARD_IMAGES = types.images;
      // Memoize only a lookup that resolved something: all-empty is the
      // background's failure shape (its catch answers empty arrays), and
      // memoizing it would stop the next render from retrying.
      if (types.lands.size || types.creatures.size || types.images.size) {
        LAST_TYPES = { key: namesKey, lands: types.lands, creatures: types.creatures };
      }
      TYPES_READY = true;
      paint(deckA, deckB, cmp, types.lands, types.creatures);
    };

    const lookup = fetchCardTypes(allNames);
    const types = await Promise.race([lookup, new Promise(r => setTimeout(() => r(null), 8000))]);
    if (types) { apply(types); return; }
    if (gen !== RENDER_GEN) return;   // superseded while waiting — nothing here to promote
    // Deadline hit. Scryfall's own retry backoff can legitimately take longer, so
    // the batch is slow, not dead: show the API fallbacks now, and still apply the
    // result when it lands — discarding a completed lookup left the whole session
    // on the rate-limited endpoint.
    promoteFallbackImages();
    lookup.then(late => { if (late) apply(late); });
  }

  function revealContent() {
    document.getElementById("loading").style.display = "none";
    document.getElementById("content").style.display = "block";
  }

  // Service worker may be sleeping on first load — retry once. resp is null only
  // when messaging failed (background always answers with arrays, even on error).
  async function fetchCardTypes(names) {
    if (!names.length) return null;
    let resp = await sendToBackground({ type: "FETCH_CARD_TYPES", names });
    if (!resp) {
      await new Promise(r => setTimeout(r, 700));
      resp = await sendToBackground({ type: "FETCH_CARD_TYPES", names });
    }
    if (!resp) return null;
    return {
      lands: new Set(resp.lands || []),
      creatures: new Set(resp.creatures || []),
      images: new Map(Object.entries(resp.images || {}))
    };
  }

  function paint(deckA, deckB, cmp, landSet, creatureSet) {
    // The rebuild below replaces the focused card's node; note it so keyboard
    // position survives the repaint instead of falling back to <body>.
    const focused = document.activeElement && document.activeElement.closest
      ? document.activeElement.closest(".card-slot, .srow") : null;
    const focusName = focused?.dataset.name;
    const focusBoard = focused?.dataset.board;

    renderColumn("col-a-body", cmp.uniqueA, "aQty", landSet, creatureSet);
    renderColumn("col-b-body", cmp.uniqueB, "bQty", landSet, creatureSet);
    renderShared(cmp.shared, landSet, creatureSet);
    document.getElementById("col-a-title").textContent = `${chrome.i18n.getMessage("onlyIn")} ${deckA.name}`;
    document.getElementById("col-b-title").textContent = `${chrome.i18n.getMessage("onlyIn")} ${deckB.name}`;
    document.getElementById("srow-head-a").textContent = deckA.name;
    document.getElementById("srow-head-b").textContent = deckB.name;
    document.getElementById("lg-a-label").textContent = `${chrome.i18n.getMessage("onlyIn")} ${deckA.name}`;
    document.getElementById("lg-b-label").textContent = `${chrome.i18n.getMessage("onlyIn")} ${deckB.name}`;
    initLazy();
    hideEmptyBoardFilters();
    // A retained filter whose board (and button) vanished with the new pair would
    // blank the whole page with no visible cause — fall back to "all".
    if (currentFilter !== "all" &&
        document.querySelector(`[data-board-filter="${currentFilter}"]`)?.classList.contains("hide")) {
      currentFilter = "all";
    }
    applyFilter(currentFilter);

    if (focusName) {
      const el = [...document.querySelectorAll(".card-slot, .srow")].find(x =>
        x.dataset.name === focusName && x.dataset.board === focusBoard && !x.classList.contains("hide"));
      el?.focus({ preventScroll: true });
    }
  }

  // Every write is null-guarded: this runs inside the DOMContentLoaded handler
  // before compareData is read, so one renamed id must cost one label, not hang
  // the whole page on "Loading…".
  function translateStaticUI() {
    const msg = (key) => chrome.i18n.getMessage(key);
    const set = (id, fn) => { const el = document.getElementById(id); if (el) fn(el); };

    const texts = [
      ["ring-label", "similar"], ["shared-title", "sharedCards"], ["srow-head-card", "card"],
      ["hover-hint", "clickToPreview"], ["footnote", "cardImages"],
      ["lg-s-label", "sharedCardsLabel"], ["results-heading", "resultsHeading"],
      ["exclusive-heading", "exclusiveHeading"], ["bmc-text-compare", "buyMeCoffee"],
      ["filter-all", "filterAll"], ["filter-commanders", "filterCommanders"],
      ["filter-mainboard", "filterMainboard"], ["filter-sideboard", "filterSideboard"],
      ["swap-text", "swapDecks"], ["another-text", "compareAnother"], ["another-go", "compare"]
    ];
    for (const [id, key] of texts) set(id, el => { el.textContent = msg(key); });

    set("rate-link", el => {
      el.textContent = msg("rateExtension");
      el.href = `https://chromewebstore.google.com/detail/${chrome.runtime.id}`;
    });
    set("bmc-link", el => { el.title = msg("buyMeCoffee"); });
    set("another-url", el => { el.placeholder = msg("pasteADeckUrl"); });
    for (const [id, key] of [["view-compact", "viewCompact"], ["view-grid", "viewGrid"], ["view-list", "viewList"]]) {
      set(id, el => { el.title = msg(key); el.setAttribute("aria-label", msg(key)); });
    }
  }

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

  // ===== comparison engine =====
  function buildComparison(deckA, deckB) {
    Shared.fixCommanderHeuristic(deckA);
    Shared.fixCommanderHeuristic(deckB);
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
    return result;
  }

  // Extracted so the board filter can recompute the same numbers over the visible
  // subset. Filtering used to hide cards while the ring, the overlap bar and the count
  // chips kept whole-deck figures, so the page contradicted itself.
  function computeMetrics(uniqueA, uniqueB, shared) {
    const distinctShared = shared.length;
    const qtyDiffs = shared.filter(e => e.aQty !== e.bQty).length;

    // Count total cards (by quantity, not distinct names)
    const uniqueAQty = uniqueA.reduce((s, e) => s + e.aQty, 0);
    const uniqueBQty = uniqueB.reduce((s, e) => s + e.bQty, 0);
    const sharedQty = shared.reduce((s, e) => s + Math.min(e.aQty, e.bQty), 0);
    const totalA = uniqueAQty + shared.reduce((s, e) => s + e.aQty, 0);
    const totalB = uniqueBQty + shared.reduce((s, e) => s + e.bQty, 0);
    const deckSize = Math.max(totalA, totalB, 1);
    const similarity = Math.round((sharedQty / deckSize) * 100);

    return { similarity, distinctShared,
      uniqueACount: uniqueAQty, uniqueBCount: uniqueBQty, sharedQty, qtyDiffs };
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

    // The figure is debossed into the felt, so there is no ring to draw — the well is
    // the mat's own marking and the number sits in it.
    document.getElementById("ring-num").innerHTML = `${M.similarity}<span>%</span>`;

    // the seam across the mat (total card quantities, not distinct names)
    const total = M.uniqueACount + M.sharedQty + M.uniqueBCount || 1;
    document.querySelector(".seam-seg.a").style.flexBasis = (M.uniqueACount / total) * 100 + "%";
    document.querySelector(".seam-seg.s").style.flexBasis = (M.sharedQty / total) * 100 + "%";
    document.querySelector(".seam-seg.b").style.flexBasis = (M.uniqueBCount / total) * 100 + "%";
    document.getElementById("lg-a").textContent = M.uniqueACount;
    document.getElementById("lg-s").textContent = M.sharedQty;
    document.getElementById("lg-b").textContent = M.uniqueBCount;
  }

  // ===== card grids =====
  // The one image-URL policy, for every consumer. The batch cache stores the CDN
  // `normal` url; Scryfall CDN paths are size-substitutable, so the grid derives
  // `small` on 1x displays where normal's extra bytes buy no sharpness (a ~150px
  // slot on a 2x display genuinely needs normal's 488px source).
  const GRID_CDN_SIZE = (window.devicePixelRatio || 1) > 1.3 ? "normal" : "small";
  function imageFor(name, want) {
    const cdn = CARD_IMAGES.get(name);
    if (!cdn) return null;
    return want === "grid" ? cdn.replace("/normal/", `/${GRID_CDN_SIZE}/`) : cdn;
  }

  function cardSlot(e, qtyKey) {
    const qty = e[qtyKey];
    const badge = qty > 1 ? `<span class="qty-badge">${qty}</span>` : "";
    const board = e.board !== "mainboard" ? `<span class="board-tag">${BOARD_LABEL[e.board]}</span>` : "";
    // While the type batch is in flight, a cache miss defers its rate-limited API
    // fallback (data-fallback-src) instead of firing a request the repaint would
    // discard; render() promotes the fallbacks only if the batch fails.
    const cdn = imageFor(e.name, "grid");
    const src = cdn || (TYPES_READY ? imgUrl(e.name, "small") : null);
    const imgAttr = src ? `data-src="${src}"` : `data-fallback-src="${imgUrl(e.name, "small")}"`;
    return `<div class="card-slot is-loading board-${e.board}" tabindex="0" role="button"
        aria-label="${esc(e.name)}"
        data-name="${esc(e.name)}" data-a="${e.aQty}" data-b="${e.bQty}" data-board="${e.board}" data-qty="${qty}">
        ${badge}${board}
        <span class="proxy-name">${esc(e.name)}</span>
        <img alt="${esc(e.name)}" ${imgAttr}>
      </div>`;
  }

  // The type batch failed or is very late: give the deferred slots their API
  // fallback so the grid still shows cards.
  function promoteFallbackImages() {
    for (const img of document.querySelectorAll("img[data-fallback-src]")) {
      img.dataset.src = img.dataset.fallbackSrc;
      delete img.dataset.fallbackSrc;
    }
    initLazy();
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
  // The counters (shared-count, qty-diff-note) belong to applyFilter, the single
  // writer of every metric-derived node — paint() ends by calling it.
  function renderShared(shared, landSet, creatureSet) {
    const body = document.getElementById("shared-body");

    const renderRow = (e) => {
      const diff = e.aQty !== e.bQty;
      const delta = e.diff > 0 ? `+${e.diff}` : e.diff < 0 ? `${e.diff}` : "=";
      const bt = e.board !== "mainboard" ? `<span class="bt">${BOARD_LABEL[e.board]}</span>` : "";
      return `<div class="srow ${diff ? "diff" : ""} board-${e.board}" tabindex="0" role="button"
          aria-label="${esc(e.name)}"
          data-name="${esc(e.name)}" data-a="${e.aQty}" data-b="${e.bQty}" data-board="${e.board}">
          <span class="qa">${e.aQty}×</span>
          <span class="nm">${esc(e.name)}${bt}</span>
          <span class="delta">${delta}</span>
          <span class="qb">${e.bQty}×</span>
        </div>`;
    };

    // Rows are grouped in a .srow-group per section — the same shape as the card
    // grids — so hideEmptyDividers needs one mechanism, not a sibling walk.
    const group = (cards) => `<div class="srow-group">${cards.map(renderRow).join("")}</div>`;

    const hasTypes = landSet.size || creatureSet.size;
    if (!hasTypes) {
      body.innerHTML = group(shared);
    } else {
      const sections = [
        { key: "creatures", cards: shared.filter(e => !landSet.has(e.name) && creatureSet.has(e.name)) },
        { key: "spells",    cards: shared.filter(e => !landSet.has(e.name) && !creatureSet.has(e.name)) },
        { key: "lands",     cards: shared.filter(e => landSet.has(e.name)) },
      ].filter(s => s.cards.length);

      const multi = sections.length > 1;
      body.innerHTML = sections.map(s =>
        `${multi ? `<div class="srow-type-divider"><span>${chrome.i18n.getMessage(s.key)}</span></div>` : ""}
        ${group(s.cards)}`
      ).join("");
    }
  }

  // ===== image loading =====
  // Images point straight at Scryfall (the manifest's img-src allows it). They used to
  // be fetched in the service worker, base64'd and messaged back, purely because the CSP
  // blocked remote images — which meant a round trip per card, a 33% size penalty from
  // base64, batches of 10 that serialised the whole grid, and a cache that lived only in
  // this page's memory, so every reload refetched everything and Scryfall started
  // answering 429. Loading them directly hands all of that to the browser: its HTTP
  // cache persists across reloads, and `loading="lazy"` only fetches what is scrolled to.
  function settleSlot(img, ok) {
    const slot = img.closest(".card-slot");
    if (!slot) return;
    slot.classList.remove("is-loading");
    if (!ok) slot.classList.add("is-proxy");
  }

  function initLazy() {
    for (const img of document.querySelectorAll("img[data-src]")) {
      const url = img.dataset.src;
      delete img.dataset.src;
      if (!url) { settleSlot(img, false); continue; }
      img.loading = "lazy";
      img.decoding = "async";
      img.addEventListener("load", () => settleSlot(img, true), { once: true });
      img.addEventListener("error", () => settleSlot(img, false), { once: true });
      img.src = url;
    }
  }

  // ===== hover preview (always loads "normal" version) =====
  // Hover, click and keyboard focus all preview. Hover alone left touch, keyboard and
  // screen-reader users with no way to see a card, while cursor:pointer on every slot
  // promised a click that did nothing.
  function initPreview() {
    const stage = document.getElementById("preview-stage");
    const img = document.getElementById("preview-img");
    const nameEl = document.getElementById("preview-name");
    const qtyEl = document.getElementById("preview-qty");
    let current = null;
    // Cleared by render(): the memo dedups within one comparison, and the same
    // name in the NEXT comparison carries different quantities and deck names.
    resetPreview = () => { current = null; };

    function show(el) {
      const name = el.dataset.name;
      if (name === current) return;
      current = name;
      const a = +el.dataset.a, b = +el.dataset.b;
      nameEl.textContent = name;
      const parts = [];
      if (a > 0) parts.push(`<span class="pq a">${a}× <i>${esc(CURRENT?.deckA.name ?? "")}</i></span>`);
      if (b > 0) parts.push(`<span class="pq b">${b}× <i>${esc(CURRENT?.deckB.name ?? "")}</i></span>`);
      qtyEl.innerHTML = parts.join("");

      // Prefer the CDN url resolved by the /cards/collection batch. The api.scryfall.com
      // endpoint is the fallback only: it is the rate-limited API, not the image host,
      // and one request per hover is what exhausted it partway across a grid.
      const cdn = imageFor(name, "preview");
      load(cdn || imgUrl(name, "normal"), name, !cdn);
    }

    // The card already on screen stays until the next one has loaded, so crossing the
    // grid no longer flashes the empty state — and a failed load leaves the previous
    // card up instead of the "click a card" hint, which read as if nothing happened.
    function load(src, name, isFallback) {
      img.dataset.for = name;
      img.onload = () => { if (img.dataset.for === current) stage.classList.add("has-img"); };
      img.onerror = () => {
        if (img.dataset.for !== current) return;
        if (!isFallback) { load(imgUrl(name, "normal"), name, true); return; }
        stage.classList.remove("has-img");   // both routes failed — show the empty stage
      };
      img.src = src;
    }

    const from = (e) => e.target.closest(".card-slot, .srow");
    // Debounced: sweeping the pointer across a column used to queue one image per card
    // it passed over. A deliberate click or keypress skips the wait.
    let hoverTimer = null;
    const hover = (el) => { clearTimeout(hoverTimer); hoverTimer = setTimeout(() => show(el), 90); };
    const now = (el) => { clearTimeout(hoverTimer); show(el); };

    document.addEventListener("mouseover", e => { const el = from(e); if (el) hover(el); });
    document.addEventListener("focusin", e => { const el = from(e); if (el) hover(el); });
    document.addEventListener("click", e => { const el = from(e); if (el) now(el); });
    document.addEventListener("keydown", e => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const el = from(e);
      if (el) { e.preventDefault(); now(el); }
    });
  }

  // ===== controls: board filter + view toggle =====
  function hideEmptyBoardFilters() {
    const boardsPresent = new Set();
    document.querySelectorAll("[data-board]").forEach(el => boardsPresent.add(el.dataset.board));
    document.querySelectorAll("[data-board-filter]").forEach(btn => {
      const f = btn.dataset.boardFilter;
      btn.classList.toggle("hide", f !== "all" && !boardsPresent.has(f));
    });
  }

  // Filtering hides cards AND restates every number derived from them. Previously only
  // the cards moved, so "Sideboard" could show 3 cards under a header reading 24, with
  // the ring still reporting whole-deck similarity.
  function applyFilter(f) {
    currentFilter = f;
    document.querySelectorAll("[data-board-filter]").forEach(b => {
      const on = b.dataset.boardFilter === f;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", String(on));
    });
    document.querySelectorAll("[data-board]").forEach(el => {
      el.classList.toggle("hide", f !== "all" && el.dataset.board !== f);
    });
    if (!CURRENT) return;

    const keep = (e) => f === "all" || e.board === f;
    const { deckA, deckB, cmp } = CURRENT;
    const M = computeMetrics(cmp.uniqueA.filter(keep), cmp.uniqueB.filter(keep), cmp.shared.filter(keep));

    renderMatchup(deckA, deckB, M);
    document.getElementById("col-a-count").textContent = M.uniqueACount;
    document.getElementById("col-b-count").textContent = M.uniqueBCount;
    document.getElementById("shared-count").textContent = M.sharedQty;
    document.getElementById("qty-diff-note").textContent =
      `${M.qtyDiffs} ${M.qtyDiffs === 1 ? chrome.i18n.getMessage("qtyMismatch") : chrome.i18n.getMessage("qtyMismatches")}`;

    hideEmptyDividers();
  }

  // A type divider whose whole section is filtered out would otherwise label nothing.
  // Grids and shared groups share one container shape, so one check serves both.
  function hideEmptyDividers() {
    for (const [containerSel, itemSel, dividerClass] of [
      [".card-grid", ".card-slot", "type-divider"],
      [".srow-group", ".srow", "srow-type-divider"]
    ]) {
      for (const container of document.querySelectorAll(containerSel)) {
        const empty = !container.querySelector(`${itemSel}:not(.hide)`);
        container.classList.toggle("hide", empty);
        const div = container.previousElementSibling;
        if (div && div.classList.contains(dividerClass)) div.classList.toggle("hide", empty);
      }
    }
  }

  function initControls() {
    document.querySelectorAll("[data-board-filter]").forEach(btn => {
      btn.addEventListener("click", () => applyFilter(btn.dataset.boardFilter));
    });

    document.querySelectorAll("[data-view]").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("[data-view]").forEach(b => {
          b.classList.remove("active");
          b.setAttribute("aria-pressed", "false");
        });
        btn.classList.add("active");
        btn.setAttribute("aria-pressed", "true");
        const v = btn.dataset.view;
        document.body.classList.toggle("view-list", v === "list");
        // Compact pins a fixed card width; grid and list fall back to the responsive default.
        if (v === "compact") document.documentElement.style.setProperty("--card-w", "96px");
        else document.documentElement.style.removeProperty("--card-w");
        chrome.storage.local.set({ compareView: v });
      });
    });

    // The choice survived nothing before: every result reopened in grid view.
    chrome.storage.local.get("compareView").then(({ compareView }) => {
      if (compareView && compareView !== "grid") document.getElementById(`view-${compareView}`)?.click();
    });
  }

  // ===== topbar: swap and compare-another ==============================================
  // The results page used to be a terminus: no way to change either deck without going
  // back to a deck tab and starting over, and every run spawned a fresh tab.
  function initTopbar() {
    const pop = document.getElementById("another-pop");
    const anotherBtn = document.getElementById("another-btn");
    const input = document.getElementById("another-url");
    const saved = document.getElementById("another-saved");
    const go = document.getElementById("another-go");
    const msg = document.getElementById("another-msg");
    const setMsg = (t, err) => { msg.textContent = t; msg.className = err ? "tb-msg err" : "tb-msg"; };

    document.getElementById("swap-btn").addEventListener("click", () => {
      if (!CURRENT) return;
      const { deckA, deckB } = CURRENT;
      render(deckB, deckA);
      chrome.storage.local.set({ compareData: { deckA: deckB, deckB: deckA } });
    });

    const openPop = (open) => {
      pop.hidden = !open;
      anotherBtn.setAttribute("aria-expanded", String(open));
      if (open) { fillSaved(); input.focus(); }
    };
    anotherBtn.addEventListener("click", () => openPop(pop.hidden));
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !pop.hidden) openPop(false); });
    document.addEventListener("click", e => {
      if (!pop.hidden && !e.target.closest("#another-pop, #another-btn")) openPop(false);
    });

    // Rebuilt on every open: decks loaded (or removed) in the popup after this
    // tab opened must show up, so no fill-once latch.
    async function fillSaved() {
      try {
        const decks = await Shared.getSavedDecks();
        Shared.populateSavedDeckSelect(saved, decks, chrome.i18n.getMessage("selectDeck"));
      } catch (_) { /* nothing saved — the URL field still works */ }
    }
    saved.addEventListener("change", () => { if (saved.value) input.value = saved.value; });
    input.addEventListener("keydown", e => { if (e.key === "Enter") go.click(); });

    go.addEventListener("click", async () => {
      const url = input.value.trim();
      if (!url) { setMsg(chrome.i18n.getMessage("pasteOrSelect"), true); return; }
      go.disabled = true;
      setMsg(chrome.i18n.getMessage("fetchingSecond"));
      try {
        const resp = await sendToBackground({ type: "FETCH_DECK", url });
        if (!resp || resp.error) {
          setMsg(`${chrome.i18n.getMessage("error")}: ${resp?.error || chrome.i18n.getMessage("fetchFailed")}`, true);
        } else {
          resp.deck.url = url;
          setMsg("");
          openPop(false);
          // Replaces deck B in place instead of opening yet another tab. Storage
          // and the button track this click, not the card-type lookup: render()
          // paints at once but keeps awaiting types, and a Swap clicked during
          // that wait must not be overwritten by this pair afterwards.
          const deckA = CURRENT.deckA;
          await chrome.storage.local.set({ compareData: { deckA, deckB: resp.deck } });
          go.disabled = false;
          await render(deckA, resp.deck);
        }
      } catch (err) {
        setMsg(`${chrome.i18n.getMessage("error")}: ${err.message}`, true);
      }
      go.disabled = false;
    });
  }

})();
