// Service worker – handles deck fetching from APIs (avoids CORS)
importScripts('shared.js', 'parsers.js');

// --- Dev-build marker -------------------------------------------------------
// Chrome injects `update_url` into the manifest of Web Store installs; an unpacked
// (locally loaded) extension has none. Used to make a local build unmistakable, so
// it is never confused with the published one. No extra permission needed.
const IS_DEV = !('update_url' in chrome.runtime.getManifest());

// Recolour the toolbar icon at runtime (swap the R/B channels) rather than shipping
// a second icon set — nothing extra to package or to strip from the release zip.
async function markDevBuild() {
  chrome.action.setBadgeText({ text: 'DEV' });
  chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
  chrome.action.setTitle({ title: `${chrome.i18n.getMessage('appName')} — DEV` });
  try {
    const imageData = {};
    for (const size of [16, 48, 128]) {
      const blob = await (await fetch(chrome.runtime.getURL(`icons/icon${size}.png`))).blob();
      const bitmap = await createImageBitmap(blob);
      const ctx = new OffscreenCanvas(size, size).getContext('2d');
      ctx.drawImage(bitmap, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size);
      const px = data.data;
      for (let i = 0; i < px.length; i += 4) { const r = px[i]; px[i] = px[i + 2]; px[i + 2] = r; }
      imageData[size] = data;
    }
    await chrome.action.setIcon({ imageData });
  } catch (_) { /* the DEV badge alone still marks the build */ }
}

if (IS_DEV) markDevBuild();

// --- Optional page access for the in-page button ----------------------------
// Two kinds of gap are covered here, both OPTIONAL so that shipping this never forces
// existing users through a permission dialog (which disables the extension until they
// re-accept):
//
//  1. Moxfield — its decks come from api2.moxfield.com, so the extension has never
//     needed access to the page the user is actually looking at.
//  2. www/non-www twins — the manifest declares e.g. www.mtgtop8.com, but the site also
//     serves mtgtop8.com, where a content script matching only the www form never runs.
//     The background fetcher already accepts both (ALLOWED_DECK_HOSTS); only the button
//     had the hole.
//
// Each granted origin gets its content script registered here, and unregistered if the
// permission is revoked.
const OPTIONAL_SCRIPTS = [
  { id: 'moxfield-www',    origin: 'https://www.moxfield.com/*',  matches: ['https://www.moxfield.com/decks/*'] },
  { id: 'moxfield-bare',   origin: 'https://moxfield.com/*',      matches: ['https://moxfield.com/decks/*'] },
  { id: 'mtgtop8-bare',    origin: 'https://mtgtop8.com/*',       matches: ['https://mtgtop8.com/event*'] },
  { id: 'mtggoldfish-bare', origin: 'https://mtggoldfish.com/*',  matches: ['https://mtggoldfish.com/deck/*'] },
  { id: 'magicville-bare', origin: 'https://magic-ville.com/*',   matches: ['https://magic-ville.com/fr/decks/showdeck*'] },
  { id: 'mtgdecks-www',    origin: 'https://www.mtgdecks.net/*',  matches: ['https://www.mtgdecks.net/*'] }
];

const OPTIONAL_ORIGINS = OPTIONAL_SCRIPTS.map(s => s.origin);

async function syncOptionalScripts() {
  let registered;
  try {
    registered = await chrome.scripting.getRegisteredContentScripts();
  } catch { return; }
  const have = new Set(registered.map(s => s.id));

  for (const entry of OPTIONAL_SCRIPTS) {
    let granted;
    try { granted = await chrome.permissions.contains({ origins: [entry.origin] }); } catch { continue; }
    try {
      if (granted && !have.has(entry.id)) {
        await chrome.scripting.registerContentScripts([{
          id: entry.id,
          matches: entry.matches,
          js: ['dom-parsers.js', 'content.js', 'inject-button.js'],
          runAt: 'document_idle'
        }]);
      } else if (!granted && have.has(entry.id)) {
        await chrome.scripting.unregisterContentScripts({ ids: [entry.id] });
      }
    } catch { /* best-effort per site; the statically declared ones are unaffected */ }
  }
}

