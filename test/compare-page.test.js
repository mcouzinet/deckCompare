"use strict";
// The results page in jsdom: compare.html with shared.js and compare.js, a stubbed chrome API
// holding the pair and a warm card cache (so the page paints once, with types, and never asks
// the background). Covers what the page says about the pair: the figure and its basis, the
// empty zones, the quantity note, the copy buttons and the board filter.
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");
const deck = (name, main, side = {}, cmd = {}) => ({ name, source: "text", url: "", commanders: cmd, mainboard: main, sideboard: side });
const TYPES = { "Mountain": "l", "Goblin Guide": "c", "Llanowar Elves": "c", "Lightning Bolt": "", "Shock": "", "Fireblast": "", "Smash to Smithereens": "" };
const cardCache = () => Object.fromEntries(Object.entries(TYPES).map(([name, t]) =>
  [name.toLowerCase(), { l: t === "l", c: t === "c", i: `https://cards.scryfall.io/${encodeURIComponent(name)}.jpg`, ts: Date.now() }]));
const opened = [];
after(() => { for (const w of opened) w.close(); });

async function openPage(compareData, extra = {}, patch = () => {}) {   // compareData undefined: the no-pair page
  const html = fs.readFileSync(path.join(ROOT, "compare.html"), "utf8")
    .replace(/<script src="[^"]+"><\/script>/g, "")
    .replace(/<link[^>]+(fonts\.googleapis|preload)[^>]*>/g, "");
  const { window } = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url: "chrome-extension://test/compare.html" });
  opened.push(window);
  const store = { compareData, cardTypeCache: cardCache(), ...extra };
  const messages = JSON.parse(fs.readFileSync(path.join(ROOT, "_locales/en/messages.json"), "utf8"));
  const sent = [];
  const clipboard = [];
  window.chrome = {
    i18n: {
      getUILanguage: () => "en",
      getMessage: (key, subs) => {
        const m = messages[key];
        if (!m) return "";
        let out = m.message;
        for (const [ph, def] of Object.entries(m.placeholders || {})) {
          out = out.split(`$${ph.toUpperCase()}$`).join([].concat(subs ?? [])[parseInt(def.content.slice(1), 10) - 1] ?? "");
        }
        return out;
      },
    },
    storage: { local: {
      get: async (keys) => { const out = {}; for (const k of [].concat(keys || [])) if (k in store) out[k] = store[k]; return out; },
      set: async (obj) => { Object.assign(store, JSON.parse(JSON.stringify(obj))); },
      remove: async (k) => { for (const x of [].concat(k)) delete store[x]; },
    } },
    runtime: { id: "test", sendMessage: (m, cb) => { sent.push(m.type); if (cb) cb(null); }, lastError: null, getURL: (p) => p },
    tabs: { query: async () => [] },
  };
  window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };   // no image loads in jsdom
  window.matchMedia = () => ({ matches: false });                                        // a wide window
  patch(window.chrome, store);
  Object.defineProperty(window.navigator, "clipboard", { value: { writeText: async (t) => { clipboard.push(t); } } });
  for (const f of ["shared.js", "compare.js"]) window.eval(fs.readFileSync(path.join(ROOT, f), "utf8"));
  const $ = (s) => window.document.querySelector(s);
  // settled: the figure is drawn, or (no pair) the actions that need one are hidden
  const settled = () => /\d/.test($("#ring-num").textContent) || $(".edge-actions").classList.contains("hide");
  for (let i = 0; i < 200 && !settled(); i++) await new Promise((r) => setTimeout(r, 10));
  return { window, $, $$: (s) => [...window.document.querySelectorAll(s)], sent, clipboard, store };
}
const tick = () => new Promise((r) => setTimeout(r, 20));
const shown = (el) => !el.classList.contains("hide");

const A = deck("Red Deck Wins", { "Mountain": 20, "Lightning Bolt": 4, "Goblin Guide": 4 }, { "Smash to Smithereens": 2 });
const B = deck("Burn", { "Mountain": 18, "Lightning Bolt": 3, "Shock": 4, "Fireblast": 2 });

test("the figure says what it counts, and a warm cache paints once without asking the background", async () => {
  const { $, $$, sent, window } = await openPage({ deckA: A, deckB: B });
  // shared copies: 18 Mountains + 3 Bolts = 21, over the larger deck (A: 30 cards)
  assert.equal($("#ring-num").textContent, "70%");
  assert.equal($("#ring-basis").textContent, "21 of 30 cards in common");
  assert.equal(window.document.title, "Burn vs Red Deck Wins · Deck Compare");
  assert.ok($$(".type-divider").length > 0);   // typed at once, from the cache
  assert.deepEqual(sent, []);                   // no FETCH_CARD_TYPES: nothing was missing
  // two quantity mismatches (Mountain 20 / 18, Bolt 4 / 3): the note shows
  assert.ok(shown($(".shared-note")));
  assert.match($("#qty-diff-note").textContent, /^2 /);
  assert.match($('.srow[data-name="Mountain"]').getAttribute("aria-label"), /Mountain: 20 vs 18/);
  // "cards" counts copies, as under the figure; the distinct names follow when they differ
  assert.equal($("#lg-a").textContent, "6 cards · 2 distinct");
  assert.equal($("#lg-s").textContent, "21 cards · 2 distinct");
  // A's surplus (2 Mountains, 1 Bolt) completes its side: 6 + 3 + 21 = its 30 cards
  assert.ok(shown($("#lg-x-link")));
  assert.equal($("#lg-x").textContent, "3 cards");
  const basis = (seg) => parseFloat($(`.seam-seg.${seg}`).style.flexBasis);
  assert.ok(Math.abs(basis("ax") - (3 / 36) * 100) < 0.01);   // 6 + 3 + 21 + 0 + 6 copies on the bar
  assert.equal(basis("bx"), 0);
});

