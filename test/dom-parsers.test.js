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

test("Moxfield (DOM): defers to the API but still marks a deck page", () => {
  const dom = new JSDOM("<html><head><title>Krenko EDH | Moxfield</title></head><body></body></html>");
  const d = D.parseMoxfield(dom.window.document);
  assert.equal(d._needsApiFetch, true);          // data lives on api2.moxfield.com
  assert.equal(d.name, "Krenko EDH");
  assert.equal(d.source, "moxfield");
});

// ---- in-page button anchors ----
// These guard the selectors the button attaches to. Three sites (Magic-Ville,
// MTGGoldfish, mtgdecks) sit behind bot checks or consent walls and could not be
// inspected live, so their anchors reuse a selector the parser already depends on —
// which is exactly what these fixtures pin down.
test("anchors: resolve against real fixtures", () => {
  const cases = [
    ["melee.html",        "https://melee.gg/Decklist/View/x",        "BUTTON"],
    ["getpaird.html",     "https://getpaird.io/decklists/x",         "A"],
    ["magicville-dc.html", "https://www.magic-ville.com/fr/decks/showdeck?ref=1", "DIV"],
    ["magicville-dc.html", "https://magic-ville.com/fr/decks/showdeck?ref=1", "DIV"],  // www-less
    ["mtgdecks.html",     "https://mtgdecks.net/x",                  "LI"],
  ];
  for (const [fixture, url, tag] of cases) {
    const enc = fixture === "magicville-dc.html" ? "latin1" : "utf8";
    const d = new JSDOM(fs.readFileSync(path.join(__dirname, "fixtures", fixture), enc)).window.document;
    const el = D.findActionBarAnchor(d, url);
    assert.ok(el, `no anchor found for ${fixture}`);
    assert.equal(el.tagName, tag, `unexpected anchor element for ${fixture}`);
  }
});

test("anchors: unknown site and missing element both yield null (floating fallback)", () => {
  const d = doc("melee.html");
  assert.equal(D.findActionBarAnchor(d, "https://unknown.example/x"), null);   // no entry
  assert.equal(D.findActionBarAnchor(d, "https://getpaird.io/decklists/x"), null); // entry, no match
  // Moxfield is deliberately absent — it uses the floating pill.
  assert.equal(D.findActionBarAnchor(d, "https://www.moxfield.com/decks/x"), null);
});

test("anchors: selectors are structural and valid", () => {
  // melee renders "Images" in French, so matching on label text would break for them.
  // Assert on the selectors themselves — an earlier version regexed the source file and
  // tripped over the word "Visual" in a comment.
  const d = new JSDOM("<html><body></body></html>").window.document;
  for (const a of D.ANCHORS) {
    assert.doesNotThrow(() => d.querySelector(a.sel), `${a.host}: invalid selector ${a.sel}`);
    assert.ok(!/:contains\(|:has-text/i.test(a.sel), `${a.host}: matches on text, not structure`);
    assert.ok(/[#.\[]/.test(a.sel), `${a.host}: no class/id/attribute hook in ${a.sel}`);
  }
});

test("router dispatches by URL", () => {
  const d = D.parseDeckFromCurrentSite(doc("dom-mtgtop8.html"), "https://www.mtgtop8.com/event?e=1&d=2");
  assert.equal(d.source, "mtgtop8");
  assert.equal(D.parseDeckFromCurrentSite(doc("melee.html"), "https://melee.gg/Decklist/View/abc").source, "melee");
  assert.equal(D.parseDeckFromCurrentSite(doc("getpaird.html"), "https://getpaird.io/decklists/x").source, "getpaird");
  assert.equal(D.parseDeckFromCurrentSite(doc("getpaird.html"), "https://www.moxfield.com/decks/x").source, "moxfield");
  assert.equal(D.parseDeckFromCurrentSite(doc("dom-mtgtop8.html"), "https://unknown.com/x"), null);
});
