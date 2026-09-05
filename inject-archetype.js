// In-page button for mtgtop8 archetype pages (same Settings toggle as the deck-page Compare
// button, on by default since 1.1). One click gathers every decklist of the archetype — across all its pages —
// and opens the pool analyzer seeded with them. The analysis runs as a fresh, ephemeral pool
// (background stores a `poolSeed`; pool.js reads it once) so the user's saved pool is untouched.
//
// Separate from inject-button.js on purpose: an archetype page is not a deck page, and this
// button has no compare panel — it is a single action, so sharing the compare flow would only
// entangle it. Loaded with shared.js + dom-parsers.js on https://www.mtgtop8.com/archetype*.
(function () {
  const STORAGE_KEY = Shared.INJECT_KEY;
  const HOST_ID = 'deckcompare-archetype';
  const MAX_DECKS = 100;   // hard cap on how many decklists we pull into one pool
  const MAX_PAGES = 30;    // pagination safety net (20 decks/page → far past MAX_DECKS)

  // Once the extension is reloaded or updated, this copy of the script lives on in the open
  // page with every chrome.* API gone ("Extension context invalidated" on the first call).
  // Nothing here may reach chrome.* unguarded: strings fall back to a built-in copy, and the
  // button turns into a "reload the page" notice instead of throwing into the console.
  const FALLBACK = (navigator.language || '').toLowerCase().startsWith('fr')
    ? { archetypeAnalyzeBtn: 'Comparer tous les decks', archetypeCollecting: 'Collecte des decks…', archetypeNoDecks: 'Aucune decklist trouvée', archetypeError: 'Échec de la collecte des decks', archetypeStale: 'Recharge la page pour utiliser ce bouton' }
    : { archetypeAnalyzeBtn: 'Cross-compare all decks', archetypeCollecting: 'Collecting decks…', archetypeNoDecks: 'No decklists found', archetypeError: 'Couldn’t collect the decks', archetypeStale: 'Reload the page to use this button' };
  const alive = () => { try { return !!(chrome.runtime && chrome.runtime.id); } catch (_) { return false; } };
  const M = (k) => { try { return (alive() && chrome.i18n.getMessage(k)) || FALLBACK[k] || k; } catch (_) { return FALLBACK[k] || k; } };

  const MARK = `
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect class="c-back" x="3.2" y="5" width="9.6" height="14" rx="2.2" transform="rotate(-9 8 12)"/>
      <rect class="c-front" x="11.2" y="5" width="9.6" height="14" rx="2.2" transform="rotate(7 16 12)"/>
      <path d="M13.6 9.8h5M13.6 12.4h5M13.6 15h3" stroke="rgba(0,0,0,.3)" stroke-width="1.5" stroke-linecap="round" transform="rotate(7 16 12)"/>
    </svg>`;

  const TEMPLATE = `
    <style>
      :host { --dc-btn:#141414; --dc-btn-hi:#1e1e1e; --dc-btn-line:rgba(255,255,255,.18); all: initial; }
      * { box-sizing: border-box; }
      /* Black with a light hairline so it reads on light (mtgtop8) and dark (Moxfield) sites
         alike; the brand's two-tone card icon carries the colour. mtgtop8's title is a
         full-width blue bar (div.w_title), so the button lands on the white strip below it —
         margins keep it off the bar and the column-header row. */
      .fab {
        display: inline-flex; align-items: center; gap: 7px;
        font: 600 12.5px/1 system-ui, -apple-system, "Segoe UI", sans-serif;
        color: #fff; background: var(--dc-btn); border: 1px solid var(--dc-btn-line); border-radius: 5px;
        padding: 7px 14px; margin: 9px 0 9px 8px; cursor: pointer; white-space: nowrap;
        box-shadow: 0 1px 3px rgba(0,0,0,.25);
      }
      .fab:hover:not(:disabled) { background: var(--dc-btn-hi); }
      .fab:disabled { opacity: .6; cursor: default; }
      .fab svg { width: 14px; height: 14px; flex: none; }
      .fab .c-back { fill: #e3a24f; }
      .fab .c-front { fill: #56b6c9; }
    </style>
    <button class="fab" type="button">${MARK}<span class="lbl"></span></button>`;

  let host = null;      // shadow host element, null when not mounted
  let enabled = false;  // mirrors the storage toggle
  let busy = false;     // a collection is in flight

  chrome.storage.local.get([STORAGE_KEY]).then(({ [STORAGE_KEY]: on }) => {
    enabled = Shared.injectEnabled(on);
    if (enabled) mount();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[STORAGE_KEY]) return;
    enabled = Shared.injectEnabled(changes[STORAGE_KEY].newValue);
    enabled ? mount() : unmount();
  });

  // The archetype title row ("<name> decks") is the natural home: the button reads as
  // "analyze these". Its cell spans the table, so we append rather than sit beside a control.
  function anchorCell() {
    const table = document.querySelector('table.Stable');
    if (!table) return null;
    return table.querySelector('td[colspan]') || table.querySelector('td');
  }

  function mount() {
    if (!enabled || host || document.getElementById(HOST_ID)) return;
    const cell = anchorCell();
    if (!cell) return;   // not the deck-list layout we expect — do nothing rather than guess

    host = document.createElement('span');
    host.id = HOST_ID;
    host.style.cssText = 'all:initial;display:block;';   // its own line on the white strip below the title bar
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = TEMPLATE;
    root.querySelector('.lbl').textContent = M('archetypeAnalyzeBtn');
    root.querySelector('.fab').addEventListener('click', () => run(root));
    cell.appendChild(host);
  }

  function unmount() {
    if (host) { host.remove(); host = null; }
  }

  // A deck's pool name: pilot and event, so 24 rows read as people/tournaments rather than
  // 24× "mtgtop8" (the MTGO export the pool fetches carries no name of its own).
  function deckName(d) {
    const parts = [d.player, d.event].map((s) => (s || '').trim()).filter(Boolean);
    return parts.join(' — ');   // '' when neither exists → pool keeps its source fallback
  }

  // POST current_page=N to the archetype's own nav form, page by page, collecting decks
  // (id + pilot + event) until they stop arriving or we hit the cap. Same-origin, so the
  // fetch carries the page's session; page 1 is already in the DOM, so the loop starts at 2.
  async function collectDecks(onProgress) {
    const decks = [];
    const seen = new Set();
    const add = (rows) => {
      for (const d of rows) if (!seen.has(d.id) && decks.length < MAX_DECKS) {
        seen.add(d.id);
        decks.push({ url: `https://www.mtgtop8.com/event?d=${d.id}&f=EDH`, name: deckName(d) });
      }
    };

    add(DomParsers.parseArchetypeDecks(document));
    onProgress(decks.length);

    const navForm = document.forms.nav_form;
    const action = navForm ? new URL(navForm.getAttribute('action') || location.pathname, location.href).href : null;

    for (let page = 2; action && decks.length < MAX_DECKS && page <= MAX_PAGES; page++) {
      let html;
      try {
        const res = await fetch(action, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `current_page=${page}`,
        });
        html = res.ok ? await res.text() : null;
      } catch (_) { break; }
      if (!html) break;
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const before = decks.length;
      add(DomParsers.parseArchetypeDecks(doc));
      onProgress(decks.length);
      if (decks.length === before) break;   // page brought nothing new → past the last page
    }
    return decks;
  }

  // The stale-script notice: the button stays visible but inert until the page is reloaded.
  function markStale(btn, lbl) {
    lbl.textContent = M('archetypeStale');
    btn.disabled = true;
    btn.title = M('archetypeStale');
  }

  async function run(root) {
    if (busy) return;
    const btn = root.querySelector('.fab');
    const lbl = root.querySelector('.lbl');
    if (!alive()) { markStale(btn, lbl); return; }
    busy = true;
    btn.disabled = true;
    try {
      const decks = await collectDecks((n) => { lbl.textContent = `${M('archetypeCollecting')} (${n})`; });
      if (!decks.length) { lbl.textContent = M('archetypeNoDecks'); return; }
      const archetype = DomParsers.parseArchetypeTitle(document);   // the pool's title when its decks have no commander
      if (!alive()) { markStale(btn, lbl); return; }   // reloaded while we were collecting
      await new Promise((resolve, reject) => {
        try {
          chrome.runtime.sendMessage({ type: 'OPEN_POOL', decks, archetype }, () => {
            const err = chrome.runtime.lastError;   // read it so Chrome does not log it; a sleeping worker still opened the tab
            err ? reject(new Error(err.message)) : resolve();
          });
        } catch (e) { reject(e); }
      });
      lbl.textContent = M('archetypeAnalyzeBtn');   // pool opened in a new tab; reset for a re-run
    } catch (_) {
      if (!alive()) { markStale(btn, lbl); return; }
      lbl.textContent = M('archetypeError');
    } finally {
      busy = false;
      if (alive()) btn.disabled = false;
    }
  }
})();
