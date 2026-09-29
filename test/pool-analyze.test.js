"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { nameKeys } = require("../enrich.js");
const { analyzePool, filterDecks, matchesFilters } = require("../pool-analyze.js");

// Build an enrichMap (name-key -> enrichment) the way enrich.js would.
function buildMap(defs) {
  const map = new Map();
  for (const d of defs) for (const k of nameKeys(d.name)) map.set(k, d);
  return map;
}

const MAP = buildMap([
  { name: "Krenko, Mob Boss", type_line: "Legendary Creature — Goblin", cmc: 4, color_identity: '["R"]', image_uri: "krenko.png" },
  { name: "Mountain", type_line: "Basic Land — Mountain", cmc: 0, color_identity: "[]" },
  { name: "Lightning Bolt", type_line: "Instant", cmc: 1, color_identity: '["R"]' },
  { name: "Goblin Guide", type_line: "Creature — Goblin Scout", cmc: 1, color_identity: '["R"]' },
  { name: "Shock", type_line: "Instant", cmc: 1, color_identity: '["R"]' },
]);

const DECKS = [
  { name: "Krenko A", source: "text", url: "", commanders: { "Krenko, Mob Boss": 1 },
    mainboard: { "Mountain": 30, "Lightning Bolt": 4, "Goblin Guide": 4 }, sideboard: {} },
  { name: "Krenko B", source: "text", url: "", commanders: { "Krenko, Mob Boss": 1 },
    mainboard: { "Mountain": 28, "Lightning Bolt": 4, "Shock": 2 }, sideboard: {} },
];

test("analyzePool counts decks and detects the shared commander", () => {
  const a = analyzePool(DECKS, MAP, []);
  assert.equal(a.total_decks, 2);
  assert.equal(a.commanders.length, 1);
  assert.equal(a.commanders[0].name, "Krenko, Mob Boss");
  assert.equal(a.commanders[0].count, 2);
  assert.equal(a.color_identity, '["R"]');
});

test("analyzePool computes per-card usage across the pool", () => {
  const a = analyzePool(DECKS, MAP, []);
  const byName = Object.fromEntries(a.cardStats.map((c) => [c.name, c]));

  // in both decks -> 100%
  assert.equal(byName["Mountain"].deck_count, 2);
  assert.equal(byName["Mountain"].percentage, 100);
  assert.equal(byName["Mountain"].avg_copies, 29); // (30 + 28) / 2

  assert.equal(byName["Lightning Bolt"].percentage, 100);

  // in one deck only -> 50%
  assert.equal(byName["Goblin Guide"].deck_count, 1);
  assert.equal(byName["Goblin Guide"].percentage, 50);
  assert.equal(byName["Shock"].percentage, 50);
});

test("analyzePool fills the average decklist to the mean mainboard size", () => {
  const a = analyzePool(DECKS, MAP, []);
  // mean mainboard size: round((38 + 34) / 2) = 36
  const total = a.averageDecklist.reduce((s, c) => s + c.avg_copies, 0);
  assert.equal(total, 36);
});

test("analyzePool carries through the errors it is given", () => {
  const a = analyzePool(DECKS, MAP, [{ url: "x", error: "boom" }]);
  assert.equal(a.errors.length, 1);
  assert.equal(a.errors[0].error, "boom");
});

// ---- card filters (mtgtop8 compare's keep / drop) ----
const F = (name, mode, board = "mainboard") => ({ name, board, mode });

test("filterDecks keeps or drops the decks that play a card", () => {
  assert.deepEqual(filterDecks(DECKS, [F("Goblin Guide", "with")]).map((d) => d.name), ["Krenko A"]);
  assert.deepEqual(filterDecks(DECKS, [F("Goblin Guide", "without")]).map((d) => d.name), ["Krenko B"]);
  // a card every deck plays: "with" keeps all, "without" keeps none
  assert.equal(filterDecks(DECKS, [F("Mountain", "with")]).length, 2);
  assert.equal(filterDecks(DECKS, [F("Mountain", "without")]).length, 0);
  // no filters: the whole pool
  assert.deepEqual(filterDecks(DECKS, []), DECKS);
  assert.deepEqual(filterDecks(DECKS, undefined), DECKS);
});

test("filterDecks stacks filters (every one must hold) and is board-aware", () => {
  assert.deepEqual(filterDecks(DECKS, [F("Mountain", "with"), F("Shock", "without")]).map((d) => d.name), ["Krenko A"]);
  assert.equal(filterDecks(DECKS, [F("Goblin Guide", "with"), F("Shock", "with")]).length, 0);
  // Krenko sits in the command zone, not the mainboard
  assert.equal(filterDecks(DECKS, [F("Krenko, Mob Boss", "with", "mainboard")]).length, 0);
  assert.equal(filterDecks(DECKS, [F("Krenko, Mob Boss", "with", "commanders")]).length, 2);
  assert.equal(filterDecks(DECKS, [F("Lightning Bolt", "with", "sideboard")]).length, 0);
});