chrome.permissions.onAdded.addListener(syncOptionalScripts);
chrome.permissions.onRemoved.addListener(syncOptionalScripts);
syncOptionalScripts();   // also covers each service-worker restart

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'FETCH_DECK') {
    fetchDeckByUrl(msg.url)
      .then(deck => sendResponse({ deck }))
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }

  if (msg.type === 'FETCH_DECKS') {
    fetchDecks(msg.urls || [])
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ decks: [], errors: [{ url: '', error: (err && err.message) || String(err) }] }));
    return true;
  }

  if (msg.type === 'LIST_MOXFIELD_DECKS') {
    listMoxfieldDecks(msg.username)
      .then(decks => sendResponse({ decks }))
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }

  if (msg.type === 'LIST_ARCHIDEKT_DECKS') {
    listArchidektDecks(msg.username)
      .then(decks => sendResponse({ decks }))
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }

  if (msg.type === 'LIST_MAGICVILLE_DECKS') {
    listMagicVilleDecks(msg.username)
      .then(decks => sendResponse({ decks }))
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }

  // The in-page button lives in a content script, which has no chrome.tabs access.
  if (msg.type === 'OPEN_COMPARE') {
    chrome.tabs.create({ url: chrome.runtime.getURL('compare.html') })
      .then(() => sendResponse({ ok: true }))
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }

  if (msg.type === 'FETCH_CARD_TYPES') {
    fetchCardTypes(msg.names)
      .then(types => sendResponse(types))
      .catch(() => sendResponse({ lands: [], creatures: [] }));
    return true;
  }
});

// --- Scryfall card type batch fetch (persistent cache + retry) ---

const CARD_TYPE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days — card types are stable

// POST one /cards/collection batch, retrying transient errors (429/5xx).
async function scryfallCollection(identifiers) {
  for (let attempt = 0; attempt < 3; attempt++) {
    let res;
    try {
      res = await fetch('https://api.scryfall.com/cards/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiers })
      });
    } catch { await new Promise(r => setTimeout(r, 500 * (attempt + 1))); continue; }
    if (res.ok) return res.json();
    if (res.status === 429 || res.status >= 500) { await new Promise(r => setTimeout(r, 800 * (attempt + 1))); continue; }
    return null; // other 4xx — don't retry
  }
  return null;
}

async function fetchCardTypes(names) {
  const BATCH = 75;
  const landNames = new Set();
  const creatureNames = new Set();

  // Serve what we can from the persistent cache; only miss names hit Scryfall.
  const cached = await Shared.cacheRead('cardTypeCache', CARD_TYPE_TTL);
  const misses = [];
  for (const name of names) {
    const hit = cached[name.toLowerCase()];
    if (hit) {
      if (hit.l) landNames.add(name);
      if (hit.c) creatureNames.add(name);
    } else {
      misses.push(name);
    }
  }

  const fresh = {}; // canonical face name -> { l, c }
  for (let i = 0; i < misses.length; i += BATCH) {
    const batch = misses.slice(i, i + BATCH);
    const data = await scryfallCollection(batch.map(name => ({ name })));
    if (!data) continue; // transient failure — cached hits still render, miss retries next time
    for (const card of (data.data || [])) {
      const faces = card.card_faces || [card];
      for (const face of faces) {
        const tl = face.type_line || card.type_line || '';
        const nm = face.name || card.name;
        const isLand = tl.includes('Land');
        const isCreature = tl.includes('Creature');
        if (isLand) landNames.add(nm);
        if (isCreature) creatureNames.add(nm);
        fresh[nm] = { l: isLand, c: isCreature };
      }
    }
    if (i + BATCH < misses.length) await new Promise(r => setTimeout(r, 100));
  }

  await Shared.cacheMerge('cardTypeCache', fresh, CARD_TYPE_TTL);
  return { lands: [...landNames], creatures: [...creatureNames] };
}

// --- Moxfield: list user's public decks ---

