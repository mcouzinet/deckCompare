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

    // Visual view (the sticky mtgtop8_deck_display=visual cookie) renders the deck as card
    // images with no deck_line/L14 text, so the loop above finds nothing. Its "Switch to
    // Text" toggle exists only on a deck page, so use it to flag a real deck whose cards
    // must come from the background's view-independent /mtgo?d= fetch — the same
    // _needsApiFetch path Archidekt uses before its embedded JSON has loaded.
    const empty = !Object.keys(deck.mainboard).length
      && !Object.keys(deck.commanders).length
      && !Object.keys(deck.sideboard).length;
    if (empty && doc.querySelector('a[href*="switch=text"]')) deck._needsApiFetch = true;

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

  // --- Where the in-page button attaches on each site -------------------------
  // Returns the element the button should sit after. Every selector is STRUCTURAL or
  // ROUTE-based, never label text: melee's "Visual View" is "Images" in French, so a
  // text match would break for non-English users.
  //
  // Sites we could open and inspect are anchored to their real action bar. The rest are
  // anchored to a selector one of the parsers above ALREADY depends on, so the anchor is
  // exactly as durable as parsing itself — if it breaks, the fixtures catch it.
  // A miss is not a failure: inject-button.js falls back to a floating pill.
  // `up` walks N levels up from the match (mtgtop8's link sits in its own wrapper).
  const ANCHORS = [
    // action bar, verified live
    { host: 'melee.gg',      sel: '.view-decklist-screenshot' },
    { host: 'getpaird.io',   sel: 'a[href$="/goldfish"]' },
    // Archidekt renders BOTH a desktop and a hidden mobile Playtester link, hence the
    // visibility filter below — anchoring to the hidden one would make our button
    // invisible, which is worse than the floating fallback.
    { host: 'archidekt.com', sel: 'a[href*="/playtester"]' },
    // Next to the list/visual view toggle — mtgtop8's equivalent of melee's Visual View,
    // so the button sits in the same place on both. Sitting in the export cluster instead
    // put it in the middle of a dense run of MTGO/.dec links. The switch= query is the
    // stable hook (the label is a plain string, and the row has no ids or classes); match
    // BOTH labels because the toggle reads "Switch to Visual" in text view and "Switch to
    // Text" in visual view — anchoring on one alone loses the button in the other view.
    { host: 'mtgtop8.com',   sel: 'a[href*="switch=visual"], a[href*="switch=text"]', up: 1 },
    // title-anchored: these sites sit behind bot checks/consent walls, so the hook is a
    // selector the shipped parser relies on (see parseMagicVille / parseMtgGoldfish /
    // parseMtgDecks) rather than a guess.
    // Magic-Ville's action menu is a stack of one-link .lil_menu rows (Anglais, MWS,
    // Historique, Proxies…). Anchor on the Proxies row's route and step up, so the
    // button becomes a new row at the end of that menu rather than sitting inside one.
    { host: 'magic-ville.com', sel: '.lil_menu a[href*="proxy"]', up: 1 },
    { host: 'mtggoldfish.com', sel: 'h1.title' },
    // mtgdecks has a real tab bar (Deck View / Arena Export / Tools & Download /
    // Comments) whose hash routes are stable; step up to the <li> so the button becomes
    // another tab. Anchoring on the h1 left it stranded on its own line under the title.
    { host: 'mtgdecks.net',    sel: 'a[href="#tools"]', up: 1 },
    // Moxfield's deck subheader (Primer / Playtest / Bulk Edit / Buy Deck / More).
    // #subheader-more is a real id, unlike the row's other hook (xQ0_bw2aqoYGKBWqhsjz),
    // which is a build hash and would break on their next deploy. Stepping up to its
    // wrapper puts the button at the end of the row instead of splitting the group.
    { host: 'moxfield.com', sel: '#subheader-more', up: 1 }
  ];

  // `isVisible` is supplied by the content script (getBoundingClientRect); tests and
  // jsdom omit it, where every match counts, since jsdom has no layout.
  function findActionBarAnchor(doc, url, isVisible) {
    const entry = ANCHORS.find(a => url.includes(a.host));
    if (!entry) return null;
    const shown = isVisible || (() => true);
    try {
      for (const el of doc.querySelectorAll(entry.sel)) {
        if (!shown(el)) continue;
        let target = el;
        for (let i = 0; i < (entry.up || 0); i++) target = target.parentElement || target;
        return target;
      }
    } catch (_) { /* bad selector on an unexpected DOM — fall back to floating */ }
    return null;
  }

  // mtgtop8 archetype pages list every deck of one archetype as a POST-form table: each
  // `tr.hover_tr` row carries a `deck_ref[N]` hidden input (the deck id the /mtgo?d= export
  // takes) plus a Player and an Event cell. Returns {id, player, event} per row so the pool
  // can name the decks by pilot/event instead of the nameless MTGO export. One page only —
  // the injector paginates by re-fetching and calling this per page.
  function parseArchetypeDecks(doc) {
    const decks = [];
    for (const tr of doc.querySelectorAll('table.Stable tr.hover_tr')) {
      const ref = tr.querySelector('input[name^="deck_ref"]');
      const id = ref ? (ref.value || '').trim() : '';
      if (!/^\d+$/.test(id)) continue;
      // Anchor on the deck-link cell so player/event stay correct even if a leading column
      // (checkbox, flag) shifts; fall back to fixed offsets when there is no link.
      const linkTd = tr.querySelector('td a[href*="d="]');
      const base = (linkTd && linkTd.closest('td')) || tr.querySelectorAll('td')[1] || null;
      const playerCell = base ? base.nextElementSibling : null;
      const eventCell = playerCell ? playerCell.nextElementSibling : null;
      const text = (el) => (el ? el.textContent.trim().replace(/\s+/g, ' ') : '');
      decks.push({ id, player: text(playerCell), event: text(eventCell) });
    }
    return decks;
  }

  const api = { parseMoxfield, parseMtgGoldfish, parseMtgTop8, parseArchidekt, parseMagicVille, parseMtgDecks, parseMelee, parseGetpaird, parseDeckFromCurrentSite, findActionBarAnchor, parseArchetypeDecks, ANCHORS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.DomParsers = api;
})(typeof self !== 'undefined' ? self : globalThis);