test("matchesFilters matches the exact keys the usage rows count", () => {
  // A zero-copy entry is not "playing" the card; an unknown name matches no deck; a
  // missing board is an empty one.
  const d = { name: "X", mainboard: { "Shock": 0 }, commanders: {} };
  assert.equal(matchesFilters(d, [F("Shock", "with")]), false);
  assert.equal(matchesFilters(d, [F("Shock", "without")]), true);
  assert.equal(matchesFilters(d, [F("Nope", "with")]), false);
  assert.equal(matchesFilters(d, [F("Nope", "with", "sideboard")]), false);
  assert.equal(matchesFilters(d, [F("Nope", "without", "sideboard")]), true);
});

test("analyzePool over a filtered subset recounts against the kept decks only", () => {
  const a = analyzePool(filterDecks(DECKS, [F("Goblin Guide", "with")]), MAP, []);
  assert.equal(a.total_decks, 1);
  const byName = Object.fromEntries(a.cardStats.map((c) => [c.name, c]));
  assert.equal(byName["Goblin Guide"].percentage, 100);
  assert.equal(byName["Shock"], undefined);
  // an empty subset is a valid, empty analysis — no NaN, no throw
  const e = analyzePool(filterDecks(DECKS, [F("Mountain", "without")]), MAP, []);
  assert.equal(e.total_decks, 0);
  assert.deepEqual(e.cardStats, []);
  assert.deepEqual(e.averageDecklist, []);
});

test("analyzePool derives the pool's colours from the consensus when no deck has a commander", () => {
  const sixty = DECKS.map((d) => Object.assign({}, d, { commanders: {} }));
  const a = analyzePool(sixty, MAP, []);
  assert.equal(a.commanders.length, 0);
  // Mountain + Lightning Bolt are in every deck; their identities union to red
  assert.equal(a.color_identity, '["R"]');
});

// ---- one decklist against the pool ----
const { compareToPool, consensusShare, averageDeck, deckSimilarity } = require("../pool-analyze.js");

test("deckSimilarity is compare.js's figure: shared copies over the larger deck, all boards", () => {
  const a = { commanders: { "Krenko, Mob Boss": 1 }, mainboard: { "Lightning Bolt": 4, "Shock": 4 }, sideboard: {} };
  assert.equal(deckSimilarity(a, a), 100);
  assert.equal(deckSimilarity(a, { mainboard: { "Mountain": 9 } }), 0);
  // 1 commander + 4 Bolt shared; A holds 9 cards, B 10: 5/10
  const b = { commanders: { "Krenko, Mob Boss": 1 }, mainboard: { "Lightning Bolt": 4, "Goblin Guide": 5 }, sideboard: {} };
  assert.equal(deckSimilarity(a, b), 50);
  assert.equal(deckSimilarity({}, {}), 0);
});

test("averageDeck is the average decklist with the pool's commander, the shape compare.html reads", () => {
  const a = analyzePool(DECKS, MAP, []);
  const avg = averageDeck(a, "Average");
  assert.equal(avg.name, "Average");
  assert.deepEqual(avg.commanders, { "Krenko, Mob Boss": 1 });
  // mean main 36: Bolt 4, Mountain 29 (avg of 30 and 28), then Goblin Guide cut to the 3 left
  assert.deepEqual(avg.mainboard, { "Lightning Bolt": 4, "Mountain": 29, "Goblin Guide": 3 });
  assert.deepEqual(avg.sideboard, {});
});

test("the average sideboard counts decks without one, the average main does not", () => {
  const decks = [
    { name: "A", source: "text", commanders: {}, mainboard: { "Shock": 60 }, sideboard: { "Lightning Bolt": 4 } },
    { name: "B", source: "text", commanders: {}, mainboard: { "Shock": 60 }, sideboard: {} },
    { name: "C", source: "text", commanders: {}, mainboard: {}, sideboard: {} },   // unread: out of the main's mean
  ];
  const a = analyzePool(decks, MAP, []);
  assert.equal(a.averageDecklist.reduce((s, c) => s + c.avg_copies, 0), 60);
  // (4 + 0 + 0) / 3 rounds to 1
  assert.deepEqual(a.averageSideboard.map((c) => [c.name, c.avg_copies]), [["Lightning Bolt", 1]]);
});