async function listMoxfieldDecks(username) {
  const headers = {
    'Referer': 'https://www.moxfield.com/',
    'Cache-Control': 'no-cache'
  };

  const allDecks = [];
  let page = 1;
  let totalPages = 1;

  do {
    const params = new URLSearchParams({
      authorUserNames: username,
      pageNumber: page,
      pageSize: '100',
      sortType: 'Updated',
      sortDirection: 'Descending',
      _t: Date.now()
    });

    const res = await fetch(`https://api2.moxfield.com/v2/decks/search?${params}`, { headers, cache: 'no-store' });

    if (!res.ok) {
      if (res.status === 404) throw new Error(chrome.i18n.getMessage('errMoxfieldUserNotFound'));
      throw new Error(`${chrome.i18n.getMessage('errMoxfieldStatus')} ${res.status}`);
    }

    const data = await res.json();
    totalPages = data.totalPages || 1;

    for (const d of (data.data || [])) {
      allDecks.push({
        id: d.publicId,
        name: d.name,
        format: d.format || '',
        url: `https://www.moxfield.com/decks/${d.publicId}`
      });
    }

    page++;
  } while (page <= totalPages);

  return allDecks;
}

// --- Archidekt: list user's public decks ---

const ARCHIDEKT_FORMATS = { 1: 'Standard', 2: 'Modern', 3: 'Commander', 4: 'Vintage', 5: 'Pauper', 6: 'Legacy', 7: 'Frontier', 8: 'Future Standard', 9: 'Penny Dreadful', 10: 'Commander 1v1', 11: 'Brawl', 12: 'Oathbreaker', 13: 'Pioneer', 14: 'Historic', 15: 'Premodern', 16: 'Alchemy', 17: 'Explorer' };

async function listArchidektDecks(username) {
  const allDecks = [];
  let page = 1;
  let hasNext = true;

  while (hasNext) {
    const params = new URLSearchParams({
      ownerUsername: username,
      pageSize: '100',
      orderBy: '-updatedAt',
      page: String(page)
    });

    const res = await fetch(`https://archidekt.com/api/decks/v3/?${params}`);
    if (!res.ok) throw new Error(`${chrome.i18n.getMessage('errArchidektStatus')} ${res.status}`);

    const data = await res.json();

    if (data.count === -1) throw new Error(chrome.i18n.getMessage('errArchidektUserNotFound'));

    for (const d of (data.results || [])) {
      if (d.private || d.unlisted) continue;
      allDecks.push({
        id: d.id,
        name: d.name,
        format: ARCHIDEKT_FORMATS[d.deckFormat] || '',
        url: `https://archidekt.com/decks/${d.id}`
      });
    }

    hasNext = !!data.next;
    page++;
  }

  return allDecks;
}

// --- Magic-Ville: list user's decks by pseudo ---

async function listMagicVilleDecks(username) {
  const res = await fetch(`https://www.magic-ville.com/fr/decks/resultats?joueur=${encodeURIComponent(username)}`);
  if (!res.ok) throw new Error(`${chrome.i18n.getMessage('errMagicVilleStatus')} ${res.status}`);

  const buf = await res.arrayBuffer();
  const html = new TextDecoder('iso-8859-1').decode(buf);

  const allDecks = [];
  // Pattern: <a ... href=showdeck?ref=NNNN ...>DECK NAME</a> within deck listing rows
  const regex = /href=["']?(?:\.\.\/decks\/)?showdeck\?ref=(\d+)[^>]*>([^<]+)<\/a>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const ref = match[1];
    const name = match[2].trim();
    if (name && !allDecks.some(d => d.id === ref)) {
      allDecks.push({
        id: ref,
        name,
        format: '',
        url: `https://www.magic-ville.com/fr/decks/showdeck?ref=${ref}`
      });
    }
  }

  if (!allDecks.length) throw new Error(chrome.i18n.getMessage('errMagicVilleNoDeckFound'));
  return allDecks;
}

// --- Router: detect source from URL and fetch ---

const ALLOWED_DECK_HOSTS = [
  'www.moxfield.com', 'moxfield.com',
  'archidekt.com',
  'www.mtgtop8.com', 'mtgtop8.com',
  'www.mtggoldfish.com', 'mtggoldfish.com',
  'www.magic-ville.com', 'magic-ville.com',
  'mtgdecks.net', 'www.mtgdecks.net',
  'melee.gg', 'www.melee.gg',
  'getpaird.io', 'www.getpaird.io'
];

