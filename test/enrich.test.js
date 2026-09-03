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

test("nameKeys splits the bare-slash form from mtgtop8's MTGO export", () => {
  // "Life/Death" (mtgtop8) must key to the same front face as "Life // Death" (Scryfall),
  // so an enriched split card resolves for a deck imported from either source.
  assert.deepEqual(nameKeys("Life/Death"), ["life/death", "life"]);
  assert.equal(nameKeys("Life/Death")[1], nameKeys("Life // Death")[1]);
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