test("compareToPool: consensus share, shared core, gaps and extras of a list kept outside the pool", () => {
  const a = analyzePool(DECKS, MAP, []);
  const mine = { mainboard: { "Mountain": 30, "Lightning Bolt": 4, "Fireball": 1 }, sideboard: {}, commanders: {} };
  const r = compareToPool(mine, a, MAP);
  // Bolt is in both decks (100 %), Goblin Guide and Shock in one of two (50 %); Mountain, a basic
  // land in a Commander pool, is left out of the share: 4 of the list's 5 other cards
  assert.deepEqual(r.consensus, { qty: 4, total: 5 });
  assert.deepEqual(r.core, { played: 2, total: 2 });
  assert.deepEqual(r.gaps.map((c) => c.name), ["Goblin Guide", "Shock"]);
  // Fireball: not in the pool, a 0 % row
  assert.deepEqual(r.extras.map((c) => [c.name, c.percentage, c.deck_count]), [["Fireball", 0, 0]]);
  // Mountain: 30 against an average of 29, but a basic land; Bolt: 4 as everyone
  assert.deepEqual(r.counts.map((c) => c.name), []);
  // vs the average deck (Krenko + Bolt 4, Mountain 29, Guide 3): 33 shared over 37
  assert.equal(r.similarity, 89);
  // the pool itself is untouched: still two decks, same usage
  assert.equal(a.total_decks, 2);
});

test("a deck of the pool is read against the others, and consensusShare(selfIn) agrees", () => {
  const all = analyzePool(DECKS, MAP, []);
  const others = analyzePool([DECKS[0]], MAP, []);
  const r = compareToPool(DECKS[1], others, MAP);
  assert.deepEqual(consensusShare(DECKS[1], all, true), r.consensus);
  // Goblin Guide: every other deck plays it; Shock: only this deck, so 0 % elsewhere
  assert.deepEqual(r.gaps.map((c) => c.name), ["Goblin Guide"]);
  assert.deepEqual(r.extras.map((c) => [c.name, c.percentage]), [["Shock", 0]]);
  assert.deepEqual(r.core, { played: 2, total: 3 });   // Mountain, Bolt, Guide are in every other deck
  // measured against a pool that includes it, the same deck would look more typical than it is
  assert.ok(consensusShare(DECKS[1], all).qty > consensusShare(DECKS[1], all, true).qty);
});

test("closestDeck finds the nearest deck by the same similarity, skipping the reference itself", () => {
  const { closestDeck } = require("../pool-analyze.js");
  // vs the list: A shares 34 of its 39 copies (87 %), B 32 of 35 (91 %)
  const mine = { mainboard: { "Mountain": 30, "Lightning Bolt": 4, "Fireball": 1 } };
  assert.deepEqual(closestDeck(mine, DECKS), { index: 1, similarity: 91 });
  // a deck of the pool against the others: itself is skipped
  assert.equal(closestDeck(DECKS[0], DECKS, 0).index, 1);
  assert.equal(closestDeck(DECKS[0], [DECKS[0]], 0), null);
});

test("poolMedians places a list among the decks as the rail measures them, quiet under three decks", () => {
  const { poolMedians, consensusShare } = require("../pool-analyze.js");
  const a2 = analyzePool(DECKS, MAP, []);
  assert.equal(poolMedians(a2, DECKS), null);
  const three = [...DECKS, { name: "Krenko C", source: "text", commanders: { "Krenko, Mob Boss": 1 },
    mainboard: { "Mountain": 30, "Lightning Bolt": 4, "Goblin Guide": 2 }, sideboard: {} }];
  const a3 = analyzePool(three, MAP, []);
  const m = poolMedians(a3, three);
  // each deck against the other two, as its rail row reads
  const qtys = three.map((d) => consensusShare(d, a3, true).qty).sort((x, y) => x - y);
  assert.equal(m.consensus.qty, qtys[1]);
  // a deck alone on the table has no consensus to share
  const a1 = analyzePool([DECKS[0]], MAP, []);
  assert.deepEqual(consensusShare(DECKS[0], a1, true), { qty: 0, total: 0 });
});

test("a 60-card pool (no command zone) keeps its basic lands in the consensus figures", () => {
  const sixty = DECKS.map((d) => ({ ...d, commanders: {} }));
  const a = analyzePool(sixty, MAP, []);
  const mine = { mainboard: { "Mountain": 30, "Lightning Bolt": 4, "Fireball": 1 }, sideboard: {}, commanders: {} };
  const r = compareToPool(mine, a, MAP);
  assert.deepEqual(r.consensus, { qty: 34, total: 35 });   // 30 Mountains count: a choice, in 60 cards
  assert.deepEqual(r.counts.map((c) => c.name), ["Mountain"]);
});
