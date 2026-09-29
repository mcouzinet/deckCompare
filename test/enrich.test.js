"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { nameKeys, enrichmentFor } = require("../src/enrich.js");

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

test("enrichCards spaces its requests and takes a name the batch reports unknown at its word", async () => {
  const { enrichCards } = require("../src/enrich.js");
  const prev = global.fetch;
  const posts = [];
  const named = [];
  // The batch knows every name but "Nope"; /cards/named is never needed.
  global.fetch = async (url, opts) => {
    if (String(url).includes("/cards/named")) { named.push(url); return { ok: false, status: 404 }; }
    const ids = JSON.parse(opts.body).identifiers.map((i) => i.name);
    posts.push({ t: Date.now(), n: ids.length });
    const known = ids.filter((n) => n !== "Nope");
    return { ok: true, status: 200, json: async () => ({ data: known.map((name) => ({ name, type_line: "Instant", cmc: 1 })), not_found: ids.includes("Nope") ? [{ name: "Nope" }] : [] }) };
  };
  try {
    const names = [...Array.from({ length: 79 }, (_, i) => `Card ${i}`), "Nope"];
    const map = await enrichCards(names);
    assert.equal(posts.length, 2);                            // 75 + 5
    assert.ok(posts[1].t - posts[0].t >= 500);                // two a second at most
    assert.equal(enrichmentFor(map, "Card 78").type_line, "Instant");
    assert.equal(named.length, 0);                            // unknown to the batch: unknown
    await enrichCards(["Nope"]);                              // a re-analysis (a filter click)
    assert.equal(posts.length, 2);
  } finally { global.fetch = prev; }
});

test("enrichCards falls back on /cards/named for the names of a batch that failed", async () => {
  const { enrichCards } = require("../src/enrich.js");
  const prev = global.fetch;
  const named = [];
  global.fetch = async (url) => {
    if (String(url).includes("/cards/named")) {
      named.push(decodeURIComponent(String(url).split("exact=")[1]));
      return { ok: true, status: 200, json: async () => ({ name: "Solo Card", type_line: "Sorcery", cmc: 2 }) };
    }
    return { ok: false, status: 400 };                       // the batch fails, not retried
  };
  try {
    const map = await enrichCards(["Solo Card"]);
    assert.deepEqual(named, ["Solo Card"]);
    assert.equal(enrichmentFor(map, "Solo Card").type_line, "Sorcery");
  } finally { global.fetch = prev; }
});
