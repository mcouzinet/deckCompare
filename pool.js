// Deck Compare — pool analyzer page.
// Fetches N decklists in-browser (background FETCH_DECKS), enriches via Scryfall
// (enrich.js), analyzes (pool-analyze.js), renders card-usage across the pool.
(function () {
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const $ = (id) => document.getElementById(id);
  const M = (key) => chrome.i18n.getMessage(key);

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
  const imgCache = new Map(); // image_uri -> dataUrl
  const pooledDecks = []; // the editable pool (add/remove + re-analyze)
  const pastedTextsSeen = new Set(); // raw text of pasted decks currently in the pool (dedup)
  const enrichMap = new Map(); // persists across adds; only new names are fetched
  let poolErrors = [];
  let inputExpanded = true; // once a pool exists, the input collapses to a "+ Ajouter" bar

  // Collapse the big input once a pool exists; keep it open while empty / when expanded.
  function applyInputState() {
    const hasPool = pooledDecks.length > 0;
    $("intro").classList.toggle("hide", hasPool);
    const showFields = !hasPool || inputExpanded;
    $("input-fields").classList.toggle("hide", !showFields);
    $("add-toggle").classList.toggle("hide", !hasPool || inputExpanded);
    $("fields-close").classList.toggle("hide", !(hasPool && inputExpanded));
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
    const t = (d.label || "").trim();
    if (!t) return d.source;
    if (/^(moxfield|archidekt|mtgtop8|mtggoldfish|magic-ville|mtgdecks|text) deck$/i.test(t)) return d.source;
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
      if (res && res.decks) newDecks.push(...res.decks);
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
    for (const d of pooledDecks) for (const b of ["mainboard", "sideboard", "commanders"]) for (const n of Object.keys(d[b])) names.add(n);
    const missing = [...names].filter((n) => !window.Enrich.enrichmentFor(enrichMap, n));
    if (missing.length) {
      const m2 = await window.Enrich.enrichCards(missing);
      for (const [k, v] of m2) if (!enrichMap.has(k)) enrichMap.set(k, v);
    }
    analysis = window.PoolAnalyze.analyzePool(pooledDecks, enrichMap, poolErrors.slice());

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
      reanalyze();
    }
  }

  // ---- render ----
  function renderAll() {
    renderHero();
    renderDeckList();
    renderCats();
    renderView();
    renderCurve();
    renderSide();
    updateSelbar();
  }

  async function fetchImg(url) {
    if (!url) return null;
    if (imgCache.has(url)) return imgCache.get(url);
    const r = await sendToBackground({ type: "FETCH_IMAGE", url });
    const dataUrl = r && r.dataUrl ? r.dataUrl : null;
    if (dataUrl) imgCache.set(url, dataUrl);
    return dataUrl;
  }

  function renderHero() {
    const top = analysis.commanders[0];
    const total = analysis.total_decks;
    const commons = analysis.cardStats.filter((c) => c.deck_count === total).length;
    $("hero-eyebrow").textContent = analysis.commanders.length > 1 ? M("poolMainCommander") : M("poolCommander");
    $("hero-name").textContent = top ? top.name : M("poolDeckPool");

    let pips = [];
    try { pips = JSON.parse(analysis.color_identity || "[]"); } catch (e) {}
    $("hero-pips").innerHTML = pips.length
      ? pips.map((c) => `<span class="cpip ${c}"></span>`).join("")
      : `<span class="cpip C"></span>`;

    $("hero-stats").innerHTML = [
      [total, M("poolDecksAnalyzed"), false],
      [commons, M("poolSharedCardsStat"), true],
      [analysis.cardStats.length, M("poolDistinctCards"), false],
    ].map(([n, l, a]) => `<div class="stat"><div class="n ${a ? "accent" : ""}">${n}</div><div class="l">${l}</div></div>`).join("");

    const art = $("hero-art");
    art.classList.remove("has");
    if (top && top.card && top.card.image_uri) {
      fetchImg(top.card.image_uri).then((d) => { if (d) { $("hero-img").src = d; art.classList.add("has"); } });
    }
  }

  // Persistent list of the decks in the pool (right rail): name → opens URL, × → removes.
  function renderDeckList() {
    const decks = analysis.decks;
    let html = `<div class="dp-head">${M("poolDecksInPool")} <span class="dp-c">${decks.length}</span></div>`;
    html += decks.map((d) => {
      const name = esc(deckDisplayName(d));
      const inner = `<span class="dp-hash">#${d.index}</span><span class="dp-n">${name}</span><span class="dp-src">${esc(d.source)}</span>`;
      const link = d.url
        ? `<a class="dp-link" href="${esc(d.url)}" target="_blank" rel="noopener" title="${M("poolOpen")} ${name}">${inner}</a>`
        : `<span class="dp-link">${inner}</span>`;
      return `<div class="dp-item">${link}<button class="dp-x" data-rmdeck="${d.index - 1}" title="${M("poolRemoveFromPool")}">×</button></div>`;
    }).join("");

    const errs = analysis.errors || [];
    if (errs.length) {
      const ignoredLabel = errs.length > 1 ? M("poolDeckIgnoredPlural") : M("poolDeckIgnoredSingular");
      html += `<div class="dp-errs"><b>${errs.length} ${ignoredLabel}</b>` +
        errs.slice(0, 8).map((e) => `<div class="dp-err" title="${esc((e.url || "?") + " — " + e.error)}">${esc(e.url || "?")} — ${esc(e.error)}</div>`).join("") + `</div>`;
    }
    $("deck-panel").innerHTML = html;
  }

  function renderCats() {
    $("cat-pills").innerHTML = CATS.map((c) => `<button class="pill ${c.key === cat ? "active" : ""}" data-cat="${c.key}">${c.label}</button>`).join("");
  }

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
    let badges = "";
    if (opts.badges && c.deck_indices) {
      badges = `<div class="pbadges">` + c.deck_indices.map((i) => {
        const d = analysis.decks[i - 1];
        const title = d ? esc(`#${i} — ${deckDisplayName(d)}`) : `#${i}`;
        return d && d.url
          ? `<a class="pbadge" href="${esc(d.url)}" target="_blank" rel="noopener" title="${title}">#${i}</a>`
          : `<span class="pbadge" title="${title}">#${i}</span>`;
      }).join("") + `</div>`;
    }
    return `<div class="prow"><input type="checkbox" data-sel="${esc(c.name)}" ${checked}>` +
      `<span class="nm" data-name="${esc(c.name)}">${esc(c.name)}${xq}</span>${copy}${right}</div>${badges}`;
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
        variable.map((c) => row(c, { frac: true, badges: true })).join("") + `</div>`;
    }
    if (!commons.length && !variable.length) html = `<div class="sect"><div class="empty">${M("poolNoCardsInCategory")}</div></div>`;
    $("sections").innerHTML = html;
  }

  function renderAverage() {
    payloadId = 0; payloads = {};
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
      s.slice(0, 20).map((c) => `<div class="prow"><span class="nm" data-name="${esc(c.name)}" style="margin-left:0">${esc(c.name)}</span><span class="frac">${c.deck_count}/${c.total_decks}</span></div>`).join("") + `</div>`;
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
    $("add-toggle").addEventListener("click", () => { inputExpanded = true; applyInputState(); $("urls").focus(); });
    $("fields-close").addEventListener("click", () => { inputExpanded = false; applyInputState(); });
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
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
