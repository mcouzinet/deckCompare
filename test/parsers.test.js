"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const P = require("../parsers.js");

const fx = (name, enc) => fs.readFileSync(path.join(__dirname, "fixtures", name), enc || "utf8");
const sum = (b) => Object.values(b).reduce((s, q) => s + q, 0);

test("Moxfield: boards map to sections; qty-0 cards skipped", () => {
  const d = P.parseMoxfield(JSON.parse(fx("moxfield.json")));
  assert.equal(d.name, "Krenko Goblins (DC)");
  assert.equal(sum(d.commanders), 1);
  assert.deepEqual(Object.keys(d.commanders), ["Krenko, Mob Boss"]);
  assert.equal(sum(d.mainboard), 22);                    // 1 + 20 + 1 (qty-0 skipped)
  assert.ok(!("Should Be Skipped (qty 0)" in d.mainboard));
  assert.equal(sum(d.sideboard), 2);
});

test("Archidekt: 'Commander' category detected, rest is mainboard", () => {
  const d = P.parseArchidekt(JSON.parse(fx("archidekt.json")));
  assert.equal(d.name, "Buffs by Hans");
  assert.equal(sum(d.commanders), 1);                    // exactly one Commander-category card
  assert.ok(sum(d.mainboard) > 90);                      // ~99-card Commander deck
  assert.equal(sum(d.sideboard), 0);
});

test("mtgtop8: text decklist with Sideboard divider", () => {
  const d = P.parseMtgTop8(fx("mtgtop8.txt"));
  assert.equal(sum(d.mainboard), 27);                    // 4+2+1+20
  assert.equal(d.mainboard["Krenko, Mob Boss"], 1);
  assert.equal(sum(d.sideboard), 3);                     // 2+1
});

test("MTGGoldfish: text decklist with Sideboard divider", () => {
  const d = P.parseMtgGoldfish(fx("mtggoldfish.txt"));
  assert.equal(sum(d.mainboard), 25);                    // 1+4+20
  assert.equal(sum(d.sideboard), 2);
});

test("mtgdecks: arena_deck textarea, set codes stripped, commander split", () => {
  const d = P.parseMtgDecks(fx("mtgdecks.html"));
  assert.match(d.name, /Aragorn, King of Gondor/);
  assert.deepEqual(Object.keys(d.commanders), ["Aragorn, King of Gondor"]);
  assert.equal(d.mainboard["Sol Ring"], 1);              // "(LTC) 280" stripped
  assert.ok(!Object.keys(d.mainboard).some((n) => /\(/.test(n)));
  assert.equal(sum(d.mainboard), 7);                     // 1+4+1+1
  assert.equal(sum(d.sideboard), 1);
});

// ---- Magic-Ville: the v0.7 regression case ----
test("Magic-Ville: parses a real DC deck (unquoted attrs, multi-line rows, commander header)", () => {
  const d = P.parseMagicVille(fx("magicville-dc.html", "latin1"));
  assert.notEqual(d.name, "Magic-Ville Deck");           // title parsed
  assert.equal(sum(d.commanders), 1);                    // "Commander" O14 header detected
  assert.equal(sum(d.mainboard), 99);                    // 99 + 1 commander = 100
  assert.equal(sum(d.sideboard), 0);
});

test("Magic-Ville: HTML entities in card names are decoded", () => {
  const d = P.parseMagicVille(fx("magicville-dc.html", "latin1"));
  const allNames = [].concat(Object.keys(d.mainboard), Object.keys(d.commanders), Object.keys(d.sideboard));
  assert.ok(allNames.length > 0);
  assert.ok(!allNames.some((n) => /&#\d|&amp;|&quot;/.test(n)), "names should be entity-decoded");
});

test("Magic-Ville: missing deck (HTTP 200 body) throws 'notFound'", () => {
  assert.throws(() => P.parseMagicVille("<html><body>Ce deck n'existe pas.</body></html>"), /notFound/);
});

test("Magic-Ville: unrecognizable page throws 'parseFailed'", () => {
  assert.throws(() => P.parseMagicVille("<html><body>totally different</body></html>"), /parseFailed/);
});

// ---- Melee ----
test("Melee: category headers map to sections; mustache template rows ignored", () => {
  const d = P.parseMelee(fx("melee.html"));
  assert.equal(sum(d.commanders), 1);
  assert.deepEqual(Object.keys(d.commanders), ["Terra, Magical Adept // Esper Terra"]); // DFC name kept
  assert.equal(sum(d.mainboard), 4);                     // Creature 2 + Land 2 (template "9" stripped)
  assert.equal(sum(d.sideboard), 2);                     // Sideboard 1 + Companion 1
  assert.equal(d.mainboard["Sword of Fire & Ice"], 1);   // &amp; entity decoded
  assert.equal(d.name, "Krenko Test Deck // Back Face");  // " | Melee" stripped
});

// ---- getpaird ----
test("getpaird: command_zone→commanders; brace-counter survives '};' in oracle text", () => {
  const d = P.parseGetpaird(fx("getpaird.html"));
  assert.equal(d.name, "Phelia Test Deck");
  assert.deepEqual(Object.keys(d.commanders), ["Phelia, Exuberant Shepherd"]);
  assert.equal(sum(d.mainboard), 12);                    // Sol Ring 1 + Forest 10 + Cursed Mirror 1
  assert.equal(sum(d.sideboard), 2);                     // Pyroblast x2
});

test("getpaird: missing _deckCards blob throws 'parseFailed'", () => {
  assert.throws(() => P.parseGetpaird("<html><body>no data here</body></html>"), /parseFailed/);
});
