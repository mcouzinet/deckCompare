// Pool analysis — computes card usage across a set of decklists (no DB, no
// server). Port of the DeckStructure analyzer to plain JS. Dual-mode export;
// uses Enrich.enrichmentFor (enrich.js must load first in the page).
(function (global) {
  const enrichmentFor =
    typeof module !== "undefined" && module.exports
      ? require("./enrich").enrichmentFor
      : global.Enrich.enrichmentFor;

  const WUBRG = ["W", "U", "B", "R", "G"];
  const CONSENSUS = 50;   // the consensus: cards at least half the decks play (the curve's threshold too)
  const RARE = 20;        // off the beaten track: cards fewer than one deck in five plays
  const round1 = (n) => Math.round(n * 10) / 10;

  function unionColorIdentity(cards) {
    const set = new Set();
    let any = false;
    for (const c of cards) {
      if (!c || !c.color_identity) continue;
      any = true;
      try {
        JSON.parse(c.color_identity).forEach((x) => set.add(x));
      } catch (e) {}
    }
    return any ? JSON.stringify(WUBRG.filter((c) => set.has(c))) : null;
  }

  // Per-card usage across the pool for one board.
  function buildStats(decks, board, map, total) {
    const indices = new Map(); // card -> 1-based deck indices
    const copies = new Map();
    decks.forEach((d, i) => {
      for (const name of Object.keys(d[board] || {})) {
        const qty = d[board][name];
        let arr = indices.get(name);
        if (!arr) {
          arr = [];
          indices.set(name, arr);
        }
        arr.push(i + 1);
        copies.set(name, (copies.get(name) || 0) + qty);
      }
    });
    const stats = [];
    for (const [name, idxs] of indices) {
      const dc = idxs.length;
      const e = enrichmentFor(map, name);
      stats.push({
        name,
        type_line: e ? e.type_line : null,
        mana_cost: e ? e.mana_cost : null,
        cmc: e ? e.cmc : null,
        color_identity: e ? e.color_identity : null,
        image_uri: e ? e.image_uri : null,
        deck_count: dc,
        deck_indices: idxs,
        total_decks: total,
        percentage: round1((dc / total) * 100),
        avg_copies: round1((copies.get(name) || 0) / dc),
      });
    }
    stats.sort((a, b) => b.deck_count - a.deck_count || a.name.localeCompare(b.name));
    return stats;
  }

  function manaCurveFrom(consensus) {
    const buckets = new Map();
    for (const c of consensus) {
      if (c.cmc == null || (c.type_line || "").includes("Land")) continue;
      const b = c.cmc >= 7 ? 7 : Math.floor(c.cmc);
      buckets.set(b, (buckets.get(b) || 0) + 1);
    }
    return [...buckets.entries()].map(([cmc, count]) => ({ cmc, count })).sort((a, b) => a.cmc - b.cmc);
  }

  // Average board size, counting copies: usually 99 for a Duel Commander main. An empty
  // main is a failed read and stays out of the mean; an empty sideboard is a real one, so
  // every deck counts toward the sideboard's.
  // The main's size is the median over the decks read (one 107-card list, a maybeboard exported
  // as main, lifted a pool of 100-card decks to a 101-card average decklist, illegal in
  // Commander); the sideboard's is the mean over every deck, those without one included.
  function typicalBoardSize(decks, board) {
    const all = decks.map((d) => Object.values(d[board] || {}).reduce((s, q) => s + q, 0));
    if (board !== "mainboard") return all.length ? Math.round(all.reduce((a, b) => a + b, 0) / all.length) : 0;
    const sizes = all.filter((n) => n > 0).sort((a, b) => a - b);
    if (!sizes.length) return 0;
    const mid = sizes.length >> 1;
    return sizes.length % 2 ? sizes[mid] : Math.round((sizes[mid - 1] + sizes[mid]) / 2);
  }

  // The "average decklist": most-played cards at their rounded avg copies,
  // filled to the pool's average mainboard size (so 100-card decks -> ~99 + cmdr).
  function buildAverageDecklist(cardStats, target) {
    const out = [];
    let count = 0;
    for (const c of cardStats) {
      if (count >= target) break;
      const copies = Math.min(Math.max(1, Math.round(c.avg_copies)), target - count);
      out.push(Object.assign({}, c, { avg_copies: copies }));
      count += copies;
    }
    return out;
  }

  // Card filters, mtgtop8-compare style. Each filter keeps the decks that do (`with`)
  // or don't (`without`) play `name` in `board`; several filters all have to hold.
  // Exact-key match on the board — the same keys buildStats counts — so "keep the decks
  // with X" keeps precisely the decks the X row counted, no more, no fewer.
  function matchesFilters(deck, filters) {
    for (const f of filters || []) {
      const has = ((deck[f.board] || {})[f.name] || 0) > 0;
      if (f.mode === "without" ? has : !has) return false;
    }
    return true;
  }
  function filterDecks(decks, filters) {
    return decks.filter((d) => matchesFilters(d, filters));
  }

  function analyzePool(decks, map, errors, threshold) {
    if (threshold == null) threshold = CONSENSUS;
    const total = decks.length;

    // Commander identity per deck = its command-zone cards, sorted & joined.
    const sigCount = new Map();
    const sigNames = new Map();
    for (const d of decks) {
      const names = Object.keys(d.commanders || {}).sort();
      if (!names.length) continue;
      const sig = names.join(" + ");
      sigCount.set(sig, (sigCount.get(sig) || 0) + 1);
      sigNames.set(sig, names);
    }
    const commanders = [...sigCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([sig, count]) => ({ name: sig, count, card: enrichmentFor(map, sigNames.get(sig)[0]) }));

    const cardStats = buildStats(decks, "mainboard", map, total);
    const sideboardStats = buildStats(decks, "sideboard", map, total);
    const consensus = cardStats.filter((c) => c.percentage >= threshold);

    // The pool's colours: the main commander's identity when there is a command zone; for a
    // 60-card format, the union of what the consensus plays.
    const color_identity = commanders.length
      ? unionColorIdentity(sigNames.get(commanders[0].name).map((n) => enrichmentFor(map, n)))
      : unionColorIdentity(consensus);
    const averageDecklist = buildAverageDecklist(cardStats, typicalBoardSize(decks, "mainboard"));
    const averageSideboard = buildAverageDecklist(sideboardStats, typicalBoardSize(decks, "sideboard"));
    const manaCurve = total >= 2 ? manaCurveFrom(consensus) : [];

    const sources = {};
    for (const d of decks) sources[d.source] = (sources[d.source] || 0) + 1;
    const deckRefs = decks.map((d, i) => ({
      index: i + 1,
      label: d.name || "Deck " + (i + 1),
      source: d.source,
      url: d.url || "",
    }));

    return {
      total_decks: total,
      commanders,
      color_identity,
      decks: deckRefs,
      cardStats,
      sideboardStats,
      averageDecklist,
      averageSideboard,
      manaCurve,
      sources,
      errors: errors || [],
    };
  }

  // ---- one decklist against the pool ("Ma liste", or a deck of the pool pinned) ----

  const statsIndex = new WeakMap();   // analysis -> Map(name -> card stat), built once per analysis
  function statsByName(analysis) {
    let m = statsIndex.get(analysis);
    if (!m) {
      m = new Map(analysis.cardStats.map((c) => [c.name, c]));
      statsIndex.set(analysis, m);
    }
    return m;
  }

  // Copies of the deck's main that the pool plays in at least CONSENSUS % of its decks, over
  // the main's size: "58/99 in the consensus". `selfIn`: the deck is one of the analyzed decks,
  // and is measured against the others (its own copy of each card taken out of every count),
  // exactly as compareToPool over analyzePool(the others) would.
  // Basic lands in a Commander pool: every deck runs a pile of them, so they say nothing about a
  // list's choices, yet counted by the copy they ruled its consensus share (11 of "21/99") and
  // made the deck with 28 basics look the most typical. A 60-card pool keeps them: there, 4
  // Mountains against 3 is a choice.
  const BASICS = new Set(["Plains", "Island", "Swamp", "Mountain", "Forest", "Wastes",
    "Snow-Covered Plains", "Snow-Covered Island", "Snow-Covered Swamp", "Snow-Covered Mountain", "Snow-Covered Forest", "Snow-Covered Wastes"]);
  const skipsBasics = (analysis) => !!(analysis.commanders && analysis.commanders.length);

  function consensusShare(ref, analysis, selfIn) {
    const stats = statsByName(analysis);
    const n = analysis.total_decks - (selfIn ? 1 : 0);
    if (n <= 0) return { qty: 0, total: 0 };   // alone: no other deck to hold a consensus
    const skip = skipsBasics(analysis);
    let qty = 0;
    let total = 0;
    for (const [name, q] of Object.entries(ref.mainboard || {})) {
      if (skip && BASICS.has(name)) continue;
      total += q;
      const c = stats.get(name);
      if (!c) continue;
      const pct = selfIn ? round1(((c.deck_count - 1) / n) * 100) : c.percentage;
      if (pct >= CONSENSUS) qty += q;
    }
    return { qty, total };
  }

  // The average decklist as a deck, in the shape compare.html reads: the pool's main
  // commander, the average main and the average sideboard.
  function averageDeck(analysis, name) {
    const board = (list) => {
      const b = {};
      for (const c of list || []) b[c.name] = c.avg_copies;
      return b;
    };
    const commanders = {};
    if (analysis.commanders[0]) for (const n of analysis.commanders[0].name.split(" + ")) commanders[n] = 1;
    return {
      name: name || "",
      source: "pool",
      url: "",
      commanders,
      mainboard: board(analysis.averageDecklist),
      sideboard: board(analysis.averageSideboard),
    };
  }

  // compare.js's similarity (computeMetrics) over the three boards: the copies both decks
  // play, over the larger deck. The same formula, so the detailed comparison opens on the
  // figure the pool page showed.
  function deckSimilarity(a, b) {
    let shared = 0;
    let totalA = 0;
    let totalB = 0;
    for (const board of ["commanders", "mainboard", "sideboard"]) {
      const A = a[board] || {};
      const B = b[board] || {};
      for (const n of Object.keys(A)) {
        totalA += A[n];
        if (B[n]) shared += Math.min(A[n], B[n]);
      }
      for (const n of Object.keys(B)) totalB += B[n];
    }
    return Math.round((shared / Math.max(totalA, totalB, 1)) * 100);
  }

  // A card of the list the pool does not play: a usage row at 0 %, typed like the others.
  function cardStub(name, map, total) {
    const e = enrichmentFor(map, name);
    return {
      name,
      type_line: e ? e.type_line : null,
      mana_cost: e ? e.mana_cost : null,
      cmc: e ? e.cmc : null,
      color_identity: e ? e.color_identity : null,
      image_uri: e ? e.image_uri : null,
      deck_count: 0,
      deck_indices: [],
      total_decks: total,
      percentage: 0,
      avg_copies: 0,
    };
  }

  // One decklist against the analyzed pool, mainboard only like the usage view. The deck must not
  // be one of the analyzed decks (a deck of the pool is read against analyzePool(the others)):
  // nothing here feeds the pool's own figures.
  //   consensus  copies of its main in the consensus, over its main's size
  //   core       of the cards every deck plays, how many it plays
  //   gaps       consensus cards it lacks, in the pool's order
  //   extras     its cards the pool plays in under RARE % of decks (0 % when the pool has none)
  //   counts     consensus cards it plays in another number than the pool's rounded average
  //   similarity to the average decklist, as compare.html computes it
  function compareToPool(ref, analysis, map) {
    const main = ref.mainboard || {};
    const stats = statsByName(analysis);
    const skip = skipsBasics(analysis);   // no basic land among the gaps or the other counts either
    const every = analysis.cardStats.filter((c) => c.deck_count === c.total_decks);
    const extras = [];
    for (const name of Object.keys(main)) {
      const c = stats.get(name);
      if (!c) extras.push(cardStub(name, map, analysis.total_decks));
      else if (c.percentage < RARE) extras.push(c);
    }
    extras.sort((a, b) => b.percentage - a.percentage || a.name.localeCompare(b.name));
    return {
      consensus: consensusShare(ref, analysis),
      core: { played: every.filter((c) => main[c.name] > 0).length, total: every.length },
      gaps: analysis.cardStats.filter((c) => c.percentage >= CONSENSUS && !(main[c.name] > 0) && !(skip && BASICS.has(c.name))),
      extras,
      counts: analysis.cardStats.filter((c) => c.percentage >= CONSENSUS && main[c.name] > 0 && main[c.name] !== Math.round(c.avg_copies) && !(skip && BASICS.has(c.name))),
      similarity: deckSimilarity(ref, averageDeck(analysis)),
    };
  }

  // The deck of `decks` nearest to `ref`, by the same similarity; `skip` leaves out an index (the
  // reference itself, when it is one of them). The first of equals wins. null when none is left.
  function closestDeck(ref, decks, skip) {
    let best = null;
    decks.forEach((d, i) => {
      if (i === skip) return;
      const similarity = deckSimilarity(ref, d);
      if (!best || similarity > best.similarity) best = { index: i, similarity };
    });
    return best;
  }

  // Where a list from outside sits among the decks: the median deck's share of the consensus,
  // each deck measured against the others as the rail shows it (median copies over median main
  // size). null under three decks, where a median says nothing.
  function poolMedians(analysis, decks) {
    if (decks.length < 3) return null;
    const median = (xs) => {
      const s = xs.slice().sort((a, b) => a - b);
      const m = s.length >> 1;
      return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
    };
    const shares = decks.map((d) => consensusShare(d, analysis, true));
    return { consensus: { qty: median(shares.map((s) => s.qty)), total: median(shares.map((s) => s.total)) } };
  }

  const api = {
    analyzePool, filterDecks, matchesFilters,
    compareToPool, consensusShare, averageDeck, deckSimilarity, closestDeck, poolMedians, CONSENSUS, RARE,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.PoolAnalyze = api;
})(typeof window !== "undefined" ? window : globalThis);
