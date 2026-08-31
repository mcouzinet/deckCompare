"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const D = require("../dom-parsers.js");

const doc = (name) => new JSDOM(fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8")).window.document;
const sum = (b) => Object.values(b).reduce((s, q) => s + q, 0);

test("MTGGoldfish (DOM): commander from table, cards from hidden input", () => {
  const d = D.parseMtgGoldfish(doc("dom-mtggoldfish.html"));
  assert.deepEqual(Object.keys(d.commanders), ["Krenko, Mob Boss"]);
  assert.equal(sum(d.commanders), 1);
  assert.equal(sum(d.mainboard), 24);        // 4 + 20 (Krenko pulled into commanders)
  assert.equal(sum(d.sideboard), 2);
  assert.equal(d.name, "Krenko Goblins");    // "by …" stripped
});

test("mtgtop8 (DOM): O14 COMMANDER header + sb_ ids", () => {
  const d = D.parseMtgTop8(doc("dom-mtgtop8.html"));
  assert.equal(sum(d.commanders), 1);
  assert.equal(d.commanders["Krenko, Mob Boss"], 1);
  assert.equal(sum(d.mainboard), 24);        // Goblin Guide 4 + Mountain 20
  assert.equal(sum(d.sideboard), 2);         // Abrade via id="sb_1"
  assert.match(d.name, /Duel Commander/);
});

test("Archidekt (DOM): __NEXT_DATA__ cardMap, categories, maybeboard skipped", () => {
  const d = D.parseArchidekt(doc("dom-archidekt.html"));
  assert.equal(d.name, "Krenko EDH");
  assert.ok(!d._needsApiFetch);
  assert.equal(sum(d.commanders), 1);
  assert.equal(sum(d.mainboard), 31);        // Goblin Guide 1 + Mountain 30
  assert.equal(sum(d.sideboard), 1);
  assert.ok(!("Maybe This" in d.mainboard));
});

test("Archidekt (DOM): no __NEXT_DATA__ falls back to API", () => {
  const dom = new JSDOM("<html><head><title>My Deck - Archidekt</title></head><body></body></html>");
  const d = D.parseArchidekt(dom.window.document);
  assert.equal(d._needsApiFetch, true);
  assert.equal(d.name, "My Deck");
});

test("mtgdecks (DOM): arena_deck textarea, set codes stripped", () => {
  const d = D.parseMtgDecks(doc("mtgdecks.html"));
  assert.deepEqual(Object.keys(d.commanders), ["Aragorn, King of Gondor"]);
  assert.equal(d.mainboard["Sol Ring"], 1);
  assert.equal(sum(d.mainboard), 7);
  assert.equal(sum(d.sideboard), 1);
});

test("Magic-Ville (DOM): defers to API with a name", () => {
  const dom = new JSDOM('<html><body><div class="title16">Sephiroth  DC</div></body></html>');
  const d = D.parseMagicVille(dom.window.document);
  assert.equal(d._needsApiFetch, true);
  assert.equal(d.name, "Sephiroth DC");
});

test("Melee (DOM): .decklist-category blocks, mustache template ignored", () => {
  const d = D.parseMelee(doc("melee.html"));
  assert.equal(sum(d.commanders), 1);
  assert.equal(d.commanders["Terra, Magical Adept // Esper Terra"], 1);
  assert.equal(sum(d.mainboard), 4);                     // template "9" row not counted
  assert.equal(sum(d.sideboard), 2);                     // Sideboard + Companion
  assert.equal(d.mainboard["Sword of Fire & Ice"], 1);   // entity decoded by the DOM
  assert.equal(d.name, "Krenko Test Deck // Back Face");
});

test("getpaird (DOM): reads inline _deckCards script text (no script execution)", () => {
  const d = D.parseGetpaird(doc("getpaird.html"));
  assert.ok(!d._needsApiFetch);
  assert.equal(d.name, "Phelia Test Deck");
  assert.equal(sum(d.commanders), 1);
  assert.equal(sum(d.mainboard), 12);
  assert.equal(sum(d.sideboard), 2);
});

test("getpaird (DOM): no _deckCards falls back to API", () => {
  const dom = new JSDOM("<html><head><title>Some Deck</title></head><body></body></html>");
  const d = D.parseGetpaird(dom.window.document);
  assert.equal(d._needsApiFetch, true);
  assert.equal(d.name, "Some Deck");
});

test("router dispatches by URL", () => {
  const d = D.parseDeckFromCurrentSite(doc("dom-mtgtop8.html"), "https://www.mtgtop8.com/event?e=1&d=2");
  assert.equal(d.source, "mtgtop8");
  assert.equal(D.parseDeckFromCurrentSite(doc("melee.html"), "https://melee.gg/Decklist/View/abc").source, "melee");
  assert.equal(D.parseDeckFromCurrentSite(doc("getpaird.html"), "https://getpaird.io/decklists/x").source, "getpaird");
  assert.equal(D.parseDeckFromCurrentSite(doc("dom-mtgtop8.html"), "https://unknown.com/x"), null);
});
