// Shared deck-normalization helpers — loaded by background.js (importScripts),
// compare.html and pool.html (<script src>). Dual-mode export like enrich.js.
(function (global) {
  function sumBoard(b) {
    return Object.values(b || {}).reduce((s, q) => s + q, 0);
  }

  // Heuristic: in Commander/Duel Commander decks (~100 cards), if the sideboard
  // has only 1-2 cards and no commanders section exists, treat sideboard as commanders.
  // Some deck sites (Magic-Ville, pasted text) have no dedicated commander zone.
  function fixCommanderHeuristic(deck) {
    if (!deck.commanders) deck.commanders = {};
    const mainCount = sumBoard(deck.mainboard);
    const sideCount = sumBoard(deck.sideboard);
    const cmdrCount = sumBoard(deck.commanders);

    if (cmdrCount === 0 && sideCount >= 1 && sideCount <= 2 && mainCount >= 90) {
      deck.commanders = Object.assign({}, deck.commanders, deck.sideboard);
      deck.sideboard = {};
    }
    return deck;
  }

  // ---- persistent card cache (chrome.storage.local) ----
  // Blob per cache key: { lowerName: { ...value, ts } }. Per-entry TTL; stale
  // entries are pruned on write, so the blob stays bounded. No-ops outside the
  // extension (e.g. Node tests) where chrome.storage is absent.
  const hasStorage = () => typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;

  async function cacheRead(key, ttlMs) {
    if (!hasStorage()) return {};
    let store;
    try { store = await chrome.storage.local.get(key); } catch { return {}; }
    const blob = store[key] || {};
    const now = Date.now();
    const out = {};
    for (const k in blob) if (now - (blob[k].ts || 0) < ttlMs) out[k] = blob[k];
    return out;
  }

  // entries: { name: valueObj } — merged in, stamped with now, stale pruned.
  async function cacheMerge(key, entries, ttlMs) {
    if (!hasStorage() || !entries || !Object.keys(entries).length) return;
    let store;
    try { store = await chrome.storage.local.get(key); } catch { store = {}; }
    const blob = store[key] || {};
    const now = Date.now();
    for (const k in blob) if (now - (blob[k].ts || 0) >= ttlMs) delete blob[k];
    for (const k in entries) blob[String(k).toLowerCase()] = Object.assign({}, entries[k], { ts: now });
    try { await chrome.storage.local.set({ [key]: blob }); } catch { /* quota — ignore */ }
  }

  const api = { fixCommanderHeuristic, sumBoard, cacheRead, cacheMerge };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.Shared = api;
})(typeof self !== "undefined" ? self : globalThis);
