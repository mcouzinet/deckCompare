"use strict";
// The cross-compare page end to end in jsdom: pool.html with its four scripts, a stubbed chrome
// API holding a saved pool and "my list", and Scryfall answering nothing (types stay unknown).
// Covers the reference: the strip, the marks in the lists, pinning a deck of the pool (measured
// against the others) and the "differences only" view.
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");
const deck = (name, main, cmd = { "Krenko, Mob Boss": 1 }) => ({ name, source: "text", url: "", commanders: cmd, mainboard: main, sideboard: {} });
const POOL = [
  deck("Alpha", { "Mountain": 30, "Lightning Bolt": 4, "Goblin Guide": 4 }),
  deck("Beta", { "Mountain": 28, "Lightning Bolt": 4, "Shock": 2 }),
  deck("Gamma", { "Mountain": 30, "Lightning Bolt": 4, "Goblin Guide": 2, "Fireblast": 2 }),
];
const MINE = deck("My Krenko", { "Mountain": 30, "Lightning Bolt": 2, "Fireball": 1 });
// Scryfall answers from the page's own cache: no lookup, no rate-limit pause per unknown name.
const CARDS = { "Krenko, Mob Boss": "Legendary Creature", "Mountain": "Basic Land", "Lightning Bolt": "Instant",
  "Goblin Guide": "Creature", "Shock": "Instant", "Fireblast": "Instant", "Fireball": "Sorcery" };
const enrichCache = () => Object.fromEntries(Object.entries(CARDS).map(([name, type_line]) =>
  [name.toLowerCase(), { name, type_line, cmc: 1, color_identity: '["R"]', ts: Date.now() }]));
const opened = [];
after(() => { for (const w of opened) w.close(); });   // the page's status timers outlive a test

async function openPage(store, patch = () => {}) {
  const html = fs.readFileSync(path.join(ROOT, "pool.html"), "utf8")
    .replace(/<script src="[^"]+"><\/script>/g, "")          // loaded below, in order
    .replace(/<link[^>]+fonts\.googleapis[^>]*>/g, "");
  const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url: "chrome-extension://test/pool.html" });
  const { window } = dom;
  opened.push(window);
  store.poolEnrichCache = { ...enrichCache(), ...(store.poolEnrichCache || {}) };   // what a previous open cached stays
  const messages = { ...JSON.parse(fs.readFileSync(path.join(ROOT, "_locales/en/messages.json"), "utf8")) };
  window.chrome = {
    i18n: {
      getUILanguage: () => "en",
      getMessage: (key, subs) => {
        const m = messages[key];
        if (!m) return "";
        let out = m.message;
        for (const [ph, def] of Object.entries(m.placeholders || {})) {
          const n = parseInt(def.content.slice(1), 10) - 1;
          out = out.split(`$${ph.toUpperCase()}$`).join([].concat(subs || [])[n] ?? "");
        }
        return out;
      },
    },
    storage: { local: {
      get: async (keys) => { const out = {}; for (const k of [].concat(keys || [])) if (k in store) out[k] = store[k]; return out; },
      set: async (obj) => { Object.assign(store, JSON.parse(JSON.stringify(obj))); },
      remove: async (k) => { for (const x of [].concat(k)) delete store[x]; },
    } },
    runtime: { sendMessage: (_m, cb) => cb && cb(null), lastError: null, getManifest: () => ({ version: "test" }), getURL: (p) => p },
    tabs: { query: async () => [], create: async () => ({}) },
  };
  window.fetch = async () => ({ ok: true, json: async () => ({ data: [], not_found: [] }) });   // Scryfall: nothing
  patch(window);
  window.requestAnimationFrame = (f) => { f(Date.now()); return 0; };   // synchronous: no race with the tests' own waits
  window.cancelAnimationFrame = () => {};
  // jsdom fires DOMContentLoaded on its own, after this synchronous setup: pool.js boots once.
  for (const f of ["shared.js", "enrich.js", "pool-analyze.js", "pool.js"]) window.eval(fs.readFileSync(path.join(ROOT, f), "utf8"));
  const $ = (s) => window.document.querySelector(s);
  for (let i = 0; i < 200 && $("#results").classList.contains("hide"); i++) await new Promise((r) => setTimeout(r, 10));
  return { window, $, $$: (s) => [...window.document.querySelectorAll(s)], store };
}
const tick = () => new Promise((r) => setTimeout(r, 20));
const figs = ($$) => $$("#ref .rf .n").map((n) => n.textContent.replace(/\s+/g, ""));

