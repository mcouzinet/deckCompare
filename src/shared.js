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
  // Same job for the decorations exports hang off a card name — they differ per source
  // ("Dispatch [EOC]" in MTGGoldfish's list, "Sol Ring (LTC) 284 *F* [Ramp]" in a Moxfield
  // export, a typographic apostrophe or an &nbsp; in a scraped cell) and each one used to
  // send the same card into both "unique" columns. Stripped here, once, in the order they
  // appear from the right; no real card name ends with a bracket or a set code.
  const DECORATIONS = [
    [/[\u2018\u2019]/g, "'"],            // Urza’s Saga -> Urza's Saga
    [/\s+/g, ' '],                       // &nbsp; and double spaces
    [/\s+#.*$/, ''],                     // trailing comment
    [/\s*\[[^\]]*\]\s*$/, ''],            // [EOC], [Ramp Package]
    [/\s*\*[A-Za-z]\*\s*$/, ''],         // *F* foil marker
    [/\s*\([A-Za-z0-9]{2,6}\)\s*[A-Za-z0-9-]*$/, '']  // (LTC) 284
  ];

  // A name typed by hand ("4 dispatch", "4 SOL RING") carries no case information, and the
  // comparison keys on the name — so it would sit next to the site's "Dispatch" as a false
  // difference. Only those two forms are rewritten: every real source writes canonical case,
  // and re-casing a correct name would break the ones that need it ("R&D's Secret Lair").
  const SMALL_WORDS = new Set(['of', 'the', 'and', 'a', 'an', 'in', 'into', 'to', 'for', 'from', 'with', 'on', 'at', 'or', 'but']);
  const capitalize = (w) => w.replace(/(^|-)([\p{Ll}])/gu, (m, sep, c) => sep + c.toUpperCase());
  function fixCaselessName(s) {
    if (s !== s.toLowerCase() && s !== s.toUpperCase()) return s;   // the source cased it: keep it
    return s.toLowerCase().split(' ').map((w, i) => (i && SMALL_WORDS.has(w) ? w : capitalize(w))).join(' ');
  }

  function normalizeName(name) {
    let s = String(name);
    for (const [re, to] of DECORATIONS) s = s.replace(re, to);
    return fixCaselessName(s.split(/\s*\/\/?\s*/)[0].trim());
  }

  // Every deck goes through here once, where it enters the app (background fetch, DOM
  // read, pasted text, restored pool): each board is re-keyed by front-face name with
  // quantities merged, so every consumer counts and compares on identical keys instead
  // of each one normalizing (compare.js did, pool-analyze.js did not). Idempotent.
  function normalizeDeck(deck) {
    if (!deck) return deck;
    for (const board of ["commanders", "mainboard", "sideboard"]) {
      if (!deck[board]) continue;
      const merged = {};
      for (const [name, qty] of Object.entries(deck[board])) {
        const key = normalizeName(name);
        merged[key] = (merged[key] || 0) + qty;
      }
      deck[board] = merged;
    }
    return deck;
  }

  // Deck-page URL matching, shared by every surface that scans open tabs (the popup's
  // "compare with this tab" and the pool analyzer's tab picker). `deckRe` is the strict
  // form — a deck-detail URL, not a homepage or listing — so a one-click shortcut can
  // never resolve to a page a comparison would fail on.
  const SUPPORTED_SITES = [
    { pattern: "mtggoldfish.com/deck/",           deckRe: /mtggoldfish\.com\/deck\/\d+/,                                                                          label: "MTGGoldfish" },
    // An archetype page shows one full deck with the deck page's own DOM (hidden decklist
    // input, deck table, Stats / View Options toolbar); the background resolves its "Deck
    // Page" link to the numeric deck when fetching by URL.
    { pattern: "mtggoldfish.com/archetype/",      deckRe: /mtggoldfish\.com\/archetype\/[^/?#]+/,                                                                 label: "MTGGoldfish" },
    { pattern: "mtgtop8.com/event",               deckRe: /mtgtop8\.com\/event\?[^#]*\bd=\d+/,                                                                    label: "mtgtop8" },
    { pattern: "archidekt.com/decks/",            deckRe: /archidekt\.com\/decks\/\d+/,                                                                           label: "Archidekt" },
    { pattern: "moxfield.com/decks/",             deckRe: /moxfield\.com\/decks\/(?!(?:personal|public|liked|following|bookmarks)(?:[/?#]|$))[^/?#]+/,           label: "Moxfield" },
    { pattern: "magic-ville.com/fr/decks/showdeck", deckRe: /magic-ville\.com\/fr\/decks\/showdeck\?[^#]*\bref=\d+/,                                              label: "Magic-Ville" },
    { pattern: "mtgdecks.net/",                   deckRe: /mtgdecks\.net\/[^/?#]+\/[^/?#]/,                                                                        label: "mtgdecks" },
    { pattern: "melee.gg/Decklist/View",          deckRe: /melee\.gg\/Decklist\/View\/[0-9a-fA-F-]{36}/,                                                          label: "Melee" },
    { pattern: "getpaird.io/decklists/",          deckRe: /getpaird\.io\/decklists\/[^/?#]+/,                                                                     label: "getpaird" },
    { pattern: "manabox.app/decks/",              deckRe: /manabox\.app\/decks\/[A-Za-z0-9_-]{16,}/,                                                         label: "ManaBox" }
  ];

  // Same deck page, seen from two places: the hash (mtggoldfish's #paper/#online) and a
  // `www.` prefix are display detail, not identity. Lets the background fetcher recognise
  // the deck it wants among the open tabs.
  function sameDeckPage(a, b) {
    const key = (u) => {
      try {
        const x = new URL(u);
        return x.host.replace(/^www\./, "") + x.pathname.replace(/\/$/, "") + x.search;
      } catch { return String(u); }
    };
    return key(a) === key(b);
  }

  // A deck tab's title without what the site wraps around the deck's name, so two decks of the
  // same commander can be told apart in a list: "X • (Altruism Commander deck) • Archidekt",
  // "X | Moxfield", "X Deck for Magic: the Gathering" (MTGGoldfish), "X \u2014 mtgdecks.net".
  // The site's name only as the title's last word (a deck called "Isshin - Melee Attack Triggers"
  // keeps its "Melee").
  const SITE_SUFFIX = /\s*[\u2022|\u00b7@\u2014\u2013-]\s*(Archidekt|Moxfield|MTGGoldfish|mtgtop8|Magic-Ville|mtgdecks|Melee|getpaird|ManaBox)(\.\w+)?\s*$/i;
  function deckTabTitle(title) {
    const t = String(title || "")
      .replace(/\s+Deck for Magic: the Gathering\s*$/i, "")
      .replace(SITE_SUFFIX, "")
      .replace(/\s*\u2022\s*\([^)]*\bdeck\)\s*$/i, "")
      .trim();
    return t || String(title || "");
  }

  // Open browser tabs that are deck-detail pages, deduped by URL and minus `excludeUrl`
  // (the calling page itself). Extension surfaces only — chrome.tabs is absent in content
  // scripts; returns [] wherever it (or the query) is unavailable.
  // Every window, the caller's first (`caller` = { windowId, incognito } of the tab whose panel
  // asks, for the background; else the current window): the second deck is often in a window
  // side by side. Never across the private-browsing boundary, in either direction.
  async function getOpenDeckTabs(excludeUrl, caller) {
    if (typeof chrome === "undefined" || !chrome.tabs || !chrome.tabs.query) return [];
    let tabs;
    try {
      const here = caller || (await chrome.tabs.query({ currentWindow: true }))[0] || {};
      tabs = (await chrome.tabs.query({})).filter((t) => !!t.incognito === !!here.incognito);
      tabs.sort((a, b) => (b.windowId === here.windowId) - (a.windowId === here.windowId));   // stable: tab order kept within a window
    } catch { return []; }
    const seen = new Set(excludeUrl ? [excludeUrl] : []);
    const out = [];
    for (const t of tabs || []) {
      if (!t.url || seen.has(t.url)) continue;
      const site = SUPPORTED_SITES.find((x) => x.deckRe.test(t.url));
      if (!site) continue;
      seen.add(t.url);
      out.push({ url: t.url, label: site.label, title: deckTabTitle(t.title) || t.url });
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

  // ---- cross-compare storage (pool.js owns it; the popup reads the pool and writes my list) ----
  const POOL_DECKS_KEY = "poolDecks";
  const POOL_MINE_KEY = "poolMine";

  // ---- in-page button default (single source of truth) ----
  // The button is on unless the user switched it off: an absent key reads as on (1.1 —
  // before that, absent meant off). The popup toggle and both content scripts read this
  // one definition, so "absent" cannot mean on in one file and off in another.
  const INJECT_KEY = "injectButton";
  const injectEnabled = (value) => value !== false;
  // 1.1 turned the button on by default. A 1.0.x install can hold a stored `false` that was
  // never a choice (1.0.13 also wrote it when the Moxfield permission prompt was declined),
  // and the two cannot be told apart — so an update from any pre-1.1 build clears the key
  // once: everyone gets the button, and switching it off is again one click away. A dev
  // reload within the 1.1 line (1.1.1 → 1.1.2) keeps the setting.
  const injectResetOnUpdate = (previousVersion) => {
    const [major, prod] = String(previousVersion || "").split(".").map(Number);
    if (!Number.isFinite(major) || !Number.isFinite(prod)) return false;
    return major < 1 || (major === 1 && prod < 1);
  };

  // ---- optional page access (single source of truth) ----
  // background.js registers/unregisters these content scripts as their origin is
  // granted/revoked; popup.js requests the origins from its toggle. The manifest's
  // optional_host_permissions must list the same origins (JSON — kept by hand).
  const OPTIONAL_SCRIPTS = [
    { id: "moxfield-www",     origin: "https://www.moxfield.com/*",  matches: ["https://www.moxfield.com/decks/*"] },
    { id: "moxfield-bare",    origin: "https://moxfield.com/*",      matches: ["https://moxfield.com/decks/*"] },
    { id: "mtgtop8-bare",     origin: "https://mtgtop8.com/*",       matches: ["https://mtgtop8.com/event*"] },
    { id: "mtggoldfish-bare", origin: "https://mtggoldfish.com/*",   matches: ["https://mtggoldfish.com/deck/*", "https://mtggoldfish.com/archetype/*"] },
    { id: "magicville-bare",  origin: "https://magic-ville.com/*",   matches: ["https://magic-ville.com/fr/decks/showdeck*"] },
    { id: "mtgdecks-www",     origin: "https://www.mtgdecks.net/*",  matches: ["https://www.mtgdecks.net/*"] },
    // ManaBox: a site the extension never had access to, so optional from the start (a new
    // required host would disable the extension until every user re-accepts it).
    { id: "manabox",          origin: "https://manabox.app/*",       matches: ["https://manabox.app/decks/*"] },
    { id: "manabox-www",      origin: "https://www.manabox.app/*",   matches: ["https://www.manabox.app/decks/*"] }
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

  // True when `url` sits on one of the optional origins — by default every OPTIONAL_SCRIPTS
  // entry, or the subset passed in (e.g. the ones still ungranted). These are the deck pages
  // where the in-page button needs a granted permission before it can appear.
  function isOptionalHost(url, origins = OPTIONAL_SCRIPTS.map((s) => s.origin)) {
    if (!url) return false;
    let host;
    try { host = new URL(url).hostname; } catch (_) { return false; }
    return origins.some((o) => originMatchesHost(o, host));
  }

  // A ManaBox deck is read in a tab (background.js), which needs the site's optional access. The
  // background cannot ask for it (no user gesture), so the extension pages do, from the click that
  // wants such a deck: no prompt once granted, and a decline ends in errManaboxAccess. Call it
  // before any other await of the handler: Firefox honours a request only there.
  const MANABOX_ORIGINS = OPTIONAL_SCRIPTS.filter((s) => s.id.startsWith("manabox")).map((s) => s.origin);
  async function requestManaBoxAccess(urls) {
    const origins = MANABOX_ORIGINS.filter((o) => urls.some((u) => isOptionalHost(u, [o])));
    if (!origins.length) return false;
    try { return await chrome.permissions.request({ origins }); } catch (_) { return false; }
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

  // Card types and images from Scryfall, cached by the background's lookup (FETCH_CARD_TYPES).
  // The results page reads the cache itself too, so the images of known cards start loading
  // before the lookup answers. A name Scryfall did not know is cached as such (`nf`, no image:
  // the card shows its name) for a day.
  // The cross-compare page's own cache (poolEnrichCache, whole cards) answers what this one
  // lacks: a detailed comparison opened from a pool then asks Scryfall for nothing.
  const CARD_TYPE_TTL = 30 * 24 * 60 * 60 * 1000;   // card types are stable
  const CARD_MISS_TTL = 24 * 60 * 60 * 1000;
  async function cachedCardTypes(names) {
    const [cached, pooled] = await Promise.all([
      cacheRead("cardTypeCache", CARD_TYPE_TTL), cacheRead("poolEnrichCache", CARD_TYPE_TTL)]);
    const now = Date.now();
    const out = { lands: [], creatures: [], images: {}, misses: [] };
    for (const name of names) {
      const hit = cached[name.toLowerCase()] || fromPool(pooled[name.toLowerCase()]);
      // `i` is absent on entries written before images were cached: a miss, so the cache
      // refills itself once. An empty string means "known to have no image".
      if (!hit || hit.i === undefined || (hit.nf && now - hit.ts >= CARD_MISS_TTL)) { out.misses.push(name); continue; }
      if (hit.l) out.lands.push(name);
      if (hit.c) out.creatures.push(name);
      if (hit.i) out.images[name] = hit.i;
    }
    return out;
  }
  // A poolEnrichCache entry in cardTypeCache's shape, judged on the front face as the lookup
  // does: a modal land on its back is not a land.
  function fromPool(e) {
    if (!e || !e.type_line) return null;
    const front = String(e.type_line).split(" // ")[0];
    return { l: front.includes("Land"), c: front.includes("Creature"), i: e.image_uri || "" };
  }

  // Whether a count takes its noun's plural in the interface language: French keeps 0 and 1
  // singular ("0 carte", "1 carte"), English 1 alone ("0 cards", "1 card").
  function plural(n) {
    const lang = typeof chrome !== "undefined" && chrome.i18n && chrome.i18n.getUILanguage ? chrome.i18n.getUILanguage() : "en";
    return /^fr/i.test(lang) ? n > 1 : n !== 1;
  }

  const api = {
    fixCommanderHeuristic, sumBoard, normalizeName, normalizeDeck, cacheRead, cacheMerge, CARD_TYPE_TTL, cachedCardTypes, plural,
    setDocumentLang, OPTIONAL_SCRIPTS, originMatchesHost, isOptionalHost, requestManaBoxAccess, INJECT_KEY, injectEnabled, injectResetOnUpdate,
    SUPPORTED_SITES, getOpenDeckTabs, deckTabTitle, sameDeckPage,
    DECK_SOURCE_IDS, getSavedDecks, populateSavedDeckSelect, POOL_DECKS_KEY, POOL_MINE_KEY
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.Shared = api;
})(typeof self !== "undefined" ? self : globalThis);
