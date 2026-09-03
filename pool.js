// Deck Compare — pool analyzer page.
// Fetches N decklists in-browser (background FETCH_DECKS), enriches via Scryfall
// (enrich.js), analyzes (pool-analyze.js), renders card-usage across the pool.
(function () {
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const $ = (id) => document.getElementById(id);
  const M = (key) => chrome.i18n.getMessage(key);
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
  const POOL_KEY = "poolDecks";                 // persisted pool (survives tab close / restart)
  const FILTER_KEY = "poolFilters";             // the card filters that go with the saved pool
  const SEED_KEY = "poolSeed";                  // one-shot {url,name} list from the archetype button
  const ENRICH_TTL = 30 * 24 * 60 * 60 * 1000;  // 30 days — Scryfall card data is stable

  // Collapse the big input once a pool exists; keep it open while empty / when expanded.
  // Once a pool exists, expanding it opens the fields as a popin over the page (rather than
  // inline above the analysis) so it stays reachable no matter how far the user has scrolled.
  function applyInputState() {
    const hasPool = pooledDecks.length > 0;
    $("intro").classList.toggle("hide", hasPool);
    const showFields = !hasPool || inputExpanded;
    $("input-fields").classList.toggle("hide", !showFields);
    $("add-toggle").classList.toggle("hide", !hasPool || inputExpanded);
    $("fields-close").classList.toggle("hide", !(hasPool && inputExpanded));
    const asModal = hasPool && inputExpanded;
    $("input-panel").classList.toggle("modal-open", asModal);
    $("modal-backdrop").classList.toggle("hide", !asModal);
    document.body.classList.toggle("modal-locked", asModal);
    renderTabPicker();   // refresh whenever the input (re)appears; async, fire-and-forget
  }

  // ---- open-tab picker: reuse a deck you already have open, same scan as the popup ----
  // One click appends the tab's URL to the links box; the pool is multi-deck, so several
  // tabs can be stacked before Analyze. Tabs already pooled or already staged are dropped,
  // so a chip never adds a duplicate.
  async function renderTabPicker() {
    let tabs;
    try { tabs = await Shared.getOpenDeckTabs(location.href); } catch { tabs = []; }
    const pooled = new Set(pooledDecks.map((d) => d.url).filter(Boolean));
    const staged = new Set(parseUrls());
    const avail = tabs.filter((t) => !pooled.has(t.url) && !staged.has(t.url));
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
    box.value = cur ? cur + "\n" + url : url;
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

  function deckDisplayName(d) {
    // Takes either a pooled deck (`name`, where the archetype rename lands) or an
    // analysis deck ref (pool-analyze.js copies that name into `label`).
    const t = (d.label || d.name || "").trim();
    if (!t) return d.source;
    if (/^(moxfield|archidekt|mtgtop8|mtggoldfish|magic-ville|mtgdecks|melee|paird|text) deck$/i.test(t)) return d.source;
    if (/^deck \d+$/i.test(t)) return d.source;
    return t;
  }

  // ---- pasted decklist parser (for the "texts" box) ----
  function parseDecklistText(text, name) {
    const deck = { name: name || M("poolPastedDeckName"), source: "text", url: "", mainboard: {}, sideboard: {}, commanders: {} };
    const add = (b, n, q) => { if (n && q > 0) b[n] = (b[n] || 0) + q; };
    const clean = (s) => s.replace(/\s*\([A-Za-z0-9]{2,6}\)\s*[A-Za-z0-9-]*\s*$/, "").replace(/\s*\[[^\]]*\]\s*$/, "").replace(/\s+\*F\*\s*$/i, "").replace(/\s+#.*$/, "").trim();
    let section = "mainboard";
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      const h = line.toLowerCase().replace(/[:()]/g, "").trim();
      if (/^commanders?$|^commandants?$/.test(h)) { section = "commanders"; continue; }
      if (/^(deck|mainboard|maindeck|main|deck principal)$/.test(h)) { section = "mainboard"; continue; }
      if (/^(sideboard|réserve|reserve|companion|compagnon)$/.test(h)) { section = "sideboard"; continue; }
      const m = line.match(/^(\d+)\s*[xX]?\s+(.+)$/);
      if (m) add(deck[section], clean(m[2]), parseInt(m[1], 10));
    }
    return Shared.fixCommanderHeuristic(deck);
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
    $("count").textContent = parts.join(" · ");
    $("run").disabled = u + t === 0;
    $("run").textContent = pooledDecks.length ? M("poolAddToPoolBtn") : M("poolAnalyzeBtn");
  }

  // Fetch the input's URLs/texts and append them to the pool, then re-analyze.
  async function addToPool() {
    const urls = parseUrls();
    const texts = parseTexts();
    if (!urls.length && !texts.length) return;
    $("err").classList.add("hide");
    $("run").disabled = true;
    poolErrors = [];
    $("loading").classList.remove("hide");
    $("loading").textContent = M("poolFetchingDecks");

    const newDecks = [];
    const existing = new Set(pooledDecks.map((d) => d.url).filter(Boolean));
    const newUrls = urls.filter((u) => !existing.has(u));
    if (newUrls.length) {
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
    $("urls").value = "";
    $("texts").value = "";
    inputExpanded = false;
    updateCount();
    applyInputState();
    await reanalyze();
  }

  // Enrich any new names, analyze the current pool, render.
  async function reanalyze() {
    if (!pooledDecks.length) {
      if (filters.length) { filters.length = 0; savePool(); }   // nothing left to filter
      analysis = null;
      $("results").classList.add("hide");
      $("loading").classList.add("hide");
      inputExpanded = true;
      updateCount();
      applyInputState();
      return;
    }
    $("loading").classList.remove("hide");
    $("loading").textContent = M("poolEnriching");
    const names = new Set();
    for (const d of pooledDecks) for (const b of BOARDS) for (const n of Object.keys(d[b] || {})) names.add(n);
    let missing = [...names].filter((n) => !window.Enrich.enrichmentFor(enrichMap, n));
    if (missing.length) {
      // 1) seed from the persistent cross-session cache before hitting Scryfall
      const cached = await Shared.cacheRead("poolEnrichCache", ENRICH_TTL);
      for (const n of missing) {
        const hit = cached[n.toLowerCase()];
        if (hit) for (const k of window.Enrich.nameKeys(hit.name || n)) if (!enrichMap.has(k)) enrichMap.set(k, hit);
      }
      // 2) fetch only what's still unknown, then persist the new entries
      missing = [...names].filter((n) => !window.Enrich.enrichmentFor(enrichMap, n));
      if (missing.length) {
        const m2 = await window.Enrich.enrichCards(missing);
        const toCache = {};
        for (const [k, v] of m2) { if (!enrichMap.has(k)) enrichMap.set(k, v); toCache[k] = v; }
        await Shared.cacheMerge("poolEnrichCache", toCache, ENRICH_TTL);
      }
    }
    // The filters pick the subset that gets analyzed; the rest stays in the pool, struck
    // through in the rail, one chip away from coming back. Enrichment above covers the
    // whole pool, so toggling a filter never fetches.
    activeIdx = [];
    pooledDecks.forEach((d, i) => { if (window.PoolAnalyze.matchesFilters(d, filters)) activeIdx.push(i); });
    analysis = window.PoolAnalyze.analyzePool(activeIdx.map((i) => pooledDecks[i]), enrichMap, poolErrors.slice());

    imgByName.clear();
    for (const c of [...analysis.cardStats, ...analysis.sideboardStats]) if (c.image_uri) imgByName.set(c.name, c.image_uri);
    for (const cm of analysis.commanders) if (cm.card && cm.card.image_uri) imgByName.set(cm.card.name, cm.card.image_uri);

    $("loading").classList.add("hide");
    $("results").classList.remove("hide");
    renderAll();
  }

  function removeDeck(idx) {
    if (idx >= 0 && idx < pooledDecks.length) {
      const [removed] = pooledDecks.splice(idx, 1);
      if (removed && removed._rawText) pastedTextsSeen.delete(removed._rawText);
      savePool();
      reanalyze();
    }
  }

  // ---- card filters (mtgtop8 compare's ✔ / ✖) ----
  // Re-filtering a card replaces its rule (with ↔ without) instead of stacking a
  // contradiction that would empty the pool.
  function addFilter(name, board, mode) {
    const i = filters.findIndex((f) => f.name === name && f.board === board);
    if (i >= 0) filters.splice(i, 1);
    filters.push({ name, board, mode });
    savePool();
    reanalyze();
  }
  function removeFilter(idx) {
    if (idx < 0 || idx >= filters.length) return;
    filters.splice(idx, 1);
    savePool();
    reanalyze();
  }
  function clearFilters() {
    if (!filters.length) return;
    filters.length = 0;
    savePool();
    reanalyze();
  }

  // ---- pool persistence (chrome.storage.local) ----
  // Decks carry their parsed boards, so a restored pool needs no site refetch —
  // only Scryfall enrichment, which the poolEnrichCache serves from disk.
  function savePool() {
    if (seedMode) return;   // an archetype pool is ephemeral — never overwrite the saved pool
    try { chrome.storage.local.set({ [POOL_KEY]: pooledDecks, [FILTER_KEY]: filters }); } catch (e) { /* quota — ignore */ }
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
    pooledDecks.push(...saved);
    for (const d of saved) if (d._rawText) pastedTextsSeen.add(d._rawText);
    // The filters are a view on that pool: restore them with it (shape-checked — storage
    // is ours, but a stale or hand-edited entry must not break the page).
    for (const f of Array.isArray(stored[FILTER_KEY]) ? stored[FILTER_KEY] : []) {
      if (f && typeof f.name === "string" && BOARDS.includes(f.board) && (f.mode === "with" || f.mode === "without")) {
        filters.push({ name: f.name, board: f.board, mode: f.mode });
      }
    }
    inputExpanded = false;
    return true;
  }

  // ---- render ----
  function renderAll() {
    renderHero();
    renderFilters();
    renderDeckList();
    renderCats();
    renderView();
    renderCurve();
    renderSide();
    updateSelbar();
  }

  // Scryfall URLs are used as-is: the manifest's img-src allows them, so the browser
  // loads and caches them itself. This used to proxy every image through the service
  // worker as base64 only because the CSP blocked remote images, which cost a round trip
  // per card and a cache that died with the page. Kept async so callers are unchanged.
  async function fetchImg(url) {
    return url || null;
  }

  function renderHero() {
    const top = analysis.commanders[0];
    const total = analysis.total_decks;
    const commons = analysis.cardStats.filter((c) => c.deck_count === total).length;
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
    $("hero-eyebrow").textContent = role;
    $("hero-eyebrow").classList.toggle("hide", !role);

    let pips = [];
    try { pips = JSON.parse(analysis.color_identity || "[]"); } catch (e) {}
    $("hero-pips").innerHTML = pips.length
      ? pips.map((c) => `<span class="cpip ${c}"></span>`).join("")
      : `<span class="cpip C"></span>`;

    // Filtered: "12/20" — the pool is still 20 decks, 12 of them are on the table.
    const decksN = filters.length ? `${total}<span class="of">/${pooledDecks.length}</span>` : String(total);
    $("hero-stats").innerHTML = [
      [decksN, M("poolDecksAnalyzed"), false],
      [commons, M("poolSharedCardsStat"), true],
      [analysis.cardStats.length, M("poolDistinctCards"), false],
    ].map(([n, l, a]) => `<div class="stat"><div class="n ${a ? "accent" : ""}">${n}</div><div class="l">${l}</div></div>`).join("");

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
    const head = `<div class="dp-head">${M("poolDecksInPool")} <span class="dp-c">${count}</span></div>`;
    const rows = pooledDecks.map((d, i) => {
      const name = esc(deckDisplayName(d));
      const off = !kept.has(i);
      const inner = `<span class="dp-hash">#${i + 1}</span><span class="dp-n">${name}</span><span class="dp-src">${esc(d.source)}</span>`;
      const link = d.url
        ? `<a class="dp-link" href="${esc(d.url)}" target="_blank" rel="noopener" title="${M("poolOpen")} ${name}">${inner}</a>`
        : `<span class="dp-link">${inner}</span>`;
      return `<div class="dp-item${off ? " off" : ""}"${off ? ` title="${M("poolFilteredOut")}"` : ""}>${link}<button class="dp-x" data-rmdeck="${i}" title="${M("poolRemoveFromPool")}">×</button></div>`;
    }).join("");

    let errsHtml = "";
    const errs = analysis.errors || [];
    if (errs.length) {
      const ignoredLabel = errs.length > 1 ? M("poolDeckIgnoredPlural") : M("poolDeckIgnoredSingular");
      errsHtml = `<div class="dp-errs"><b>${errs.length} ${ignoredLabel}</b>` +
        errs.slice(0, 8).map((e) => `<div class="dp-err" title="${esc((e.url || "?") + " — " + e.error)}">${esc(e.url || "?")} — ${esc(e.error)}</div>`).join("") + `</div>`;
    }
    $("deck-panel").innerHTML = head + `<div class="dp-list">${rows}</div>` + errsHtml;
  }

  function renderCats() {
    $("cat-pills").innerHTML = CATS.map((c) => `<button class="pill ${c.key === cat ? "active" : ""}" data-cat="${c.key}">${c.label}</button>`).join("");
  }

  // Keep / drop the decks a row counted — mtgtop8 compare's ✔ / ✖. Both go inert once
  // every deck plays the card: keep would change nothing, drop would empty the pool.
  const ICON_KEEP = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10.5l4 4 8-9"/></svg>`;
  const ICON_DROP = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 5l10 10M15 5L5 15"/></svg>`;
  function filterButtons(c, board) {
    const off = c.deck_count >= c.total_decks ? " disabled" : "";
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
  function row(c, opts) {
    opts = opts || {};
    const checked = selected.has(c.name) ? "checked" : "";
    const xq = c.avg_copies > 1 ? `<span class="xq">×${c.avg_copies}</span>` : "";
    const copy = `<button class="cp" data-copy="${esc(c.name)}" title="${M("poolCopyName")}"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="7" y="7" width="9" height="9" rx="1.5"/><path d="M4 13V4.5A1.5 1.5 0 0 1 5.5 3H13"/></svg></button>`;
    let right;
    if (opts.bar) {
      right = `<div class="bar"><i style="width:${c.percentage}%"></i></div><span class="pct">${c.percentage}%</span>`;
    } else if (opts.frac) {
      right = `<span class="frac">${c.deck_count}/${c.total_decks}</span><span class="pct">${c.percentage}%</span>`;
    } else {
      right = `<span class="pct">${c.percentage}%</span>`;
    }
    const flt = opts.filter ? filterButtons(c, opts.filter) : "";
    let badges = "";
    if (opts.badges && c.deck_indices) {
      // deck_indices count within the analyzed subset; badges show the pool's own #n so
      // a badge and the rail always name the same deck, filters or not.
      badges = `<div class="pbadges">` + c.deck_indices.map((k) => {
        const pi = activeIdx[k - 1];
        const d = pi == null ? null : pooledDecks[pi];
        const n = pi == null ? k : pi + 1;
        const title = d ? esc(`#${n} — ${deckDisplayName(d)}`) : `#${n}`;
        return d && d.url
          ? `<a class="pbadge" href="${esc(d.url)}" target="_blank" rel="noopener" title="${title}">#${n}</a>`
          : `<span class="pbadge" title="${title}">#${n}</span>`;
      }).join("") + `</div>`;
    }
    return `<div class="prow"><input type="checkbox" data-sel="${esc(c.name)}" ${checked}>` +
      `<span class="nm" data-name="${esc(c.name)}">${esc(c.name)}${xq}</span>${copy}${flt}${right}</div>${badges}`;
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
    const total = analysis.total_decks;
    const filtered = analysis.cardStats.filter((c) => matchCat(c.type_line, cat));
    const commons = filtered.filter((c) => c.deck_count === total);
    const variable = filtered.filter((c) => c.deck_count < total);
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
        cmdNames.map((n) => `<div class="prow"><input type="checkbox" data-sel="${esc(n)}" ${selected.has(n) ? "checked" : ""}><span class="nm" data-name="${esc(n)}">${esc(n)}</span></div>`).join("") + `</div>`;
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
      s.slice(0, 20).map((c) => `<div class="prow"><span class="nm" data-name="${esc(c.name)}" style="margin-left:0">${esc(c.name)}</span>${filterButtons(c, "sideboard")}<span class="frac">${c.deck_count}/${c.total_decks}</span></div>`).join("") + `</div>`;
  }

  // ---- selection ----
  function updateSelbar() {
    const n = selected.size;
    const cardWord = n > 1 ? M("poolCardPlural") : M("poolCardSingular");
    const selWord = n > 1 ? M("poolSelectedPlural") : M("poolSelectedSingular");
    $("sel-n").textContent = `${n} ${cardWord} ${selWord}`;
    $("selbar").classList.toggle("show", n > 0);
  }
  function copy(text) { navigator.clipboard.writeText(text).catch(() => {}); }

  // ---- hover preview ----
  let pvCurrent = null;
  function preview(name) {
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
    $("add-toggle").textContent = M("poolAddDecksBtn");
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

    $("urls").addEventListener("input", updateCount);
    $("texts").addEventListener("input", updateCount);
    $("run").addEventListener("click", addToPool);
    $("tabpick-list").addEventListener("click", (e) => {
      const item = e.target.closest(".tabpick-item");
      if (item) stageTabUrl(item.dataset.tabUrl);
    });
    $("add-toggle").addEventListener("click", () => { inputExpanded = true; applyInputState(); $("urls").focus(); });
    $("fields-close").addEventListener("click", () => { inputExpanded = false; applyInputState(); });
    $("modal-backdrop").addEventListener("click", () => { inputExpanded = false; applyInputState(); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && pooledDecks.length && inputExpanded) { inputExpanded = false; applyInputState(); }
    });
    updateCount();
    applyInputState();

    $("view-seg").addEventListener("click", (e) => {
      const b = e.target.closest("[data-view]");
      if (b) { view = b.dataset.view; renderView(); }
    });
    $("cat-pills").addEventListener("click", (e) => {
      const b = e.target.closest("[data-cat]");
      if (b) { cat = b.dataset.cat; renderCats(); renderUsage(); }
    });

    document.addEventListener("change", (e) => {
      const cb = e.target.closest("[data-sel]");
      if (cb) { const n = cb.dataset.sel; cb.checked ? selected.add(n) : selected.delete(n); updateSelbar(); }
    });
    document.addEventListener("click", (e) => {
      const rm = e.target.closest("[data-rmdeck]");
      if (rm) { removeDeck(parseInt(rm.dataset.rmdeck, 10)); return; }
      const fa = e.target.closest("[data-flt]");
      if (fa) { addFilter(fa.dataset.fname, fa.dataset.fboard, fa.dataset.flt); return; }
      const rf = e.target.closest("[data-rmfilter]");
      if (rf) { removeFilter(parseInt(rf.dataset.rmfilter, 10)); return; }
      if (e.target.closest("[data-clearfilters]")) { clearFilters(); return; }
      const cp = e.target.closest("[data-copy]");
      if (cp) { copy(cp.dataset.copy); return; }
      const ct = e.target.closest("[data-copyid]");
      if (ct) { copy(payloads[ct.dataset.copyid] || ""); return; }
      const sa = e.target.closest("[data-selid]");
      if (sa) {
        (payloads[sa.dataset.selid] || []).forEach((n) => selected.add(n));
        document.querySelectorAll("[data-sel]").forEach((cb) => { if (selected.has(cb.dataset.sel)) cb.checked = true; });
        updateSelbar();
      }
    });
    document.addEventListener("mouseover", (e) => {
      const nm = e.target.closest("[data-name]");
      if (nm) preview(nm.dataset.name);
    });
    $("sel-copy").addEventListener("click", () => copy([...selected].join("\n")));
    $("sel-clear").addEventListener("click", () => {
      selected.clear();
      document.querySelectorAll("[data-sel]").forEach((cb) => (cb.checked = false));
      updateSelbar();
    });

    // An archetype seed wins over the saved pool: start fresh in ephemeral seed mode (nothing
    // is persisted, so the user's saved pool survives untouched), stage the URLs and analyze.
    // With no seed, restore the saved pool as usual.
    consumePoolSeed().then((seed) => {
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
