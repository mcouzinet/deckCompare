// Optional in-page button (off by default; toggled in the popup's Settings panel).
// Adds a "Compare" launcher on supported deck pages so a comparison can be started
// without opening the popup. Where we know the site's own action bar it is inserted
// there (see ANCHORS); otherwise it falls back to a floating pill. Everything lives
// inside a Shadow DOM so the host site's CSS can't reach it (and ours can't leak out).
// Reuses the popup pipeline: DomParsers for the current page, background FETCH_DECK
// for the target.
//
// Loaded after shared.js + dom-parsers.js + content.js, so Shared and DomParsers
// are available.
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
  // Guarded: after an extension reload this script's chrome.* is gone ("Extension context
  // invalidated"); a label must never throw for that.
  const M = (k, s) => { try { return chrome.i18n.getMessage(k, s) || k; } catch (_) { return k; } };
  // NOTE: the in-page button looks the same in dev and in production on purpose — it is
  // what users see, so it should not carry build state. The dev marker lives on the
  // toolbar icon instead (recoloured + DEV badge in background.js).

  let host = null;        // the shadow host element, null when not injected
  let enabled = false;    // mirrors the storage toggle, re-checked before any mount
  let cancelWait = null;  // cancels a pending mountWhenReady observer/timer
  let unwire = null;      // removes wire()'s window/document listeners

  // --- lifecycle: mount/unmount so the popup toggle applies without a page reload ---

  chrome.storage.local.get([STORAGE_KEY]).then(({ [STORAGE_KEY]: on }) => {
    enabled = !!on;
    if (enabled) mountWhenReady();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[STORAGE_KEY]) return;
    enabled = !!changes[STORAGE_KEY].newValue;
    enabled ? mountWhenReady() : unmount();
  });

  // Also cancels a pending anchor wait: toggling OFF during the wait window used
  // to leave the observer armed, which mounted the button after the setting was off.
  function unmount() {
    if (cancelWait) cancelWait();
    if (unwire) { unwire(); unwire = null; }
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
    if (!enabled) return;   // the toggle may have flipped during the anchor wait
    if (host || document.getElementById(HOST_ID)) return;
    if (!looksLikeDeckPage()) return;

    const anchor = anchorFor(document);
    host = document.createElement('div');
    host.id = HOST_ID;
    host.classList.toggle('inline', !!anchor);     // :host(.inline) drops the pill shape

    // `all:initial` stops the page styling our host; everything else is set explicitly.
    host.style.cssText = anchor
      ? 'all:initial;display:inline-flex;vertical-align:middle;'
      : 'all:initial;position:fixed;z-index:2147483647;bottom:20px;right:20px;';

    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = TEMPLATE;
    wire(root);

    if (anchor && anchor.parentElement) {
      anchor.insertAdjacentElement('afterend', host);
      matchAnchorBox(host, anchor, root);
    } else {
      (document.body || document.documentElement).appendChild(host);
    }
  }

  // Sit like a peer of the button we were inserted next to, instead of imposing one
  // geometry on every site: each action bar aligns its children differently, and a
  // hardcoded value looks wrong somewhere (flex-start suited melee's tall bar but left
  // the button riding high on getpaird, and short next to Archidekt's 39px control).
  function matchAnchorBox(hostEl, anchor, root) {
    let cs, parentCs;
    try {
      cs = getComputedStyle(anchor);
      parentCs = anchor.parentElement ? getComputedStyle(anchor.parentElement) : null;
    } catch (_) { return; }

    // Vertical placement is settled by measurement further down, not by copying the
    // row's alignment rules — those reason about the anchor's box, and a stretched
    // wrapper's centre is not where its link sits. Aligning to the top here is what
    // makes that correction exact: under align-self:center flexbox centres the margin
    // box, so a margin-top only moves us by half of it (that is why Moxfield stayed
    // visibly low even after a correction was applied).
    hostEl.style.alignSelf = 'flex-start';

    // Size to the neighbour. Two shapes, because action bars come in two kinds:
    //  - real buttons (20-52px): match their height exactly;
    //  - plain text links (Magic-Ville's menu is a row of ~15px links): a 30px button
    //    there inflates the line and reads as misaligned, so shrink to a compact chip
    //    that sits on the text line instead of towering over it.
    // Measure the control, not the wrapper we were inserted next to. Several anchors
    // step up to a wrapper to get the insertion point right, and a bare wrapper in a
    // flex row stretches to the row's height — on Moxfield that made the button 44px
    // beside 24px links. The wrapper still decides WHERE we go; its inner control
    // decides how big we are.
    const control = anchor.matches('a, button') ? anchor : (anchor.querySelector('a, button') || anchor);

    // Sites with no usable action bar are anchored to a heading instead, and matching a
    // heading's height makes the button oversized — there it keeps its own default.
    const isHeading = /^H[1-6]$/.test(control.tagName) || !!anchor.querySelector('h1, h2, h3');
    const h = isHeading ? 0 : control.getBoundingClientRect().height;
    if (h >= 20 && h <= 52) {
      hostEl.style.setProperty('--dc-anchor-height', `${Math.round(h)}px`);
    } else if (h > 0 && h < 20) {
      hostEl.classList.add('compact');
      hostEl.style.setProperty('--dc-anchor-height', `${Math.max(18, Math.round(h) + 4)}px`);
    }

    // Horizontal breathing room. When the row is a flex/grid with a gap, that already
    // spaces us and adding margin would double it; otherwise (mtgtop8's export line is
    // plain inline flow) we'd sit flush against the neighbours, so mirror their own
    // horizontal margin, with a small floor so we are never glued to them.
    const gap = parentCs ? parseFloat(parentCs.columnGap) : NaN;
    if (!(gap > 0)) {
      // Prefer the anchor's own margin, but fall back to the item before it: a row often
      // spaces every child except its last (Moxfield's toolbar uses Bootstrap me-5
      // throughout, then nothing on the "More" wrapper we attach to), and reading only
      // the anchor there would drop us to the floor value and break the row's rhythm.
      let neighbourMargin = Math.max(parseFloat(cs.marginRight) || 0, parseFloat(cs.marginLeft) || 0);
      const prev = anchor.previousElementSibling;
      if (!neighbourMargin && prev) {
        try { neighbourMargin = parseFloat(getComputedStyle(prev).marginRight) || 0; } catch (_) {}
      }
      const m = Math.min(Math.max(6, Math.round(neighbourMargin)), 14);
      hostEl.style.marginLeft = `${m}px`;
      hostEl.style.marginRight = `${m}px`;
    }

    // Line our centre up with the control's, from the rendered positions. This replaces
    // the per-site alignment guesswork: it works whatever the row does, including
    // melee's mb-auto-pinned bar, and needs no special case per site.
    const cRect = control.getBoundingClientRect();
    const hRect = hostEl.getBoundingClientRect();
    if (cRect.height && hRect.height) {
      const delta = (cRect.top + cRect.height / 2) - (hRect.top + hRect.height / 2);
      if (Math.abs(delta) > 0.5) hostEl.style.marginTop = `${Math.round(delta)}px`;
    }
  }

  const hasAnchorEntry = () => {
    try { return DomParsers.ANCHORS.some(a => location.href.includes(a.host)); }
    catch (_) { return false; }
  };

  // Moxfield and Archidekt render their toolbar from JS, so at document_idle the anchor
  // does not exist yet. Mounting straight away would take the floating fallback and stay
  // there for good — the button never moved into Moxfield's toolbar for exactly this
  // reason. So when the site HAS an anchor but it is not in the DOM yet, wait for it
  // before mounting; that also avoids flashing a floating pill that then jumps.
  // The timeout is the giving-up point: mount floating rather than nothing.
  function mountWhenReady() {
    if (cancelWait) cancelWait();   // at most one pending wait
    if (!hasAnchorEntry() || anchorFor(document)) { mount(); return; }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      obs.disconnect();
      clearTimeout(timer);
      cancelWait = null;
      mount();
    };
    const obs = new MutationObserver(() => { if (anchorFor(document)) finish(); });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    const timer = setTimeout(finish, 8000);
    cancelWait = () => {
      settled = true;
      obs.disconnect();
      clearTimeout(timer);
      cancelWait = null;
    };
  }

  // --- markup (inside the shadow root, so these class names are private) ---

  // The extension's two-overlapping-cards mark, redrawn as inline SVG so it stays sharp
  // at any size and needs no web_accessible_resources. Monochrome (currentColor) with
  // depth from opacity, so it reads on any background. Used on the button and, so the
  // panel is identifiably ours, in the panel header.
  // Card fills are classed rather than hardcoded so the same markup can be monochrome on
  // the coloured button and two-tone (the icon's orange + teal) on the dark panel. The
  // rule lines use a translucent black, which works over either fill — an earlier version
  // stroked them in the button colour, which made them vanish anywhere else.
  const MARK = `
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect class="c-back" x="3.2" y="5" width="9.6" height="14" rx="2.2"
            transform="rotate(-9 8 12)"/>
      <rect class="c-front" x="11.2" y="5" width="9.6" height="14" rx="2.2"
            transform="rotate(7 16 12)"/>
      <path d="M13.6 9.8h5M13.6 12.4h5M13.6 15h3" stroke="rgba(0,0,0,.3)" stroke-width="1.5"
            stroke-linecap="round" transform="rotate(7 16 12)"/>
    </svg>`;

  const TEMPLATE = `
    <style>
      /* Deck Compare's own palette, mirrored from popup.html's :root so the injected UI
         matches the extension rather than inventing a look. Values are inlined because
         the host page never sees those custom properties. */
      :host {
        --dc-brand: #e0654a;
        --dc-brand-btn: #b8402c; --dc-brand-btn-hi: #c74a33;   /* panel CTA (inside our own dark panel) */
        --dc-btn: #141414; --dc-btn-hi: #1e1e1e; --dc-btn-line: rgba(255,255,255,.18);  /* on-site button */
        --dc-card-a: #e3a24f;     /* --a, the icon's orange card */
        --dc-card-b: #56b6c9;     /* --b, the icon's teal card   */
        --dc-felt: #17120d; --dc-felt-lit: #201a13; --dc-felt-deep: #0d0a06;
        --dc-raised: #2a221a;
        --dc-tx-hi: #f4eee3; --dc-tx: #c9bfad; --dc-tx-mut: #9a8f7c;
        --dc-line: rgba(244,238,227,0.13);
        --dc-lift: 0 2px 4px rgba(0,0,0,.5), 0 8px 20px rgba(0,0,0,.42);
        --dc-press: inset 0 2px 5px rgba(0,0,0,.66);
      }
      :host, * { box-sizing: border-box; }
      .fab {
        display: flex; align-items: center; gap: 8px;
        font: 600 13px/1.2 system-ui, -apple-system, "Segoe UI", sans-serif;
        color: #fff; background: var(--dc-btn); border: 1px solid var(--dc-btn-line); border-radius: 999px;
        padding: 11px 16px; cursor: pointer; box-shadow: var(--dc-lift);
      }
      .fab:hover { background: var(--dc-btn-hi); }
      .fab svg { width: 15px; height: 15px; flex: none; }
      /* Two-tone brand icon on the black button — the colour lives in the icon now. */
      .fab .c-back { fill: var(--dc-card-a); }
      .fab .c-front { fill: var(--dc-card-b); }
      .brand .c-back { fill: var(--dc-card-a); }
      .brand .c-front { fill: var(--dc-card-b); }
      /* Inline mode: sit in the site's own action bar. Deliberately keeps our brand
         colour instead of mimicking the site's buttons — the button must read as
         "added by the extension", not as a native feature of the page. */
      /* --dc-anchor-height is set from the neighbouring button so we match its size;
         it falls back to our own padding when the anchor isn't button-sized. */
      :host(.inline) .fab {
        border-radius: 4px; padding: 0 12px; font-size: 12.5px;
        box-shadow: none; white-space: nowrap;
        min-height: var(--dc-anchor-height, 30px);
      }
      /* Neighbours are text links, not buttons — sit on their line, don't tower over it. */
      :host(.compact) .fab {
        border-radius: 3px; padding: 0 7px; font-size: 11px; gap: 5px;
      }
      :host(.compact) .fab svg { width: 12px; height: 12px; }
      .panel {
        position: fixed; z-index: 2147483647; width: 290px;
        background: var(--dc-felt-lit); color: var(--dc-tx-hi); border: 1px solid var(--dc-line);
        border-radius: 6px; padding: 14px; box-shadow: var(--dc-lift);
        font: 400 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
      }
      .panel[hidden] { display: none; }
      .row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
      /* The panel has to say whose it is — on a host site it is otherwise an unexplained
         popup. Same wordmark as the toolbar popup: Deck + bold Compare. */
      .brand { display: flex; align-items: center; gap: 7px; }
      .brand svg { width: 17px; height: 17px; flex: none; }
      .brand-name { font-size: 13px; font-weight: 500; color: var(--dc-tx-hi); letter-spacing: .01em; }
      .brand-name b { font-weight: 700; }
      .title {
        font-size: 10.5px; font-weight: 600; letter-spacing: .09em; text-transform: uppercase;
        color: var(--dc-tx-mut); margin-bottom: 10px;
      }
      .x { border: 0; background: none; color: var(--dc-tx-mut); cursor: pointer; padding: 2px; display: inline-flex; }
      .x svg { width: 15px; height: 15px; }
      .x:hover { color: var(--dc-tx-hi); }
      select, input {
        width: 100%; font: inherit; color: var(--dc-tx-hi); background: var(--dc-felt-deep);
        border: 1px solid var(--dc-line); border-radius: 4px; padding: 8px 10px; margin-bottom: 8px;
        box-shadow: var(--dc-press);
      }
      select:focus, input:focus { outline: 2px solid var(--dc-card-a); outline-offset: -1px; }
      select[hidden] { display: none; }
      .go {
        width: 100%; font: 600 13px/1 system-ui, sans-serif; color: #fff;
        background: var(--dc-brand-btn); border: 0; border-radius: 4px; padding: 10px; cursor: pointer;
      }
      .go:hover:not(:disabled) { background: var(--dc-brand-btn-hi); }
      .go:disabled { opacity: .55; cursor: default; }
      /* Collapses entirely when there is nothing to say. It used to reserve a line to
         avoid a jump when a status appears, but that left dead space under the button
         for the whole time the panel is idle — which is most of it. */
      .msg { margin-top: 8px; font-size: 12px; color: var(--dc-tx-mut); }
      .msg:empty { display: none; }
      /* popup.html styles #status.error with --brand-hi; same convention here. */
      .msg.err { color: var(--dc-brand); }
    </style>
    <button class="fab" part="fab" aria-expanded="false" aria-haspopup="dialog">
      ${MARK}
      <span class="fab-label"></span>
    </button>
    <div class="panel" hidden role="dialog" aria-label="Deck Compare">
      <div class="row">
        <span class="brand">${MARK}<span class="brand-name">Deck<b>Compare</b></span></span>
        <button class="x" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      </div>
      <div class="title"></div>
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
    $('.title').textContent = M('injectPanelTitle');
    input.placeholder = M('pasteADeckUrl');
    input.setAttribute('aria-label', M('pasteADeckUrl'));
    select.setAttribute('aria-label', M('selectDeck'));
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

    // returnFocus is off for outside clicks: the user already clicked somewhere on the
    // host page, and pulling focus back to our button would steal it from them.
    const setOpen = (open, returnFocus = true) => {
      panel.hidden = !open;
      fab.setAttribute('aria-expanded', String(open));
      if (open) { fillSavedDecks(select); placePanel(); input.focus(); }
      else if (returnFocus) fab.focus();
    };

    fab.addEventListener('click', () => setOpen(panel.hidden));
    // Window/document listeners share one AbortController so unmount() removes
    // them all: each popup toggle cycle used to stack another permanent set, each
    // retaining its detached shadow tree. Shadow-internal listeners need none —
    // they die with the host element.
    const ac = new AbortController();
    unwire = () => ac.abort();
    addEventListener('resize', () => { if (!panel.hidden) placePanel(); }, { passive: true, signal: ac.signal });
    // Passive: this only reads the button's rect and writes the panel's own position,
    // so it must never be allowed to block the host page's scrolling.
    addEventListener('scroll', () => { if (!panel.hidden) placePanel(); }, { capture: true, passive: true, signal: ac.signal });
    $('.x').addEventListener('click', () => setOpen(false));

    // Escape and a click outside close it, like every other panel on the page.
    root.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) setOpen(false); });
    document.addEventListener('click', (e) => {
      if (!panel.hidden && !e.composedPath().includes(host)) setOpen(false, false);
    }, { signal: ac.signal });

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
  // Stays hidden unless at least one real deck was added: an empty picker showing only
  // "select a deck" is noise, and looks broken. Rebuilt on every open (no fill-once
  // latch), so decks loaded in the popup after this page loaded still show up.
  async function fillSavedDecks(select) {
    try {
      const decks = await Shared.getSavedDecks();
      Shared.populateSavedDeckSelect(select, decks, M('selectDeck'));
    } catch (_) { /* nothing saved — the URL field still works */ }
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
    // Deck B never depends on deck A, so start it now instead of after A resolves —
    // popup.js fetches in parallel for the same reason; paying the only real wait
    // twice in series was the cost of the serial version. The guard keeps an early
    // return from surfacing as an unhandled rejection.
    const targetPromise = send({ type: 'FETCH_DECK', url: targetUrl });
    targetPromise.catch(() => {});

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
    const targetResp = await targetPromise;
    if (targetResp.error) { setMsg(`${M('error')}: ${targetResp.error}`, true); return; }

    setMsg(M('openingResults'));
    deckA.url = location.href;
    targetResp.deck.url = targetUrl;
    await chrome.storage.local.set({ compareData: { deckA, deckB: targetResp.deck } });
    await send({ type: 'OPEN_COMPARE' });   // content scripts can't call chrome.tabs
    setMsg('');
  }
})();
