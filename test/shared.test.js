"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { fixCommanderHeuristic, sumBoard, normalizeName, SUPPORTED_SITES } = require("../src/shared.js");

const siteMatch = (url) => (SUPPORTED_SITES.find((s) => s.deckRe.test(url)) || {}).label;

test("SUPPORTED_SITES matches deck-detail URLs (popup + pool tab pickers)", () => {
  assert.equal(siteMatch("https://www.moxfield.com/decks/AbC123_-x"), "Moxfield");
  assert.equal(siteMatch("https://www.mtgtop8.com/event?e=90366&d=885960&f=EDH"), "mtgtop8");
  assert.equal(siteMatch("https://manabox.app/decks/qWOeE_BgTEyv7VV2-kzpXg"), "ManaBox");
  assert.equal(siteMatch("https://www.mtggoldfish.com/archetype/modern-izzet-prowess#paper"), "MTGGoldfish");  // archetype page = one full deck
  assert.equal(siteMatch("https://archidekt.com/decks/12345/krenko"), "Archidekt");
  assert.equal(siteMatch("https://getpaird.io/decklists/abc-def"), "getpaird");
  assert.equal(siteMatch("https://melee.gg/Decklist/View/123e4567-e89b-12d3-a456-426614174000"), "Melee");
});

test("SUPPORTED_SITES rejects homepages and listings (no false one-click shortcut)", () => {
  assert.equal(siteMatch("https://www.moxfield.com/decks/personal"), undefined);
  assert.equal(siteMatch("https://www.mtgtop8.com/event?e=90366&f=EDH"), undefined); // no d=
  assert.equal(siteMatch("https://archidekt.com/decks/"), undefined);
  assert.equal(siteMatch("https://www.moxfield.com/"), undefined);
  assert.equal(siteMatch("https://manabox.app/decks"), undefined);                     // no deck id
  assert.equal(siteMatch("https://www.mtggoldfish.com/archetype/"), undefined);   // the archetype index, no deck
});

