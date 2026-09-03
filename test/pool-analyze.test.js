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
