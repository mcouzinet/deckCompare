// Shared deck-normalization helpers — loaded by background.js (importScripts),
// compare.html, pool.html, popup.html (<script src>) and every content script.
// Dual-mode export like enrich.js.
(function (global) {
  function sumBoard(b) {
    return Object.values(b || {}).reduce((s, q) => s + q, 0);
  }

  // Heuristic: in Commander/Duel Commander decks (~100 cards), if the sideboard
  // has only 1-2 cards and no commanders section exists, treat sideboard as commanders.
  // Some deck sites (Magic-Ville, pasted text) have no dedicated commander zone.
  function fixCommanderHeuristic(deck) {
    if (!deck.commanders) deck.commanders = {};
    const mainCount = sumBoard(deck.mainboard);
    const sideCount = sumBoard(deck.sideboard);
    const cmdrCount = sumBoard(deck.commanders);

    if (cmdrCount === 0 && sideCount >= 1 && sideCount <= 2 && mainCount >= 90) {
      deck.commanders = Object.assign({}, deck.commanders, deck.sideboard);
      deck.sideboard = {};
    }
    return deck;
  }

  // Front-face key for a split/DFC card, so the same card matches across sources and
  // resolves on Scryfall: "Brazen Borrower // Petty Theft" -> "Brazen Borrower". The
  // separator differs by source — Moxfield/Scryfall write " // ", but mtgtop8's MTGO
  // export writes a bare slash with no spaces ("Life/Death") — so split on either form
  // (one or two slashes, any surrounding spaces) and a cross-source shared card keys
  // identically instead of landing in both "unique" columns.
  function normalizeName(name) {
    return String(name).split(/\s*\/\/?\s*/)[0].trim();
  }

  // Deck-page URL matching, shared by every surface that scans open tabs (the popup's
  // "compare with this tab" and the pool analyzer's tab picker). `deckRe` is the strict
  // form — a deck-detail URL, not a homepage or listing — so a one-click shortcut can
  // never resolve to a page a comparison would fail on.
  const SUPPORTED_SITES = [
    { pattern: "mtggoldfish.com/deck/",           deckRe: /mtggoldfish\.com\/deck\/\d+/,                                                                          label: "MTGGoldfish" },
    { pattern: "mtgtop8.com/event",               deckRe: /mtgtop8\.com\/event\?[^#]*\bd=\d+/,                                                                    label: "mtgtop8" },
    { pattern: "archidekt.com/decks/",            deckRe: /archidekt\.com\/decks\/\d+/,                                                                           label: "Archidekt" },
    { pattern: "moxfield.com/decks/",             deckRe: /moxfield\.com\/decks\/(?!(?:personal|public|liked|following|bookmarks)(?:[/?#]|$))[^/?#]+/,           label: "Moxfield" },
    { pattern: "magic-ville.com/fr/decks/showdeck", deckRe: /magic-ville\.com\/fr\/decks\/showdeck\?[^#]*\bref=\d+/,                                              label: "Magic-Ville" },
    { pattern: "mtgdecks.net/",                   deckRe: /mtgdecks\.net\/[^/?#]+\/[^/?#]/,                                                                        label: "mtgdecks" },
    { pattern: "melee.gg/Decklist/View",          deckRe: /melee\.gg\/Decklist\/View\/[0-9a-fA-F-]{36}/,                                                          label: "Melee" },
    { pattern: "getpaird.io/decklists/",          deckRe: /getpaird\.io\/decklists\/[^/?#]+/,                                                                     label: "getpaird" }
  ];

  // Open browser tabs that are deck-detail pages, deduped by URL and minus `excludeUrl`
  // (the calling page itself). Extension surfaces only — chrome.tabs is absent in content
  // scripts; returns [] wherever it (or the query) is unavailable.
  async function getOpenDeckTabs(excludeUrl) {
    if (typeof chrome === "undefined" || !chrome.tabs || !chrome.tabs.query) return [];
    let tabs;
    try { tabs = await chrome.tabs.query({ currentWindow: true }); } catch { return []; }
    const seen = new Set(excludeUrl ? [excludeUrl] : []);
    const out = [];
    for (const t of tabs || []) {
      if (!t.url || seen.has(t.url)) continue;
      const site = SUPPORTED_SITES.find((x) => x.deckRe.test(t.url));
      if (!site) continue;
      seen.add(t.url);
      out.push({ url: t.url, label: site.label, title: t.title || t.url });
    }
    return out;
  }

  // The document language is whatever locale Chrome resolved for _locales, not a
  // fixed one baked into the markup. One helper, so a future refinement (keeping
  // the region subtag, RTL dir) lands on every page at once.
  function setDocumentLang() {
    if (typeof chrome === "undefined" || !chrome.i18n || typeof document === "undefined") return;
    document.documentElement.lang = chrome.i18n.getUILanguage().split("-")[0];
  }

  // ---- in-page button default (single source of truth) ----
  // The button is on unless the user switched it off: an absent key reads as on (1.1 —
  // before that, absent meant off). The popup toggle and both content scripts read this
  // one definition, so "absent" cannot mean on in one file and off in another.
  const INJECT_KEY = "injectButton";
  const injectEnabled = (value) => value !== false;

  // ---- optional page access (single source of truth) ----
  // background.js registers/unregisters these content scripts as their origin is
  // granted/revoked; popup.js requests the origins from its toggle. The manifest's
  // optional_host_permissions must list the same origins (JSON — kept by hand).
  const OPTIONAL_SCRIPTS = [
    { id: "moxfield-www",     origin: "https://www.moxfield.com/*",  matches: ["https://www.moxfield.com/decks/*"] },
    { id: "moxfield-bare",    origin: "https://moxfield.com/*",      matches: ["https://moxfield.com/decks/*"] },
    { id: "mtgtop8-bare",     origin: "https://mtgtop8.com/*",       matches: ["https://mtgtop8.com/event*"] },
    { id: "mtggoldfish-bare", origin: "https://mtggoldfish.com/*",   matches: ["https://mtggoldfish.com/deck/*"] },
    { id: "magicville-bare",  origin: "https://magic-ville.com/*",   matches: ["https://magic-ville.com/fr/decks/showdeck*"] },
    { id: "mtgdecks-www",     origin: "https://www.mtgdecks.net/*",  matches: ["https://www.mtgdecks.net/*"] }
  ];

  // True when `hostname` is covered by a match-pattern origin such as
  // "https://host/*" or "https://*.host/*". Parses the pattern instead of
  // string-munging it, so wildcard or path-scoped entries stay covered.
  function originMatchesHost(originPattern, hostname) {
    const m = /^https?:\/\/([^/]+)/.exec(originPattern);
    if (!m) return false;
    const h = m[1];
    if (h.startsWith("*.")) {
      const base = h.slice(2);
      return hostname === base || hostname.endsWith("." + base);
    }
    return hostname === h;
  }

  // ---- saved decks (written by the popup's Settings panel) ----
  // Every source, not just the last one loaded. Single list of storage keys so a
  // new source cannot ship to one surface and silently miss the others.
  const DECK_SOURCE_IDS = ["moxfield", "archidekt", "magicville"];

  async function getSavedDecks() {
    if (!hasStorage()) return [];
    let stored;
    try { stored = await chrome.storage.local.get(DECK_SOURCE_IDS.map(id => `${id}Decks`)); }
    catch { return []; }
    const out = [];
    for (const id of DECK_SOURCE_IDS) {
      for (const d of stored[`${id}Decks`] || []) {
        if (d && d.url && d.name) out.push(Object.assign({}, d, { source: id }));
      }
    }
    return out;
  }

  // One renderer for every saved-deck <select> (results page + in-page panel), so
  // label format and empty behaviour cannot drift between surfaces. Rebuilds from
  // scratch: callers invoke it on each open and always see the current list.
  function populateSavedDeckSelect(select, decks, placeholder) {
    select.innerHTML = "";
    select.hidden = !decks.length;
    if (!decks.length) return;
    select.add(new Option(placeholder, ""));
    for (const d of decks) select.add(new Option(d.format ? `${d.name} · ${d.format}` : d.name, d.url));
  }

  // ---- persistent card cache (chrome.storage.local) ----
  // Blob per cache key: { lowerName: { ...value, ts } }. Per-entry TTL; stale
  // entries are pruned on write, so the blob stays bounded. No-ops outside the
  // extension (e.g. Node tests) where chrome.storage is absent.
  const hasStorage = () => typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;

  async function cacheRead(key, ttlMs) {
    if (!hasStorage()) return {};
    let store;
    try { store = await chrome.storage.local.get(key); } catch { return {}; }
    const blob = store[key] || {};
    const now = Date.now();
    const out = {};
    for (const k in blob) if (now - (blob[k].ts || 0) < ttlMs) out[k] = blob[k];
    return out;
  }

  // entries: { name: valueObj } — merged in, stamped with now, stale pruned.
  async function cacheMerge(key, entries, ttlMs) {
    if (!hasStorage() || !entries || !Object.keys(entries).length) return;
    let store;
    try { store = await chrome.storage.local.get(key); } catch { store = {}; }
    const blob = store[key] || {};
    const now = Date.now();
    for (const k in blob) if (now - (blob[k].ts || 0) >= ttlMs) delete blob[k];
    for (const k in entries) blob[String(k).toLowerCase()] = Object.assign({}, entries[k], { ts: now });
    try { await chrome.storage.local.set({ [key]: blob }); } catch { /* quota — ignore */ }
  }

  const api = {
    fixCommanderHeuristic, sumBoard, normalizeName, cacheRead, cacheMerge,
    setDocumentLang, OPTIONAL_SCRIPTS, originMatchesHost, INJECT_KEY, injectEnabled,
    SUPPORTED_SITES, getOpenDeckTabs,
    DECK_SOURCE_IDS, getSavedDecks, populateSavedDeckSelect
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.Shared = api;
})(typeof self !== "undefined" ? self : globalThis);
