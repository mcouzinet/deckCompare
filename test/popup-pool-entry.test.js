"use strict";
// The popup's "This deck against the N decks" entry, in jsdom: popup.html with shared.js and
// popup.js, a stubbed chrome API, the active tab on a deck page. It shows only with a saved pool
// the deck is not already part of, and names the pool's commander.
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..", "src");
const TAB = "https://archidekt.com/decks/77";
const deck = (url, cmd) => ({ name: url, source: "archidekt", url, commanders: { [cmd]: 1 }, mainboard: { "Sol Ring": 1 }, sideboard: {} });
const opened = [];
after(() => { for (const w of opened) w.close(); });

async function openPopup(store, patch = () => {}) {
  const html = fs.readFileSync(path.join(ROOT, "popup.html"), "utf8")
    .replace(/<script src="[^"]+"><\/script>/g, "")
    .replace(/<link[^>]+fonts\.googleapis[^>]*>/g, "");
  const { window } = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url: "chrome-extension://test/popup.html" });
  opened.push(window);
  const messages = JSON.parse(fs.readFileSync(path.join(ROOT, "_locales/en/messages.json"), "utf8"));
  window.chrome = {
    i18n: {
      getUILanguage: () => "en",
      getMessage: (key, subs) => {
        const m = messages[key];
        if (!m) return "";
        let out = m.message;
        for (const [ph, def] of Object.entries(m.placeholders || {})) {
          out = out.split(`$${ph.toUpperCase()}$`).join([].concat(subs || [])[parseInt(def.content.slice(1), 10) - 1] ?? "");
        }
        return out;
      },
    },
    storage: { local: {
      get: async (keys) => { const out = {}; for (const k of [].concat(keys || [])) if (k in store) out[k] = store[k]; return out; },
      set: async (obj) => { Object.assign(store, obj); },
      remove: async () => {},
    } },
    tabs: { query: async () => [{ id: 1, url: TAB, title: "My deck", active: true }], sendMessage: (_id, _m, cb) => cb && cb(null), create: async () => ({}) },
    runtime: { sendMessage: (_m, cb) => cb && cb(null), lastError: null, getManifest: () => ({ version: "test", host_permissions: [], content_scripts: [] }), getURL: (p) => p, onMessage: { addListener() {} } },
    permissions: { contains: async () => true, request: async () => true, remove: async () => true },
  };
  patch(window.chrome);
  window.close = () => {};   // the popup closes itself after acting
  for (const f of ["shared.js", "popup.js"]) window.eval(fs.readFileSync(path.join(ROOT, f), "utf8"));
  // The popup settles its entry after a few awaits (tab query, saved decks, the pool): give it that.
  const btn = window.document.getElementById("pool-mine-btn");
  for (let i = 0; i < 30 && btn.hidden; i++) await new Promise((r) => setTimeout(r, 10));
  return { window, btn };
}

test("offered on a deck page with a saved pool, naming its commander", async () => {
  const pool = [deck("https://archidekt.com/decks/1", "Aragorn, the Uniter"), deck("https://archidekt.com/decks/2", "Aragorn, the Uniter"),
    deck("https://archidekt.com/decks/3", "Krenko, Mob Boss")];
  const { btn } = await openPopup({ poolDecks: pool });
  assert.equal(btn.hidden, false);
  assert.equal(btn.querySelector("#pool-mine-text").textContent, "This deck against the 3 decks");
  assert.equal(btn.querySelector("#pool-mine-sub").textContent, "· Aragorn, the Uniter");
});

test("not offered without a saved pool, nor on a deck the pool already holds", async () => {
  const none = await openPopup({});
  assert.equal(none.btn.hidden, true);
  // the active tab's own deck, spelt differently (www, trailing slash)
  const pooled = await openPopup({ poolDecks: [deck("https://www.archidekt.com/decks/77/", "Aragorn, the Uniter")] });
  assert.equal(pooled.btn.hidden, true);
});

test("a ManaBox tab is read without the site's access: the popup injects its reader (activeTab)", async () => {
  const URL = "https://manabox.app/decks/qWOeE_BgTEyv7VV2-kzpXg";
  const injected = [];
  const sent = [];
  const store = { poolDecks: [deck("https://archidekt.com/decks/1", "Aragorn, the Uniter")] };
  const { window, btn } = await openPopup(store, (chrome) => {
    chrome.tabs.query = async () => [{ id: 1, url: URL, title: "ManaBox", active: true }];
    // No content script on the page (ManaBox not granted) until the popup injects one.
    chrome.tabs.sendMessage = (_id, _m, cb) => {
      if (injected.length) return cb({ deck: { name: "Aragorn Landfall", commanders: { "Aragorn, the Uniter": 1 }, mainboard: { "Sol Ring": 1 }, sideboard: {} } });
      chrome.runtime.lastError = { message: "Could not establish connection. Receiving end does not exist." };
      cb(undefined);
      chrome.runtime.lastError = null;
    };
    chrome.scripting = { executeScript: async (inj) => { injected.push(inj); return [{}]; } };
    chrome.runtime.sendMessage = (m, cb) => { sent.push(m.type); if (cb) cb(null); };
  });
  assert.equal(btn.hidden, false);
  btn.click();
  for (let i = 0; i < 50 && !store.poolMine; i++) await new Promise((r) => setTimeout(r, 10));
  assert.equal(injected[0].target.tabId, 1);
  assert.deepEqual([...injected[0].files], ["shared.js", "dom-parsers.js", "content.js"]);
  assert.equal(store.poolMine.url, URL);
  assert.deepEqual(store.poolMine.mainboard, { "Sol Ring": 1 });
  assert.equal(window.document.getElementById("detected-name").textContent, "Aragorn Landfall");
  assert.ok(!sent.includes("FETCH_DECK"));   // read on the page, never refused by the background
});

test("the saved decks wait for the user: the popup's own focus does not open them, a click does", async () => {
  const saved = [{ url: "https://archidekt.com/decks/5", name: "Krenko Tokens", format: "Commander" }];
  const { window } = await openPopup({ archidektDecks: saved });
  const input = window.document.getElementById("deck-url");
  const dropdown = window.document.getElementById("deck-dropdown");
  for (let i = 0; i < 30 && window.document.activeElement !== input; i++) await new Promise((r) => setTimeout(r, 10));
  assert.equal(window.document.activeElement, input);   // the caret lands in the field
  input.dispatchEvent(new window.FocusEvent("focus"));   // the window's own focus, arriving late
  assert.equal(dropdown.classList.contains("open"), false);
  input.click();
  assert.equal(dropdown.classList.contains("open"), true);
  assert.match(dropdown.textContent, /Krenko Tokens/);
});

test("with the settings open, their messages show under them (the main view is hidden)", async () => {
  const { window } = await openPopup({});
  const $ = (s) => window.document.querySelector(s);
  $("#settings-toggle").click();
  $("#settings-user").value = "";
  $('[data-source="archidekt"]').click();   // no username: the popup asks for one
  await new Promise((r) => setTimeout(r, 20));
  const status = $("#status");
  assert.match(status.textContent, /username/i);
  // no hidden ancestor between the line and the page
  for (let el = status; el; el = el.parentElement) assert.notEqual(el.style.display, "none");
  $("#settings-close").click();
  assert.ok($(".p-body").contains(status));   // back in the main view
});
