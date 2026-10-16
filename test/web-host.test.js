"use strict";
// web-host.js, the results page's stand-in for chrome.* where a shared link opens it on the web:
// the extension's own strings, placeholders included, in the browser's language; and nothing at
// all inside the extension.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..", "src");
async function host(language, chrome) {
  const { window } = new JSDOM("<!DOCTYPE html><head></head>", { runScripts: "outside-only", url: "https://mcouzinet.github.io/deckCompare/src/compare.html" });
  Object.defineProperty(window.navigator, "language", { value: language });
  if (chrome) window.chrome = chrome;
  const asked = [];
  window.fetch = async (url) => { asked.push(url); return { json: async () => JSON.parse(fs.readFileSync(path.join(ROOT, url), "utf8")) }; };
  window.eval(fs.readFileSync(path.join(ROOT, "web-host.js"), "utf8"));
  if (window.webHost) await window.webHost.ready;
  return { window, asked };
}

test("outside the extension, the page speaks the extension's own strings, in the browser's language", async () => {
  const fr = await host("fr-FR");
  assert.deepEqual(fr.asked, ["_locales/en/messages.json", "_locales/fr/messages.json"]);
  const t = fr.window.chrome.i18n.getMessage;
  assert.equal(t("similarityBasis", ["21", "30"]), "21 cartes en commun sur 30");
  assert.equal(t("resultsTabTitle", ["Burn", "Red Deck Wins"]), "Red Deck Wins contre Burn · Deck Compare");
  assert.equal(t("no-such-key"), "");
  const en = await host("en-US");
  assert.deepEqual(en.asked, ["_locales/en/messages.json"]);
  assert.equal(en.window.chrome.i18n.getMessage("similarityBasis", ["21", "30"]), "21 of 30 cards in common");
  // storage lives as long as the page: nothing is written on the reader's machine
  await en.window.chrome.storage.local.set({ compareView: "list" });
  assert.deepEqual({ ...await en.window.chrome.storage.local.get(["compareView", "compareData"]) }, { compareView: "list" });
});

test("inside the extension, it leaves chrome.* alone", async () => {
  const own = { runtime: { id: "extension" } };
  const { window, asked } = await host("en-US", own);
  assert.equal(window.chrome, own);
  assert.equal(window.webHost, undefined);
  assert.deepEqual(asked, []);
});

test("a shared link opens on the web: the pair, its day, and Scryfall's types and images, accents aside", async () => {
  const { shareLink } = require("../src/shared.js");
  const deck = (name, main) => ({ name, source: "Moxfield", url: "https://moxfield.com/decks/x", commanders: {}, mainboard: main, sideboard: {} });
  const link = await shareLink(deck("Red Deck Wins", { "Mountain": 20, "Lorien Revealed": 1, "Goblin Guide": 4 }),
    deck("Burn", { "Mountain": 18, "Shock": 4 }), new Date(2026, 8, 30));
  const html = fs.readFileSync(path.join(ROOT, "compare.html"), "utf8").replace(/<script src="[^"]+"><\/script>/g, "");
  const { window } = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true,
    url: `https://mcouzinet.github.io/deckCompare/src/compare.html${new URL(link).hash}` });
  Object.defineProperty(window.navigator, "language", { value: "en-US" });
  Object.assign(window, { CompressionStream, DecompressionStream, TextEncoder, TextDecoder });
  window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = () => ({ matches: false });
  // Scryfall spells one of them with its accent (the deck came from an MTGO export).
  const cards = {
    "Mountain": { name: "Mountain", type_line: "Basic Land" },
    "Lorien Revealed": { name: "Lórien Revealed", type_line: "Sorcery" },
    "Goblin Guide": { name: "Goblin Guide", type_line: "Creature" },
    "Shock": { name: "Shock", type_line: "Instant" },
  };
  for (const c of Object.values(cards)) c.image_uris = { normal: `https://cards.scryfall.io/${encodeURIComponent(c.name)}.jpg` };
  window.fetch = async (url, init) => {
    if (String(url).startsWith("_locales/")) return { json: async () => JSON.parse(fs.readFileSync(path.join(ROOT, url), "utf8")) };
    const asked = JSON.parse(init.body).identifiers;
    return { ok: true, status: 200, json: async () => ({ data: asked.map(({ name }) => cards[name]), not_found: [] }) };
  };
  // jsdom runs no <script src>: enrich.js is evaluated when web-host.js appends it.
  const head = window.document.head, append = head.append.bind(head);
  head.append = (el) => {
    if (!/\/enrich\.js$/.test(el.src || "")) return append(el);
    window.eval(fs.readFileSync(path.join(ROOT, "enrich.js"), "utf8"));
    setTimeout(() => el.onload());
  };
  for (const f of ["web-host.js", "shared.js", "compare.js"]) window.eval(fs.readFileSync(path.join(ROOT, f), "utf8"));
  const $ = (s) => window.document.querySelector(s);
  for (let i = 0; i < 200 && !$(".type-divider"); i++) await new Promise((r) => setTimeout(r, 10));
  assert.equal($("#ring-num").textContent, "72%");   // 18 Mountains in common, over deck 1's 25 cards
  assert.ok(window.document.body.classList.contains("shared-view"));
  assert.equal($("#shared-tag").textContent, "Comparison shared on September 30, 2026");
  assert.equal($("#rate-link").textContent, "Get Deck Compare");
  assert.ok($(".type-divider"), "the lookup typed the cards");
  const lorien = $('.card-slot[data-name="Lorien Revealed"]');
  assert.ok(!lorien.classList.contains("is-proxy"));
  assert.equal(lorien.querySelector("img").dataset.src, "https://cards.scryfall.io/L%C3%B3rien%20Revealed.jpg");
  window.close();
});
