// Pure deck parsers — input is an already-fetched response (JSON object for APIs,
// raw text/HTML string for scrapers); output is a normalized deck object. NO network,
// NO chrome.* — so Node tests import this directly and background.js runs it via
// importScripts. Parse-level failures throw Error(code); background.js maps codes to
// localized messages. Dual-mode export like shared.js / enrich.js.
(function (global) {
  // ---- Moxfield (api2 v3 JSON) ----
  function parseMoxfield(data) {
    const deck = { name: data.name || 'Moxfield Deck', mainboard: {}, sideboard: {}, commanders: {}, source: 'moxfield' };
    for (const boardName of ['mainboard', 'sideboard', 'commanders']) {
      const board = data.boards && data.boards[boardName];
      if (!board || !board.cards) continue;
      for (const entry of Object.values(board.cards)) {
        const name = entry.card && entry.card.name;
        const qty = entry.quantity || 0;
        if (name && qty > 0) deck[boardName][name] = (deck[boardName][name] || 0) + qty;
      }
    }
    return deck;
  }

  // ---- Archidekt (API JSON, categories drive the board) ----
  function parseArchidekt(data) {
    const deck = { name: data.name || 'Archidekt Deck', mainboard: {}, sideboard: {}, commanders: {}, source: 'archidekt' };
    for (const entry of (data.cards || [])) {
      const name = entry.card && entry.card.oracleCard && entry.card.oracleCard.name;
      const qty = entry.quantity || 1;
      const cats = entry.categories || [];
      if (!name) continue;
      if (cats.includes('Maybeboard')) continue;
      if (cats.includes('Commander')) deck.commanders[name] = (deck.commanders[name] || 0) + qty;
      else if (cats.includes('Sideboard')) deck.sideboard[name] = (deck.sideboard[name] || 0) + qty;
      else deck.mainboard[name] = (deck.mainboard[name] || 0) + qty;
    }
    return deck;
  }

  // ---- mtgtop8 (plain text decklist from /mtgo) ----
  function parseMtgTop8(text) {
    const deck = { name: 'mtgtop8 Deck', mainboard: {}, sideboard: {}, source: 'mtgtop8' };
    let board = 'mainboard';
    for (const line of text.split('\n')) {
      const t = line.trim();
      if (t === '') continue;
      if (t.toLowerCase() === 'sideboard') { board = 'sideboard'; continue; }
      const m = t.match(/^(\d+)\s+(.+)$/);
      if (m) { const name = m[2].trim(); deck[board][name] = (deck[board][name] || 0) + parseInt(m[1], 10); }
    }
    return deck;
  }

  // ---- MTGGoldfish (plain text from the download endpoint) ----
  function parseMtgGoldfish(text) {
    const deck = { name: 'MTGGoldfish Deck', mainboard: {}, sideboard: {}, source: 'mtggoldfish' };
    let board = 'mainboard';
    for (const line of text.split('\n')) {
      const t = line.trim();
      if (t === '') continue;
      if (t.toLowerCase() === 'sideboard') { board = 'sideboard'; continue; }
      const m = t.match(/^(\d+)\s+(.+)$/);
      if (m) { const name = m[2].trim(); deck[board][name] = (deck[board][name] || 0) + parseInt(m[1], 10); }
    }
    return deck;
  }

  // ---- mtgdecks.net (arena_deck textarea) ----
  function parseMtgDecks(html) {
    const deck = { name: 'mtgdecks Deck', mainboard: {}, sideboard: {}, commanders: {}, source: 'mtgdecks' };
    const arena = html.match(/<textarea[^>]*id="arena_deck"[^>]*>([\s\S]*?)<\/textarea>/i);
    if (arena) {
      let section = 'mainboard';
      for (const line of arena[1].split('\n')) {
        const t = line.trim();
        if (!t) continue;
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
    const title = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (title) deck.name = title[1].replace(/<[^>]+>/g, '').trim();
    return deck;
  }

  // ---- Magic-Ville (HTML scrape; unquoted attrs, multi-line rows) ----
  // Throws Error('notFound') / Error('parseFailed') — background.js localizes these.
  const decodeEntities = (s) => s
    .replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

  function parseMagicVille(html) {
    // Magic-Ville returns HTTP 200 with a tiny body for a missing/private deck.
    if (/Ce deck n'existe pas/i.test(html)) throw new Error('notFound');

    const deck = { name: 'Magic-Ville Deck', mainboard: {}, sideboard: {}, commanders: {}, source: 'magic-ville' };

    // Deck name — Magic-Ville uses UNQUOTED attributes (class=title16).
    const titleMatch = html.match(/<div\s+class=["']?title16["']?[^>]*>([\s\S]*?)<\/div>/i);
    if (titleMatch) deck.name = decodeEntities(titleMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());

    // The text view holds the card list; its attributes are unquoted (id=aff_texte).
    const textBlock = html.match(/id=["']?aff_texte["']?[^>]*>([\s\S]*?)(?=<div\s+id=["']?aff_graphique|$)/i);
    if (!textBlock) throw new Error('parseFailed');
    const block = textBlock[1];

    // Single ordered scan: each hit is EITHER a colspan'd O14 section header (group 1)
    // OR a card row (qty group 2, name group 3). Card rows span multiple lines, so this
    // must NOT be line-based. Type headers (Lands/Creatures/…) carry no board keyword
    // and stay in mainboard; only Commander/Réserve/Sideboard switch section.
    const tokenRe = /<td(?=[^>]*\bcolspan)(?=[^>]*\bclass=["']?O14\b)[^>]*>([\s\S]*?)<\/td>|height=["']?20["']?[^>]*>\s*<td[^>]*>\s*(\d*)\s*<\/td>\s*<td[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/gi;
    let section = 'mainboard';
    let m;
    while ((m = tokenRe.exec(block)) !== null) {
      if (m[1] !== undefined) {
        const h = m[1].replace(/<[^>]+>/g, '').trim().toLowerCase();
        if (h.includes('commandant') || h.includes('commander')) section = 'commanders';
        else if (h.includes('réserve') || h.includes('sideboard') || h.includes('reserve')) section = 'sideboard';
        else if (section === 'commanders') section = 'mainboard';
      } else {
        const qty = parseInt(m[2], 10) || 1;
        const name = decodeEntities(m[3].replace(/<[^>]+>/g, '').trim());
        if (name) deck[section][name] = (deck[section][name] || 0) + qty;
      }
    }
    return deck;
  }

  // ---- Melee (melee.gg server-rendered decklist HTML) ----
  // Cards live in .decklist-category blocks: a .decklist-category-title header
  // ("Commander (1)", "Creature (21)", "Land (37)", "Sideboard (2)"…) followed by
  // .decklist-record rows (.decklist-record-quantity + .decklist-record-name).
  // The page also carries Mustache <script type="x-tmpl-mustache"> templates whose
  // placeholder rows would be counted, so strip those first.
  function meleeSectionFor(title) {
    const t = title.replace(/\(.*$/, '').trim().toLowerCase();
    if (t === 'commander') return 'commanders';
    if (t === 'sideboard' || t === 'companion') return 'sideboard';
    return 'mainboard'; // card-type headers (Creature/Instant/Land/…) stay mainboard
  }

  function parseMelee(html) {
    const clean = html.replace(/<script[^>]*x-tmpl-mustache[^>]*>[\s\S]*?<\/script>/gi, '');
    const deck = { name: 'Melee Deck', mainboard: {}, sideboard: {}, commanders: {}, source: 'melee' };

    const titleMatch = clean.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch) {
      const nm = decodeEntities(titleMatch[1].replace(/\s*\|\s*Melee\s*$/i, '').replace(/\s+/g, ' ').trim());
      if (nm) deck.name = nm;
    }

    // Single ordered scan: each hit is EITHER a category header (group 1) OR a card
    // row (qty group 2, name group 3). Rows span multiple lines, so this is not
    // line-based; class matching is substring-tolerant to extra classes/attributes.
    const tokenRe = /<div[^>]*class="[^"]*decklist-category-title[^"]*"[^>]*>([\s\S]*?)<\/div>|<span[^>]*class="[^"]*decklist-record-quantity[^"]*"[^>]*>\s*(\d+)\s*<\/span>[\s\S]*?<a[^>]*class="[^"]*decklist-record-name[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
    let section = 'mainboard';
    let m;
    while ((m = tokenRe.exec(clean)) !== null) {
      if (m[1] !== undefined) {
        section = meleeSectionFor(m[1].replace(/<[^>]+>/g, ''));
      } else {
        const qty = parseInt(m[2], 10) || 1;
        const name = decodeEntities(m[3].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
        if (name) deck[section][name] = (deck[section][name] || 0) + qty;
      }
    }
    return deck;
  }

  // ---- getpaird.io (embedded `var _deckCards = {…}` JSON blob) ----
  // Throws Error('parseFailed') when the blob is absent/unparseable.
  // Brace-counting (string-aware) rather than a lazy regex: MTG oracle text carries
  // mana symbols like "{C};" whose "};" would fool a `\}\s*;` terminator.
  function sliceJsonObject(text, startIdx) {
    let depth = 0, inStr = false, esc = false;
    for (let i = startIdx; i < text.length; i++) {
      const ch = text[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
      } else if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}') { if (--depth === 0) return text.slice(startIdx, i + 1); }
    }
    return null;
  }

  function extractDeckCards(text) {
    const at = text.indexOf('_deckCards');
    if (at === -1) return null;
    const brace = text.indexOf('{', at);
    if (brace === -1) return null;
    const json = sliceJsonObject(text, brace);
    if (!json) return null;
    try { return JSON.parse(json); } catch { return null; }
  }

  const GETPAIRD_SECTIONS = { command_zone: 'commanders', mainboard: 'mainboard', sideboard: 'sideboard' };

  function getpairdDeckFromData(data, name) {
    const deck = { name: name || 'Paird Deck', mainboard: {}, sideboard: {}, commanders: {}, source: 'getpaird' };
    for (const [key, board] of Object.entries(GETPAIRD_SECTIONS)) {
      for (const c of (data[key] || [])) {
        const nm = c && c.name;
        const qty = (c && c.quantity) || 1;
        if (nm) deck[board][nm] = (deck[board][nm] || 0) + qty;
      }
    }
    return deck;
  }

  function parseGetpaird(html) {
    const data = extractDeckCards(html);
    if (!data) throw new Error('parseFailed');
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const name = titleMatch ? decodeEntities(titleMatch[1].replace(/\s+/g, ' ').trim()) : '';
    return getpairdDeckFromData(data, name);
  }

  const api = { parseMoxfield, parseArchidekt, parseMtgTop8, parseMtgGoldfish, parseMtgDecks, parseMagicVille, parseMelee, parseGetpaird };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.Parsers = api;
})(typeof self !== 'undefined' ? self : globalThis);
