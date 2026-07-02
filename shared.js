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

  const api = { fixCommanderHeuristic, sumBoard };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.Shared = api;
})(typeof self !== "undefined" ? self : globalThis);