async function fetchDeckByUrl(url) {
  try {
    const parsed = new URL(url);
    if (!ALLOWED_DECK_HOSTS.includes(parsed.hostname)) throw new Error();
  } catch {
    throw new Error(chrome.i18n.getMessage('errUnsupportedSource'));
  }
  let deck;
  if (url.includes('moxfield.com')) deck = await fetchMoxfieldDeck(url);
  else if (url.includes('archidekt.com')) deck = await fetchArchidektDeck(url);
  else if (url.includes('mtgtop8.com')) deck = await fetchMtgTop8Deck(url);
  else if (url.includes('mtggoldfish.com')) deck = await fetchMtgGoldfishDeck(url);
  else if (url.includes('magic-ville.com')) deck = await fetchMagicVilleDeck(url);
  else if (url.includes('mtgdecks.net')) deck = await fetchMtgDecksDeck(url);
  else if (url.includes('melee.gg')) deck = await fetchMeleeDeck(url);
  else if (url.includes('getpaird.io')) deck = await fetchGetpairdDeck(url);
  else throw new Error(chrome.i18n.getMessage('errUnsupportedSource'));

  // Guard: a page that yielded no cards (an archetype/listing page, or a parser
  // that silently found nothing) surfaces a clear error instead of an empty deck
  // that would produce a blank comparison.
  if (Shared.sumBoard(deck.mainboard) + Shared.sumBoard(deck.commanders) === 0) {
    throw new Error(chrome.i18n.getMessage('emptyDeck'));
  }
  return deck;
}

// --- Moxfield ---

