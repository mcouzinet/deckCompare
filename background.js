// Service worker – handles deck fetching from APIs (avoids CORS)

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'FETCH_DECK') {
    fetchDeckByUrl(msg.url)
      .then(deck => sendResponse({ deck }))
      .catch(err => sendResponse({ error: err.message }));
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

  if (msg.type === 'FETCH_IMAGE') {
    fetchImage(msg.url)
      .then(dataUrl => sendResponse({ dataUrl }))
      .catch(() => sendResponse({ dataUrl: null }));
    return true;
  }

  if (msg.type === 'FETCH_CARD_TYPES') {
    fetchCardTypes(msg.names)
      .then(types => sendResponse(types))
      .catch(() => sendResponse({ lands: [], creatures: [] }));
    return true;
  }
});

// --- Scryfall card type batch fetch ---

async function fetchCardTypes(names) {
  const BATCH = 75;
  const landNames = new Set();
  const creatureNames = new Set();

  for (let i = 0; i < names.length; i += BATCH) {
    const batch = names.slice(i, i + BATCH);
    const res = await fetch('https://api.scryfall.com/cards/collection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifiers: batch.map(name => ({ name })) })
    });
    if (!res.ok) continue;
    const data = await res.json();
    for (const card of (data.data || [])) {
      const faces = card.card_faces || [card];
      for (const face of faces) {
        const tl = face.type_line || card.type_line || '';
        if (tl.includes('Land')) landNames.add(face.name || card.name);
        if (tl.includes('Creature')) creatureNames.add(face.name || card.name);
      }
    }
    if (i + BATCH < names.length) await new Promise(r => setTimeout(r, 100));
  }

  return { lands: [...landNames], creatures: [...creatureNames] };
}

// --- Image proxy (avoids CORS) with retry on 429 ---

const ALLOWED_IMAGE_HOSTS = ['api.scryfall.com', 'cards.scryfall.io'];

async function fetchImage(url) {
  try {
    const parsed = new URL(url);
    if (!ALLOWED_IMAGE_HOSTS.includes(parsed.hostname)) return null;
  } catch { return null; }
  for (let i = 0; i < 3; i++) {
    const res = await fetch(url);
    if (res.ok) {
      const blob = await res.blob();
      const buf = await blob.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = '';
      for (let j = 0; j < bytes.length; j++) binary += String.fromCharCode(bytes[j]);
      return `data:${blob.type};base64,${btoa(binary)}`;
    }
    if (res.status === 429) {
      await new Promise(r => setTimeout(r, 1500 * Math.pow(2, i)));
      continue;
    }
    return null;
  }
  return null;
}

// --- Moxfield: list user's public decks ---

async function listMoxfieldDecks(username) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
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
      if (res.status === 404) throw new Error('Utilisateur Moxfield introuvable');
      throw new Error(`Erreur Moxfield: ${res.status}`);
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
    if (!res.ok) throw new Error(`Erreur Archidekt: ${res.status}`);

    const data = await res.json();

    if (data.count === -1) throw new Error('Utilisateur Archidekt introuvable');

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
  if (!res.ok) throw new Error(`Erreur Magic-Ville: ${res.status}`);

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

  if (!allDecks.length) throw new Error('Aucun deck trouvé pour cet utilisateur');
  return allDecks;
}

// --- Router: detect source from URL and fetch ---

const ALLOWED_DECK_HOSTS = [
  'www.moxfield.com', 'moxfield.com',
  'archidekt.com',
  'www.mtgtop8.com', 'mtgtop8.com',
  'www.mtggoldfish.com', 'mtggoldfish.com',
  'www.magic-ville.com', 'magic-ville.com',
  'mtgdecks.net', 'www.mtgdecks.net'
];

