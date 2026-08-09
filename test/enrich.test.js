"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { nameKeys, enrichmentFor } = require("../enrich.js");

test("nameKeys lowercases a normal card name", () => {
  assert.deepEqual(nameKeys("Lightning Bolt"), ["lightning bolt"]);
});

test("nameKeys adds the DFC front face as a second key", () => {
  assert.deepEqual(
    nameKeys("Brazen Borrower // Petty Theft"),
    ["brazen borrower // petty theft", "brazen borrower"]
  );
});

test("nameKeys trims surrounding whitespace", () => {
  assert.deepEqual(nameKeys("  Sol Ring  "), ["sol ring"]);
});

test("enrichmentFor resolves by full name and by DFC front face", () => {
  const map = new Map();
  const borrower = { name: "Brazen Borrower // Petty Theft", type_line: "Creature — Faerie // Instant" };
  for (const k of nameKeys(borrower.name)) map.set(k, borrower);

  // full name
  assert.equal(enrichmentFor(map, "Brazen Borrower // Petty Theft"), borrower);
  // front face only (how decklists usually reference it)
  assert.equal(enrichmentFor(map, "Brazen Borrower"), borrower);
  // case-insensitive
  assert.equal(enrichmentFor(map, "brazen borrower"), borrower);
  // unknown card
  assert.equal(enrichmentFor(map, "Black Lotus"), null);
});
