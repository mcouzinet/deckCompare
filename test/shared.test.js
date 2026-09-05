"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { fixCommanderHeuristic, sumBoard, normalizeName, SUPPORTED_SITES } = require("../shared.js");

const siteMatch = (url) => (SUPPORTED_SITES.find((s) => s.deckRe.test(url)) || {}).label;

test("SUPPORTED_SITES matches deck-detail URLs (popup + pool tab pickers)", () => {
  assert.equal(siteMatch("https://www.moxfield.com/decks/AbC123_-x"), "Moxfield");
  assert.equal(siteMatch("https://www.mtgtop8.com/event?e=90366&d=885960&f=EDH"), "mtgtop8");
  assert.equal(siteMatch("https://archidekt.com/decks/12345/krenko"), "Archidekt");
  assert.equal(siteMatch("https://getpaird.io/decklists/abc-def"), "getpaird");
  assert.equal(siteMatch("https://melee.gg/Decklist/View/123e4567-e89b-12d3-a456-426614174000"), "Melee");
});

test("SUPPORTED_SITES rejects homepages and listings (no false one-click shortcut)", () => {
  assert.equal(siteMatch("https://www.moxfield.com/decks/personal"), undefined);
  assert.equal(siteMatch("https://www.mtgtop8.com/event?e=90366&f=EDH"), undefined); // no d=
  assert.equal(siteMatch("https://archidekt.com/decks/"), undefined);
  assert.equal(siteMatch("https://www.moxfield.com/"), undefined);
});

test("getOpenDeckTabs keeps deck tabs, drops the caller, non-decks and dupes", async () => {
  const { getOpenDeckTabs } = require("../shared.js");
  const prev = global.chrome;
  global.chrome = { tabs: { query: async () => [
    { url: "https://www.moxfield.com/decks/aaa", title: "My Deck" },
    { url: "https://www.mtgtop8.com/event?e=1&d=2", title: "Event Deck" },
    { url: "https://www.moxfield.com/decks/aaa", title: "My Deck (dupe)" }, // same URL
    { url: "https://news.example.com/article", title: "Not a deck" },
    { url: "chrome-extension://x/pool.html", title: "The pool page itself" },
  ] } };
  try {
    const tabs = await getOpenDeckTabs("chrome-extension://x/pool.html");
    assert.deepEqual(tabs.map((t) => t.url), [
      "https://www.moxfield.com/decks/aaa",
      "https://www.mtgtop8.com/event?e=1&d=2",
    ]);
    assert.deepEqual(tabs.map((t) => t.label), ["Moxfield", "mtgtop8"]);
  } finally { global.chrome = prev; }
});

test("getOpenDeckTabs returns [] where chrome.tabs is unavailable", async () => {
  const { getOpenDeckTabs } = require("../shared.js");
  const prev = global.chrome;
  global.chrome = undefined;
  try { assert.deepEqual(await getOpenDeckTabs("x"), []); }
  finally { global.chrome = prev; }
});

test("sumBoard sums quantities and tolerates empty/undefined", () => {
  assert.equal(sumBoard({ a: 2, b: 3 }), 5);
  assert.equal(sumBoard({}), 0);
  assert.equal(sumBoard(undefined), 0);
});

test("fixCommanderHeuristic promotes a lone sideboard to the command zone (~100-card deck)", () => {
  const deck = { mainboard: mainOf(99), sideboard: { "Krenko, Mob Boss": 1 }, commanders: {} };
  fixCommanderHeuristic(deck);
  assert.deepEqual(deck.commanders, { "Krenko, Mob Boss": 1 });
  assert.deepEqual(deck.sideboard, {});
});

test("fixCommanderHeuristic accepts a 2-card partner command zone", () => {
  const deck = { mainboard: mainOf(98), sideboard: { "Tana": 1, "Tymna": 1 }, commanders: {} };
  fixCommanderHeuristic(deck);
  assert.equal(sumBoard(deck.commanders), 2);
  assert.deepEqual(deck.sideboard, {});
});

test("fixCommanderHeuristic leaves a real sideboard (60-card deck) untouched", () => {
  const deck = { mainboard: mainOf(60), sideboard: { "Rest in Peace": 2 }, commanders: {} };
  fixCommanderHeuristic(deck);
  assert.deepEqual(deck.commanders, {});
  assert.deepEqual(deck.sideboard, { "Rest in Peace": 2 });
});

test("fixCommanderHeuristic does not touch a deck that already has a commander", () => {
  const deck = { mainboard: mainOf(99), sideboard: { "Sol Ring": 1 }, commanders: { "Krenko, Mob Boss": 1 } };
  fixCommanderHeuristic(deck);
  assert.deepEqual(deck.commanders, { "Krenko, Mob Boss": 1 });
  assert.deepEqual(deck.sideboard, { "Sol Ring": 1 });
});

test("fixCommanderHeuristic ignores a 3+ card sideboard", () => {
  const deck = { mainboard: mainOf(99), sideboard: { a: 1, b: 1, c: 1 }, commanders: {} };
  fixCommanderHeuristic(deck);
  assert.deepEqual(deck.commanders, {});
  assert.equal(sumBoard(deck.sideboard), 3);
});

test("normalizeName keeps the front face of split/DFC cards", () => {
  assert.equal(normalizeName("Brazen Borrower // Petty Theft"), "Brazen Borrower");
  assert.equal(normalizeName("Fire // Ice"), "Fire");
});

test("normalizeName leaves single-name cards untouched", () => {
  assert.equal(normalizeName("Sol Ring"), "Sol Ring");
  assert.equal(normalizeName("  Krenko, Mob Boss  "), "Krenko, Mob Boss");
});

test("normalizeName matches a split card across sources (Moxfield ' // ' vs mtgtop8 '/')", () => {
  // The real bug: Moxfield exports "Life // Death", mtgtop8's MTGO export "Life/Death".
  // Both must reduce to the same key, or the shared card lands in both unique columns.
  assert.equal(normalizeName("Life // Death"), "Life");
  assert.equal(normalizeName("Life/Death"), "Life");
  assert.equal(normalizeName("Life // Death"), normalizeName("Life/Death"));
  // tolerate a spaced single slash too
  assert.equal(normalizeName("Life / Death"), "Life");
});

// helper: a mainboard whose quantities sum to n
function mainOf(n) {
  return { "Mountain": n };
}

test("injectEnabled: the in-page button is on unless explicitly switched off (1.1 default)", () => {
  const { injectEnabled, INJECT_KEY } = require("../shared.js");
  assert.equal(INJECT_KEY, "injectButton");
  assert.equal(injectEnabled(undefined), true);   // fresh install, or never opened Settings
  assert.equal(injectEnabled(true), true);
  assert.equal(injectEnabled(false), false);      // the only value that removes the button
});