async function fetchMoxfieldDeck(urlOrId) {
  let deckId = urlOrId;
  if (urlOrId.includes('moxfield.com')) {
    const match = urlOrId.match(/moxfield\.com\/decks\/([^/?#]+)/);
    if (match) deckId = match[1];
  }

  const res = await fetch(`https://api2.moxfield.com/v3/decks/all/${deckId}`);
  if (!res.ok) {
    if (res.status === 404) throw new Error(chrome.i18n.getMessage('errMoxfieldDeckNotFound'));
    throw new Error(`${chrome.i18n.getMessage('errMoxfieldStatus')} ${res.status}`);
  }

  const data = await res.json();
  return Parsers.parseMoxfield(data);
}

// --- Archidekt ---

async function fetchArchidektDeck(url) {
  const match = url.match(/archidekt\.com\/decks\/(\d+)/);
  if (!match) throw new Error(chrome.i18n.getMessage('errArchidektInvalidUrl'));

  const res = await fetch(`https://archidekt.com/api/decks/${match[1]}/`);
  if (!res.ok) {
    if (res.status === 404) throw new Error(chrome.i18n.getMessage('errArchidektDeckNotFound'));
    throw new Error(`${chrome.i18n.getMessage('errArchidektStatus')} ${res.status}`);
  }

  const data = await res.json();
  return Parsers.parseArchidekt(data);
}

// --- mtgtop8 ---

async function fetchMtgTop8Deck(url) {
  const match = url.match(/[?&]d=(\d+)/);
  if (!match) throw new Error(chrome.i18n.getMessage('errMtgtop8InvalidUrl'));

  const deckId = match[1];
  const res = await fetch(`https://www.mtgtop8.com/mtgo?d=${deckId}`);
  if (!res.ok) throw new Error(`${chrome.i18n.getMessage('errMtgtop8Status')} ${res.status}`);

  const text = await res.text();
  return Parsers.parseMtgTop8(text);
}

// --- Magic-Ville (HTML scraping with forced English card names) ---

async function fetchMagicVilleDeck(url) {
  const match = url.match(/ref=(\d+)/);
  if (!match) throw new Error(chrome.i18n.getMessage('errMagicVilleInvalidUrl'));

  const res = await fetch(`https://www.magic-ville.com/fr/decks/showdeck?ref=${match[1]}&decklanglocal=eng`);
  if (!res.ok) throw new Error(`${chrome.i18n.getMessage('errMagicVilleStatus')} ${res.status}`);

  const buf = await res.arrayBuffer();
  const html = new TextDecoder('iso-8859-1').decode(buf);

  try {
    return Parsers.parseMagicVille(html);
  } catch (e) {
    if (e.message === 'notFound') throw new Error(chrome.i18n.getMessage('errMagicVilleDeckNotFound'));
    throw new Error(chrome.i18n.getMessage('errMagicVilleParseFailed'));
  }
}

// --- mtgdecks.net (HTML scraping – behind Cloudflare, best via content script) ---

async function fetchMtgDecksDeck(url) {
  const parsed = new URL(url);
  if (!['mtgdecks.net', 'www.mtgdecks.net'].includes(parsed.hostname)) throw new Error(chrome.i18n.getMessage('errMtgdecksInvalidUrl'));
  // mtgdecks is Cloudflare-fronted like MTGGoldfish — send the user's clearance
  // cookie so a cookie-less server fetch isn't 403'd (applied by analogy; the
  // extension's host permission lets the SW read the cross-origin response).
  const res = await fetch(`https://mtgdecks.net${parsed.pathname}`, { credentials: 'include' });
  if (!res.ok) {
    if (res.status === 403) throw new Error(chrome.i18n.getMessage('errMtgdecksBlocked'));
    throw new Error(`${chrome.i18n.getMessage('errMtgdecksStatus')} ${res.status}`);
  }

  const html = await res.text();
  return Parsers.parseMtgDecks(html);
}

// --- MTGGoldfish (via download endpoint – may be blocked by Cloudflare) ---

async function fetchMtgGoldfishDeck(url) {
  const match = url.match(/mtggoldfish\.com\/deck\/(\d+)/);
  if (!match) throw new Error(chrome.i18n.getMessage('errMtggoldfishInvalidUrl'));

  // MTGGoldfish's Cloudflare returns 403 to cookie-less requests on this endpoint.
  // credentials:'include' attaches the user's cf_clearance cookie (set once they've
  // opened mtggoldfish in this browser); with our host permission the service worker
  // can send it cross-origin and read the response without CORS headers. Verified:
  // same request is 200 with the cookie, 403 without.
  const res = await fetch(`https://www.mtggoldfish.com/deck/download/${match[1]}`, { credentials: 'include' });
  if (!res.ok) {
    // 403 despite credentials:'include' means no valid cf_clearance cookie (user
    // hasn't opened mtggoldfish in this browser lately) — give an actionable message.
    if (res.status === 403) throw new Error(chrome.i18n.getMessage('errMtggoldfishBlocked'));
    throw new Error(`${chrome.i18n.getMessage('errMtggoldfishStatus')} ${res.status}`);
  }

  const text = await res.text();
  return Parsers.parseMtgGoldfish(text);
}

// --- Melee (melee.gg – server-rendered decklist HTML, no cookie needed) ---

async function fetchMeleeDeck(url) {
  const match = url.match(/\/Decklist\/View\/([0-9a-fA-F-]{36})/);
  if (!match) throw new Error(chrome.i18n.getMessage('errMeleeInvalidUrl'));

  const res = await fetch(`https://melee.gg/Decklist/View/${match[1]}`);
  if (!res.ok) throw new Error(`${chrome.i18n.getMessage('errMeleeStatus')} ${res.status}`);

  const text = await res.text();
  return Parsers.parseMelee(text);
}

// --- getpaird.io (embedded `var _deckCards` JSON, no cookie needed) ---

async function fetchGetpairdDeck(url) {
  const match = url.match(/getpaird\.io\/decklists\/([^/?#]+)/);
  if (!match) throw new Error(chrome.i18n.getMessage('errGetpairdInvalidUrl'));

  const res = await fetch(`https://getpaird.io/decklists/${match[1]}`);
  if (!res.ok) {
    if (res.status === 404) throw new Error(chrome.i18n.getMessage('errGetpairdDeckNotFound'));
    throw new Error(`${chrome.i18n.getMessage('errGetpairdStatus')} ${res.status}`);
  }

  const html = await res.text();
  try {
    return Parsers.parseGetpaird(html);
  } catch (e) {
    if (e.message === 'parseFailed') throw new Error(chrome.i18n.getMessage('errGetpairdParseFailed'));
    throw e;
  }
}

// --- Pool batch fetch (for the pool analyzer page) ---

// Fetch many deck URLs (concurrency-limited), normalized for the pool analyzer.
async function fetchDecks(urls) {
  const decks = [];
  const errors = [];
  let i = 0;
  const worker = async () => {
    while (i < urls.length) {
      const url = urls[i++];
      try {
        const deck = await fetchDeckByUrl(url);   // throws 'emptyDeck' when no cards
        deck.url = url;
        Shared.fixCommanderHeuristic(deck);
        decks.push(deck);
      } catch (e) {
        errors.push({ url, error: (e && e.message) || chrome.i18n.getMessage('fetchFailed') });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, urls.length || 1) }, worker));
  return { decks, errors };
}
