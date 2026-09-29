// Deck Compare — pool analyzer page.
// Fetches N decklists in-browser (background FETCH_DECKS), enriches via Scryfall
// (enrich.js), analyzes (pool-analyze.js), renders card-usage across the pool.
(function () {
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const $ = (id) => document.getElementById(id);
  const M = (key, subs) => chrome.i18n.getMessage(key, subs);
  // The page markup used to be pinned to lang="fr"; the real language is the one
  // Chrome resolved for _locales.
  Shared.setDocumentLang();

  // Stash arrays/multi-line strings for copy/select buttons instead of embedding
  // them in attributes (avoids quote/newline escaping pitfalls). Reset per render.
  let payloadId = 0;
  let payloads = {};
  const stash = (v) => { const id = "p" + payloadId++; payloads[id] = v; return id; };
  const sendToBackground = (msg) =>
    new Promise((resolve) => chrome.runtime.sendMessage(msg, (r) => resolve(chrome.runtime.lastError ? null : r)));

  // ---- state ----
  let analysis = null;
  let view = "usage";
  let cat = "all";
  const selected = new Set();
  const imgByName = new Map(); // card name -> scryfall image_uri (for hover/hero art)
  const pooledDecks = []; // the editable pool (add/remove + re-analyze)
  const pastedTextsSeen = new Set(); // raw text of pasted decks currently in the pool (dedup)
  const enrichMap = new Map(); // persists across adds; only new names are fetched
  let poolErrors = [];
  const filters = [];   // card filters (mtgtop8 compare): [{ name, board, mode: "with" | "without" }]
  let activeIdx = [];   // pooledDecks indices the filters keep, in pool order; analysis deck k ↔ pooledDecks[activeIdx[k]]
  const BOARDS = ["mainboard", "sideboard", "commanders"];
  let inputExpanded = true; // once a pool exists, the input collapses to a "+ Ajouter" bar
  let seedMode = false;     // launched from an archetype button: fresh, ephemeral, not persisted
  let seedNameByUrl = null; // url -> pilot/event name, applied to the seeded decks after fetch
  let seedArchetype = null; // the mtgtop8 archetype's name: the hero's title when the decks have no commander
  // The reference: the one decklist the lists are marked against and the strip under the hero
  // measures. "mine" is the user's own list, kept outside the pool (no figure of the pool counts
  // it); a number is a pooledDecks index, a deck of the pool pinned from the rail. Hovering or
  // focusing a rail row previews that deck in the lists without changing the reference.
  let mine = null;
  let pinned = null;        // "mine" | pooledDecks index | null
  let hoverRef = null;      // same shape, while the pointer or focus is on a rail row
  let gapsOnly = false;     // "differences only": the usage view reduced to the reference's gaps
  let refStats = null;      // PoolAnalyze.compareToPool for the pinned reference (statsFor caches it per analysis)
  let inputMode = "pool";   // the popin adds decks to the pool ("pool") or sets my list ("mine")
  const MINE_KEY = Shared.POOL_MINE_KEY;        // my list, persisted on its own: it outlives any pool (the popup writes it too)
  const POOL_KEY = Shared.POOL_DECKS_KEY;       // persisted pool (survives tab close / restart)
  const FILTER_KEY = "poolFilters";             // the card filters that go with the saved pool
  const SEED_KEY = "poolSeed";                  // one-shot {url,name} list from the archetype button
  const ENRICH_TTL = 30 * 24 * 60 * 60 * 1000;  // 30 days — Scryfall card data is stable

  // Collapse the big input once a pool exists; keep it open while empty / when expanded.
  // Once a pool exists, expanding it opens the fields as a popin over the page (rather than
  // inline above the analysis) so it stays reachable no matter how far the user has scrolled.
  function applyInputState() {
    const hasPool = pooledDecks.length > 0;
    // The same popin takes my list: one link or one pasted list, its own title and button.
    const mineMode = inputMode === "mine" && hasPool && inputExpanded;
    $("intro-title").textContent = mineMode ? M("poolMineTitle") : M("poolAnalysis");
    $("intro-sub").textContent = mineMode ? M("poolMineIntro") : M("poolIntro");
    $("links-label").textContent = mineMode ? M("poolMineLinkLabel") : M("poolLinksLabel");
    $("or-paste-text").textContent = mineMode ? M("poolMineOrPaste") : M("poolOrPasteText");
    $("urls").rows = mineMode ? 1 : 5;
    $("or-saved").hidden = !mineMode;
    $("urls").placeholder = mineMode ? URLS_PLACEHOLDER.split("\n")[0] : URLS_PLACEHOLDER;
    if (mineMode) {
      Shared.getSavedDecks().then((decks) => {
        if (inputMode !== "mine") return;   // closed or switched back meanwhile
        Shared.populateSavedDeckSelect($("mine-saved"), decks, M("selectDeck"));
        $("mine-saved-label").hidden = $("mine-saved").hidden;
        $("or-saved").hidden = $("mine-saved").hidden;   // "or" only between two ways in
      });
    } else {
      $("mine-saved").hidden = true;
      $("mine-saved-label").hidden = true;
    }
    $("intro").classList.toggle("hide", hasPool && !mineMode);
    const showFields = !hasPool || inputExpanded;
    $("input-fields").classList.toggle("hide", !showFields);
    // Folded away (a pool on screen, the popin closed), the panel has nothing to show: without
    // this its padding and hairline left an empty band above the hero.
    $("input-panel").classList.toggle("hide", !showFields);
    $("fields-close").classList.toggle("hide", !(hasPool && inputExpanded));
    const asModal = hasPool && inputExpanded;
    $("input-panel").classList.toggle("modal-open", asModal);
    $("modal-backdrop").classList.toggle("hide", !asModal);
    document.body.classList.toggle("modal-locked", asModal);
    // Open over a pool, it is a dialog: named by its title (the add popin gets one: it had
    // none), and the page behind it out of reach of the keyboard, which Tab used to walk into.
    if (asModal && !mineMode) {
      $("intro").classList.remove("hide");
      $("intro-title").textContent = M("poolAddDecksBtn");
    }
    $("intro-sub").hidden = asModal && !mineMode;
    const panel = $("input-panel");
    if (asModal) {
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-modal", "true");
      panel.setAttribute("aria-labelledby", "intro-title");
    } else {
      panel.removeAttribute("role"); panel.removeAttribute("aria-modal"); panel.removeAttribute("aria-labelledby");
    }
    for (const el of [$("results"), document.querySelector(".rail"), document.querySelector(".topbar")]) if (el) el.inert = asModal;
    renderTabPicker();   // refresh whenever the input (re)appears; async, fire-and-forget
  }

  let URLS_PLACEHOLDER = "";   // the links box's own placeholder, read at boot; my list shows its first line

  // ---- open-tab picker: reuse a deck you already have open, same scan as the popup ----
  // One click appends the tab's URL to the links box; the pool is multi-deck, so several
  // tabs can be stacked before Analyze. Tabs already pooled or already staged are dropped,
  // so a chip never adds a duplicate.
  async function renderTabPicker() {
    let tabs;
    try { tabs = await Shared.getOpenDeckTabs(location.href); } catch { tabs = []; }
    const pooled = new Set(pooledDecks.map((d) => d.url).filter(Boolean));
    const staged = new Set(parseUrls());
    // Neither a deck already in the pool nor my list's own page (it stays apart from the pool).
    const taken = [...pooled, ...(mine && mine.url ? [mine.url] : [])];
    const avail = tabs.filter((t) => !staged.has(t.url) && !taken.some((u) => Shared.sameDeckPage(u, t.url)));
    if (!avail.length) { $("tabpick").classList.add("hide"); $("tabpick-list").innerHTML = ""; return; }
    $("tabpick-list").innerHTML = avail.map((t) =>
      `<button type="button" class="tabpick-item" data-tab-url="${esc(t.url)}">` +
      `<span class="src-chip">${esc(t.label)}</span>` +
      `<span class="nm">${esc(t.title)}</span></button>`
    ).join("");
    $("tabpick").classList.remove("hide");
  }

  function stageTabUrl(url) {
    const box = $("urls");
    const cur = box.value.trim();
    box.value = cur && inputMode !== "mine" ? cur + "\n" + url : url;   // my list is one deck: a tab replaces it
    inputExpanded = true;
    applyInputState();   // also re-renders the picker, dropping the chip we just staged
    updateCount();
    box.focus();
  }

  // ---- category rules (Land wins over Artifact/Enchantment) ----
  const CATS = [
    { key: "all", label: M("catAll") },
    { key: "creatures", label: M("creatures") },
    { key: "instants", label: M("catInstants") },
    { key: "artifacts", label: M("catArtifacts") },
    { key: "enchantments", label: M("catEnchantments") },
    { key: "planeswalkers", label: M("catPlaneswalkers") },
    { key: "lands", label: M("lands") },
  ];
  function matchCat(t, c) {
    t = t || "";
    if (c === "all") return true; // "All" includes everything, lands too
    if (c === "lands") return t.includes("Land");
    if (t.includes("Land")) return false; // elsewhere, a land only shows up under "Lands"
    switch (c) {
      case "creatures": return t.includes("Creature");
      case "instants": return t.includes("Instant") || t.includes("Sorcery");
      case "artifacts": return t.includes("Artifact") && !t.includes("Creature");
      case "enchantments": return t.includes("Enchantment") && !t.includes("Creature");
      case "planeswalkers": return t.includes("Planeswalker");
      default: return true;
    }
  }
  const TYPE_LABEL = { Creature: M("creatures"), Artifact: M("catArtifacts"), Enchantment: M("catEnchantments"), Planeswalker: M("catPlaneswalkers") };
  const TYPE_ORDER = ["Creature", "Instant", "Sorcery", "Artifact", "Enchantment", "Planeswalker"];
  function typeCat(t) {
    if (!t) return M("catOther");
    if (t.includes("Land")) return M("lands");
    for (const x of TYPE_ORDER) if (t.includes(x)) return x === "Instant" || x === "Sorcery" ? M("catInstants") : TYPE_LABEL[x] || x;
    return M("catOther");
  }
  const AVG_ORDER = [M("creatures"), M("catInstants"), M("catArtifacts"), M("catEnchantments"), M("catPlaneswalkers"), M("lands"), M("catOther")];

  // A deck's source as its site writes itself ("archidekt" -> "Archidekt"); a pasted list has none.
  function siteLabel(source) {
    const key = String(source || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!key || key === "text") return "";
    const site = Shared.SUPPORTED_SITES.find((s) => s.label.toLowerCase().replace(/[^a-z0-9]/g, "") === key);
    return site ? site.label : String(source);
  }

  function deckDisplayName(d) {
    // Takes either a pooled deck (`name`, where the archetype rename lands) or an
    // analysis deck ref (pool-analyze.js copies that name into `label`).
    const t = (d.label || d.name || "").trim();
    if (!t) return d.source;
    if (/^(moxfield|archidekt|mtgtop8|mtggoldfish|magic-ville|mtgdecks|melee|paird|manabox|text) deck$/i.test(t)) return d.source;
    if (/^deck \d+$/i.test(t)) return d.source;
    return t;
  }

  // ---- pasted decklist parser (for the "texts" box) ----
  function parseDecklistText(text, name) {
    const deck = { name: name || M("poolPastedDeckName"), source: "text", url: "", mainboard: {}, sideboard: {}, commanders: {} };
    const add = (b, n, q) => { if (n && q > 0) b[n] = (b[n] || 0) + q; };
    let section = "mainboard";
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      const h = line.toLowerCase().replace(/[:()]/g, "").trim();
      if (/^commanders?$|^commandants?$/.test(h)) { section = "commanders"; continue; }
      if (/^(deck|mainboard|maindeck|main|deck principal)$/.test(h)) { section = "mainboard"; continue; }
      if (/^(sideboard|réserve|reserve|companion|compagnon)$/.test(h)) { section = "sideboard"; continue; }
      const m = line.match(/^(\d+)\s*[xX]?\s+(.+)$/);
      if (m) add(deck[section], m[2].trim(), parseInt(m[1], 10));  // set code / foil / comment: Shared.normalizeDeck strips them
    }
    return Shared.fixCommanderHeuristic(Shared.normalizeDeck(deck));
  }

  // ---- input ----
  function parseUrls() {
    return $("urls").value.split(/\s+/).map((s) => s.trim()).filter((s) => /^https?:\/\//i.test(s));
  }
  function parseTexts() {
    return $("texts").value.split(/^\s*-{3,}\s*$/m).map((b) => b.trim()).filter(Boolean);
  }
  function updateCount() {
    const u = parseUrls().length, t = parseTexts().length;
    const parts = [`${u} ${u > 1 ? M("poolLinkPlural") : M("poolLinkSingular")}`];
    if (t) parts.push(`${t} ${t > 1 ? M("poolPastedPlural") : M("poolPastedSingular")}`);
    // My list is one deck: past one entry, say which one counts rather than a count that promises more.
    $("count").textContent = inputMode === "mine" ? (u + t > 1 ? M("poolMineFirstOnly") : "") : parts.join(" · ");
    $("run").disabled = u + t === 0;
    $("run").textContent = inputMode === "mine" ? M("poolMineRun") : pooledDecks.length ? M("poolAddToPoolBtn") : M("poolAnalyzeBtn");
  }

  // My list: the first link, else the first pasted list. It never joins the pool; it becomes
  // the reference, and the analysis runs again only to type its cards the pool does not play.
  async function setMine() {
    const url = parseUrls()[0];
    const text = parseTexts()[0];
    if (!url && !text) return;
    $("err").classList.add("hide");
    $("run").disabled = true;
    $("count").textContent = M("poolFetchingDecks");
    let deck = null;
    let error = "";
    // One of the decks already: it is pinned and measured against the others, not copied as my list.
    const inPool = url ? pooledDecks.findIndex((d) => d.url && Shared.sameDeckPage(d.url, url)) : -1;
    if (inPool >= 0) {
      $("urls").value = "";
      inputMode = "pool";
      inputExpanded = false;
      updateCount();
      applyInputState();
      setPinned(inPool);
      return;
    }
    if (url) {
      await Shared.requestManaBoxAccess([url]);   // from this click, before any other await (shared.js)
      const res = await sendToBackground({ type: "FETCH_DECKS", urls: [url] });
      deck = (res && res.decks && res.decks[0]) || null;
      if (res && res.errors && res.errors[0]) error = res.errors[0].error;
    } else {
      const d = parseDecklistText(text, M("poolPastedDeckName"));   // "My list" is already the strip's label
      if (Object.keys(d.mainboard).length + Object.keys(d.commanders).length) deck = d;
      else error = M("poolNoCardsRecognized");
    }
    if (!deck) {
      updateCount();
      $("err").textContent = M("poolNoDeckFetched") + (error ? " (" + error + ")" : "");
      $("err").classList.remove("hide");
      return;
    }
    mine = deck;
    pinned = "mine";
    saveMine();
    $("urls").value = "";
    $("texts").value = "";
    inputMode = "pool";
    inputExpanded = false;
    updateCount();
    applyInputState();
    await reanalyze();
  }

  // Fetch the input's URLs/texts and append them to the pool, then re-analyze.
  async function addToPool() {
    if (inputMode === "mine") return setMine();
    const urls = parseUrls();
    const texts = parseTexts();
    if (!urls.length && !texts.length) return;
    $("err").classList.add("hide");
    $("run").disabled = true;
    poolErrors = [];
    const newDecks = [];
    const existing = new Set(pooledDecks.map((d) => d.url).filter(Boolean));
    const newUrls = urls.filter((u) => !existing.has(u));
    $("loading").classList.remove("hide");
    $("loading").textContent = newUrls.length > 1 ? M("poolFetchingDecksN", [String(newUrls.length)]) : M("poolFetchingDecks");

    if (newUrls.length) {
      await Shared.requestManaBoxAccess(newUrls);   // from this click, before any other await (shared.js)
      const res = await sendToBackground({ type: "FETCH_DECKS", urls: newUrls });
      if (res && res.decks) {
        // Archetype seed: the MTGO export is nameless, so name each deck by pilot/event.
        if (seedNameByUrl) for (const d of res.decks) { const nm = seedNameByUrl.get(d.url); if (nm) d.name = nm; }
        newDecks.push(...res.decks);
      }
      if (res && res.errors) poolErrors.push(...res.errors);
    }
    texts.forEach((txt) => {
      if (pastedTextsSeen.has(txt)) return; // identical paste already in the pool
      try {
        const d = parseDecklistText(txt, `${M("poolPastedDeckName")} #${pooledDecks.length + newDecks.length + 1}`);
        if (Object.keys(d.mainboard).length + Object.keys(d.commanders).length) {
          d._rawText = txt;
          pastedTextsSeen.add(txt);
          newDecks.push(d);
        } else {
          poolErrors.push({ url: M("poolPastedDeckName"), error: M("poolNoCardsRecognized") });
        }
      } catch (e) { poolErrors.push({ url: M("poolPastedDeckName"), error: M("poolUnreadableText") }); }
    });

    if (!newDecks.length && !pooledDecks.length) {
      $("loading").classList.add("hide");
      $("run").disabled = false;
      $("err").textContent = M("poolNoDeckFetched") + (poolErrors[0] ? " (" + poolErrors[0].error + ")" : "");
      $("err").classList.remove("hide");
      return;
    }

    pooledDecks.push(...newDecks);
    savePool();
    if (inputMode === "pool") {   // the user may have closed this popin and opened my list's meanwhile
      $("urls").value = "";
      $("texts").value = "";
      inputExpanded = false;
    }
    updateCount();
    applyInputState();
    await reanalyze();
  }

  // Enrich any new names, analyze the current pool, render.
  async function reanalyze() {
    if (!pooledDecks.length) {
      if (filters.length) { filters.length = 0; saveFilters(); }   // nothing left to filter
      analysis = null;
      $("results").classList.add("hide");
      $("deck-panel").innerHTML = "";   // nothing to list, not even my list: it waits for a pool
      $("loading").classList.add("hide");
      inputMode = "pool";               // the first-run form adds decks, whatever popin was open
      inputExpanded = true;
      updateCount();
      applyInputState();
      return;
    }
    $("loading").classList.remove("hide");
    $("loading").textContent = M("poolEnriching");
    const names = new Set();
    // My list's cards too: the ones the pool does not play still need a type and an image.
    for (const d of mine ? [...pooledDecks, mine] : pooledDecks) for (const b of BOARDS) for (const n of Object.keys(d[b] || {})) names.add(n);
    let missing = [...names].filter((n) => !window.Enrich.enrichmentFor(enrichMap, n));
    if (missing.length) {
      // 1) seed from the persistent cross-session cache before hitting Scryfall
      const cached = await Shared.cacheRead("poolEnrichCache", ENRICH_TTL);
      for (const n of missing) {
        const hit = cached[n.toLowerCase()];
        if (hit && hit.nf && Date.now() - (hit.ts || 0) > 24 * 3600 * 1000) continue;   // unknown a day ago: ask again
        if (hit) for (const k of window.Enrich.nameKeys(hit.name || n)) if (!enrichMap.has(k)) enrichMap.set(k, hit);
      }
      // 2) fetch only what's still unknown, then persist the new entries
      missing = [...names].filter((n) => !window.Enrich.enrichmentFor(enrichMap, n));
      if (missing.length) {
        // First load: the decks are already here, so their usage shows at once while Scryfall
        // answers (a blank page with one grey line lasted seconds); types, images and the curve
        // fill in with the second render. Adding decks to a pool on screen keeps the old one up.
        if (!analysis) analyzeAndRender(true);
        const m2 = await window.Enrich.enrichCards(missing, (done, total) => {
          $("loading").textContent = M("poolEnrichingProgress", [String(done), String(total)]);
        });
        const toCache = {};
        for (const [k, v] of m2) { if (!enrichMap.has(k)) enrichMap.set(k, v); toCache[k] = v; }
        // A name Scryfall does not know (a token such as "Soldier") is remembered as such for a
        // day: it cost a lookup, and a "1 / 1" flash of the loading line, on every open.
        for (const n of missing) {
          if (!window.Enrich.isUnknown(n) || window.Enrich.enrichmentFor(enrichMap, n)) continue;
          const stub = { name: n, nf: true };
          enrichMap.set(n.toLowerCase(), stub);
          toCache[n.toLowerCase()] = stub;
        }
        await Shared.cacheMerge("poolEnrichCache", toCache, ENRICH_TTL);
      }
    }
    analyzeAndRender(false);
  }

  // The filters pick the subset that gets analyzed; the rest stays in the pool, struck
  // through in the rail, one chip away from coming back. Enrichment covers the whole pool,
  // so toggling a filter never fetches. `early`: Scryfall has not answered yet, the loading
  // line stays over the results.
  function analyzeAndRender(early) {
    activeIdx = [];
    pooledDecks.forEach((d, i) => { if (window.PoolAnalyze.matchesFilters(d, filters)) activeIdx.push(i); });
    analysis = window.PoolAnalyze.analyzePool(activeIdx.map((i) => pooledDecks[i]), enrichMap, poolErrors.slice());

    imgByName.clear();
    for (const c of [...analysis.cardStats, ...analysis.sideboardStats]) if (c.image_uri) imgByName.set(c.name, c.image_uri);
    for (const cm of analysis.commanders) if (cm.card && cm.card.image_uri) imgByName.set(cm.card.name, cm.card.image_uri);

    $("loading").classList.toggle("hide", !early);
    $("results").classList.remove("hide");
    renderAll();
  }

  async function removeDeck(idx) {
    if (idx >= 0 && idx < pooledDecks.length) {
      const [removed] = pooledDecks.splice(idx, 1);
      if (removed && removed._rawText) pastedTextsSeen.delete(removed._rawText);
      // The reference follows its deck: gone with it, or one place up with the rest.
      if (pinned === idx) { pinned = null; gapsOnly = false; }
      else if (typeof pinned === "number" && pinned > idx) pinned--;
      endPreview();   // a pending preview would name a row that has moved
      const inRail = document.activeElement && document.activeElement.closest && document.activeElement.closest("#deck-panel");
      savePool();
      await reanalyze();
      announce(M("poolDeckRemoved"));
      // The list is rebuilt: focus fell to the page. It goes to the row now in that place (the
      // next deck, or the last one), else to adding decks.
      if (inRail) {
        const xs = document.querySelectorAll("#deck-panel [data-rmdeck]");
        const to = xs[Math.min(idx, xs.length - 1)] || document.querySelector("#deck-panel .dp-add") || $("urls");
        if (to) to.focus();
      }
    }
  }

  // ---- card filters (mtgtop8 compare's ✔ / ✖) ----
  // Re-filtering a card replaces its rule (with ↔ without) instead of stacking a
  // contradiction that would empty the pool.
  function addFilter(name, board, mode) {
    const i = filters.findIndex((f) => f.name === name && f.board === board);
    if (i >= 0) filters.splice(i, 1);
    filters.push({ name, board, mode });
    saveFilters();
    reanalyze();
  }
  function removeFilter(idx) {
    if (idx < 0 || idx >= filters.length) return;
    filters.splice(idx, 1);
    saveFilters();
    reanalyze();
  }
  function clearFilters() {
    if (!filters.length) return;
    filters.length = 0;
    saveFilters();
    reanalyze();
  }

  // ---- pool persistence (chrome.storage.local) ----
  // Decks carry their parsed boards, so a restored pool needs no site refetch —
  // only Scryfall enrichment, which the poolEnrichCache serves from disk.
  function savePool() {
    if (seedMode) return;   // an archetype pool is ephemeral — never overwrite the saved pool
    try { chrome.storage.local.set({ [POOL_KEY]: pooledDecks, [FILTER_KEY]: filters }); } catch (e) { /* quota — ignore */ }
  }
  // A filter click saves the filters alone: the decks (hundreds of KB) did not change.
  function saveFilters() {
    if (seedMode) return;
    try { chrome.storage.local.set({ [FILTER_KEY]: filters }); } catch (e) { /* quota: ignore */ }
  }

  // My list is kept on its own key, seed mode included: it is the user's deck, not a view on
  // this pool, and the archetype pool is exactly where they will want it next time.
  function saveMine() {
    try {
      if (mine) chrome.storage.local.set({ [MINE_KEY]: mine });
      else chrome.storage.local.remove(MINE_KEY);
    } catch (e) { /* quota: ignore */ }
  }
  async function restoreMine() {
    let stored;
    try { stored = await chrome.storage.local.get(MINE_KEY); } catch (e) { return; }
    const d = stored && stored[MINE_KEY];
    if (!d || typeof d !== "object") return;
    try { mine = Shared.fixCommanderHeuristic(Shared.normalizeDeck(d)); pinned = "mine"; } catch (e) { mine = null; }
  }
  // Reads my list again from its page (the site may have changed it since); the old one stays
  // if the read fails, and the status line says so.
  async function reloadMine(btn) {
    if (!mine || !mine.url) return;
    btn.disabled = true;
    // The outcome shows on the button for a beat (the status region is for screen readers only).
    const flash = (b, text) => {
      if (!b) return;
      b.textContent = text;
      setTimeout(() => { if (b.isConnected) b.textContent = M("poolMineReload"); }, 2000);
    };
    await Shared.requestManaBoxAccess([mine.url]);   // from this click, before any other await (shared.js)
    const res = await sendToBackground({ type: "FETCH_DECKS", urls: [mine.url] });
    const deck = res && res.decks && res.decks[0];
    if (!deck) {
      btn.disabled = false;
      flash(btn, M("poolMineReloadFailed"));
      announce(M("poolNoDeckFetched") + (res && res.errors && res.errors[0] ? " (" + res.errors[0].error + ")" : ""));
      return;
    }
    mine = deck;
    saveMine();
    await reanalyze();   // its new cards may need a type and an image; the strip is redrawn
    flash($("ref").querySelector("[data-reloadmine]"), M("poolMineReloaded"));
    announce(M("poolMineReloaded"));
  }

  function removeMine() {
    mine = null;
    if (pinned === "mine") { pinned = null; gapsOnly = false; }
    endPreview();
    saveMine();
    if (analysis) renderAll();
    else $("deck-panel").innerHTML = "";
  }

  // A one-shot seed left by the archetype button: consume it (remove immediately so a reload
  // falls back to the saved pool) and return its deck URLs, or null when there is none.
  async function consumePoolSeed() {
    let stored;
    try { stored = await chrome.storage.local.get(SEED_KEY); } catch (e) { return null; }
    const seed = stored && stored[SEED_KEY];
    if (!seed || !Array.isArray(seed.decks) || !seed.decks.length) return null;
    try { await chrome.storage.local.remove(SEED_KEY); } catch (e) { /* best effort */ }
    return seed;   // { decks: [{ url, name }], archetype }
  }

  async function restorePool() {
    let stored;
    try { stored = await chrome.storage.local.get([POOL_KEY, FILTER_KEY]); } catch (e) { return false; }
    const saved = stored && stored[POOL_KEY];
    if (!Array.isArray(saved) || !saved.length) return false;
    pooledDecks.push(...saved.map(Shared.normalizeDeck));   // pools saved before 1.1.4 hold raw keys
    for (const d of saved) if (d._rawText) pastedTextsSeen.add(d._rawText);
    // The filters are a view on that pool: restore them with it (shape-checked — storage
    // is ours, but a stale or hand-edited entry must not break the page).
    for (const f of Array.isArray(stored[FILTER_KEY]) ? stored[FILTER_KEY] : []) {
      if (f && typeof f.name === "string" && BOARDS.includes(f.board) && (f.mode === "with" || f.mode === "without")) {
        filters.push({ name: Shared.normalizeName(f.name), board: f.board, mode: f.mode });
      }
    }
    inputExpanded = false;
    return true;
  }

  // ---- render ----
  function renderAll() {
    computeRef();
    renderHero();
    renderRef();
    renderFilters();
    renderDeckList();
    renderMineBtn();
    renderCats();
    renderView();
    renderCurve();
    renderSide();
    applyRef();
    updateSelbar();
  }

  // ---- the reference ----
  const refDeck = (key) => (key === "mine" ? mine : key == null ? null : pooledDecks[key] || null);
  const pinKey = (v) => (v === "mine" ? "mine" : parseInt(v, 10));

  // compareToPool per deck, kept for the current analysis: a sweep down the rail previews each
  // deck's figures in the strip without measuring the same deck twice.
  let statsCache = new Map();
  let statsAnalysis = null;
  let medians = null;   // PoolAnalyze.poolMedians of the decks on the table, per analysis
  function statsFor(key) {
    if (statsAnalysis !== analysis) {
      statsCache = new Map();
      statsAnalysis = analysis;
      medians = analysis && analysis.total_decks ? window.PoolAnalyze.poolMedians(analysis, activeIdx.map((i) => pooledDecks[i])) : null;
    }
    const ref = refDeck(key);
    if (!ref || !analysis || !analysis.total_decks) return null;
    let st = statsCache.get(ref);
    if (!st) {
      // A deck on the table is read against the others ("to the others", "elsewhere"): against
      // a pool that holds it, every card it plays would count toward the consensus it is
      // measured by. My list, or a deck the filters set aside, reads against the table as is.
      const inTable = typeof key === "number" && activeIdx.includes(key);
      const deckMap = inTable ? activeIdx.filter((i) => i !== key) : activeIdx;
      if (!deckMap.length) return null;   // alone on the table: nothing to measure it against
      const base = inTable ? window.PoolAnalyze.analyzePool(deckMap.map((i) => pooledDecks[i]), enrichMap) : analysis;
      st = window.PoolAnalyze.compareToPool(ref, base, enrichMap);
      st.average = window.PoolAnalyze.averageDeck(base); // what "against the average" opens (not the whole analysis)
      st.inTable = inTable;
      st.deckMap = deckMap;                              // base's deck k is pooledDecks[deckMap[k - 1]]
      st.gapNames = new Set(st.gaps.map((c) => c.name)); // what applyRef tags "missing"
      const near = window.PoolAnalyze.closestDeck(ref, deckMap.map((i) => pooledDecks[i]));
      st.closest = near ? { key: deckMap[near.index], similarity: near.similarity } : null;
      statsCache.set(ref, st);
    }
    return st;
  }

  function computeRef() {
    const ref = refDeck(pinned);
    if (!ref) { pinned = null; gapsOnly = false; }
    refStats = statsFor(pinned);
    // Cards of my list the pool never plays have no image in the analysis: give them one.
    if (refStats) for (const c of refStats.extras) if (c.image_uri && !imgByName.has(c.name)) imgByName.set(c.name, c.image_uri);
  }

  // The strip under the hero: which deck, then its five figures. Similarity and consensus take
  // its side's ink, the gaps the alarm; "differences only" and the detailed comparison below.
  // While a rail row is previewed, the visible strip shows that deck's figures in place (same
  // layout, no shift) under a "preview" label; the actions still act on the pinned deck.
  let stripKey;
  function renderRef(key = pinned) {
    const box = $("ref");
    const ref = refDeck(key);
    const s = pinned == null ? null : statsFor(key);
    stripKey = key;
    if (!ref || !s) { box.classList.add("hide"); box.innerHTML = ""; return; }
    const name = key === "mine" ? M("poolMineKind") : M("poolRefDeckKind", [String(key + 1)]);
    const kind = key === pinned ? name : `${M("poolRefPreview")} · ${name}`;
    const med = medians && !s.inTable;
    // Under three decks, "played by at least half of them" is any card one of them plays: the
    // consensus figures say so instead of alarming ("150 consensus cards missing" with two).
    const few = s.deckMap.length < 3;
    const poolCmd = analysis.commanders[0] ? analysis.commanders[0].name.split(" + ") : [];
    const refCmd = Object.keys(ref.commanders || {});
    const otherCmd = refCmd.length > 0 && poolCmd.length > 0 && !refCmd.some((n) => poolCmd.includes(n));
    const warn = otherCmd ? esc(M("poolRefOtherCommander", [refCmd.join(" + ")])) : "";
    box.classList.toggle("previewing", key !== pinned);
    box.setAttribute("aria-label", `${kind} · ${deckDisplayName(ref)}`);   // a named region: reachable by landmark
    // A figure, its label, and a yardstick line under it.
    const fig = (n, label, cls, ctx) => `<div class="rf${cls ? " " + cls : ""}"><span class="n">${n}</span><span class="l">${label}</span>` +
      (ctx ? `<span class="ctx">${ctx}</span>` : "") + `</div>`;
    // The two counts of cards are also the way to them: "differences only", scrolled to that list.
    const jump = (n, label, cls, to, note) => n
      ? `<button type="button" class="rf rf-btn${cls ? " " + cls : ""}" data-gapsjump="${to}" title="${esc(`${M("poolRefShowList")} · ${note}`)}"><span class="n">${n}</span><span class="l">${label}</span></button>`
      : fig(n, label, cls);
    box.innerHTML =
      `<div class="ref-head"><span class="ref-kind">${esc(kind)}</span><span class="ref-name">${esc(deckDisplayName(ref))}</span>` +
      (siteLabel(ref.source) ? `<span class="src-chip">${esc(siteLabel(ref.source))}</span>` : "") +
      // Led by another commander than the decks': says why every figure reads low.
      (warn ? `<span class="ref-warn" title="${warn}">${warn}</span>` : "") +
      // My list is a snapshot of its page: one click reads it again, after an edit on the site.
      (key === "mine" && key === pinned && ref.url ? `<button type="button" class="lnk ref-reload" data-reloadmine="1">${M("poolMineReload")}</button>` : "") +
      `<button type="button" class="lnk ref-x" data-unpin="1">${M("poolRefUnpin")}</button></div>` +
      `<div class="ref-figs">` +
      // Under the similarity, what it is measured against; under the consensus share, for a list
      // from outside the table, the median deck's (each deck against the others, as its rail row
      // reads). Both lines are always there: a preview never changes the strip's height.
      fig(`${s.similarity}<small>%</small>`, M("poolRefSimilar"), "a", M(s.inTable ? "poolRefVsOthers" : "poolRefVsAll", [String(s.deckMap.length)])) +
      fig(`${s.consensus.qty}${s.consensus.total ? `<small>/${s.consensus.total}</small>` : ""}`, M("poolRefConsensus"), "a",
        few ? M("poolRefFewDecks") : med ? M("poolRefMedianOf", [String(medians.consensus.qty), String(medians.consensus.total)]) : "&nbsp;") +
      (s.core.total ? fig(`${s.core.played}<small>/${s.core.total}</small>`, M("poolRefCore")) : "") +
      jump(s.gaps.length, M(Shared.plural(s.gaps.length) ? "poolRefGaps" : "poolRefGapsOne"), s.gaps.length && !few ? "alarm" : "", "gaps-missing", M("poolGapsMissingNote")) +
      jump(s.extras.length, M(Shared.plural(s.extras.length) ? "poolRefExtras" : "poolRefExtrasOne"), "", "gaps-rare", M("poolGapsRareNote")) +
      `</div><div class="ref-actions">` +
      `<button type="button" class="pill${gapsOnly ? " active" : ""}" data-gaps="1" aria-pressed="${gapsOnly}">${M("poolRefGapsOnly")}</button>` +
      `<button type="button" class="lnk ref-detail" data-refdetail="1">${M("poolRefDetail")} ↗</button>` +
      (s.closest
        ? `<button type="button" class="lnk ref-detail" data-closest="${s.closest.key}" title="${esc(`${M("poolRefClosestTitle")} · #${s.closest.key + 1} ${deckDisplayName(refDeck(s.closest.key))}`)}">` +
          `${esc(M("poolRefClosest", [`#${s.closest.key + 1}`, String(s.closest.similarity)]))} ↗</button>`
        : "") +
      // A deck of the pool pinned while my list exists: the one comparison a player wants next.
      (typeof pinned === "number" && mine ? `<button type="button" class="lnk ref-detail" data-vsmine="1">${M("poolRefVsMine")} ↗</button>` : "") +
      `<span class="ref-legend"><i></i>${esc(M("poolRefLegend", [key === "mine" ? M("poolRefLegendMine") : `#${key + 1}`]))}</span></div>`;
    box.classList.remove("hide");
  }

  // "Compare my list" opens the popin; it shows only while there is no list (once there is, its
  // rail row pins it back).
  const ICON_MINE = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="10" cy="10" r="6.5"/><circle cx="10" cy="10" r="2" fill="currentColor" stroke="none"/></svg>`;
  function renderMineBtn() {
    const b = $("mine-add");
    b.classList.toggle("hide", !pooledDecks.length || !!mine);
    b.innerHTML = ICON_MINE + `<span>${M("poolMineBtn")}</span>`;
    b.title = M("poolMineTitle");
  }

  // Pin (or unpin) a reference without rebuilding the page: the strip, the rail's pressed row,
  // the marks in the lists; only "differences only" needs the usage lists redrawn.
  function setPinned(key) {
    const wasGaps = gapsOnly;
    pinned = key;
    endPreview();
    computeRef();
    renderRef();
    renderMineBtn();
    for (const it of document.querySelectorAll("#deck-panel [data-pin]")) {
      const k = pinKey(it.dataset.pin);
      const on = k === pinned;
      const link = it.querySelector(".dp-link");
      it.classList.toggle("pinned", on);
      link.setAttribute("aria-pressed", String(on));
      link.title = railTitle(k, on, it.classList.contains("off"));
    }
    if (view === "usage" && (wasGaps || gapsOnly)) renderUsage();   // otherwise the lists stand: only the marks move
    applyRef();
    // The strip is not a live region (a sweep down the rail would read it out row by row): a pin
    // says in one line what is now compared, through the page's status region.
    if (refStats) announce(M("poolRefAnnounce", [$("ref").querySelector(".ref-kind").textContent, String(refStats.similarity)]));
  }

  // Marks the lists with the previewed deck, else the reference. Rows carry their card, board,
  // share and average copies, so this is one pass of class toggles: no list is rebuilt, which
  // keeps a sweep down the rail light even over a few hundred rows.
  const GAP_LABEL = M("poolRefGapTag");
  function applyRef() {
    const key = hoverRef != null ? hoverRef : pinned;
    const deck = refDeck(key);
    document.body.classList.toggle("has-ref", !!deck);
    document.body.classList.toggle("ref-preview", hoverRef != null && hoverRef !== pinned);
    // Whose count it is, next to the pool's average: "×2.7 you ×2", "×2.7 #5 ×2".
    const who = key === "mine" ? M("poolRefYou") : "#" + (key + 1);
    // "Missing" comes from the reference's own measure (a deck of the table against the others),
    // not from the row's share of the whole pool.
    const st = deck ? statsFor(key) : null;
    for (const r of document.querySelectorAll(".prow[data-card]")) {
      const board = r.dataset.board;
      const q = deck ? (deck[board] || {})[r.dataset.card] || 0 : 0;
      const gap = !!deck && !q && board === "mainboard" && (st ? st.gapNames.has(r.dataset.card) : +r.dataset.pct >= window.PoolAnalyze.CONSENSUS);
      r.classList.toggle("ref-has", q > 0);
      r.classList.toggle("ref-gap", gap);
      r.classList.toggle("ref-off", !!deck && !q && !gap);
      const rq = r.querySelector(".rq");
      const avg = +r.dataset.avg || 0;   // 0: no deck plays it, a count would compare with nothing
      const rqText = q > 0 && avg > 0 && q !== Math.round(avg) ? `${who} ×${q}` : "";
      if (rq && rq.textContent !== rqText) rq.textContent = rqText;
      const tag = r.querySelector(".rtag");
      const tagText = gap ? GAP_LABEL : "";
      if (tag && tag.textContent !== tagText) tag.textContent = tagText;
    }
    if (pinned != null && key !== stripKey) renderRef(key);
    // The reference's own #n badge: a class on the few badges that name it (a rewritten
    // stylesheet would restyle the whole page on every step of a sweep down the rail).
    for (const b of document.querySelectorAll(".pbadge.ref-badge")) b.classList.remove("ref-badge");
    if (typeof key === "number") for (const b of document.querySelectorAll(`.pbadge[data-pi="${key}"]`)) b.classList.add("ref-badge");
  }

  let refFrame = 0;
  let refIntent = 0;
  // Drops any preview, shown or pending: a deck removed or pinned must not leave one behind.
  function endPreview() {
    hoverRef = null;
    clearTimeout(refIntent);
  }
  // `delay`: the pointer's intent. A row crossed on the way elsewhere previews nothing (the page
  // would flash); a row the pointer rests on does, and leaving the rail restores at once.
  function previewRef(key, delay) {
    clearTimeout(refIntent);
    if (key === hoverRef) return;
    const go = () => {
      hoverRef = key;
      cancelAnimationFrame(refFrame);
      refFrame = requestAnimationFrame(applyRef);   // one pass per frame, however fast the sweep
    };
    if (delay && key != null) refIntent = setTimeout(go, delay);
    else go();
  }

  // The detailed comparison: the reference against the average decklist, or against one deck of
  // the pool (its nearest), on the results page.
  async function openDetail(otherKey) {
    const ref = refDeck(pinned);
    if (!ref || !analysis) return;
    let other = otherKey != null ? refDeck(otherKey) : null;
    if (other) other = Object.assign({}, other, { name: deckDisplayName(other) });
    else {
      // The average the strip measured it against: the others' for a deck of the table, so the
      // results page opens on the strip's own percentage.
      other = Object.assign({}, refStats ? refStats.average : window.PoolAnalyze.averageDeck(analysis), {
        name: (() => {   // "(1 deck)" under a filter that leaves one
          const n = refStats ? refStats.deckMap.length : analysis.total_decks;
          return M(Shared.plural(n) ? "poolRefAverageName" : "poolRefAverageNameOne", [String(n)]);
        })(),
        source: M("poolAnalysis"),   // shown under its name on the results page
      });
    }
    await chrome.storage.local.set({ compareData: { deckA: Object.assign({}, ref, { name: deckDisplayName(ref) }), deckB: other } });
    chrome.tabs.create({ url: chrome.runtime.getURL("compare.html") });
  }

  // Scryfall URLs are used as-is: the manifest's img-src allows them, so the browser
  // loads and caches them itself. This used to proxy every image through the service
  // worker as base64 only because the CSP blocked remote images, which cost a round trip
  // per card and a cache that died with the page. Kept async so callers are unchanged.
  async function fetchImg(url) {
    return url || null;
  }

  // A card every analyzed deck plays. The hero's "shared cards" count, the usage view's
  // shared section, the list the stat button copies and the inert filter icons all read
  // this one predicate, so the number shown and the list copied can never diverge.
  const inEveryDeck = (c) => c.deck_count === c.total_decks;

  function renderHero() {
    const top = analysis.commanders[0];
    const total = analysis.total_decks;
    const commons = analysis.cardStats.filter(inEveryDeck).length;
    // The pool's face: its commander when it has a command zone; otherwise (a 60-card
    // format) the most-played non-land card, which is what identifies the archetype.
    let heroName, heroCard = null, role = "";
    if (top) {
      heroName = top.name; heroCard = top.card;
      role = analysis.commanders.length > 1 ? M("poolMainCommander") : M("poolCommander");
    } else {
      // Launched from an mtgtop8 archetype page, the archetype is the title and the
      // most-played card is its face; otherwise that card is both.
      const lead = analysis.cardStats.find((c) => !(c.type_line || "").includes("Land"));
      heroCard = lead || null;
      if (seedArchetype) { heroName = seedArchetype; role = M("poolArchetype"); }
      else if (lead) { heroName = lead.name; role = M("poolMostPlayed"); }
      else heroName = M("poolDeckPool");
    }
    $("hero-name").textContent = heroName;
    document.title = `${heroName} · ${M("poolAnalysis")}`;   // the tab says which pool it holds
    $("hero-eyebrow").textContent = role;
    $("hero-eyebrow").classList.toggle("hide", !role);

    let pips = [];
    try { pips = JSON.parse(analysis.color_identity || "[]"); } catch (e) {}
    $("hero-pips").innerHTML = pips.length
      ? pips.map((c) => `<span class="cpip ${c}"></span>`).join("")
      : `<span class="cpip C"></span>`;

    // Filtered: "12/20" — the pool is still 20 decks, 12 of them are on the table.
    const decksN = filters.length ? `${total}<span class="of">/${pooledDecks.length}</span>` : String(total);
    // The two card stats double as copy buttons (see copyStat) — unless they read 0, when
    // there is nothing to copy. The list is computed at click time from `analysis`, not
    // stashed here: `payloads` is reset by every view render.
    const one = (n, key) => M(Shared.plural(n) ? key : key + "One");   // "1 carte en commun", not "1 cartes"
    $("hero-stats").innerHTML = [
      [decksN, one(total, "poolDecksAnalyzed"), false, null],
      [commons, one(commons, "poolSharedCardsStat"), true, "shared"],
      [analysis.cardStats.length, one(analysis.cardStats.length, "poolDistinctCards"), false, "distinct"],
    ].map(([n, l, a, k]) => {
      const body = `<span class="n ${a ? "accent" : ""}">${n}</span><span class="l">${l}</span>`;
      return k && n
        ? `<button type="button" class="stat stat-btn" data-copystat="${k}" title="${M("poolCopyListTitle")}">${body}</button>`
        : `<div class="stat">${body}</div>`;
    }).join("");

    const art = $("hero-art");
    art.classList.remove("has");
    if (heroCard && heroCard.image_uri) {
      fetchImg(heroCard.image_uri).then((d) => { if (d) { $("hero-img").src = d; art.classList.add("has"); } });
    }
  }

  // Persistent list of the decks in the pool (right rail): name → opens URL, × → removes.
  // Rendered from the pool itself, not the analysis, so decks the filters set aside stay
  // listed — struck through, still removable — and #n is the pool's own numbering.
  function renderDeckList() {
    const kept = new Set(activeIdx);
    const count = filters.length ? `${activeIdx.length}/${pooledDecks.length}` : String(pooledDecks.length);
    // Header stays pinned; only the deck rows (.dp-list) scroll, so a 100-deck pool can't
    // push the card preview below the fold. Errors sit under the scroll area, still in view.
    // "+ Add" lives with the list it feeds, pinned in the head: the input opens as a popin
    // now, so the full-width dashed bar that used to sit above the hero had no job left.
    // Only once there is a pool — while it is empty the inline form is already on screen.
    const PLUS = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M10 4v12M4 10h12"/></svg>`;
    const add = pooledDecks.length
      ? `<button type="button" class="dp-add" title="${M("poolAddDecksBtn")}" aria-label="${M("poolAddDecksBtn")}">${PLUS}${M("poolAddDecksShort")}</button>`
      : "";
    const head = `<div class="dp-head">${M("poolDecksInPool")} <span class="dp-c">${count}</span>${add}</div>`;
    // Each row is the button that pins its deck as the reference (hover previews it); the
    // deck's page opens from the arrow. On hover or once pinned, the source makes way for the
    // deck's share of the consensus: "58/99".
    // Every deck of a commander's pool starts with that commander's name, and the rail cut
    // them all right where they differ ("Aragorn, the Uniter Sp…"): the row shows what follows
    // it (the whole name stays in the title), and the source chip only when sources differ.
    const lead0 = analysis && analysis.commanders && analysis.commanders[0];
    const words = lead0 ? String(lead0.name).split(/[^\p{L}\p{N}']+/u).filter(Boolean) : [];
    const lead = words.length ? new RegExp(`^\\W*${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\W+")}\\b[\\s,:;|\\u00b7\\u2022\\u2013\\u2014-]*`, "iu") : null;
    const shortName = (d) => {
      const full = deckDisplayName(d);
      const rest = lead ? full.replace(lead, "") : full;
      return rest.length >= 3 ? rest : full;
    };
    const oneSource = new Set(pooledDecks.map((d) => d.source || "")).size <= 1;
    const railRow = (key, d, hash, extra, rm, noSrc) => {
      const off = extra.includes(" off");
      const name = esc(shortName(d));
      const fullName = esc(deckDisplayName(d));
      const on = pinned === key;
      const share = analysis && analysis.total_decks ? window.PoolAnalyze.consensusShare(d, analysis, kept.has(key)) : null;
      const fig = share && share.total ? `<span class="dp-fig">${share.qty}/${share.total}</span>` : "";
      const open = d.url
        ? `<a class="dp-open" href="${esc(d.url)}" target="_blank" rel="noopener" title="${M("poolOpen")} ${fullName}" aria-label="${M("poolOpen")} ${fullName}">${ICON_OPEN}</a>`
        : "";
      return `<div class="dp-item${extra}${on ? " pinned" : ""}" data-pin="${key}">` +
        `<button type="button" class="dp-link" aria-pressed="${on}" title="${esc(railTitle(key, on, off))}">` +
        `<span class="dp-hash">${hash}</span><span class="dp-n">${name}</span>${fig}${noSrc || oneSource ? "" : `<span class="dp-src">${esc(d.source || "")}</span>`}</button>` +
        `${open}${rm}</div>`;
    };
    const mineRow = mine
      ? railRow("mine", mine, M("poolMineKind"), " dp-mine",
          `<button class="dp-x" data-rmmine="1" title="${M("poolRemoveMine")}" aria-label="${M("poolRemoveMine")}">×</button>`, true)
      : "";
    const rows = pooledDecks.map((d, i) => {
      const off = !kept.has(i);
      return railRow(i, d, `#${i + 1}`, off ? " off" : "",
        `<button class="dp-x" data-rmdeck="${i}" title="${M("poolRemoveFromPool")}" aria-label="${M("poolRemoveFromPool")}">×</button>`);
    }).join("");

    let errsHtml = "";
    const errs = analysis.errors || [];
    if (errs.length) {
      const ignoredLabel = errs.length > 1 ? M("poolDeckIgnoredPlural") : M("poolDeckIgnoredSingular");
      errsHtml = `<div class="dp-errs"><b>${errs.length} ${ignoredLabel}</b>` +
        errs.slice(0, 8).map((e) => `<div class="dp-err" title="${esc((e.url || "?") + " · " + e.error)}">${esc(e.url || "?")} · ${esc(e.error)}</div>`).join("") + `</div>`;
    }
    // The list scrolls on its own: keep its place across a redraw (a removal, a filter).
    const prev = $("deck-panel").querySelector(".dp-list");
    const top = prev ? prev.scrollTop : 0;
    // Say what the rows do: nothing else on the page shows that hovering or clicking one does anything.
    const hint = pooledDecks.length > 1 ? `<div class="dp-hint">${M("poolRefRailHint")}</div>` : "";
    $("deck-panel").innerHTML = head + mineRow + `<div class="dp-list">${rows}</div>` + hint + errsHtml;
    $("deck-panel").querySelector(".dp-list").scrollTop = top;
  }
  // What a click on a rail row does: unpin it, or pin it (a deck against the others, my list
  // against these decks); a deck the filters set aside says so first. The deck's full name
  // leads, since the row cuts long ones short.
  const railTitle = (key, on, off) => (refDeck(key) ? `${deckDisplayName(refDeck(key))} · ` : "") + (on ? M("poolRefUnpin")
    : (off ? M("poolFilteredOut") + " · " : "") + (key === "mine" ? M("poolMineTitle") : M("poolRefPinHint")));
  const ICON_OPEN = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 5H5v10h10v-3M11 4h5v5M16 4l-7 7"/></svg>`;

  function renderCats() {
    $("cat-pills").innerHTML = CATS.map((c) => `<button class="pill ${c.key === cat ? "active" : ""}" data-cat="${c.key}">${c.label}</button>`).join("");
  }

  // Keep / drop the decks a row counted — mtgtop8 compare's ✔ / ✖. Both go inert once
  // every deck plays the card: keep would change nothing, drop would empty the pool.
  const ICON_KEEP = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10.5l4 4 8-9"/></svg>`;
  const ICON_DROP = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 5l10 10M15 5L5 15"/></svg>`;
  function filterButtons(c, board) {
    const off = inEveryDeck(c) ? " disabled" : "";
    const btn = (mode, cls, icon, label) =>
      `<button class="fa ${cls}" data-flt="${mode}" data-fname="${esc(c.name)}" data-fboard="${board}" title="${label}" aria-label="${label}"${off}>${icon}</button>`;
    return btn("with", "keep", ICON_KEEP, M("poolKeepWithCard")) + btn("without", "drop", ICON_DROP, M("poolDropWithCard"));
  }

  // Active filters as chips above the results: × lifts one, the link lifts them all.
  function renderFilters() {
    const bar = $("filters");
    if (!filters.length) { bar.classList.add("hide"); bar.innerHTML = ""; return; }
    bar.innerHTML = `<span class="lbl">${M("poolFiltersLabel")}</span>` +
      filters.map((f, i) =>
        `<span class="chip ${f.mode}"><span class="mode">${f.mode === "with" ? M("poolFilterWith") : M("poolFilterWithout")}</span>` +
        `<span class="chip-name" data-name="${esc(f.name)}">${esc(f.name)}</span>` +
        (f.board === "sideboard" ? `<span class="hsh">· ${M("poolSideboardTitle")}</span>` : "") +
        `<button class="chip-x" data-rmfilter="${i}" title="${M("poolFilterRemove")}" aria-label="${M("poolFilterRemove")}">×</button></span>`
      ).join("") +
      `<button class="lnk" data-clearfilters="1">${M("poolClearFilters")}</button>`;
    bar.classList.remove("hide");
  }

  // Filters that leave no deck on the table (only reachable by removing decks by hand
  // after filtering): say so where the list would be, with the way out.
  const emptyFiltered = () =>
    `<div class="sect"><div class="empty">${M("poolNoDeckMatches")} <button class="lnk" data-clearfilters="1" style="color:var(--a)">${M("poolClearFilters")}</button></div></div>`;

  // a card row
  // A share as the interface language writes it, like the rest of the page ("(35 %)"): "85,7 %"
  // in French (comma, narrow no-break space), "85.7%" in English.
  const PCT_LANG = chrome.i18n.getUILanguage();
  const PCT_FMT = new Intl.NumberFormat(PCT_LANG, { maximumFractionDigits: 1 });
  const pctLabel = (p) => `${PCT_FMT.format(p)}${/^fr/i.test(PCT_LANG) ? "\u202f" : ""}%`;

  function row(c, opts) {
    opts = opts || {};
    const checked = selected.has(c.name) ? "checked" : "";
    const xq = c.avg_copies > 1 ? `<span class="xq">×${c.avg_copies}</span>` : "";
    const copy = `<button class="cp" data-copy="${esc(c.name)}" title="${M("poolCopyName")}"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="7" y="7" width="9" height="9" rx="1.5"/><path d="M4 13V4.5A1.5 1.5 0 0 1 5.5 3H13"/></svg></button>`;
    let right;
    if (opts.bar) {
      right = `<div class="bar"><i style="width:${c.percentage}%"></i></div><span class="pct">${pctLabel(c.percentage)}</span>`;
    } else if (opts.frac) {
      right = `<span class="frac">${c.deck_count}/${c.total_decks}</span><span class="pct">${pctLabel(c.percentage)}</span>`;
    } else {
      right = `<span class="pct">${pctLabel(c.percentage)}</span>`;
    }
    const flt = opts.filter ? filterButtons(c, opts.filter) : "";
    let badges = "";
    if (opts.badges && c.deck_indices && c.deck_indices.length) {
      // deck_indices count within the analyzed subset; badges show the pool's own #n so
      // a badge and the rail always name the same deck, filters or not. A reference measured
      // against the others brings its own subset (opts.deckMap).
      const deckMap = opts.deckMap || activeIdx;
      badges = `<div class="pbadges">` + c.deck_indices.map((k) => {
        const pi = deckMap[k - 1];
        const d = pi == null ? null : pooledDecks[pi];
        const n = pi == null ? k : pi + 1;
        const title = d ? esc(`#${n} · ${deckDisplayName(d)}`) : `#${n}`;
        return d && d.url
          ? `<a class="pbadge" data-pi="${pi}" href="${esc(d.url)}" target="_blank" rel="noopener" title="${title}">#${n}</a>`
          : `<span class="pbadge" data-pi="${pi}" title="${title}">#${n}</span>`;
      }).join("") + `</div>`;
    }
    // card, board, share and average copies ride on the row for applyRef's marks
    return `<div class="prow" data-card="${esc(c.name)}" data-board="${opts.board || "mainboard"}" data-pct="${c.percentage}" data-avg="${c.avg_copies}">` +
      `<input type="checkbox" data-sel="${esc(c.name)}" aria-label="${esc(c.name)}" ${checked}>` +
      `<span class="nm" data-name="${esc(c.name)}">${esc(c.name)}${xq}<span class="rq"></span></span><span class="rtag"></span>${copy}${flt}${right}</div>${badges}`;
  }

  function sectionHead(title, count, note, cards) {
    const names = cards.map((c) => c.name);
    return `<div class="sect-head"><span class="sect-title">${title} <span class="c">(${count})</span>` +
      (note ? ` <span class="sect-note">${note}</span>` : "") + `</span>` +
      `<span class="sect-actions">` +
      `<button class="lnk" data-selid="${stash(names)}">${M("poolSelectBtn")}</button>` +
      `<button class="lnk" data-copyid="${stash(names.join("\n"))}"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="7" y="7" width="9" height="9" rx="1.5"/><path d="M4 13V4.5A1.5 1.5 0 0 1 5.5 3H13"/></svg> ${M("poolCopyBtn")}</button>` +
      `</span></div>`;
  }

  function renderView() {
    document.querySelectorAll("#view-seg .seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
    $("usage-view").classList.toggle("hide", view !== "usage");
    $("average-view").classList.toggle("hide", view !== "average");
    if (view === "usage") renderUsage();
    else renderAverage();
  }

  function renderUsage() {
    payloadId = 0; payloads = {};
    if (!analysis.total_decks) { $("sections").innerHTML = emptyFiltered(); return; }
    if (gapsOnly && refStats) { $("sections").innerHTML = gapsSections(); return; }
    const filtered = analysis.cardStats.filter((c) => matchCat(c.type_line, cat));
    const commons = filtered.filter(inEveryDeck);
    const variable = filtered.filter((c) => !inEveryDeck(c));
    let html = "";
    if (commons.length) {
      html += `<div class="sect">${sectionHead(M("poolSharedFull"), commons.length, "", commons)}` +
        commons.map((c) => row(c, {})).join("") + `</div>`;
    }
    if (variable.length) {
      const note = analysis.decks.length > 1 ? M("poolVariableNote") : "";
      html += `<div class="sect">${sectionHead(M("poolVariable"), variable.length, note, variable)}` +
        variable.map((c) => row(c, { frac: true, badges: true, filter: "mainboard" })).join("") + `</div>`;
    }
    if (!commons.length && !variable.length) html = `<div class="sect"><div class="empty">${M("poolNoCardsInCategory")}</div></div>`;
    $("sections").innerHTML = html;
  }

  // "Differences only": what the decks agree on that the reference lacks, then what it plays
  // that the decks rarely do. The category pills still apply. A card no deck plays keeps no
  // filter buttons: keeping only the decks that play it would empty the table.
  function gapsSections() {
    const gaps = refStats.gaps.filter((c) => matchCat(c.type_line, cat));
    const extras = refStats.extras.filter((c) => matchCat(c.type_line, cat));
    // Consensus cards it plays in another number: the 60-card formats' real question (two Bolts
    // where the decks play four); shown only when there are some.
    const counts = (refStats.counts || []).filter((c) => matchCat(c.type_line, cat));
    const none = `<div class="empty">${M("poolNoCardsInCategory")}</div>`;
    return `<div class="sect" id="gaps-missing">${sectionHead(M("poolGapsMissing"), gaps.length, M("poolGapsMissingNote"), gaps)}` +
      (gaps.length ? gaps.map((c) => row(c, { frac: true, badges: true, filter: "mainboard", deckMap: refStats.deckMap })).join("") : none) + `</div>` +
      (counts.length
        ? `<div class="sect" id="gaps-counts">${sectionHead(M("poolGapsCounts"), counts.length, M("poolGapsCountsNote"), counts)}` +
          counts.map((c) => row(c, { frac: true, badges: true, filter: "mainboard", deckMap: refStats.deckMap })).join("") + `</div>`
        : "") +
      `<div class="sect" id="gaps-rare">${sectionHead(M("poolGapsRare"), extras.length, M("poolGapsRareNote"), extras)}` +
      (extras.length ? extras.map((c) => row(c, { frac: true, badges: true, filter: c.deck_count ? "mainboard" : null, deckMap: refStats.deckMap })).join("") : none) + `</div>`;
  }

  function renderAverage() {
    payloadId = 0; payloads = {};
    if (!analysis.total_decks) { $("average-view").innerHTML = emptyFiltered(); return; }
    const avg = analysis.averageDecklist;
    const avgCount = avg.reduce((s, c) => s + c.avg_copies, 0);
    const cmdNames = analysis.commanders[0] ? analysis.commanders[0].name.split(" + ") : [];
    const grouped = {};
    for (const c of avg) (grouped[typeCat(c.type_line)] = grouped[typeCat(c.type_line)] || []).push(c);
    const sections = AVG_ORDER.filter((k) => grouped[k] && grouped[k].length).map((k) => ({ k, cards: grouped[k] }));

    // "Commander"/"Deck" are fixed deck-list interchange headers (for pasting into
    // other tools), not localized UI text — kept in English regardless of locale.
    const copyText = (cmdNames.length ? "Commander\n" + cmdNames.map((n) => "1 " + n).join("\n") + "\n\n" : "") +
      "Deck\n" + avg.map((c) => `${c.avg_copies} ${c.name}`).join("\n");

    const cmdWord = cmdNames.length > 1 ? M("poolCommanderPlural") : M("poolCommanderSingular");
    let html = `<div class="sect-head" style="border:0; padding:0 0 4px">` +
      `<span class="sect-title" style="text-transform:none; letter-spacing:0; font-size:15px">${M("poolAverageView")} <span class="c">${avgCount + cmdNames.length} ${M("poolCardPlural")} (${cmdNames.length} ${cmdWord} + ${avgCount})</span></span>` +
      `<span class="sect-actions"><button class="lnk" data-copyid="${stash(copyText)}"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="7" y="7" width="9" height="9" rx="1.5"/><path d="M4 13V4.5A1.5 1.5 0 0 1 5.5 3H13"/></svg> ${M("poolCopyDecklistBtn")}</button></span></div>`;

    if (cmdNames.length) {
      html += `<div class="sect"><div class="type-divider"><span>${M("poolCommander")}</span></div>` +
        cmdNames.map((n) => `<div class="prow" data-card="${esc(n)}" data-board="commanders"><input type="checkbox" data-sel="${esc(n)}" aria-label="${esc(n)}" ${selected.has(n) ? "checked" : ""}><span class="nm" data-name="${esc(n)}">${esc(n)}</span></div>`).join("") + `</div>`;
    }
    html += sections.map((s) =>
      `<div class="sect"><div class="type-divider"><span>${s.k} (${s.cards.length})</span></div>` +
      s.cards.map((c) => row(c, { bar: true })).join("") + `</div>`
    ).join("");
    $("average-view").innerHTML = html;
  }

  function renderCurve() {
    const data = analysis.manaCurve || [];
    if (!data.length) { $("curve-slot").innerHTML = ""; return; }
    const buckets = [];
    for (let i = 0; i <= 7; i++) buckets.push({ cmc: i, count: (data.find((d) => d.cmc === i) || {}).count || 0 });
    const max = Math.max(...buckets.map((b) => b.count), 1);
    $("curve-slot").innerHTML = `<div class="curve"><h3>${M("poolManaCurve")}</h3><div class="bars">` +
      buckets.map((b) => `<div class="col"><span class="v">${b.count || ""}</span><div class="b" style="height:${(b.count / max) * 100}%"></div><span class="x">${b.cmc === 7 ? "7+" : b.cmc}</span></div>`).join("") +
      `</div><div class="cap">${M("poolManaCurveCaption")}</div></div>`;
  }

  function renderSide() {
    const s = analysis.sideboardStats || [];
    if (!s.length) { $("side-slot").innerHTML = ""; return; }
    $("side-slot").innerHTML = `<div class="sect"><div class="sect-head"><span class="sect-title">${M("poolSideboardTitle")} <span class="c">(${s.length})</span></span></div>` +
      s.slice(0, 20).map((c) => `<div class="prow" data-card="${esc(c.name)}" data-board="sideboard" data-pct="${c.percentage}" data-avg="${c.avg_copies}"><span class="nm" data-name="${esc(c.name)}" style="margin-left:0">${esc(c.name)}<span class="rq"></span></span>${filterButtons(c, "sideboard")}<span class="frac">${c.deck_count}/${c.total_decks}</span></div>`).join("") + `</div>`;
  }

  // ---- selection ----
  function updateSelbar() {
    const n = selected.size;
    const cardWord = n > 1 ? M("poolCardPlural") : M("poolCardSingular");
    const selWord = n > 1 ? M("poolSelectedPlural") : M("poolSelectedSingular");
    $("sel-n").textContent = `${n} ${cardWord} ${selWord}`;
    $("selbar").classList.toggle("show", n > 0);
  }
  // Resolves to whether the text reached the clipboard; never rejects.
  function copy(text) { return navigator.clipboard.writeText(text).then(() => true, () => false); }
  // Every copy says so, as the results page does: the row icons, the section and selection
  // buttons used to stay silent. A check mark in the action ink for a beat, and the live region.
  function copied(btn) {
    announce(M("poolCopiedLabel"));
    if (!btn) return;
    btn.classList.add("did-copy");
    clearTimeout(btn._copiedTimer);
    btn._copiedTimer = setTimeout(() => btn.classList.remove("did-copy"), 1200);
  }

  // Hero stats as copy buttons: "shared cards" is every mainboard card all compared decks
  // play, "distinct cards" every mainboard card in the pool (the sideboard has its own
  // section, the commander is the hero) — one name per line, like the section Copy buttons.
  // Both lists match the numbers shown: renderHero counts with the same inEveryDeck.
  function statList(kind) {
    const cards = kind === "shared" ? analysis.cardStats.filter(inEveryDeck) : analysis.cardStats;
    return cards.map((c) => c.name);
  }
  // The two stats share one live region. Clearing it and writing on the next task makes a
  // repeat announce (same-task clear+set coalesces into "no change"); one timer owns the reset,
  // so a second copy 0.5 s after the first is announced and not cut short by the first flash.
  let statusTimer;
  function announce(text) {
    const status = $("hero-status");
    status.textContent = "";
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      status.textContent = text;
      statusTimer = setTimeout(() => { status.textContent = ""; }, 1200);
    }, 50);
  }
  const statFlash = {};   // kind -> the timer that ends its "copied!" flash (a re-click re-arms it)
  function copyStat(el) {
    const kind = el.dataset.copystat;
    copy(statList(kind).join("\n")).then((ok) => {
      if (!ok) return;   // nothing reached the clipboard: don't say it did
      const label = el.querySelector(".l");
      if (!el.classList.contains("copied")) {
        el.dataset.label = label.textContent;
        el.style.minWidth = el.getBoundingClientRect().width + "px";   // "copied!" is shorter: keep the row from reflowing
        el.classList.add("copied");
        label.textContent = M("poolCopiedLabel");
      }
      announce(M("poolCopiedLabel"));   // the same word, for screen readers
      clearTimeout(statFlash[kind]);
      statFlash[kind] = setTimeout(() => {
        label.textContent = el.dataset.label;
        delete el.dataset.label;
        el.classList.remove("copied");
        el.style.minWidth = "";
      }, 1200);
    });
  }

  // ---- hover preview ----
  let pvCurrent = null;
  // Below 1000px the held card floats in a corner of the window (pool.html), the one away from
  // the row it shows; it is put away when the pointer leaves the card rows.
  const pvFloating = window.matchMedia ? window.matchMedia("(max-width: 1000px)") : { matches: false };
  let pvDropTimer = null;
  function preview(name, el) {
    clearTimeout(pvDropTimer);
    if (el && el.getBoundingClientRect) {
      const r = el.getBoundingClientRect(), card = document.querySelector(".preview-card");
      card.classList.toggle("left", r.left + r.width / 2 > innerWidth / 2);
      card.classList.toggle("top", r.top + r.height / 2 > innerHeight / 2);
    }
    if (name === pvCurrent) return;
    pvCurrent = name;
    $("pv-name").textContent = name;
    const stage = $("pv-stage");
    stage.classList.remove("has");
    fetchImg(imgByName.get(name)).then((d) => { if (d && pvCurrent === name) { $("pv-img").src = d; stage.classList.add("has"); } });
  }

  // ---- events ----
  function boot() {
    $("topbar-meta").textContent = M("poolAnalysis");
    $("intro-title").textContent = M("poolAnalysis");
    $("intro-sub").textContent = M("poolIntro");
    $("fields-close").title = M("poolCloseInput");
    $("tabpick-label").textContent = M("openTabsLabel");
    $("links-label").textContent = M("poolLinksLabel");
    $("or-paste-text").textContent = M("poolOrPasteText");
    $("view-usage-text").textContent = M("poolUsageView");
    $("view-average-text").textContent = M("poolAverageView");
    $("preview-hint").textContent = M("poolHoverHint");
    $("sel-copy-text").textContent = M("poolCopyBtn");
    $("sel-clear").textContent = M("poolClearBtn");
    $("pool-footnote").textContent = M("poolFootnote");

    URLS_PLACEHOLDER = $("urls").placeholder;
    $("mine-saved-label").textContent = M("poolMineSavedLabel");
    $("or-saved").textContent = M("poolMineOr");
    $("mine-saved").addEventListener("change", (e) => {
      if (!e.target.value) return;
      $("urls").value = e.target.value;   // one of the user's own decks: its link, as if pasted
      updateCount();
    });
    $("urls").addEventListener("input", updateCount);
    $("texts").addEventListener("input", updateCount);
    $("run").addEventListener("click", addToPool);
    $("tabpick-list").addEventListener("click", (e) => {
      const item = e.target.closest(".tabpick-item");
      if (item) stageTabUrl(item.dataset.tabUrl);
    });
    // The "+ Add" pill is re-rendered with the deck panel (innerHTML), so the panel — which
    // persists — listens for it; closing the popin hands focus back to that pill.
    const closeAdd = () => {
      const fromMine = inputMode === "mine";
      inputMode = "pool";
      inputExpanded = false;
      $("err").classList.add("hide");
      updateCount();
      applyInputState();
      (fromMine ? $("mine-add") : $("deck-panel").querySelector(".dp-add"))?.focus();
    };
    let fieldsMode = "pool";   // whose entries the fields hold: switching popins starts them empty
    const openInput = (mode) => {
      if (mode !== fieldsMode) { $("urls").value = ""; $("texts").value = ""; fieldsMode = mode; }
      inputMode = mode;
      inputExpanded = true;
      $("err").classList.add("hide");
      updateCount();
      applyInputState();
      $("urls").focus();
    };
    $("deck-panel").addEventListener("click", (e) => {
      if (e.target.closest(".dp-add")) { openInput("pool"); return; }
      if (e.target.closest("[data-rmmine]")) { removeMine(); return; }
      const link = e.target.closest(".dp-link");
      if (link) {
        const key = pinKey(link.closest("[data-pin]").dataset.pin);
        setPinned(pinned === key ? null : key);
      }
    });
    // Hover or focus on a rail row previews that deck in the lists; leaving the rail restores
    // the reference.
    $("deck-panel").addEventListener("mouseover", (e) => {
      const it = e.target.closest("[data-pin]");
      previewRef(it ? pinKey(it.dataset.pin) : null, 110);
    });
    $("deck-panel").addEventListener("mouseleave", () => previewRef(null));
    // Focus handed back by the page (after unpinning) is not the user reaching for a row: no preview.
    let quietFocus = false;
    $("deck-panel").addEventListener("focusin", (e) => {
      const it = e.target.closest("[data-pin]");
      if (it && !quietFocus) previewRef(pinKey(it.dataset.pin));
    });
    $("deck-panel").addEventListener("focusout", (e) => {
      if (!$("deck-panel").contains(e.relatedTarget)) previewRef(null);
    });
    // Up and down walk the rows (three tab stops each otherwise): a keyboard sweep previews each
    // deck in turn, the way the pointer does.
    $("deck-panel").addEventListener("keydown", (e) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const cur = e.target.closest(".dp-link");
      if (!cur) return;
      const links = [...$("deck-panel").querySelectorAll(".dp-link")];
      const next = links[links.indexOf(cur) + (e.key === "ArrowDown" ? 1 : -1)];
      if (!next) return;
      e.preventDefault();
      next.focus();
      next.scrollIntoView({ block: "nearest" });
    });
    // "Differences only" on or off: a reading of the usage lists, so it brings that view.
    const setGaps = (on) => {
      gapsOnly = on;
      if (on) view = "usage";
      renderRef();
      renderView();
      applyRef();
    };
    $("mine-add").addEventListener("click", () => openInput("mine"));
    $("fields-close").addEventListener("click", closeAdd);
    $("modal-backdrop").addEventListener("click", closeAdd);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && pooledDecks.length && inputExpanded) closeAdd();
    });
    updateCount();
    applyInputState();

    $("view-seg").addEventListener("click", (e) => {
      const b = e.target.closest("[data-view]");
      if (b) {
        view = b.dataset.view;
        if (view !== "usage" && gapsOnly) { gapsOnly = false; renderRef(); }   // a reading of the usage lists only
        renderView();
        applyRef();
      }
    });
    $("cat-pills").addEventListener("click", (e) => {
      const b = e.target.closest("[data-cat]");
      if (b) { cat = b.dataset.cat; renderCats(); renderUsage(); applyRef(); }
    });

    document.addEventListener("change", (e) => {
      const cb = e.target.closest("[data-sel]");
      if (cb) { const n = cb.dataset.sel; cb.checked ? selected.add(n) : selected.delete(n); updateSelbar(); }
    });
    document.addEventListener("click", (e) => {
      // The strip is redrawn under these buttons: focus goes back to its counterpart, or to the
      // row that was pinned once the strip is gone, never to the page.
      if (e.target.closest("[data-unpin]")) {
        const was = pinned;
        setPinned(null);
        quietFocus = true;
        $("deck-panel").querySelector(`[data-pin="${was}"] .dp-link`)?.focus();
        quietFocus = false;
        if (document.activeElement === document.body) $("mine-add").focus();
        return;
      }
      if (e.target.closest("[data-gaps]")) {
        setGaps(!gapsOnly);
        $("ref").querySelector("[data-gaps]")?.focus();
        return;
      }
      if (e.target.closest("[data-refdetail]")) { openDetail(); return; }
      const rl = e.target.closest("[data-reloadmine]");
      if (rl) { reloadMine(rl); return; }
      const cl = e.target.closest("[data-closest]");
      if (cl) { openDetail(parseInt(cl.dataset.closest, 10)); return; }
      if (e.target.closest("[data-vsmine]")) { openDetail("mine"); return; }
      const gj = e.target.closest("[data-gapsjump]");
      if (gj) {
        setGaps(true);
        const to = $(gj.dataset.gapsjump);
        if (to) {
          // Under the sticky topbar. Rows are skipped until near the screen (content-visibility),
          // so the ones drawn on arrival may differ from their estimate: land a second time.
          const land = () => window.scrollTo({ top: to.getBoundingClientRect().top + window.scrollY - 76 });
          land();
          requestAnimationFrame(() => requestAnimationFrame(land));
          to.tabIndex = -1;
          to.focus({ preventScroll: true });
        }
        return;
      }
      const rm = e.target.closest("[data-rmdeck]");
      if (rm) { removeDeck(parseInt(rm.dataset.rmdeck, 10)); return; }
      const fa = e.target.closest("[data-flt]");
      if (fa) { addFilter(fa.dataset.fname, fa.dataset.fboard, fa.dataset.flt); return; }
      const rf = e.target.closest("[data-rmfilter]");
      if (rf) { removeFilter(parseInt(rf.dataset.rmfilter, 10)); return; }
      if (e.target.closest("[data-clearfilters]")) { clearFilters(); return; }
      const cs = e.target.closest("[data-copystat]");
      if (cs) { copyStat(cs); return; }
      const cp = e.target.closest("[data-copy]");
      if (cp) { copy(cp.dataset.copy).then((ok) => ok && copied(cp)); return; }
      const ct = e.target.closest("[data-copyid]");
      if (ct) { copy(payloads[ct.dataset.copyid] || "").then((ok) => ok && copied(ct)); return; }
      const sa = e.target.closest("[data-selid]");
      if (sa) {
        (payloads[sa.dataset.selid] || []).forEach((n) => selected.add(n));
        document.querySelectorAll("[data-sel]").forEach((cb) => { if (selected.has(cb.dataset.sel)) cb.checked = true; });
        updateSelbar();
      }
    });
    document.addEventListener("mouseover", (e) => {
      const nm = e.target.closest("[data-name]");
      if (nm) preview(nm.dataset.name, nm);
      else if (pvFloating.matches && pvCurrent) {
        clearTimeout(pvDropTimer);
        pvDropTimer = setTimeout(() => { pvCurrent = null; $("pv-stage").classList.remove("has"); $("pv-name").textContent = ""; }, 400);
      }
    });
    $("sel-copy").addEventListener("click", () => copy([...selected].join("\n")).then((ok) => ok && copied($("sel-copy"))));
    $("sel-clear").addEventListener("click", () => {
      selected.clear();
      document.querySelectorAll("[data-sel]").forEach((cb) => (cb.checked = false));
      updateSelbar();
    });

    // An archetype seed wins over the saved pool: start fresh in ephemeral seed mode (nothing
    // is persisted, so the user's saved pool survives untouched), stage the URLs and analyze.
    // With no seed, restore the saved pool as usual.
    restoreMine().then(consumePoolSeed).then((seed) => {
      if (seed) {
        const seedDecks = seed.decks;
        seedArchetype = typeof seed.archetype === "string" && seed.archetype.trim() ? seed.archetype.trim() : null;
        seedMode = true;
        seedNameByUrl = new Map(seedDecks.filter((d) => d.name).map((d) => [d.url, d.name]));
        $("urls").value = seedDecks.map((d) => d.url).join("\n");
        updateCount();
        inputExpanded = true;
        applyInputState();
        addToPool();   // fetches, names by pilot/event, analyzes; savePool() is a no-op in seed mode
        return;
      }
      restorePool().then((restored) => {
        if (restored) { updateCount(); applyInputState(); reanalyze(); }
      });
    });
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