async function fetchDeckByUrl(url) {
  try {
    const parsed = new URL(url);
    if (!ALLOWED_DECK_HOSTS.includes(parsed.hostname)) throw new Error();
  } catch {
    throw new Error('Source non supportée.');
  }
  if (url.includes('moxfield.com')) return fetchMoxfieldDeck(url);
  if (url.includes('archidekt.com')) return fetchArchidektDeck(url);
  if (url.includes('mtgtop8.com')) return fetchMtgTop8Deck(url);
  if (url.includes('mtggoldfish.com')) return fetchMtgGoldfishDeck(url);
  if (url.includes('magic-ville.com')) return fetchMagicVilleDeck(url);
  if (url.includes('mtgdecks.net')) return fetchMtgDecksDeck(url);
  throw new Error('Source non supportée.');
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
    if (res.status === 404) throw new Error('Deck Moxfield introuvable');
    throw new Error(`Erreur Moxfield: ${res.status}`);
  }

  const data = await res.json();
  const deck = { name: data.name || 'Moxfield Deck', mainboard: {}, sideboard: {}, commanders: {}, source: 'moxfield' };

  for (const boardName of ['mainboard', 'sideboard', 'commanders']) {
    const board = data.boards?.[boardName];
    if (!board?.cards) continue;
    for (const [, entry] of Object.entries(board.cards)) {
      const name = entry.card?.name;
      const qty = entry.quantity || 0;
      if (name && qty > 0) {
        deck[boardName][name] = (deck[boardName][name] || 0) + qty;
      }
    }
  }
  return deck;
}

// --- Archidekt ---

async function fetchArchidektDeck(url) {
  const match = url.match(/archidekt\.com\/decks\/(\d+)/);
  if (!match) throw new Error('URL Archidekt invalide');

  const res = await fetch(`https://archidekt.com/api/decks/${match[1]}/`);
  if (!res.ok) {
    if (res.status === 404) throw new Error('Deck Archidekt introuvable');
    throw new Error(`Erreur Archidekt: ${res.status}`);
  }

  const data = await res.json();
  const deck = { name: data.name || 'Archidekt Deck', mainboard: {}, sideboard: {}, commanders: {}, source: 'archidekt' };

  for (const entry of (data.cards || [])) {
    const name = entry.card?.oracleCard?.name;
    const qty = entry.quantity || 1;
    const cats = entry.categories || [];

    if (!name) continue;
    if (cats.includes('Maybeboard')) continue;

    if (cats.includes('Commander')) {
      deck.commanders[name] = (deck.commanders[name] || 0) + qty;
    } else if (cats.includes('Sideboard')) {
      deck.sideboard[name] = (deck.sideboard[name] || 0) + qty;
    } else {
      deck.mainboard[name] = (deck.mainboard[name] || 0) + qty;
    }
  }
  return deck;
}

// --- mtgtop8 ---

async function fetchMtgTop8Deck(url) {
  const match = url.match(/[?&]d=(\d+)/);
  if (!match) throw new Error('URL mtgtop8 invalide (paramètre d= manquant)');

  const deckId = match[1];
  const res = await fetch(`https://www.mtgtop8.com/mtgo?d=${deckId}`);
  if (!res.ok) throw new Error(`Erreur mtgtop8: ${res.status}`);

  const text = await res.text();
  const lines = text.split('\n').filter(l => l.trim() !== '');

  const deck = { name: 'mtgtop8 Deck', mainboard: {}, sideboard: {}, source: 'mtgtop8' };
  let currentBoard = 'mainboard';

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.toLowerCase() === 'sideboard') {
      currentBoard = 'sideboard';
      continue;
    }
    const m = trimmed.match(/^(\d+)\s+(.+)$/);
    if (m) {
      const qty = parseInt(m[1], 10);
      const name = m[2].trim();
      deck[currentBoard][name] = (deck[currentBoard][name] || 0) + qty;
    }
  }
  return deck;
}

// --- Magic-Ville (HTML scraping with forced English card names) ---

