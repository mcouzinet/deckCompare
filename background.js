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
// The table itself lives in shared.js — the popup requests these same origins,
// and a copy per file is how a host gets granted but never injected (or the
// reverse) with no error anywhere.
const OPTIONAL_SCRIPTS = Shared.OPTIONAL_SCRIPTS;

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
          js: ['shared.js', 'dom-parsers.js', 'content.js', 'inject-button.js'],
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

  // A content script (the archetype button) can't open an extension page itself, so it hands
  // us the deck URLs; we stash them for pool.js to pick up once, then open the analyzer. The
  // seed is transient (pool.js removes it on read) and capped, so nothing unbounded persists.
  if (msg.type === 'OPEN_POOL') {
    const decks = Array.isArray(msg.decks) ? msg.decks.slice(0, 100) : [];
    const archetype = typeof msg.archetype === 'string' ? msg.archetype.slice(0, 120) : '';
    chrome.storage.local.set({ poolSeed: { decks, archetype, ts: Date.now() } })
      .then(() => chrome.tabs.create({ url: chrome.runtime.getURL('pool.html') }))
      .then(() => sendResponse({ ok: true }))
      .catch(err => sendResponse({ error: (err && err.message) || String(err) }));
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
      .catch(() => sendResponse({ lands: [], creatures: [], images: {} }));
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
  // Card image URLs come free with this batch — /cards/collection returns the whole card.
  // Without them the results page asked api.scryfall.com for an image on every hover,
  // which is the API and not the CDN, and got rate-limited within one pass over a grid.
  const images = {};

  // Serve what we can from the persistent cache; only miss names hit Scryfall.
  const cached = await Shared.cacheRead('cardTypeCache', CARD_TYPE_TTL);
  const misses = [];
  for (const name of names) {
    const hit = cached[name.toLowerCase()];
    // `i` is absent on entries written before images were cached; treat those as misses
    // so the cache refills itself once. An empty string means "known to have no image".
    if (hit && hit.i !== undefined) {
      if (hit.l) landNames.add(name);
      if (hit.c) creatureNames.add(name);
      if (hit.i) images[name] = hit.i;
    } else {
      misses.push(name);
    }
  }

  // Everything is keyed by the REQUESTED name, never Scryfall's canonical one:
  // the caller looks entries up by the deck's own spelling, and diacritics don't
  // survive toLowerCase (accent-stripped MTGO exports say "Lorien Revealed" where
  // Scryfall answers "Lórien Revealed"), so a canonical key would miss on every
  // load, forever. /cards/collection returns `data` in request order with the
  // unresolved identifiers in `not_found`, which recovers the mapping exactly.
  const fresh = {}; // requested name -> { l, c, i }
  for (let i = 0; i < misses.length; i += BATCH) {
    const batch = misses.slice(i, i + BATCH);
    const data = await scryfallCollection(batch.map(name => ({ name })));
    if (!data) continue; // transient failure — cached hits still render, miss retries next time
    const notFound = new Set((data.not_found || []).map(nf => (nf.name || '').toLowerCase()));
    const found = batch.filter(name => !notFound.has(name.toLowerCase()));
    const cards = data.data || [];
    for (let j = 0; j < Math.min(found.length, cards.length); j++) {
      const reqName = found[j];
      const card = cards[j];
      // Front face: it is the face the deck's (already front-face-normalized)
      // name designates, same as the /cards/named endpoint resolves to.
      const face = (card.card_faces && card.card_faces[0]) || card;
      const tl = face.type_line || card.type_line || '';
      const isLand = tl.includes('Land');
      const isCreature = tl.includes('Creature');
      const img = (face.image_uris && face.image_uris.normal)
        || (card.image_uris && card.image_uris.normal) || '';
      if (isLand) landNames.add(reqName);
      if (isCreature) creatureNames.add(reqName);
      if (img) images[reqName] = img;
      fresh[reqName] = { l: isLand, c: isCreature, i: img };
    }
    if (i + BATCH < misses.length) await new Promise(r => setTimeout(r, 100));
  }

  await Shared.cacheMerge('cardTypeCache', fresh, CARD_TYPE_TTL);
  return { lands: [...landNames], creatures: [...creatureNames], images };
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
  // Magic-Ville now 403s cookie-less requests (same anti-bot pattern as MTGGoldfish/
  // mtgdecks) — credentials:'include' attaches the user's Magic-Ville session cookie.
  const res = await fetch(`https://www.magic-ville.com/fr/decks/resultats?joueur=${encodeURIComponent(username)}`, { credentials: 'include' });
  if (!res.ok) {
    if (res.status === 403) throw new Error(chrome.i18n.getMessage('errMagicVilleBlocked'));
    throw new Error(`${chrome.i18n.getMessage('errMagicVilleStatus')} ${res.status}`);
  }

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

  // credentials:'include' attaches the user's Magic-Ville session/clearance cookie —
  // without it the site now 403s the service worker's cookie-less request.
  const res = await fetch(`https://www.magic-ville.com/fr/decks/showdeck?ref=${match[1]}&decklanglocal=eng`, { credentials: 'include' });
  if (!res.ok) {
    if (res.status === 403) throw new Error(chrome.i18n.getMessage('errMagicVilleBlocked'));
    throw new Error(`${chrome.i18n.getMessage('errMagicVilleStatus')} ${res.status}`);
  }

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
