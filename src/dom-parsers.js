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
          const name = m[2].trim();  // "(SET) 123": Shared.normalizeDeck strips it
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

  // --- ManaBox: the whole deck ships in the page ---
  // A shared deck (manabox.app/decks/<id>) is an Astro page whose deck island carries the
  // full list in its `props` attribute, in Astro's serialisation: every value is a
  // [type, value] pair (0 = plain value or object, 1 = array). boardCategory is ManaBox's
  // own enum (read from its deck.js): 0 commander, 1 oathbreaker, 2 signature spell,
  // 3 mainboard, 4 sideboard, 5 maybeboard. The first three sit in the command zone; the
  // maybeboard is left out, as Archidekt's is. Foil and normal copies come as separate
  // lines of the same name, hence the sum.
  function astroValue(v) {
    if (Array.isArray(v) && typeof v[0] === 'number') {
      if (v.length < 2) return undefined;
      if (v[0] === 1) return (v[1] || []).map(astroValue);
      return v[0] === 0 ? astroValue(v[1]) : v[1];
    }
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const out = {};
      for (const k of Object.keys(v)) out[k] = astroValue(v[k]);
      return out;
    }
    return v;
  }

  const MANABOX_BOARDS = { 0: 'commanders', 1: 'commanders', 2: 'commanders', 3: 'mainboard', 4: 'sideboard' };

  function parseManaBox(doc) {
    let data = null;
    for (const el of doc.querySelectorAll('astro-island[props]')) {
      let props;
      try { props = astroValue(JSON.parse(el.getAttribute('props'))); } catch (_) { continue; }
      if (props && props.deck && Array.isArray(props.deck.cards)) { data = props.deck; break; }
    }
    if (!data) return null;
    const deck = { mainboard: {}, sideboard: {}, commanders: {}, source: 'manabox' };
    for (const c of data.cards) {
      const board = MANABOX_BOARDS[c && c.boardCategory];
      const qty = (c && parseInt(c.quantity, 10)) || 0;
      if (!board || !c.name || qty <= 0) continue;
      deck[board][c.name] = (deck[board][c.name] || 0) + qty;
    }
    deck.name = (data.name || '').trim() || 'ManaBox Deck';
    return deck;
  }

  // --- Pauper Duel Commander: read over HTTP (parsers.js), the page itself is that export ---
  function parsePauperDuelCommander() {
    return { mainboard: {}, sideboard: {}, commanders: {}, source: 'pdc', _needsApiFetch: true };
  }

  // --- Endstep: an account's deck, behind its sign-in ---
  // The page is a single-page app: the deck comes from the site's own API, with the session of
  // the signed-in user (content.js, readEndstepDeck). Read synchronously, a deck page only says so.
  const ENDSTEP_DECK = /^\/decks\/([0-9a-f-]{36})\/?$/;
  // Meta DC: a list is a dialog over any page, with its address (?deck=) in the URL while open.
  // The background reads it from the tournament's file (Parsers.parseMetaDc).
  function parseMetaDc(doc, url) {
    if (!/[?&]deck=\d+\.\d+(?:&|#|$)/.test(url)) return null;
    return { mainboard: {}, sideboard: {}, commanders: {}, source: 'metadc', _needsApiFetch: true };
  }

  function parseEndstep(doc, url) {
    let path = '';
    try { path = new URL(url).pathname; } catch (_) { /* not a page */ }
    if (!ENDSTEP_DECK.test(path)) return null;
    return { mainboard: {}, sideboard: {}, commanders: {}, source: 'endstep', _needsApiFetch: true };
  }
  // GET /api/decks/<id>: { name, format, cards, sideboard, commanders }, each list of names or of
  // { name, quantity }. A commander also listed among the cards is counted once, as commander.
  function endstepDeckFromApi(data) {
    const deck = { mainboard: {}, sideboard: {}, commanders: {}, source: 'endstep' };
    const add = (board, list) => {
      for (const x of Array.isArray(list) ? list : []) {
        const name = typeof x === 'string' ? x : x && x.name;
        if (!name) continue;
        const qty = typeof x === 'string' ? 1 : x.quantity || x.count || 1;
        deck[board][name] = (deck[board][name] || 0) + qty;
      }
    };
    add('commanders', data.commanders);
    add('mainboard', data.cards);
    add('sideboard', data.sideboard);
    for (const name of Object.keys(deck.commanders)) {
      if (deck.mainboard[name] > 1) deck.mainboard[name] -= 1;
      else delete deck.mainboard[name];
    }
    deck.name = String(data.name || '').trim() || 'Endstep Deck';
    if (data.format) deck.format = String(data.format);
    return deck;
  }
  async function readEndstepDeck(url, fetchFn = fetch) {
    const m = ENDSTEP_DECK.exec(new URL(url).pathname);
    if (!m) return null;
    const res = await fetchFn(`/api/decks/${m[1]}`, { credentials: 'include' });
    if (!res.ok) return null;
    const deck = endstepDeckFromApi(await res.json());
    try { await toOracleNames(deck, fetchFn); } catch (_) { /* Scryfall down: the names stay as Endstep wrote them */ }
    return deck;
  }

  // Endstep writes a Universes Beyond card under its flavor name ("Answer the Call", Scryfall's
  // flavor_name of Eladamri's Call), which no other site uses: the same card would not match.
  // /cards/collection does not know flavor names, /cards/named does: the names the batch reports
  // unknown are asked one by one, 550 ms apart (Scryfall allows two requests a second).
  async function toOracleNames(deck, fetchFn) {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const names = [...new Set(['commanders', 'mainboard', 'sideboard'].flatMap((b) => Object.keys(deck[b])))];
    const unknown = [];
    for (let i = 0; i < names.length; i += 75) {
      if (i) await wait(550);
      const res = await fetchFn('https://api.scryfall.com/cards/collection', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiers: names.slice(i, i + 75).map((name) => ({ name })) })
      });
      if (!res.ok) return;
      unknown.push(...((await res.json()).not_found || []).map((nf) => nf.name).filter(Boolean));
    }
    for (const name of unknown.slice(0, 20)) {
      await wait(550);
      const res = await fetchFn(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`);
      const oracle = res.ok && (await res.json()).name;
      if (!oracle || oracle === name) continue;
      for (const board of ['commanders', 'mainboard', 'sideboard']) {
        if (!(name in deck[board])) continue;
        deck[board][oracle] = (deck[board][oracle] || 0) + deck[board][name];
        delete deck[board][name];
      }
    }
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
    if (url.includes('manabox.app')) return parseManaBox(doc);
    if (url.includes('pauperduelcommander.fr')) return parsePauperDuelCommander(doc);
    if (url.includes('endstep.cc')) return parseEndstep(doc, url);
    if (url.includes('meta-dc.tolarianstudio.com')) return parseMetaDc(doc, url);
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
    // Next to Clone deck / More, in the primary actions group — the ellipsis-vertical
    // icon is a stable FontAwesome hook, unlike the CSS-modules classes around it (those
    // carry a build hash, e.g. contextMenu_wrapper__81GsE, that a redeploy can change).
    // Archidekt renders BOTH a desktop and a hidden mobile "More" control, hence the
    // visibility filter below — anchoring to the hidden one would make our button
    // invisible, which is worse than the floating fallback. Step up 2 (svg -> button ->
    // its wrapper div) so the button lands beside the group instead of inside it.
    { host: 'archidekt.com', sel: 'svg[data-icon="ellipsis-vertical"]', up: 2 },
    // Next to the list/visual view toggle — mtgtop8's equivalent of melee's Visual View,
    // so the button sits in the same place on both. Sitting in the export cluster instead
    // put it in the middle of a dense run of MTGO/.dec links. The switch= query is the
    // stable hook (the label is a plain string, and the row has no ids or classes); match
    // BOTH labels because the toggle reads "Switch to Visual" in text view and "Switch to
    // Text" in visual view — anchoring on one alone loses the button in the other view.
    { host: 'mtgtop8.com',   sel: 'a[href*="switch=visual"], a[href*="switch=text"]', up: 1 },
    // Magic-Ville sits behind a bot check, so its hook is a selector the shipped parser
    // already relies on (see parseMagicVille) rather than a guess.
    // Magic-Ville's action menu is a stack of one-link .lil_menu rows (Anglais, MWS,
    // Historique, Proxies…). Anchor on the Proxies row's route and step up, so the
    // button becomes a new row at the end of that menu rather than sitting inside one.
    { host: 'magic-ville.com', sel: '.lil_menu a[href*="proxy"]', up: 1 },
    // MTGGoldfish's deck toolbar: a nav-pills row (Stats / View Options) followed by the
    // price menu. Anchor on the row's last pill, so the button becomes one more pill of
    // that group. It used to hang off h1.title, which the site now renders as a block above
    // "Report Deck Name": the button sat stranded on its own line.
    { host: 'mtggoldfish.com', sel: 'ul.deck-action-menu > li.nav-item:last-of-type' },
    // mtgdecks has a real tab bar (Deck View / Arena Export / Tools & Download /
    // Comments) whose hash routes are stable; step up to the <li> so the button becomes
    // another tab. Anchoring on the h1 left it stranded on its own line under the title.
    { host: 'mtgdecks.net',    sel: 'a[href="#tools"]', up: 1 },
    // Moxfield's deck subheader (Primer / Playtest / Bulk Edit / Buy Deck / More).
    // #subheader-more is a real id, unlike the row's other hook (xQ0_bw2aqoYGKBWqhsjz),
    // which is a build hash and would break on their next deploy. Stepping up to its
    // wrapper puts the button at the end of the row instead of splitting the group.
    { host: 'moxfield.com', sel: '#subheader-more', up: 1 },
    // ManaBox's deck header ends on an action bar (Buy menu, two hidden buy forms, Download);
    // the button follows Download, the bar's last <button>, which stays true once our host sits
    // after it. Tailwind classes are the only hooks, but this combination is unique on the page
    // (verified live).
    { host: 'manabox.app', sel: 'div.ml-auto.flex.items-center.gap-2 > button:last-of-type' },
    // Pauper Duel Commander: under the Exporter / Valider row, the site's own data-deck-validate
    // hook stepped up to that row (a phone header and a desktop sidebar each have one; the
    // visible one wins). In the sidebar's column the button takes the column's width.
    { host: 'pauperduelcommander.fr', sel: '[data-deck-validate]', up: 1 },
    // Inside the list's modal dialog (the page behind it is inert): after « Copier la liste ».
    { host: 'meta-dc.tolarianstudio.com', sel: 'dialog[open] [data-deck-actions] > button:last-of-type' },
    // Endstep's deck editor toolbar (Stacks / by mana value / card size / Import / Export): after
    // Import / Export, its last button. The es-ed-* classes are the editor's own names, not build
    // hashes (seen signed in, 2026-10-21); the page renders late, which mountWhenReady waits for.
    { host: 'endstep.cc', sel: '.es-ed-right > button:last-of-type' }
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
  // The archetype page's name: mtgtop8 prints "<Archetype> decks" in a blue title bar — but
  // the same class carries "Metagame breakdown" above it and the privacy notice below, so
  // the one that ends in "decks" is the one; an empty name (an unknown archetype id) is "".
  function parseArchetypeTitle(doc) {
    for (const el of doc.querySelectorAll('div.w_title')) {
      const text = el.textContent.trim().replace(/\s+/g, ' ');
      const m = /^(.*?)\s*decks?$/i.exec(text);
      if (m) return m[1].trim();
    }
    return '';
  }

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

  const api = { parseMoxfield, parseMtgGoldfish, parseMtgTop8, parseArchidekt, parseMagicVille, parseMtgDecks, parseMelee, parseGetpaird, parseManaBox, parsePauperDuelCommander, parseMetaDc, parseEndstep, endstepDeckFromApi, readEndstepDeck, parseDeckFromCurrentSite, findActionBarAnchor, parseArchetypeDecks, parseArchetypeTitle, ANCHORS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.DomParsers = api;
})(typeof self !== 'undefined' ? self : globalThis);
