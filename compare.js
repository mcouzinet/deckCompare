// Deck Compare — results page (redesign)
(function () {
  const BOARD_LABEL = { commanders: "CMD", mainboard: "MAIN", sideboard: "SIDE" };
  // Fallback only. This is api.scryfall.com, the rate-limited API, which 302s to the CDN: the
  // preview's second try when a CDN image fails to load, never the grid's.
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
  // False while a type batch is in flight: slots without a CDN url then wait (grey) for
  // it, instead of settling as their name (see settleWaitingSlots / render).
  let TYPES_READY = false;
  // Set by initPreview; render() calls it so the preview's dedup memo cannot
  // survive into a different comparison.
  let resetPreview = () => {};
  // Set by initPreview: puts the held card away (applyFilter, when a filter hides its board).
  let dropHeld = () => {};
  // Set by initPreview: shows the card hovered while the lookup was still out (render's apply).
  let repreview = () => {};
  let heldBoard = null;
  // Bumped at each render() so in-flight lookups can tell they were superseded.
  // Deck identity is not enough: Swap twice restores the exact same objects, and
  // an old late apply must still lose to the newer render's result.
  let RENDER_GEN = 0;

  document.addEventListener("DOMContentLoaded", async () => {
    Shared.setDocumentLang();
    document.getElementById("loading").textContent = chrome.i18n.getMessage("loading");
    translateStaticUI();

    const { compareData, compareView } = await chrome.storage.local.get(["compareData", "compareView"]);
    // The saved view is set before the first paint: applied after it, grid view flashed first.
    setView(compareView || "grid", false);
    if (!compareData) {
      document.getElementById("loading").textContent = chrome.i18n.getMessage("noData");
      // Swap and Compare another act on a pair: with none, they would be dead buttons.
      document.querySelector(".edge-actions").classList.add("hide");
      document.title = "Deck Compare";
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

    // The lookup's own cache, read here: the images of every card already known start
    // loading with the first paint, where they used to wait on the whole lookup (one new
    // name held them all behind a Scryfall round trip). All known: one paint, with types.
    const known = await Shared.cachedCardTypes(allNames).catch(() => null);
    if (gen !== RENDER_GEN) return;
    if (known) {
      CARD_IMAGES = new Map(Object.entries(known.images));
      if (!known.misses.length) {
        const lands = new Set(known.lands), creatures = new Set(known.creatures);
        LAST_TYPES = { key: namesKey, lands, creatures };
        TYPES_READY = true;
        paint(deckA, deckB, cmp, lands, creatures);
        revealContent();
        return;
      }
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
      // Merged, not replaced: a failed lookup answers empty, and must not take back the
      // images the cache already gave the first paint.
      CARD_IMAGES = new Map([...CARD_IMAGES, ...types.images]);
      // Memoize only a lookup that resolved something: all-empty is the
      // background's failure shape (its catch answers empty arrays), and
      // memoizing it would stop the next render from retrying.
      if (types.lands.size || types.creatures.size || types.images.size) {
        LAST_TYPES = { key: namesKey, lands: types.lands, creatures: types.creatures };
      }
      TYPES_READY = true;
      paint(deckA, deckB, cmp, types.lands, types.creatures);
      repreview();
    };

    const lookup = fetchCardTypes(allNames);
    const types = await Promise.race([lookup, new Promise(r => setTimeout(() => r(null), 8000))]);
    if (types) { apply(types); return; }
    if (gen !== RENDER_GEN) return;   // superseded while waiting: nothing here to settle
    // Deadline hit. Scryfall's own retry backoff can legitimately take longer, so the
    // batch is slow, not dead: the waiting cards show their names now, and the result
    // still applies when it lands.
    settleWaitingSlots();
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
    // The tab says which pair it holds: several comparisons open side by side used to share
    // one fixed English title. Deck 2 first: it is the one that changes from tab to tab (deck 1
    // is usually the user's), and the tab strip cuts titles short.
    document.title = chrome.i18n.getMessage("resultsTabTitle", [deckA.name, deckB.name]);
    // These labels end in an ellipsis when a name is long: each keeps the whole as its title.
    const label = (id, text) => { const el = document.getElementById(id); el.textContent = el.title = text; };
    label("col-a-title", `${chrome.i18n.getMessage("onlyIn")} ${deckA.name}`);
    label("col-b-title", `${chrome.i18n.getMessage("onlyIn")} ${deckB.name}`);
    label("srow-head-a", deckA.name);
    label("srow-head-b", deckB.name);
    label("lg-a-label", `${chrome.i18n.getMessage("onlyIn")} ${deckA.name}`);
    label("lg-b-label", `${chrome.i18n.getMessage("onlyIn")} ${deckB.name}`);
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
      ["lg-s-label", "sharedCardsLabel"], ["lg-x-label", "surplusLabel"], ["results-heading", "resultsHeading"],
      ["exclusive-heading", "exclusiveHeading"], ["bmc-text-compare", "buyMeCoffee"],
      ["col-a-empty", "noExclusive"], ["col-b-empty", "noExclusive"], ["shared-empty", "noShared"],
      ["qty-diff-off", "showAllRows"],
      ["filter-all", "filterAll"], ["filter-commanders", "filterCommanders"],
      ["filter-mainboard", "filterMainboard"], ["filter-sideboard", "filterSideboard"],
      ["swap-text", "swapDecks"], ["another-text", "compareAnother"], ["another-go", "compare"]
    ];
    for (const [id, key] of texts) set(id, el => { el.textContent = msg(key); });

    set("rate-link", el => {
      el.textContent = msg("rateExtension");
      el.href = `https://chromewebstore.google.com/detail/${chrome.runtime.id}`;
    });
    set("bmc-link", el => { el.title = msg("buyMeCoffee"); el.setAttribute("aria-label", msg("buyMeCoffee")); });
    set("another-url", el => { el.placeholder = msg("pasteADeckUrl"); });
    set("another-saved", el => { el.setAttribute("aria-label", msg("selectDeck")); });
    for (const el of document.querySelectorAll(".zone-copy")) {
      el.title = msg("copyZoneList");
      el.querySelector(".zc-done").textContent = msg("poolCopiedLabel");
    }
    for (const [id, key] of [["view-compact", "viewCompact"], ["view-grid", "viewGrid"], ["view-list", "viewList"]]) {
      set(id, el => { el.title = msg(key); el.setAttribute("aria-label", msg(key)); });
    }
  }

  // ===== name normalization =====
  // Front-face keying (split/DFC + cross-source separator handling) lives in shared.js,
  // so the results page and any future consumer merge cards the same way.
  const normalizeName = Shared.normalizeName;

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
    // Surplus copies of shared cards, per side: with them each side's segments add up to its deck.
    const extraA = shared.reduce((s, e) => s + Math.max(0, e.aQty - e.bQty), 0);
    const extraB = shared.reduce((s, e) => s + Math.max(0, e.bQty - e.aQty), 0);

    // Count total cards (by quantity, not distinct names)
    const uniqueAQty = uniqueA.reduce((s, e) => s + e.aQty, 0);
    const uniqueBQty = uniqueB.reduce((s, e) => s + e.bQty, 0);
    const sharedQty = shared.reduce((s, e) => s + Math.min(e.aQty, e.bQty), 0);
    const totalA = uniqueAQty + shared.reduce((s, e) => s + e.aQty, 0);
    const totalB = uniqueBQty + shared.reduce((s, e) => s + e.bQty, 0);
    const deckSize = Math.max(totalA, totalB, 1);
    const similarity = Math.round((sharedQty / deckSize) * 100);

    return { similarity, deckSize, distinctShared, distinctA: uniqueA.length, distinctB: uniqueB.length,
      uniqueACount: uniqueAQty, uniqueBCount: uniqueBQty, sharedQty, qtyDiffs, extraA, extraB };
  }

  // ===== matchup header =====
  function renderMatchup(deckA, deckB, M) {
    const nameA = document.getElementById("deck-a-name");
    const nameB = document.getElementById("deck-b-name");
    nameA.textContent = nameA.title = deckA.name;   // the title is the whole of a name cut at two lines
    nameB.textContent = nameB.title = deckB.name;
    if (deckA.url) nameA.href = deckA.url;
    else nameA.removeAttribute("href");
    if (deckB.url) nameB.href = deckB.url;
    else nameB.removeAttribute("href");
    document.getElementById("deck-a-src").textContent = deckA.source || "?";
    document.getElementById("deck-b-src").textContent = deckB.source || "?";

    // The figure is debossed into the felt, so there is no ring to draw — the well is
    // the mat's own marking and the number sits in it.
    document.getElementById("ring-num").innerHTML = `${M.similarity}<span>%</span>`;
    // The noun agrees with the first number in French ("1 carte en commun sur 100"), with the
    // total in English ("1 of 100 cards in common").
    const agree = /^fr/i.test(chrome.i18n.getUILanguage()) ? M.sharedQty : M.deckSize;
    document.getElementById("ring-basis").textContent =
      chrome.i18n.getMessage(Shared.plural(agree) ? "similarityBasis" : "similarityBasisOne", [String(M.sharedQty), String(M.deckSize)]);

    // the seam across the mat: every copy of either deck, once (total card quantities)
    const total = M.uniqueACount + M.extraA + M.sharedQty + M.extraB + M.uniqueBCount || 1;
    for (const [seg, n] of [["a", M.uniqueACount], ["ax", M.extraA], ["s", M.sharedQty], ["bx", M.extraB], ["b", M.uniqueBCount]]) {
      const el = document.querySelector(`.seam-seg.${seg}`);
      el.style.flexBasis = (n / total) * 100 + "%";
      el.style.display = n ? "" : "none";   // an empty segment would still take its 2px gap
    }
    // Two measures per segment: cards counted as players count a deck (copies included) drive
    // the bar and the score, the distinct names are what the cross-compare page counts (the
    // same two decks used to read "42" here and "27" there). "Cards" means copies everywhere
    // on this page, as in the line under the figure; equal counts (singletons) show once.
    const M_ = (k) => chrome.i18n.getMessage(k);
    const legend = (copies, names) => {
      const cards = `<b>${copies}</b> ${M_(Shared.plural(copies) ? "poolCardPlural" : "poolCardSingular")}`;
      return copies === names ? cards : `${cards} · <b>${names}</b> ${M_(Shared.plural(names) ? "distinctPlural" : "distinctSingular")}`;
    };
    document.getElementById("lg-a").innerHTML = legend(M.uniqueACount, M.distinctA);
    document.getElementById("lg-s").innerHTML = legend(M.sharedQty, M.distinctShared);
    document.getElementById("lg-b").innerHTML = legend(M.uniqueBCount, M.distinctB);
    const extra = M.extraA + M.extraB;
    document.getElementById("lg-x-link").classList.toggle("hide", !extra);
    document.getElementById("lg-x").innerHTML = `<b>${extra}</b> ${M_(Shared.plural(extra) ? "poolCardPlural" : "poolCardSingular")}`;
    document.getElementById("lg-x-sw").style.background = M.extraA && M.extraB
      ? "linear-gradient(90deg, var(--a) 50%, var(--b) 50%)" : `var(--${M.extraA ? "a" : "b"})`;
  }

  // ===== card grids =====
  // One image-URL policy for grid and preview alike: the CDN `normal` (488px) the
  // /cards/collection batch cached. We used to downsize the grid to Scryfall `small`
  // (146px) on 1x displays to save bytes, but the slots render ~150–210px wide, so
  // `small` was upscaled — soft cards, unreadable text — on every non-retina monitor.
  // `normal` is sharp everywhere for ~2–3MB across the page, and matches the hover.
  function imageFor(name) {
    return CARD_IMAGES.get(name) || null;
  }

  function cardSlot(e, qtyKey) {
    const qty = e[qtyKey];
    const badge = qty > 1 ? `<span class="qty-badge">${qty}</span>` : "";
    const board = e.board !== "mainboard" ? `<span class="board-tag">${BOARD_LABEL[e.board]}</span>` : "";
    // No url: the lookup has not answered yet (the slot waits, grey) or could not resolve the
    // card (it shows its name). The grid never asks the API: when the batch failed, one request
    // per card fired some fifty at once and got the client rate-limited; and a name the batch
    // did not know (it resolves front faces, split halves, accent-free spellings) is unknown.
    const src = imageFor(e.name);
    const imgAttr = src ? `data-src="${src}"` : "";
    const state = src || !TYPES_READY ? "is-loading" : "is-proxy";
    // The label carries the count the badge shows ("4 Lightning Bolt"): a screen reader got
    // the name alone.
    return `<div class="card-slot ${state} board-${e.board}" tabindex="0" role="button"
        aria-label="${qty} ${esc(e.name)}"
        data-name="${esc(e.name)}" data-a="${e.aQty}" data-b="${e.bQty}" data-board="${e.board}" data-qty="${qty}">
        ${badge}${board}
        <span class="proxy-name">${esc(e.name)}</span>
        <img alt="" ${imgAttr}>
      </div>`;
  }

  // The type batch failed or is very late: the cards still waiting show their names.
  function settleWaitingSlots() {
    for (const img of document.querySelectorAll(".card-slot.is-loading img:not([src]):not([data-src])")) settleSlot(img, false);
  }

  function renderColumn(elId, entries, qtyKey, landSet, creatureSet) {
    const el = document.getElementById(elId);
    // Nothing to show is applyFilter's to say (a filter can empty a side too).
    if (!entries.length) { el.innerHTML = ""; return; }

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
          aria-label="${esc(chrome.i18n.getMessage("sharedRowLabel", [e.name, String(e.aQty), String(e.bQty)]))}"
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

  // An image starts when its card comes within 300px of the viewport. Native loading="lazy"
  // reaches much further ahead: it requested 48 of 80 cards (3.7 MB) with 8 on screen, and
  // the visible ones queued behind the rest. A hidden card (filter, list view) never starts.
  let lazyIO = null;
  function initLazy() {
    if (lazyIO) lazyIO.disconnect();   // a repaint replaced every image: observe the new ones
    lazyIO = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        lazyIO.unobserve(en.target);
        startImage(en.target);
      }
    }, { rootMargin: "300px 0px" });
    for (const img of document.querySelectorAll("img[data-src]")) lazyIO.observe(img);
  }
  function startImage(img) {
    const url = img.dataset.src;
    delete img.dataset.src;
    if (!url) { settleSlot(img, false); return; }
    img.decoding = "async";
    img.addEventListener("load", () => settleSlot(img, true), { once: true });
    img.addEventListener("error", () => settleSlot(img, false), { once: true });
    img.src = url;
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

    const rail = document.querySelector(".rail");
    let pendingName = null;   // hovered before the lookup gave it an image
    function show(el) {
      const name = el.dataset.name;
      // Floating (below 1080px), the held card takes the corner away from the element it
      // shows: the other side for a card, the other half height too for a full-width row.
      const r = el.getBoundingClientRect();
      rail.classList.toggle("left", r.left + r.width / 2 > innerWidth / 2);
      rail.classList.toggle("top", r.top + r.height / 2 > innerHeight / 2);
      heldBoard = el.dataset.board;
      if (name === current) return;
      const cdn = imageFor(name);
      // Still waiting on the lookup: not "no image" yet. The card held so far stays, and this
      // one shows once the lookup answers (repreview, from render's apply).
      if (!cdn && !TYPES_READY) { pendingName = name; return; }
      pendingName = null;
      current = name;
      const a = +el.dataset.a, b = +el.dataset.b;
      nameEl.textContent = name;
      const parts = [];
      if (a > 0) parts.push(`<span class="pq a">${a}× <i>${esc(CURRENT?.deckA.name ?? "")}</i></span>`);
      if (b > 0) parts.push(`<span class="pq b">${b}× <i>${esc(CURRENT?.deckB.name ?? "")}</i></span>`);
      qtyEl.innerHTML = parts.join("");

      // The CDN url resolved by the /cards/collection batch. Without one the card is unknown to
      // Scryfall (or the lookup failed): asking the rate-limited API could only 404, so the
      // stage says there is no image instead of inviting a hover that already happened.
      if (cdn) { hintEl.textContent = chrome.i18n.getMessage("clickToPreview"); load(cdn, name, false); }
      else { stage.classList.remove("has-img"); hintEl.textContent = chrome.i18n.getMessage("noCardImage"); }
    }
    const hintEl = document.getElementById("hover-hint");

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
    const hover = (el) => { clearTimeout(hoverTimer); clearTimeout(dropTimer); hoverTimer = setTimeout(() => show(el), 90); };
    const now = (el) => { clearTimeout(hoverTimer); clearTimeout(dropTimer); show(el); };

    // Below 1080px the held card floats over the page's corner (compare.html): it is put away
    // when the pointer or the focus leaves the cards, on Escape, or on a click elsewhere.
    const floating = window.matchMedia("(max-width: 1080px)");
    let dropTimer = null;
    const drop = () => {
      clearTimeout(hoverTimer);
      current = null;
      pendingName = null;
      stage.classList.remove("has-img");
      hintEl.textContent = chrome.i18n.getMessage("clickToPreview");
      nameEl.textContent = "";   // no name left under the hint as if an image had failed
      qtyEl.innerHTML = "";
    };
    const dropSoon = () => { if (floating.matches && current) { clearTimeout(dropTimer); dropTimer = setTimeout(drop, 400); } };
    dropHeld = drop;
    repreview = () => {
      if (!pendingName) return;
      const el = [...document.querySelectorAll(".card-slot, .srow")].find(x => x.dataset.name === pendingName);
      pendingName = null;
      if (el) show(el);
    };

    document.addEventListener("mouseover", e => { const el = from(e); if (el) hover(el); else dropSoon(); });
    document.addEventListener("focusin", e => { const el = from(e); if (el) hover(el); else if (floating.matches) drop(); });
    document.addEventListener("click", e => { const el = from(e); if (el) now(el); else if (floating.matches) drop(); });
    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && floating.matches) { drop(); return; }
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
    // The held card follows the filter: one from a board now hidden is put away.
    if (f !== "all" && heldBoard && heldBoard !== f) { dropHeld(); heldBoard = null; }
    const M = computeMetrics(cmp.uniqueA.filter(keep), cmp.uniqueB.filter(keep), cmp.shared.filter(keep));

    renderMatchup(deckA, deckB, M);
    // A filter changes the figure: "100 % similar" on the commanders alone read as identical
    // decks. The caption names the board it is measured on.
    const board = { commanders: "filterCommanders", mainboard: "filterMainboard", sideboard: "filterSideboard" }[f];
    document.getElementById("ring-label").textContent =
      chrome.i18n.getMessage("similar") + (board ? ` · ${chrome.i18n.getMessage(board)}` : "");
    document.getElementById("col-a-count").textContent = M.uniqueACount;
    document.getElementById("col-b-count").textContent = M.uniqueBCount;
    document.getElementById("shared-count").textContent = M.sharedQty;
    document.getElementById("qty-diff-note").textContent =
      `${M.qtyDiffs} ${M.qtyDiffs === 1 ? chrome.i18n.getMessage("qtyMismatch") : chrome.i18n.getMessage("qtyMismatches")}`;
    // No mismatch, no alarm: "0 quantity mismatches" wore the red dot for nothing (and the
    // "mismatches only" view, left on, would show an empty table).
    document.querySelector(".shared-note").classList.toggle("hide", !M.qtyDiffs);
    if (!M.qtyDiffs) setDiffsOnly(false);
    // An empty zone says so, whether the pair or the board filter emptied it.
    document.getElementById("col-a-empty").classList.toggle("hide", M.distinctA > 0);
    document.getElementById("col-b-empty").classList.toggle("hide", M.distinctB > 0);
    document.getElementById("shared-empty").classList.toggle("hide", M.distinctShared > 0);
    document.getElementById("srow-head").classList.toggle("hide", !M.distinctShared);
    for (const [zone, n] of [["a", M.uniqueACount], ["b", M.uniqueBCount], ["s", M.sharedQty]]) {
      const btn = document.querySelector(`[data-copy-zone="${zone}"]`);
      btn.disabled = !n;
      btn.setAttribute("aria-label", `${chrome.i18n.getMessage("copyZoneList")} (${n})`);
    }

    hideEmptyDividers();
  }

  // A zone's visible cards as "qty name" lines (the shared zone at the copies both decks
  // play), the sideboard after a blank line: what every deck builder imports.
  function zoneText(zone) {
    const { cmp } = CURRENT;
    const list = zone === "a" ? cmp.uniqueA : zone === "b" ? cmp.uniqueB : cmp.shared;
    const qty = (e) => zone === "a" ? e.aQty : zone === "b" ? e.bQty : Math.min(e.aQty, e.bQty);
    const shown = list.filter(e => currentFilter === "all" || e.board === currentFilter);
    const lines = (side) => shown.filter(e => (e.board === "sideboard") === side).map(e => `${qty(e)} ${e.name}`).join("\n");
    return [lines(false), lines(true)].filter(Boolean).join("\n\n");
  }

  // A type divider whose whole section is filtered out would otherwise label nothing.
  // Grids and shared groups share one container shape, so one check serves both.
  function hideEmptyDividers() {
    for (const [containerSel, itemSel, dividerClass] of [
      [".card-grid", ".card-slot", "type-divider"],
      [".srow-group", document.body.classList.contains("diffs-only") ? ".srow.diff" : ".srow", "srow-type-divider"]
    ]) {
      for (const container of document.querySelectorAll(containerSel)) {
        const empty = !container.querySelector(`${itemSel}:not(.hide)`);
        container.classList.toggle("hide", empty);
        const div = container.previousElementSibling;
        if (div && div.classList.contains(dividerClass)) div.classList.toggle("hide", empty);
      }
    }
  }

  function setDiffsOnly(on) {
    document.body.classList.toggle("diffs-only", on);
    document.querySelector(".shared-note").setAttribute("aria-pressed", String(on));
    hideEmptyDividers();
  }

  function initControls() {
    document.querySelectorAll("[data-board-filter]").forEach(btn => {
      btn.addEventListener("click", () => applyFilter(btn.dataset.boardFilter));
    });
    document.querySelector(".shared-note").addEventListener("click", () =>
      setDiffsOnly(!document.body.classList.contains("diffs-only")));
    // The surplus entry of the legend jumps to the shared table showing just those rows.
    document.getElementById("lg-x-link").addEventListener("click", () => setDiffsOnly(true));

    const flash = {};   // zone -> the timer ending its "copied!" (a re-click re-arms it)
    document.querySelectorAll("[data-copy-zone]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const zone = btn.dataset.copyZone;
        const ok = await navigator.clipboard.writeText(zoneText(zone)).then(() => true, () => false);
        if (!ok) return;   // nothing reached the clipboard: don't say it did
        btn.classList.add("copied");
        const status = document.getElementById("copy-status");
        status.textContent = "";
        setTimeout(() => { status.textContent = chrome.i18n.getMessage("poolCopiedLabel"); }, 50);
        clearTimeout(flash[zone]);
        flash[zone] = setTimeout(() => btn.classList.remove("copied"), 1200);
      });
    });

    document.querySelectorAll("[data-view]").forEach(btn => {
      btn.addEventListener("click", () => setView(btn.dataset.view, true));
    });
  }

  // The view is remembered: every result used to reopen in grid view.
  function setView(v, save) {
    if (!document.getElementById(`view-${v}`)) v = "grid";
    document.querySelectorAll("[data-view]").forEach(b => {
      const on = b.dataset.view === v;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", String(on));
    });
    document.body.classList.toggle("view-list", v === "list");
    // Compact: at least four cards a side, 72px when there is room (one more a side than the
    // grid at every width); grid and list fall back to the default of at least three.
    if (v === "compact") document.documentElement.style.setProperty("--card-w", "min(72px, calc((100% - 30px) / 4))");
    else document.documentElement.style.removeProperty("--card-w");
    if (save) chrome.storage.local.set({ compareView: v });
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
      if (open) {
        const label = document.getElementById("another-label");
        label.textContent = label.title = chrome.i18n.getMessage("anotherReplaces", [CURRENT?.deckB.name ?? ""]);
        fillSaved(); fillTabs(); input.focus();
      }
    };

    // The deck tabs already open, minus the two on screen: one click compares deck 1 to it.
    const tabsBox = document.getElementById("another-tabs");
    async function fillTabs() {
      let tabs = [];
      try { tabs = await Shared.getOpenDeckTabs(location.href); } catch (_) { /* none */ }
      const shown = [CURRENT?.deckA.url, CURRENT?.deckB.url].filter(Boolean);
      tabs = tabs.filter(t => !shown.some(u => Shared.sameDeckPage(u, t.url)));
      const oneSite = new Set(tabs.map(t => t.label)).size === 1;   // then the chip tells nothing apart
      tabsBox.innerHTML = tabs.map(t =>
        `<button type="button" class="pop-tab" data-url="${esc(t.url)}" title="${esc(t.title)}">` +
        (oneSite ? "" : `<span class="src">${esc(t.label)}</span>`) + `<span class="nm">${esc(t.title)}</span></button>`).join("");
      tabsBox.hidden = !tabs.length;
    }
    tabsBox.addEventListener("click", e => {
      const b = e.target.closest(".pop-tab");
      if (!b || go.disabled) return;
      input.value = b.dataset.url;
      go.click();
    });
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
      tabsBox.querySelectorAll(".pop-tab").forEach(b => { b.disabled = true; });
      setMsg(chrome.i18n.getMessage("fetchingSecond"));
      try {
        await Shared.requestManaBoxAccess([url]);   // from this click, before any other await (shared.js)
        const resp = await sendToBackground({ type: "FETCH_DECK", url });
        if (!resp || resp.error) {
          setMsg(`${chrome.i18n.getMessage("error")} ${resp?.error || chrome.i18n.getMessage("fetchFailed")}`, true);
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
          setDiffsOnly(false);   // a new pair starts on all its shared cards
          await render(deckA, resp.deck);
        }
      } catch (err) {
        setMsg(`${chrome.i18n.getMessage("error")} ${err.message}`, true);
      }
      go.disabled = false;
      tabsBox.querySelectorAll(".pop-tab").forEach(b => { b.disabled = false; });
    });
  }

})();