test("getOpenDeckTabs keeps deck tabs, drops the caller, non-decks and dupes", async () => {
  const { getOpenDeckTabs } = require("../src/shared.js");
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
  const { getOpenDeckTabs } = require("../src/shared.js");
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

test("normalizeName drops what exports hang off the name (set code, foil, category, comment)", () => {
  assert.equal(normalizeName("Dispatch [EOC]"), "Dispatch");           // MTGGoldfish list
  assert.equal(normalizeName("Dispatch (EOC) 42"), "Dispatch");        // Arena / mtgdecks
  assert.equal(normalizeName("Sol Ring (LTC) 284 *F* [Ramp]"), "Sol Ring");  // Moxfield export
  assert.equal(normalizeName("Sol Ring # pas cher"), "Sol Ring");
  assert.equal(normalizeName("Fire // Ice [MH2]"), "Fire");
  // Not a set code: a parenthesised part of a real card name stays.
  assert.equal(normalizeName("Erase (Not the Urza's Legacy One)"), "Erase (Not the Urza's Legacy One)");
});

test("normalizeName re-cases a hand-typed name so it meets the site's spelling", () => {
  assert.equal(normalizeName("dispatch"), "Dispatch");
  assert.equal(normalizeName("SOL RING"), "Sol Ring");
  assert.equal(normalizeName("sword of fire and ice"), "Sword of Fire and Ice");
  assert.equal(normalizeName("nicol bolas, god-pharaoh"), "Nicol Bolas, God-Pharaoh");
  assert.equal(normalizeName("urza's saga"), "Urza's Saga");
  // A source that cased the name is never rewritten — some spellings can't be guessed.
  assert.equal(normalizeName("R&D's Secret Lair"), "R&D's Secret Lair");
  assert.equal(normalizeName("Krenko, Mob Boss"), "Krenko, Mob Boss");
});

test("normalizeName keys a card the same whatever quotes/spaces the source uses", () => {
  assert.equal(normalizeName("Urza\u2019s Saga"), "Urza's Saga");        // typographic apostrophe
  assert.equal(normalizeName("Urza's\u00a0Saga"), "Urza's Saga");        // &nbsp; from a scraped cell
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
  const { injectEnabled, INJECT_KEY } = require("../src/shared.js");
  assert.equal(INJECT_KEY, "injectButton");
  assert.equal(injectEnabled(undefined), true);   // fresh install, or never opened Settings
  assert.equal(injectEnabled(true), true);
  assert.equal(injectEnabled(false), false);      // the only value that removes the button
});

test("isOptionalHost: only the optional origins (Moxfield, the non-www twins) need a granted permission", () => {
  const { isOptionalHost } = require("../src/shared.js");
  assert.equal(isOptionalHost("https://www.moxfield.com/decks/abc"), true);
  assert.equal(isOptionalHost("https://mtggoldfish.com/deck/1"), true);        // bare twin: optional
  assert.equal(isOptionalHost("https://www.mtggoldfish.com/deck/1"), false);   // declared statically
  assert.equal(isOptionalHost("https://www.moxfield.com/decks/abc", ["https://mtgtop8.com/*"]), false);  // restricted set
  assert.equal(isOptionalHost(undefined), false);
  assert.equal(isOptionalHost("not a url"), false);
});

test("injectResetOnUpdate: an update from any pre-1.1 build clears the toggle, a 1.1.x reload keeps it", () => {
  const { injectResetOnUpdate } = require("../src/shared.js");
  assert.equal(injectResetOnUpdate("1.0.13"), true);    // the live version: its `false` may be a declined prompt
  assert.equal(injectResetOnUpdate("1.0.0"), true);
  assert.equal(injectResetOnUpdate("0.9.0"), true);
  assert.equal(injectResetOnUpdate("1.1"), false);      // a release is X.Y: same line, keep the setting
  assert.equal(injectResetOnUpdate("1.1.1"), false);    // dev iteration within the 1.1 line
  assert.equal(injectResetOnUpdate("1.2.0"), false);
  assert.equal(injectResetOnUpdate("2.0.0"), false);
  assert.equal(injectResetOnUpdate(undefined), false);  // reason "install" carries no previousVersion
  assert.equal(injectResetOnUpdate("garbage"), false);
});

test("normalizeDeck re-keys every board by front face and merges quantities (one entry point for all sources)", () => {
  const { normalizeDeck } = require("../src/shared.js");
  const { analyzePool } = require("../src/pool-analyze.js");
  const mox = normalizeDeck({ name: "A", _needsApiFetch: true, commanders: { "Raffine, Scheming Seer": 1 },
    mainboard: { "Life // Death": 1, "Life/Death": 2, "Island": 7 }, sideboard: {} });
  assert.deepEqual(mox.mainboard, { Life: 3, Island: 7 });
  assert.deepEqual(mox.commanders, { "Raffine, Scheming Seer": 1 });
  assert.equal(mox._needsApiFetch, true);                       // other fields untouched
  assert.equal(normalizeDeck(null), null);                      // parseDeckFromCurrentSite may yield null
  // a Moxfield deck and an mtgtop8 export share the split card once they went through it
  const top8 = normalizeDeck({ name: "B", mainboard: { "Life/Death": 1 }, sideboard: {}, commanders: {} });
  const stats = analyzePool([mox, top8], new Map(), [], 50).cardStats;
  assert.deepEqual(stats.filter((c) => c.name.startsWith("Life")).map((c) => [c.name, c.deck_count]), [["Life", 2]]);
});

test("sameDeckPage ignores the hash and www (finding a deck's tab for the fetch fallback)", () => {
  const { sameDeckPage } = require("../src/shared.js");
  assert.equal(sameDeckPage("https://www.mtggoldfish.com/deck/7593392",
                            "https://www.mtggoldfish.com/deck/7593392#paper"), true);
  assert.equal(sameDeckPage("https://mtggoldfish.com/deck/7593392",
                            "https://www.mtggoldfish.com/deck/7593392#online"), true);
  assert.equal(sameDeckPage("https://mtgdecks.net/Modern/burn-decklist-by-x/",
                            "https://mtgdecks.net/Modern/burn-decklist-by-x"), true);
  assert.equal(sameDeckPage("https://www.mtggoldfish.com/deck/7593392",
                            "https://www.mtggoldfish.com/deck/7593393"), false);
  // mtgtop8 puts the deck id in the query string — it is identity, not decoration.
  assert.equal(sameDeckPage("https://www.mtgtop8.com/event?e=90366&d=885960",
                            "https://www.mtgtop8.com/event?e=90366&d=885961"), false);
});

test("every locale's appDescription fits Safari's 112-character limit (Chrome allows 132)", () => {
  const fs = require("fs"); const path = require("path");
  const dir = path.join(__dirname, "..", "src", "_locales");
  for (const loc of fs.readdirSync(dir)) {
    const m = JSON.parse(fs.readFileSync(path.join(dir, loc, "messages.json"), "utf8"));
    const d = m.appDescription && m.appDescription.message;
    assert.equal(typeof d, "string", `${loc}: appDescription missing`);
    assert.ok(d.length <= 112, `${loc}: appDescription is ${d.length} characters`);
  }
});

test("OPTIONAL_SCRIPTS and the manifest's optional_host_permissions list the same origins", () => {
  const { OPTIONAL_SCRIPTS } = require("../src/shared.js");
  const manifest = require("../src/manifest.json");
  assert.deepEqual([...OPTIONAL_SCRIPTS.map((e) => e.origin)].sort(), [...manifest.optional_host_permissions].sort());
});

test("every locale declares the same message keys", () => {
  const fs = require("fs"); const path = require("path");
  const dir = path.join(__dirname, "..", "src", "_locales");
  const keys = (loc) => Object.keys(JSON.parse(fs.readFileSync(path.join(dir, loc, "messages.json"), "utf8"))).sort();
  const [first, ...rest] = fs.readdirSync(dir);
  for (const loc of rest) assert.deepEqual(keys(loc), keys(first), `${loc} and ${first} differ`);
});

test("requestManaBoxAccess asks for the ManaBox hosts it is given, and nothing else", async () => {
  const { requestManaBoxAccess } = require("../src/shared.js");
  const prev = global.chrome;
  const asked = [];
  global.chrome = { permissions: { request: async ({ origins }) => { asked.push(origins); return true; } } };
  try {
    assert.equal(await requestManaBoxAccess(["https://archidekt.com/decks/1", "not a url"]), false);
    assert.equal(await requestManaBoxAccess(["https://manabox.app/decks/aaaaaaaaaaaaaaaa", "https://manabox.app/decks/bbbbbbbbbbbbbbbb"]), true);
    assert.deepEqual(asked, [["https://manabox.app/*"]]);
    global.chrome = {};   // no permissions API (a content script): no request, no throw
    assert.equal(await requestManaBoxAccess(["https://www.manabox.app/decks/aaaaaaaaaaaaaaaa"]), false);
  } finally { global.chrome = prev; }
});

test("cachedCardTypes serves known cards and retries a name Scryfall lacked after a day", async () => {
  const { cachedCardTypes } = require("../src/shared.js");
  const prev = global.chrome;
  const now = Date.now();
  const cardTypeCache = {
    "forest": { l: true, c: false, i: "https://cards.scryfall.io/forest.jpg", ts: now },
    "llanowar elves": { l: false, c: true, i: "https://cards.scryfall.io/elves.jpg", ts: now },
    "old entry": { l: false, c: false, ts: now },                                   // no `i`: before images were cached
    "typo today": { l: false, c: false, i: "", nf: true, ts: now - 60 * 1000 },
    "typo last week": { l: false, c: false, i: "", nf: true, ts: now - 7 * 24 * 3600 * 1000 },
  };
  global.chrome = { storage: { local: { get: async () => ({ cardTypeCache }) } } };
  try {
    const r = await cachedCardTypes(["Forest", "Llanowar Elves", "Old Entry", "Typo Today", "Typo Last Week", "Unknown"]);
    assert.deepEqual(r.lands, ["Forest"]);
    assert.deepEqual(r.creatures, ["Llanowar Elves"]);
    assert.deepEqual(r.images, { Forest: "https://cards.scryfall.io/forest.jpg", "Llanowar Elves": "https://cards.scryfall.io/elves.jpg" });
    assert.deepEqual(r.misses, ["Old Entry", "Typo Last Week", "Unknown"]);
  } finally { global.chrome = prev; }
});

test("cachedCardTypes falls back on the cross-compare page's cache, front face first", async () => {
  const { cachedCardTypes } = require("../src/shared.js");
  const prev = global.chrome;
  const now = Date.now();
  const poolEnrichCache = {
    "sol ring": { name: "Sol Ring", type_line: "Artifact", image_uri: "https://cards.scryfall.io/sol.jpg", ts: now },
    "bala ged recovery": { name: "Bala Ged Recovery // Bala Ged Sanctuary", type_line: "Sorcery // Land", image_uri: "https://cards.scryfall.io/bala.jpg", ts: now },
  };
  global.chrome = { storage: { local: { get: async (k) => (k === "poolEnrichCache" ? { poolEnrichCache } : {}) } } };
  try {
    const r = await cachedCardTypes(["Sol Ring", "Bala Ged Recovery", "Unknown"]);
    assert.deepEqual(r.lands, []);   // the land is the back face
    assert.deepEqual(r.images, { "Sol Ring": "https://cards.scryfall.io/sol.jpg", "Bala Ged Recovery": "https://cards.scryfall.io/bala.jpg" });
    assert.deepEqual(r.misses, ["Unknown"]);
  } finally { global.chrome = prev; }
});

test("deckTabTitle keeps the deck's name and drops what each site wraps around it", () => {
  const { deckTabTitle } = require("../src/shared.js");
  assert.equal(deckTabTitle("Aragorn, the Uniter (budget) • (Altruism Commander deck) • Archidekt"), "Aragorn, the Uniter (budget)");
  assert.equal(deckTabTitle("Eldrazi Deck for Magic: the Gathering"), "Eldrazi");
  assert.equal(deckTabTitle("Terra Rea - Duel Commander | Moxfield"), "Terra Rea - Duel Commander");   // a dash inside the name stays
  assert.equal(deckTabTitle("Aragorn Duel Commander \u2014 mtgdecks.net"), "Aragorn Duel Commander");
  assert.equal(deckTabTitle("Krenko Test Deck // Back Face | Melee"), "Krenko Test Deck // Back Face");
  assert.equal(deckTabTitle("Draw your Deck (Midrange Build)"), "Draw your Deck (Midrange Build)");   // nothing to drop
  assert.equal(deckTabTitle("Archidekt"), "Archidekt");   // never emptied
  // a site's name inside the deck's own name stays
  assert.equal(deckTabTitle("Isshin - Melee Attack Triggers • (Isshin Commander deck) • Archidekt"), "Isshin - Melee Attack Triggers");
  assert.equal(deckTabTitle("Krenko - Moxfield Primer Port | Moxfield"), "Krenko - Moxfield Primer Port");
});

test("getOpenDeckTabs lists the caller's window first and never crosses the private-browsing line", async () => {
  const { getOpenDeckTabs } = require("../src/shared.js");
  const prev = global.chrome;
  const all = [
    { url: "https://archidekt.com/decks/1", title: "Other window • (Commander deck) • Archidekt", windowId: 2, incognito: false },
    { url: "https://archidekt.com/decks/2", title: "Private deck", windowId: 3, incognito: true },
    { url: "https://archidekt.com/decks/3", title: "Same window", windowId: 1, incognito: false },
  ];
  global.chrome = { tabs: { query: async (q) => (q && q.currentWindow ? [all[2]] : all) } };
  try {
    // an extension page in window 1: the private tab is not offered, window 1 comes first
    const mine = await getOpenDeckTabs("chrome-extension://x/compare.html");
    assert.deepEqual(mine.map((t) => t.title), ["Same window", "Other window"]);   // titles cleaned too
    // the background answering a panel in the private window: only the private tab
    const priv = await getOpenDeckTabs("https://archidekt.com/decks/9", { windowId: 3, incognito: true });
    assert.deepEqual(priv.map((t) => t.url), ["https://archidekt.com/decks/2"]);
  } finally { global.chrome = prev; }
});
