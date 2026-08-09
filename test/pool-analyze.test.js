"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { nameKeys } = require("../enrich.js");
const { analyzePool } = require("../pool-analyze.js");

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
