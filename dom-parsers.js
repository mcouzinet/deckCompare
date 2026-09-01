// DOM parsers for the content script (active-tab path). Each takes an explicit
// `doc` (document) so it runs both in the page (content.js passes the real document)
// and in Node tests (jsdom passes a built document). Dual-mode export like parsers.js.
// Returning `_needsApiFetch: true` tells the popup to fall back to the background API
// fetch (parsers.js) — used when the DOM alone can't yield a reliable list.
(function (global) {
  // --- MTGGoldfish ---
  function parseMtgGoldfish(doc) {
    const deck = { mainboard: {}, sideboard: {}, commanders: {}, source: 'mtggoldfish' };

    // Identify commander names from the visible table (deck-category-header rows).
    const commanderNames = new Set();
    const allRows = doc.querySelectorAll('.deck-view-deck-table tbody tr');
    let section = 'mainboard';
    for (const row of allRows) {
      if (row.classList.contains('deck-category-header')) {
        const text = row.textContent.trim().toLowerCase();
        if (text.includes('commander')) section = 'commanders';
        else if (text.includes('sideboard')) section = 'sideboard';
        else if (section === 'commanders') section = 'mainboard';
        continue;
      }
      const cells = row.querySelectorAll('td');
      if (cells.length >= 2 && section === 'commanders') {
        const nameEl = (cells[1] && cells[1].querySelector('a')) || cells[1];
        const name = nameEl && nameEl.textContent && nameEl.textContent.trim();
        if (name) commanderNames.add(name);
      }
    }

    // The hidden input holds the canonical card list.
    const input = doc.getElementById('deck_input_deck');
    if (!input || !input.value) return null;

    let board = 'mainboard';
    for (const line of input.value.split('\n')) {
      const t = line.trim();
      if (t === '') continue;
      if (t.toLowerCase() === 'sideboard') { board = 'sideboard'; continue; }
      const m = t.match(/^(\d+)\s+(.+)$/);
      if (m) {
        const qty = parseInt(m[1], 10);
        const name = m[2].trim();
        if (commanderNames.has(name)) deck.commanders[name] = (deck.commanders[name] || 0) + qty;
        else deck[board][name] = (deck[board][name] || 0) + qty;
      }
    }

    const titleEl = doc.querySelector('h1.title');
    deck.name = titleEl ? titleEl.textContent.replace(/by\s+.*$/, '').trim() : 'MTGGoldfish Deck';
    return deck;
  }

  // --- mtgtop8 ---
  function parseMtgTop8(doc) {
    const deck = { mainboard: {}, sideboard: {}, commanders: {}, source: 'mtgtop8' };

    const commanderHeaders = new Set();
    doc.querySelectorAll('div.O14').forEach(h => {
      if (h.textContent.trim().toUpperCase() === 'COMMANDER') commanderHeaders.add(h);
    });

    let inCommander = false;
    for (const el of doc.querySelectorAll('div.O14, div.deck_line')) {
      if (el.classList.contains('O14')) { inCommander = commanderHeaders.has(el); continue; }
      const nameEl = el.querySelector('span.L14');
      if (!nameEl) continue;
      const name = nameEl.textContent.trim();
      const qtyMatch = el.textContent.trim().match(/^(\d+)/);
      const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;
      if (inCommander) deck.commanders[name] = (deck.commanders[name] || 0) + qty;
      else if ((el.id || '').startsWith('sb')) deck.sideboard[name] = (deck.sideboard[name] || 0) + qty;
      else deck.mainboard[name] = (deck.mainboard[name] || 0) + qty;
    }

    const titleEl = doc.querySelector('div.event_title');
    deck.name = titleEl ? titleEl.textContent.trim() : 'mtgtop8 Deck';
    return deck;
  }

  // --- Archidekt (__NEXT_DATA__ embedded JSON, else API fallback) ---
  function parseArchidekt(doc) {
    const deck = { mainboard: {}, sideboard: {}, commanders: {}, source: 'archidekt' };
    const nextDataEl = doc.getElementById('__NEXT_DATA__');
    if (nextDataEl) {
      try {
        const deckData = JSON.parse(nextDataEl.textContent).props.pageProps.redux.deck;
        if (deckData) {
          deck.name = deckData.name || 'Archidekt Deck';
          for (const entry of Object.values(deckData.cardMap || {})) {
            const name = entry.name;
            const qty = entry.qty || 1;
            const cats = entry.categories || [];
            if (!name) continue;
            if (cats.includes('Commander')) deck.commanders[name] = (deck.commanders[name] || 0) + qty;
            else if (cats.includes('Maybeboard')) continue;
            else if (cats.includes('Sideboard')) deck.sideboard[name] = (deck.sideboard[name] || 0) + qty;
            else deck.mainboard[name] = (deck.mainboard[name] || 0) + qty;
          }
          return deck;
        }
      } catch (_) { /* fall through to API */ }
    }
    deck.name = (doc.title || '').replace(/ - Archidekt$/, '').trim() || 'Archidekt Deck';
    deck._needsApiFetch = true;
    return deck;
  }

  // --- Moxfield: always defer to the background API ---
  // Moxfield is a SPA whose deck data comes from api2.moxfield.com, not from the page,
  // so there is nothing reliable to scrape here — but returning a deck (rather than
  // null) marks this as a deck page for callers such as the in-page button.
  function parseMoxfield(doc) {
    const deck = { mainboard: {}, sideboard: {}, commanders: {}, source: 'moxfield' };
    deck.name = (doc.title || '').replace(/\s*[|·-]\s*Moxfield.*$/i, '').trim() || 'Moxfield Deck';
    deck._needsApiFetch = true;
    return deck;
  }

  // --- Magic-Ville: always defer to the background API (English card names) ---
  function parseMagicVille(doc) {
    const deck = { mainboard: {}, sideboard: {}, commanders: {}, source: 'magic-ville' };
    const titleEl = doc.querySelector('div.title16');
    deck.name = titleEl ? titleEl.textContent.replace(/\s+/g, ' ').trim() : 'Magic-Ville Deck';
    deck._needsApiFetch = true;
    return deck;
  }

  // --- mtgdecks.net (arena_deck textarea) ---
  function parseMtgDecks(doc) {
    const deck = { mainboard: {}, sideboard: {}, commanders: {}, source: 'mtgdecks' };
    const arena = doc.getElementById('arena_deck');
    if (arena && arena.value) {
      let section = 'mainboard';
      for (const line of arena.value.split('\n')) {
        const t = line.trim();
        if (t === '') continue;
        if (t.toLowerCase() === 'commander') { section = 'commanders'; continue; }
        if (t.toLowerCase() === 'deck') { section = 'mainboard'; continue; }
        if (t.toLowerCase() === 'sideboard') { section = 'sideboard'; continue; }
        const m = t.match(/^(\d+)\s+(.+)$/);
        if (m) {
          const name = m[2].replace(/\s*\([A-Z0-9]+\)\s*\d*$/, '').trim();
          deck[section][name] = (deck[section][name] || 0) + parseInt(m[1], 10);
        }
      }
    }
    const titleEl = doc.querySelector('h1');
    deck.name = titleEl ? titleEl.textContent.trim() : 'mtgdecks Deck';
    return deck;
  }

  // --- Melee (server-rendered .decklist-category blocks) ---
  function parseMelee(doc) {
    const deck = { mainboard: {}, sideboard: {}, commanders: {}, source: 'melee' };
    const sectionFor = (title) => {
      const t = title.replace(/\(.*$/, '').trim().toLowerCase();
      if (t === 'commander') return 'commanders';
      if (t === 'sideboard' || t === 'companion') return 'sideboard';
      return 'mainboard';
    };
    for (const cat of doc.querySelectorAll('.decklist-category')) {
      const titleEl = cat.querySelector('.decklist-category-title');
      const section = sectionFor(titleEl ? titleEl.textContent : '');
      for (const rec of cat.querySelectorAll('.decklist-record')) {
        const nameEl = rec.querySelector('.decklist-record-name');
        const qtyEl = rec.querySelector('.decklist-record-quantity');
        const name = nameEl && nameEl.textContent.replace(/\s+/g, ' ').trim();
        if (!name) continue;
        const qty = parseInt((qtyEl && qtyEl.textContent) || '1', 10) || 1;
        deck[section][name] = (deck[section][name] || 0) + qty;
      }
    }
    const t = (doc.title || '').replace(/\s*\|\s*Melee\s*$/i, '').trim();
    deck.name = t || 'Melee Deck';
    return deck;
  }

  // --- getpaird.io (inline `var _deckCards = {…}` script) ---
  // Reads the script element's text (the page global isn't reachable from the
  // content script's isolated world); brace-counts the object so mana-symbol "};"
  // inside oracle text can't truncate it. Falls back to the API if absent.
  function parseGetpaird(doc) {
    const deck = { mainboard: {}, sideboard: {}, commanders: {}, source: 'getpaird' };
    const titleEl = doc.querySelector('title');
    deck.name = (titleEl ? titleEl.textContent.replace(/\s+/g, ' ').trim() : '') || 'Paird Deck';

    let data = null;
    for (const s of doc.querySelectorAll('script')) {
      const text = s.textContent || '';
      const at = text.indexOf('_deckCards');
      if (at === -1) continue;
      const brace = text.indexOf('{', at);
      if (brace === -1) continue;
      let depth = 0, inStr = false, esc = false, json = null;
      for (let i = brace; i < text.length; i++) {
        const ch = text[i];
        if (inStr) {
          if (esc) esc = false;
          else if (ch === '\\') esc = true;
          else if (ch === '"') inStr = false;
        } else if (ch === '"') inStr = true;
        else if (ch === '{') depth++;
        else if (ch === '}') { if (--depth === 0) { json = text.slice(brace, i + 1); break; } }
      }
      if (json) { try { data = JSON.parse(json); } catch (_) {} }
      if (data) break;
    }
    if (!data) { deck._needsApiFetch = true; return deck; }

    const map = { command_zone: 'commanders', mainboard: 'mainboard', sideboard: 'sideboard' };
    for (const [key, board] of Object.entries(map)) {
      for (const c of (data[key] || [])) {
        const nm = c && c.name;
        const qty = (c && c.quantity) || 1;
        if (nm) deck[board][nm] = (deck[board][nm] || 0) + qty;
      }
    }
    return deck;
  }

  function parseDeckFromCurrentSite(doc, url) {
    if (url.includes('moxfield.com')) return parseMoxfield(doc);
    if (url.includes('mtggoldfish.com')) return parseMtgGoldfish(doc);
    if (url.includes('mtgtop8.com')) return parseMtgTop8(doc);
    if (url.includes('archidekt.com')) return parseArchidekt(doc);
    if (url.includes('magic-ville.com')) return parseMagicVille(doc);
    if (url.includes('mtgdecks.net')) return parseMtgDecks(doc);
    if (url.includes('melee.gg')) return parseMelee(doc);
    if (url.includes('getpaird.io')) return parseGetpaird(doc);
    return null;
  }

  const api = { parseMoxfield, parseMtgGoldfish, parseMtgTop8, parseArchidekt, parseMagicVille, parseMtgDecks, parseMelee, parseGetpaird, parseDeckFromCurrentSite };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.DomParsers = api;
})(typeof self !== 'undefined' ? self : globalThis);