test("my list is pinned from storage, measured without being counted, and marked in the lists", async () => {
  const { $, $$ } = await openPage({ poolDecks: POOL, poolMine: MINE });
  assert.equal($("#ref").classList.contains("hide"), false);
  assert.match($(".ref-kind").textContent, /My list/);
  assert.equal($(".ref-name").textContent, "My Krenko");
  // the pool still counts three decks: my list is not one of them
  assert.match($("#hero-stats").textContent, /^3/);
  // Bolt 100 %, Goblin Guide 67 %: 2 of my 3 main cards other than basic lands are consensus cards
  assert.equal(figs($$)[1], "2/3");
  const row = (name) => $(`.prow[data-card="${name}"]`);
  assert.ok(row("Mountain").classList.contains("ref-has"));
  assert.ok(row("Goblin Guide").classList.contains("ref-gap"));
  assert.equal(row("Goblin Guide").querySelector(".rtag").textContent, "missing");
  assert.equal(row("Lightning Bolt").querySelector(".rq").textContent, "you ×2");   // the pool plays 4
  assert.ok(row("Shock").classList.contains("ref-off"));
});

test("a deck of the pool, pinned from the rail, is measured against the others", async () => {
  const { $, $$, window } = await openPage({ poolDecks: POOL, poolMine: MINE });
  $('#deck-panel [data-pin="1"] .dp-link').dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await tick();
  assert.match($(".ref-kind").textContent, /Deck #2/);
  assert.equal($('#deck-panel [data-pin="1"] .dp-link').getAttribute("aria-pressed"), "true");
  // Beta against Alpha and Gamma: Shock is in neither (seldom played elsewhere); Goblin Guide is in
  // both and Fireblast in one of two (50 %): two consensus cards Beta lacks
  const [similarity, consensus, core, gaps, extras] = figs($$);
  assert.equal(core, "2/3");          // Mountain, Bolt, Guide are in both others; Beta plays two
  assert.equal(gaps, "2");
  assert.equal(extras, "1");
  assert.equal(consensus, "4/6");   // Bolt yes, Shock not among the others, Mountain left out
  // measured against two decks, "half of them" is either one: the strip says so, without the alarm
  assert.match($("#ref").textContent, /a consensus needs at least 3 decks/);
  assert.equal($('#ref [data-gapsjump="gaps-missing"]')?.classList.contains("alarm") ?? false, false);
  // the rail says the same as the strip
  assert.equal($('#deck-panel [data-pin="1"] .dp-fig').textContent, consensus);
  assert.match(similarity, /%$/);
  // its own badge turns orange
  assert.ok($$('.pbadge[data-pi="1"]').every((b) => b.classList.contains("ref-badge")));
});

test("differences only lists the gaps and the seldom-played cards, and leaves with the view", async () => {
  const { $, $$, window } = await openPage({ poolDecks: POOL, poolMine: MINE });
  $("[data-gaps]").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await tick();
  assert.equal($("[data-gaps]").getAttribute("aria-pressed"), "true");
  const ids = $$("#sections .sect").map((s) => s.id);
  assert.deepEqual(ids, ["gaps-missing", "gaps-counts", "gaps-rare"]);
  assert.deepEqual($$("#gaps-missing .prow").map((r) => r.dataset.card), ["Goblin Guide"]);
  assert.deepEqual($$("#gaps-rare .prow").map((r) => r.dataset.card), ["Fireball"]);
  // switching to the average decklist turns it off
  $('[data-view="average"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await tick();
  assert.equal($("[data-gaps]").getAttribute("aria-pressed"), "false");
});

test("removing my list hides the strip and clears the stored list", async () => {
  const { $, store, window } = await openPage({ poolDecks: POOL, poolMine: MINE });
  $("[data-rmmine]").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await tick();
  assert.equal($("#ref").classList.contains("hide"), true);
  assert.equal("poolMine" in store, false);
  assert.equal($("#mine-add").classList.contains("hide"), false);   // "Compare my list" is back
});

test("the popin takes a pasted list as my list, with its own title and one list only", async () => {
  const { $, window, store } = await openPage({ poolDecks: POOL });
  assert.equal($("#ref").classList.contains("hide"), true);   // no list yet
  $("#mine-add").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await tick();
  assert.equal($("#intro-title").textContent, "Compare my list to these decks");
  assert.equal($("#mine-saved-label").hidden, true);          // no saved decks: no picker
  const texts = $("#texts");
  texts.value = "Deck\n30 Mountain\n4 Lightning Bolt\n---\nDeck\n1 Shock";
  texts.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.match($("#count").textContent, /Only one list/);
  $("#run").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  for (let i = 0; i < 100 && $("#ref").classList.contains("hide"); i++) await tick();
  assert.match($(".ref-kind").textContent, /My list/);
  assert.equal(store.poolMine.mainboard["Lightning Bolt"], 4);
  assert.equal(store.poolDecks.length, 3);                    // the pool did not grow
  assert.equal($("#run").textContent, "Add to the comparison");   // back to the pool's own mode
});

test("a rail row previews its deck after a short hover intent; leaving the rail restores the reference", async () => {
  const { $, window } = await openPage({ poolDecks: POOL, poolMine: MINE });
  $('#deck-panel [data-pin="2"] .dp-link').dispatchEvent(new window.MouseEvent("mouseover", { bubbles: true }));
  await tick();                                       // inside the intent: nothing moved yet
  assert.match($(".ref-kind").textContent, /My list/);
  await new Promise((r) => setTimeout(r, 160));
  assert.match($(".ref-kind").textContent, /Preview · Deck #3/);
  assert.ok(window.document.body.classList.contains("ref-preview"));
  $("#deck-panel").dispatchEvent(new window.MouseEvent("mouseleave"));
  await tick();
  assert.match($(".ref-kind").textContent, /^My list$/);
});

test("the arrow keys walk the rail and preview each deck at once", async () => {
  const { $, window } = await openPage({ poolDecks: POOL, poolMine: MINE });
  window.Element.prototype.scrollIntoView = () => {};   // not in jsdom
  const start = $('#deck-panel [data-pin="mine"] .dp-link');
  start.focus();
  start.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  await tick();
  assert.equal(window.document.activeElement, $('#deck-panel [data-pin="0"] .dp-link'));
  assert.match($(".ref-kind").textContent, /Preview · Deck #1/);
});

test("a link to one of the decks pins that deck instead of copying it as my list", async () => {
  const pool = POOL.map((d, i) => ({ ...d, url: `https://archidekt.com/decks/${i + 1}` }));
  const { $, window, store } = await openPage({ poolDecks: pool });
  $("#mine-add").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await tick();
  const urls = $("#urls");
  urls.value = "https://www.archidekt.com/decks/2/";   // same page, other spelling
  urls.dispatchEvent(new window.Event("input", { bubbles: true }));
  $("#run").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await tick();
  assert.match($(".ref-kind").textContent, /^Deck #2$/);
  assert.equal("poolMine" in store, false);
  assert.equal($("#input-panel").classList.contains("hide"), true);
});

test("removing my list while a hover preview is pending leaves no preview behind", async () => {
  const { $, window } = await openPage({ poolDecks: POOL, poolMine: MINE });
  $('#deck-panel [data-pin="1"] .dp-link').dispatchEvent(new window.MouseEvent("click", { bubbles: true }));   // pin #2
  $('#deck-panel [data-pin="mine"] .dp-link').dispatchEvent(new window.MouseEvent("mouseover", { bubbles: true }));
  $("[data-rmmine]").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));   // within the intent
  await new Promise((r) => setTimeout(r, 160));
  assert.equal(window.document.body.classList.contains("ref-preview"), false);
  assert.match($(".ref-kind").textContent, /^Deck #2$/);
});

test("reading my list again keeps the old one when its page cannot be read", async () => {
  const { $, window, store } = await openPage({ poolDecks: POOL, poolMine: { ...MINE, url: "https://archidekt.com/decks/9" } });
  const before = $("#ref").textContent;
  $("[data-reloadmine]").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));   // the stub fetches nothing
  for (let i = 0; i < 20 && !$("#hero-status").textContent; i++) await tick();
  assert.match($("#hero-status").textContent, /No deck could be fetched/);
  assert.equal($("[data-reloadmine]").textContent, "Could not read it");   // seen, not only announced
  assert.equal($("#ref").textContent.replace("Could not read it", "Reload the list"), before);
  assert.equal(store.poolMine.name, "My Krenko");
});

test("a list led by another commander says so in the strip", async () => {
  const { $ } = await openPage({ poolDecks: POOL, poolMine: { ...MINE, commanders: { "Zada, Hedron Grinder": 1 } } });
  assert.match($(".ref-warn").textContent, /other commander: Zada, Hedron Grinder/);
  const same = await openPage({ poolDecks: POOL, poolMine: MINE });
  assert.equal(same.$(".ref-warn"), null);
});

test("unpinning hands focus back to the rail row without previewing it again", async () => {
  const { $, window } = await openPage({ poolDecks: POOL, poolMine: MINE });
  $("[data-unpin]").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await tick();
  assert.equal(window.document.activeElement, $('#deck-panel [data-pin="mine"] .dp-link'));
  assert.equal(window.document.body.classList.contains("has-ref"), false);   // no marks left in the lists
  assert.equal($("#ref").classList.contains("hide"), true);
});

test("a card name Scryfall does not know is looked up once, then remembered", async () => {
  const pool = POOL.map((d, i) => (i ? d : { ...d, mainboard: { ...d.mainboard, "Soldier": 1 } }));
  const store = { poolDecks: pool };
  const first = await openPage(store, (window) => {
    window.fetch = async (_url, opts) => {
      const ids = JSON.parse(opts.body).identifiers.map((x) => x.name);
      return { ok: true, status: 200, json: async () => ({ data: [], not_found: ids.map((name) => ({ name })) }) };
    };
  });
  assert.equal(store.poolEnrichCache.soldier.nf, true);
  first.window.close();
  let asked = 0;
  await openPage(store, (window) => { window.fetch = async () => { asked++; return { ok: true, json: async () => ({ data: [], not_found: [] }) }; }; });
  assert.equal(asked, 0);   // the second open asks Scryfall nothing
});

test("removing a deck keeps the keyboard in the list, on the row now in its place", async () => {
  const { $, $$, window, store } = await openPage({ poolDecks: POOL });
  const x = $('#deck-panel [data-rmdeck="0"]');
  x.focus();
  x.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  for (let i = 0; i < 30 && store.poolDecks.length === POOL.length; i++) await tick();
  for (let i = 0; i < 30 && window.document.activeElement === window.document.body; i++) await tick();
  assert.equal(store.poolDecks.length, POOL.length - 1);
  assert.equal(window.document.activeElement, $('#deck-panel [data-rmdeck="0"]'));   // Beta's, now first
  assert.equal($$("#deck-panel [data-rmdeck]").length, POOL.length - 1);
});
