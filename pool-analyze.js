// Pool analysis — computes card usage across a set of decklists (no DB, no
// server). Port of the DeckStructure analyzer to plain JS. Dual-mode export;
// uses Enrich.enrichmentFor (enrich.js must load first in the page).
(function (global) {
  const enrichmentFor =
    typeof module !== "undefined" && module.exports
      ? require("./enrich").enrichmentFor
      : global.Enrich.enrichmentFor;

  const WUBRG = ["W", "U", "B", "R", "G"];
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

  // Average mainboard size (counting copies) — usually 99 in Duel Commander.
  function meanMainboardSize(decks) {
    const sizes = decks
      .map((d) => Object.values(d.mainboard || {}).reduce((s, q) => s + q, 0))
      .filter((n) => n > 0);
    if (!sizes.length) return 0;
    return Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length);
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

  function analyzePool(decks, map, errors, threshold) {
    if (threshold == null) threshold = 50;
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

    const color_identity = commanders.length
      ? unionColorIdentity(sigNames.get(commanders[0].name).map((n) => enrichmentFor(map, n)))
      : null;

    const cardStats = buildStats(decks, "mainboard", map, total);
    const sideboardStats = buildStats(decks, "sideboard", map, total);
    const consensus = cardStats.filter((c) => c.percentage >= threshold);
    const averageDecklist = buildAverageDecklist(cardStats, meanMainboardSize(decks));
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
      manaCurve,
      sources,
      errors: errors || [],
    };
  }

  const api = { analyzePool };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.PoolAnalyze = api;
})(typeof window !== "undefined" ? window : globalThis);
