// Content script – runs on supported deck sites
// Detects the site and extracts the decklist

function parseDeckFromCurrentSite() {
  const url = window.location.href;

  if (url.includes('mtggoldfish.com')) return parseMtgGoldfish();
  if (url.includes('mtgtop8.com')) return parseMtgTop8();
  if (url.includes('archidekt.com')) return parseArchidekt();
  if (url.includes('magic-ville.com')) return parseMagicVille();
  if (url.includes('mtgdecks.net')) return parseMtgDecks();

  return null;
}

// --- MTGGoldfish ---
function parseMtgGoldfish() {
  const deck = { mainboard: {}, sideboard: {}, commanders: {}, source: 'mtggoldfish' };

  // First: detect commander names from the HTML table (deck-category-header)
  const commanderNames = new Set();
  const headers = document.querySelectorAll('tr.deck-category-header');
  let inCommanderSection = false;
  for (const header of headers) {
    const text = header.textContent.trim().toLowerCase();
    if (text.includes('commander') || text.includes('companion')) {
      inCommanderSection = true;
      continue;
    }
    if (inCommanderSection) {
      // This header starts a new section, commander section is over
      inCommanderSection = false;
    }
  }

  // Walk table rows to find commander cards
  const allRows = document.querySelectorAll('.deck-view-deck-table tbody tr');
  let currentSection = 'mainboard';
  for (const row of allRows) {
    if (row.classList.contains('deck-category-header')) {
      const text = row.textContent.trim().toLowerCase();
      if (text.includes('commander')) currentSection = 'commanders';
      else if (text.includes('sideboard')) currentSection = 'sideboard';
      else if (currentSection === 'commanders') currentSection = 'mainboard';
      continue;
    }
    // Card row: first td = qty, second td = name
    const cells = row.querySelectorAll('td');
    if (cells.length >= 2 && currentSection === 'commanders') {
      const nameEl = cells[1]?.querySelector('a') || cells[1];
      const name = nameEl?.textContent?.trim();
      if (name) commanderNames.add(name);
    }
  }

  // Then parse the hidden input (canonical card list)
  const input = document.getElementById('deck_input_deck');
  if (!input || !input.value) return null;

  const lines = input.value.split('\n').filter(l => l.trim() !== '');
  let currentBoard = 'mainboard';

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.toLowerCase() === 'sideboard') {
      currentBoard = 'sideboard';
      continue;
    }
    const match = trimmed.match(/^(\d+)\s+(.+)$/);
    if (match) {
      const qty = parseInt(match[1], 10);
      const name = match[2].trim();

      // Check if this card was identified as commander from the table
      if (commanderNames.has(name)) {
        deck.commanders[name] = (deck.commanders[name] || 0) + qty;
      } else {
        deck[currentBoard][name] = (deck[currentBoard][name] || 0) + qty;
      }
    }
  }

  const titleEl = document.querySelector('h1.title');
  deck.name = titleEl ? titleEl.textContent.replace(/by\s+.*$/, '').trim() : 'MTGGoldfish Deck';
  return deck;
}

// --- mtgtop8 ---
function parseMtgTop8() {
  const deck = { mainboard: {}, sideboard: {}, commanders: {}, source: 'mtgtop8' };

  // Detect commander section via O14 headers
  const headers = document.querySelectorAll('div.O14');
  const commanderHeaderPositions = new Set();
  headers.forEach(h => {
    if (h.textContent.trim().toUpperCase() === 'COMMANDER') {
      commanderHeaderPositions.add(h);
    }
  });

  // Track if we're in commander section
  let inCommanderSection = false;

  // Walk through the deck container in DOM order
  const allElements = document.querySelectorAll('div.O14, div.deck_line');
  for (const el of allElements) {
    if (el.classList.contains('O14')) {
      inCommanderSection = commanderHeaderPositions.has(el);
      continue;
    }

    // It's a deck_line
    const nameEl = el.querySelector('span.L14');
    if (!nameEl) continue;

    const name = nameEl.textContent.trim();
    const rawText = el.textContent.trim();
    const qtyMatch = rawText.match(/^(\d+)/);
    const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;

    if (inCommanderSection) {
      deck.commanders[name] = (deck.commanders[name] || 0) + qty;
    } else {
      // id prefix: md = mainboard, sb = sideboard (but also commander)
      const id = el.id || '';
      if (id.startsWith('sb') && !inCommanderSection) {
        deck.sideboard[name] = (deck.sideboard[name] || 0) + qty;
      } else {
        deck.mainboard[name] = (deck.mainboard[name] || 0) + qty;
      }
    }
  }

  // Deck name from page title
  const titleEl = document.querySelector('div.event_title');
  deck.name = titleEl ? titleEl.textContent.trim() : 'mtgtop8 Deck';
  return deck;
}

