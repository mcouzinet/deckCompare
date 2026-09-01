// Optional in-page button (off by default; toggled in the popup's Settings panel).
// Adds a "Compare" launcher on supported deck pages so a comparison can be started
// without opening the popup. Where we know the site's own action bar it is inserted
// there (see ANCHORS); otherwise it falls back to a floating pill. Everything lives
// inside a Shadow DOM so the host site's CSS can't reach it (and ours can't leak out).
// Reuses the popup pipeline: DomParsers for the current page, background FETCH_DECK
// for the target.
//
// Loaded after dom-parsers.js + content.js, so DomParsers is available.
(function () {
  const STORAGE_KEY = 'injectButton';
  const HOST_ID = 'deckcompare-launcher';

  // Anchor table lives in dom-parsers.js (site-DOM knowledge, and unit-testable against
  // the fixtures). A miss just means the floating pill instead of an inline button.
  // Skip anchors that aren't actually rendered (Archidekt ships a hidden mobile copy of
  // its Playtester link) — attaching to one would leave the button invisible.
  const isRendered = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const anchorFor = (doc) => {
    try { return DomParsers.findActionBarAnchor(doc, location.href, isRendered); } catch (_) { return null; }
  };
  const M = (k, s) => chrome.i18n.getMessage(k, s) || k;
  // Web Store installs carry update_url; an unpacked local build does not. Same test
  // as background.js — a dev build gets an amber button so it can't be mistaken for
  // the published extension while testing.
  const IS_DEV = !('update_url' in chrome.runtime.getManifest());

  let host = null; // the shadow host element, null when not injected

  // --- lifecycle: mount/unmount so the popup toggle applies without a page reload ---

  chrome.storage.local.get([STORAGE_KEY]).then(({ [STORAGE_KEY]: on }) => { if (on) mountWhenReady(); });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[STORAGE_KEY]) return;
    changes[STORAGE_KEY].newValue ? mountWhenReady() : unmount();
  });

  function unmount() {
    if (host) { host.remove(); host = null; }
  }

  // Some matches are broad (mtgdecks.net/*), so the button would otherwise show on
  // listing/home pages where a comparison can only fail. Mount only where this page
  // actually yields a deck — or defers to the API, which implies it is a deck page.
  function looksLikeDeckPage() {
    let d;
    try { d = DomParsers.parseDeckFromCurrentSite(document, location.href); } catch (_) { return false; }
    if (!d) return false;
    return !!d._needsApiFetch || !boardsEmpty(d);
  }

  function mount() {
    if (host || document.getElementById(HOST_ID)) return;
    if (!looksLikeDeckPage()) return;

    const anchor = anchorFor(document);
    host = document.createElement('div');
    host.id = HOST_ID;
    host.classList.toggle('dev', IS_DEV);          // :host(.dev) recolours the pill
    host.classList.toggle('inline', !!anchor);     // :host(.inline) drops the pill shape

    // `all:initial` stops the page styling our host; everything else is set explicitly.
    // align-self:flex-start pins us to the top of the site's action bar and stops the
    // flex row stretching us. (melee's bar is ~130px tall and pins its own buttons to
    // the top with mb-auto: default stretch made us 131px, centre left us 52px too low.)
    host.style.cssText = anchor
      ? 'all:initial;display:inline-flex;vertical-align:middle;align-self:flex-start;'
      : 'all:initial;position:fixed;z-index:2147483647;bottom:20px;right:20px;';

    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = TEMPLATE;
    wire(root);

    if (anchor && anchor.parentElement) anchor.insertAdjacentElement('afterend', host);
    else (document.body || document.documentElement).appendChild(host);
  }

  // SPA/late-rendered toolbars (Moxfield, Archidekt) may not exist at document_idle.
  // Retry the mount while the DOM settles, then give up and let mount() fall back to
  // the floating pill. Disconnects as soon as the button is in the page.
  function mountWhenReady() {
    mount();
    if (host) return;
    const obs = new MutationObserver(() => { mount(); if (host) obs.disconnect(); });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => { obs.disconnect(); mount(); }, 8000);
  }

  // --- markup (inside the shadow root, so these class names are private) ---

  const TEMPLATE = `
    <style>
      :host, * { box-sizing: border-box; }
      .fab {
        display: flex; align-items: center; gap: 8px;
        font: 600 13px/1.2 system-ui, -apple-system, "Segoe UI", sans-serif;
        color: #fff; background: #6d28d9; border: 0; border-radius: 999px;
        padding: 11px 16px; cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,.3);
      }
      .fab:hover { background: #7c3aed; }
      .fab svg { width: 16px; height: 16px; }
      /* Dev build: amber pill + a DEV tag, so a local test build is obvious. */
      :host(.dev) .fab { background: #b45309; }
      :host(.dev) .fab:hover { background: #d97706; }
      .dev-tag {
        font-size: 9px; font-weight: 700; letter-spacing: .08em;
        background: rgba(0,0,0,.32); border-radius: 4px; padding: 2px 4px;
      }
      /* Inline mode: sit in the site's own action bar. Deliberately keeps our brand
         colour instead of mimicking the site's buttons — the button must read as
         "added by the extension", not as a native feature of the page. */
      :host(.inline) .fab {
        border-radius: 6px; padding: 6px 12px; font-size: 12.5px;
        box-shadow: none; white-space: nowrap;
      }
      .panel {
        position: fixed; z-index: 2147483647; width: 290px;
        background: #16141c; color: #ece9f3; border: 1px solid #2f2b3a;
        border-radius: 12px; padding: 14px; box-shadow: 0 10px 34px rgba(0,0,0,.45);
        font: 400 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
      }
      .panel[hidden] { display: none; }
      .row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
      .title { font-size: 11px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: #a79fbd; }
      .x { border: 0; background: none; color: #a79fbd; font-size: 18px; line-height: 1; cursor: pointer; padding: 0 2px; }
      .x:hover { color: #fff; }
      select, input {
        width: 100%; font: inherit; color: #ece9f3; background: #211d2b;
        border: 1px solid #322d40; border-radius: 8px; padding: 8px 10px; margin-bottom: 8px;
      }
      select:focus, input:focus { outline: 2px solid #6d28d9; outline-offset: -1px; }
      select[hidden] { display: none; }
      .go {
        width: 100%; font: 600 13px/1 system-ui, sans-serif; color: #fff;
        background: #6d28d9; border: 0; border-radius: 8px; padding: 10px; cursor: pointer;
      }
      .go:hover:not(:disabled) { background: #7c3aed; }
      .go:disabled { opacity: .55; cursor: default; }
      .msg { margin-top: 8px; font-size: 12px; color: #a79fbd; min-height: 1em; }
      .msg.err { color: #f89a9a; }
    </style>
    <button class="fab" part="fab">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 7h7M4 17h7M17 4v16"/><path d="M14 7l3-3 3 3"/>
      </svg>
      <span class="fab-label"></span>
      <span class="dev-tag" hidden>DEV</span>
    </button>
    <div class="panel" hidden>
      <div class="row"><span class="title"></span><button class="x">&times;</button></div>
      <select hidden></select>
      <input type="text" />
      <button class="go"></button>
      <div class="msg"></div>
    </div>`;

  // --- behaviour ---

  function wire(root) {
    const $ = (sel) => root.querySelector(sel);
    const fab = $('.fab'), panel = $('.panel'), input = $('input');
    const select = $('select'), go = $('.go'), msg = $('.msg');

    $('.fab-label').textContent = M('compare');
    if (IS_DEV) $('.dev-tag').hidden = false;
    $('.title').textContent = M('injectPanelTitle');
    input.placeholder = M('pasteADeckUrl');
    go.textContent = M('compare');

    const setMsg = (text, isErr) => { msg.textContent = text; msg.className = isErr ? 'msg err' : 'msg'; };

    // The panel is position:fixed and placed from the button's own rect, so no overflow
    // or stacking context on the host page can clip it. Clamped to stay on screen.
    function placePanel() {
      const b = fab.getBoundingClientRect();
      const w = 290, margin = 8;
      const left = Math.min(Math.max(margin, b.right - w), innerWidth - w - margin);
      const below = b.bottom + margin;
      const fitsBelow = below + panel.offsetHeight <= innerHeight - margin;
      panel.style.left = `${Math.round(left)}px`;
      panel.style.top = fitsBelow
        ? `${Math.round(below)}px`
        : `${Math.round(Math.max(margin, b.top - panel.offsetHeight - margin))}px`;
    }

    fab.addEventListener('click', () => {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) { fillSavedDecks(select); placePanel(); input.focus(); }
    });
    addEventListener('resize', () => { if (!panel.hidden) placePanel(); });
    addEventListener('scroll', () => { if (!panel.hidden) placePanel(); }, true);
    $('.x').addEventListener('click', () => { panel.hidden = true; });

    // Picking a saved deck fills the input, so there's a single source of truth.
    select.addEventListener('change', () => { if (select.value) input.value = select.value; });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go.click(); });

    go.addEventListener('click', async () => {
      const target = input.value.trim();
      if (!target) { setMsg(M('pasteOrSelect'), true); return; }
      go.disabled = true;
      try {
        await runComparison(target, setMsg);
      } catch (err) {
        setMsg(`${M('error')}: ${err.message}`, true);
      }
      go.disabled = false;
    });
  }

  // Offer the decks the user already loaded in the popup (Moxfield/Archidekt/Magic-Ville).
  async function fillSavedDecks(select) {
    if (select.dataset.filled) return;
    const { deckSource } = await chrome.storage.local.get(['deckSource']);
    const source = deckSource || 'moxfield';
    const stored = await chrome.storage.local.get([`${source}Decks`]);
    const decks = stored[`${source}Decks`] || [];
    if (!decks.length) return;
    select.hidden = false;
    select.dataset.filled = '1';
    const placeholder = new Option(M('selectDeck'), '');
    select.add(placeholder);
    for (const d of decks) select.add(new Option(d.format ? `${d.name} · ${d.format}` : d.name, d.url));
  }

  const send = (msg) => new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (resp) => {
      const err = chrome.runtime.lastError;
      err ? reject(new Error(err.message)) : resolve(resp);
    });
  });

  const boardsEmpty = (d) => !d
    || (!Object.keys(d.mainboard || {}).length && !Object.keys(d.commanders || {}).length);

  // Same sequence as popup.js runComparison, minus the popup-only UI bits.
  async function runComparison(targetUrl, setMsg) {
    setMsg(M('readingDeck'));
    let deckA = DomParsers.parseDeckFromCurrentSite(document, location.href);

    if (!deckA || deckA._needsApiFetch || boardsEmpty(deckA)) {
      setMsg(M('fetchingApi'));
      const resp = await send({ type: 'FETCH_DECK', url: location.href });
      if (resp.error) { setMsg(`${M('error')}: ${resp.error}`, true); return; }
      deckA = resp.deck;
    }
    if (boardsEmpty(deckA)) { setMsg(M('unableToRead'), true); return; }

    setMsg(M('fetchingSecond'));
    const targetResp = await send({ type: 'FETCH_DECK', url: targetUrl });
    if (targetResp.error) { setMsg(`${M('error')}: ${targetResp.error}`, true); return; }

    setMsg(M('openingResults'));
    deckA.url = location.href;
    targetResp.deck.url = targetUrl;
    await chrome.storage.local.set({ compareData: { deckA, deckB: targetResp.deck } });
    await send({ type: 'OPEN_COMPARE' });   // content scripts can't call chrome.tabs
    setMsg('');
  }
})();