async function fetchMagicVilleDeck(url) {
  const match = url.match(/ref=(\d+)/);
  if (!match) throw new Error('URL Magic-Ville invalide (paramètre ref= manquant)');

  const res = await fetch(`https://www.magic-ville.com/fr/decks/showdeck?ref=${match[1]}&decklanglocal=eng`);
  if (!res.ok) throw new Error(`Erreur Magic-Ville: ${res.status}`);

  const buf = await res.arrayBuffer();
  const html = new TextDecoder('iso-8859-1').decode(buf);

  const deck = { name: 'Magic-Ville Deck', mainboard: {}, sideboard: {}, commanders: {}, source: 'magic-ville' };

  // Extract deck name from title16
  const titleMatch = html.match(/<div\s+class=title16>([\s\S]*?)<\/div>/i);
  if (titleMatch) deck.name = titleMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

  // Extract from aff_texte div
  const textBlock = html.match(/id="aff_texte"([\s\S]*?)(?=<\/div>\s*<div\s+id="aff_graphique"|$)/i);
  if (!textBlock) throw new Error('Impossible de parser la page Magic-Ville');

  const block = textBlock[1];
  let currentSection = 'mainboard';

  // Find section headers (O14 class) and card rows (height=20)
  const lines = block.split('\n');
  for (const line of lines) {
    // Check for section header
    const hMatch = /class=["']?O14["']?[^>]*colspan[^>]*>(.*?)<\/td>/i.exec(line);
    if (hMatch) {
      const headerText = hMatch[1].replace(/<[^>]+>/g, '').trim().toLowerCase();
      if (headerText.includes('commandant') || headerText.includes('commander')) {
        currentSection = 'commanders';
      } else if (headerText.includes('réserve') || headerText.includes('sideboard') || headerText.includes('reserve')) {
        currentSection = 'sideboard';
      } else {
        if (currentSection === 'commanders') currentSection = 'mainboard';
      }
      continue;
    }

    // Check for card row
    const cMatch = /height=["']?20["']?[^>]*>\s*<td[^>]*>\s*(\d*)\s*<\/td>\s*<td[^>]*>.*?<a[^>]*>(.*?)<\/a>/i.exec(line);
    if (cMatch) {
      const qty = parseInt(cMatch[1], 10) || 1;
      const name = cMatch[2].replace(/<[^>]+>/g, '').trim();
      if (name) {
        deck[currentSection][name] = (deck[currentSection][name] || 0) + qty;
      }
    }
  }

  return deck;
}

// --- mtgdecks.net (HTML scraping – behind Cloudflare, best via content script) ---

async function fetchMtgDecksDeck(url) {
  const parsed = new URL(url);
  if (!['mtgdecks.net', 'www.mtgdecks.net'].includes(parsed.hostname)) throw new Error('URL mtgdecks invalide');
  const res = await fetch(`https://mtgdecks.net${parsed.pathname}`);
  if (!res.ok) throw new Error(`Erreur mtgdecks: ${res.status}`);

  const html = await res.text();
  const deck = { name: 'mtgdecks Deck', mainboard: {}, sideboard: {}, commanders: {}, source: 'mtgdecks' };

  // Try to find the arena_deck textarea content
  const arenaMatch = html.match(/<textarea[^>]*id="arena_deck"[^>]*>([\s\S]*?)<\/textarea>/i);
  if (arenaMatch) {
    const lines = arenaMatch[1].split('\n');
    let currentSection = 'mainboard';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.toLowerCase() === 'commander') { currentSection = 'commanders'; continue; }
      if (trimmed.toLowerCase() === 'deck') { currentSection = 'mainboard'; continue; }
      if (trimmed.toLowerCase() === 'sideboard') { currentSection = 'sideboard'; continue; }

      const m = trimmed.match(/^(\d+)\s+(.+)$/);
      if (m) {
        const qty = parseInt(m[1], 10);
        const name = m[2].replace(/\s*\([A-Z0-9]+\)\s*\d*$/, '').trim();
        deck[currentSection][name] = (deck[currentSection][name] || 0) + qty;
      }
    }
  }

  // Try to extract deck name from <h1>
  const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (titleMatch) deck.name = titleMatch[1].replace(/<[^>]+>/g, '').trim();

  return deck;
}

// --- MTGGoldfish (via download endpoint – may be blocked by Cloudflare) ---

async function fetchMtgGoldfishDeck(url) {
  const match = url.match(/mtggoldfish\.com\/deck\/(\d+)/);
  if (!match) throw new Error('URL MTGGoldfish invalide');

  const res = await fetch(`https://www.mtggoldfish.com/deck/download/${match[1]}`);
  if (!res.ok) throw new Error(`Erreur MTGGoldfish: ${res.status}`);

  const text = await res.text();
  const lines = text.split('\n').filter(l => l.trim() !== '');

  const deck = { name: 'MTGGoldfish Deck', mainboard: {}, sideboard: {}, source: 'mtggoldfish' };
  let currentBoard = 'mainboard';

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    if (trimmed.toLowerCase() === 'sideboard') {
      currentBoard = 'sideboard';
      continue;
    }
    const m = trimmed.match(/^(\d+)\s+(.+)$/);
    if (m) {
      const qty = parseInt(m[1], 10);
      const name = m[2].trim();
      deck[currentBoard][name] = (deck[currentBoard][name] || 0) + qty;
    }
  }
  return deck;
}