// --- Archidekt ---
function parseArchidekt() {
  const deck = { mainboard: {}, sideboard: {}, commanders: {}, source: 'archidekt' };

  // Try __NEXT_DATA__ first (Next.js embedded data)
  const nextDataEl = document.getElementById('__NEXT_DATA__');
  if (nextDataEl) {
    try {
      const nextData = JSON.parse(nextDataEl.textContent);
      const deckData = nextData?.props?.pageProps?.redux?.deck;
      if (deckData) {
        deck.name = deckData.name || 'Archidekt Deck';
        const cardMap = deckData.cardMap || {};
        for (const [, entry] of Object.entries(cardMap)) {
          const name = entry.name;
          const qty = entry.qty || 1;
          const cats = entry.categories || [];

          if (cats.includes('Commander')) {
            deck.commanders[name] = (deck.commanders[name] || 0) + qty;
          } else if (cats.includes('Maybeboard')) {
            // skip maybeboard
          } else if (cats.includes('Sideboard')) {
            deck.sideboard[name] = (deck.sideboard[name] || 0) + qty;
          } else {
            deck.mainboard[name] = (deck.mainboard[name] || 0) + qty;
          }
        }
        return deck;
      }
    } catch (_) { /* fallback below */ }
  }

  // Fallback: page title only, rest will be fetched via API in background
  deck.name = document.title.replace(/ - Archidekt$/, '').trim() || 'Archidekt Deck';
  deck._needsApiFetch = true;
  return deck;
}

// --- Magic-Ville ---
// Always fallback to API (Apprentice export) which returns English card names
function parseMagicVille() {
  const deck = { mainboard: {}, sideboard: {}, commanders: {}, source: 'magic-ville' };
  const titleEl = document.querySelector('div.title16');
  deck.name = titleEl ? titleEl.textContent.replace(/\s+/g, ' ').trim() : 'Magic-Ville Deck';
  deck._needsApiFetch = true;
  return deck;
}

// --- mtgdecks.net ---
function parseMtgDecks() {
  const deck = { mainboard: {}, sideboard: {}, commanders: {}, source: 'mtgdecks' };

  // Best method: textarea#arena_deck
  const arena = document.getElementById('arena_deck');
  if (arena && arena.value) {
    let currentSection = 'mainboard';
    const lines = arena.value.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === '') continue;
      if (trimmed.toLowerCase() === 'commander') { currentSection = 'commanders'; continue; }
      if (trimmed.toLowerCase() === 'deck') { currentSection = 'mainboard'; continue; }
      if (trimmed.toLowerCase() === 'sideboard') { currentSection = 'sideboard'; continue; }

      const match = trimmed.match(/^(\d+)\s+(.+)$/);
      if (match) {
        const qty = parseInt(match[1], 10);
        // Strip set info "(SET) NUM" if present
        const name = match[2].replace(/\s*\([A-Z0-9]+\)\s*\d*$/, '').trim();
        deck[currentSection][name] = (deck[currentSection][name] || 0) + qty;
      }
    }
  }

  const titleEl = document.querySelector('h1');
  deck.name = titleEl ? titleEl.textContent.trim() : 'mtgdecks Deck';
  return deck;
}

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'GET_DECKLIST') {
    const deck = parseDeckFromCurrentSite();
    sendResponse({ deck });
  }
  return true;
});