test("a zone's count copies its visible cards as deck-builder lines, sideboard apart", async () => {
  const { $, clipboard } = await openPage({ deckA: A, deckB: B });
  $('[data-copy-zone="a"]').click();
  await tick();
  assert.deepEqual(clipboard, ["4 Goblin Guide\n\n2 Smash to Smithereens"]);
  assert.ok($('[data-copy-zone="a"]').classList.contains("copied"));
  $('[data-copy-zone="s"]').click();   // the copies both decks play
  await tick();
  assert.equal(clipboard[1], "3 Lightning Bolt\n18 Mountain");
});

test("empty zones say so, whether the pair or the board filter empties them", async () => {
  const { $, window } = await openPage({ deckA: A, deckB: deck("Nothing alike", { "Island": 20 }) });
  assert.equal($("#ring-basis").textContent, "0 of 30 cards in common");
  assert.equal($("#lg-s").textContent, "0 cards");               // one number when both counts agree
  assert.ok(!shown($("#lg-x-link")));                            // no surplus, no entry
  assert.ok(shown($("#shared-empty")));
  assert.ok(!shown($("#srow-head")));
  assert.ok(!shown($(".shared-note")));                     // no "0 quantity mismatches"
  assert.equal($('[data-copy-zone="s"]').disabled, true);
  $('[data-board-filter="sideboard"]').click();              // only A has a sideboard
  await tick();
  assert.equal($("#ring-label").textContent, "similar · Sideboard");   // the figure says what it measures
  assert.ok(shown($("#col-b-empty")));
  assert.ok(!shown($("#col-a-empty")));
  assert.equal($("#col-a-count").textContent, "2");
  window.close();
});

test("without a pair, the page says so and hides the actions that need one", async () => {
  const { $ } = await openPage(undefined);
  assert.match($("#loading").textContent, /No comparison data/);
  assert.ok($(".edge-actions").classList.contains("hide"));
});

test("the mismatch note filters the shared table to its mismatches, and switches off when none are left", async () => {
  const { $, $$, window } = await openPage({
    deckA: deck("Green", { "Mountain": 20, "Llanowar Elves": 4 }),
    deckB: deck("Also green", { "Mountain": 18, "Llanowar Elves": 4 }),
  });
  const note = $(".shared-note");
  assert.equal(note.getAttribute("aria-pressed"), "false");
  note.click();
  assert.ok(window.document.body.classList.contains("diffs-only"));
  assert.equal(note.getAttribute("aria-pressed"), "true");
  // the creatures hold only an equal row: their group and divider step out with it
  const elves = $('.srow[data-name="Llanowar Elves"]').closest(".srow-group");
  assert.ok(elves.classList.contains("hide"));
  assert.ok(elves.previousElementSibling.classList.contains("hide"));
  assert.ok(!$('.srow[data-name="Mountain"]').closest(".srow-group").classList.contains("hide"));
  $('[data-board-filter="commanders"]').click();   // no commander: no mismatch left to show
  await tick();
  assert.ok(!window.document.body.classList.contains("diffs-only"));
});

test("a card hovered before Scryfall answers is not called imageless, and shows once the images arrive", async () => {
  const url = "https://cards.scryfall.io/goblin.jpg";
  const { $, window } = await openPage({ deckA: A, deckB: B }, {}, (chrome, store) => {
    delete store.cardTypeCache;   // a cold cache: the page must ask the background
    chrome.runtime.sendMessage = (m, cb) => {
      if (m.type === "FETCH_CARD_TYPES") setTimeout(() => cb({ lands: ["Mountain"], creatures: ["Goblin Guide"], images: { "Goblin Guide": url } }), 250);
      else if (cb) cb(null);
    };
  });
  const slot = $('.card-slot[data-name="Goblin Guide"]');
  slot.dispatchEvent(new window.MouseEvent("mouseover", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 120));               // past the hover debounce, before the answer
  assert.notEqual($("#hover-hint").textContent, "No image for this card");
  assert.equal($("#preview-name").textContent, "");
  await new Promise((r) => setTimeout(r, 300));               // the lookup answered: the card is held
  assert.equal($("#preview-name").textContent, "Goblin Guide");
  assert.equal($("#preview-img").getAttribute("src"), url);
});
