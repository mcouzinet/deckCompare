Shared.setDocumentLang();

const statusEl = document.getElementById('status');
const compareBtn = document.getElementById('compare-btn');
const deckUrlInput = document.getElementById('deck-url');
const deckDropdown = document.getElementById('deck-dropdown');
const detectedEl = document.getElementById('detected');
const detectedName = document.getElementById('detected-name');
const detectedSub = document.getElementById('detected-sub');
const detectedLive = document.getElementById('detected-live');
const moxHint = document.getElementById('mox-hint');
const settingsPanel = document.getElementById('settings-panel');
const settingsUser = document.getElementById('settings-user');
const settingsHint = document.getElementById('settings-hint');
const settingsInject = document.getElementById('settings-inject');
const injectGrant = document.getElementById('inject-grant');            // Settings: allow on Moxfield
const injectGrantMain = document.getElementById('inject-grant-main');   // main view, on such a tab
const tabpick = document.getElementById('tabpick');
const tabpickList = document.getElementById('tabpick-list');

// `pattern` says "this tab is on a supported site" (deck-1 detection, where the
// content script or the API settles whether it really is a deck); `deckRe` says
// "this URL is itself a fetchable deck" — the bar for offering another tab as a
// one-click candidate, where a homepage or event listing could only ever error.
// Deck-page URL matching lives in shared.js so the popup and the pool analyzer's tab
// picker scan open tabs by the exact same rules.
const SUPPORTED_SITES = Shared.SUPPORTED_SITES;

// Sources that expose a public deck list for a username. The id list lives in
// shared.js so every surface reads the same storage keys.
const DECK_SOURCES = Shared.DECK_SOURCE_IDS.map(id => ({ id, msg: `LIST_${id.toUpperCase()}_DECKS` }));

let currentTab = null;
let detectedSite = null;

// Deck names/formats come from external APIs and are injected into innerHTML
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// --- Translate static UI ---
document.getElementById('bmc-text').textContent = chrome.i18n.getMessage('buyMeCoffee');
document.getElementById('lbl-deck1').textContent = `Deck 1 · ${chrome.i18n.getMessage('activeTab')}`;
document.getElementById('lbl-deck2').textContent = `Deck 2 · ${chrome.i18n.getMessage('compareAgainst')}`;
document.getElementById('vs-text').textContent = chrome.i18n.getMessage('versus');
document.getElementById('cmp-url-text').textContent = chrome.i18n.getMessage('compare');
document.getElementById('url-hint').textContent = chrome.i18n.getMessage('worksWithAny');
document.getElementById('supports-lbl').textContent = chrome.i18n.getMessage('supports');
document.getElementById('detected-badge').textContent = chrome.i18n.getMessage('detected');
document.getElementById('detected-name').textContent = chrome.i18n.getMessage('scanning');
document.getElementById('settings-title').textContent = chrome.i18n.getMessage('settings');
document.getElementById('settings-user-label').textContent = chrome.i18n.getMessage('settingsUser');
document.getElementById('settings-loadfrom-label').textContent = chrome.i18n.getMessage('settingsLoadFrom');
document.getElementById('settings-inject-label').textContent = chrome.i18n.getMessage('settingsInjectLabel');
document.getElementById('settings-inject-hint').textContent = chrome.i18n.getMessage('settingsInjectHint');
document.getElementById('inject-grant-text').textContent = chrome.i18n.getMessage('injectGrantMox');
document.getElementById('inject-grant-main-text').textContent = chrome.i18n.getMessage('injectGrantMox');
document.getElementById('onboarding-title').textContent = chrome.i18n.getMessage('onboardingTitle');
document.getElementById('onboarding-step1').textContent = chrome.i18n.getMessage('onboardingStep1');
document.getElementById('onboarding-step2').textContent = chrome.i18n.getMessage('onboardingStep2');
document.getElementById('onboarding-step3').textContent = chrome.i18n.getMessage('onboardingStep3');
document.getElementById('pool-btn').title = chrome.i18n.getMessage('poolEntryTitle');
document.getElementById('pool-entry-text').textContent = chrome.i18n.getMessage('poolAnalysis');
document.getElementById('pool-entry-sub').textContent = `· ${chrome.i18n.getMessage('poolEntrySub')}`;
document.getElementById('settings-toggle').title = chrome.i18n.getMessage('settingsBtnTitle');
document.getElementById('settings-toggle').setAttribute('aria-label', chrome.i18n.getMessage('settingsBtnTitle'));
document.getElementById('tabpick-label').textContent = chrome.i18n.getMessage('openTabsLabel');
deckUrlInput.placeholder = chrome.i18n.getMessage('deck2Placeholder');

// --- On popup open: detect active tab, offer candidates, restore saved decks ---
(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;

  detectedSite = SUPPORTED_SITES.find(s => tab?.url?.includes(s.pattern));
  if (detectedSite) {
    detectedEl.classList.remove('none');
    detectedName.textContent = chrome.i18n.getMessage('detected');
    detectedSub.innerHTML = `<span class="src-chip">${detectedSite.label}</span>`;
    detectedLive.style.display = '';
    nameDetectedDeck(tab);
    listOpenDeckTabs(tab);
  } else {
    detectedName.textContent = chrome.i18n.getMessage('noDetected');
    detectedSub.textContent = '';
    // Hide deck 2 section when no deck detected
    document.querySelectorAll('.deck2-section').forEach(el => el.style.display = 'none');
  }

  await loadSavedDecks();

  // Land the caret where the work happens: with a URL already copied, the popup is
  // open-paste-Enter instead of open-click-paste-click.
  if (detectedSite) deckUrlInput.focus();
})();

// The badge already says "Detected"; the slot below it is styled as the deck's title, so
// it carries the deck's actual name. Best-effort: the content script may not be injected,
// and a miss just leaves the generic label in place.
async function nameDetectedDeck(tab) {
  try {
    const resp = await sendToTab(tab.id, { type: 'GET_DECKLIST' });
    if (resp?.deck?.name) detectedName.textContent = resp.deck.name;
  } catch (_) { /* no content script on this page — keep the generic label */ }
}

// --- Deck 2 from an already-open tab ------------------------------------------------
// The dominant case is two deck pages open at once. tabs.query returns the url for any
// page the extension already holds host access to, so this costs no new permission and
// turns "leave, find the tab, copy the address bar, come back, paste" into one click.
async function listOpenDeckTabs(activeTab) {
  let tabs = [];
  try { tabs = await chrome.tabs.query({ currentWindow: true }); } catch (_) { return; }

  const seen = new Set([activeTab?.url]);
  const candidates = [];
  for (const t of tabs) {
    if (!t.url || t.id === activeTab?.id || seen.has(t.url)) continue;
    // deckRe, not the loose pattern: a homepage or event listing offered here is
    // a one-click shortcut that can only ever fail.
    const site = SUPPORTED_SITES.find(x => x.deckRe.test(t.url));
    if (!site) continue;
    seen.add(t.url);
    candidates.push({ url: t.url, label: site.label, title: t.title || t.url });
  }
  if (!candidates.length) return;

  tabpickList.innerHTML = candidates.map(c =>
    `<button type="button" class="tabpick-item" data-url="${esc(c.url)}">` +
    `<span class="src-chip">${esc(c.label)}</span>` +
    `<span class="nm">${esc(c.title)}</span></button>`
  ).join('');
  tabpick.hidden = false;
}

tabpickList.addEventListener('click', e => {
  const item = e.target.closest('.tabpick-item');
  if (!item) return;
  tabpickList.querySelectorAll('.tabpick-item').forEach(b => { b.disabled = true; });
  runComparison(item.dataset.url);
});

// --- Deck 2 field: one input that takes a URL or searches your saved decks -----------
// It used to be two panes behind a toggle, with two Compare buttons and a persisted
// preference — a decision the user had to make before they could act, to feed one field.
let allDecks = [];      // every source's decks, merged
let pickedUrl = '';     // set when an option is chosen; cleared as soon as the user types
let activeIndex = -1;   // keyboard cursor in the dropdown; -1 = none
let currentSource = 'moxfield';  // the source Enter targets: persisted deckSource, or the last button clicked

// Read every source, not just the last one used: only `${source}Decks` was ever read, so
// loading Moxfield made previously loaded Archidekt decks unreachable.
async function loadSavedDecks() {
  const keys = DECK_SOURCES.map(s => `${s.id}User`);
  const stored = await chrome.storage.local.get([...keys, 'deckSource', Shared.INJECT_KEY]);
  settingsInject.checked = Shared.injectEnabled(stored[Shared.INJECT_KEY]);   // on unless switched off
  refreshInjectGrant();

  // The merged, source-tagged deck list comes from the same shared reader the
  // results page and the in-page panel use.
  allDecks = await Shared.getSavedDecks();
  const configured = [];
  for (const s of DECK_SOURCES) {
    const user = stored[`${s.id}User`];
    if (user) configured.push({ id: s.id, user });
  }

  const last = configured.find(c => c.id === (stored.deckSource || 'moxfield')) || configured[0];
  if (last) { settingsUser.value = last.user; currentSource = last.id; }
  else if (stored.deckSource) currentSource = stored.deckSource;
  updateMoxHint(configured);
}

function matchingDecks(query) {
  const q = query.trim().toLowerCase();
  if (!q) return allDecks;
  return allDecks.filter(d =>
    d.name.toLowerCase().includes(q) ||
    (d.format && d.format.toLowerCase().includes(q)) ||
    d.source.includes(q));
}

function renderDropdown(list) {
  activeIndex = -1;
  deckUrlInput.removeAttribute('aria-activedescendant');
  deckDropdown.innerHTML = list.map((d, i) => {
    const fmt = d.format ? `<span class="fmt">${esc(d.format)}</span>` : '';
    return `<div class="deck-option" role="option" id="deck-opt-${i}" aria-selected="false" data-url="${esc(d.url)}"><span class="nm">${esc(d.name)}</span>${fmt}</div>`;
  }).join('');
}

function openDropdown(open) {
  deckDropdown.classList.toggle('open', open);
  deckUrlInput.setAttribute('aria-expanded', String(open));
  if (!open) {
    activeIndex = -1;
    deckUrlInput.removeAttribute('aria-activedescendant');
  }
}

function setActiveOption(i) {
  const opts = deckDropdown.querySelectorAll('.deck-option');
  if (!opts.length) return;
  activeIndex = (i + opts.length) % opts.length;
  opts.forEach((o, n) => {
    const on = n === activeIndex;
    o.classList.toggle('active', on);
    o.setAttribute('aria-selected', String(on));
    if (on) o.scrollIntoView({ block: 'nearest' });
  });
  deckUrlInput.setAttribute('aria-activedescendant', opts[activeIndex].id);
}

// Single commit path, shared by mouse and keyboard.
function commitOption(opt) {
  pickedUrl = opt.dataset.url;
  const nameEl = opt.querySelector('.nm');
  deckUrlInput.value = nameEl ? nameEl.textContent : '';
  openDropdown(false);
}

// A pasted URL is used as typed; a picked deck keeps its name in the field and its URL here.
const targetUrl = () => pickedUrl || deckUrlInput.value.trim();

function suggest() {
  const list = matchingDecks(deckUrlInput.value);
  // A URL is not a search: no point offering deck names to someone who just pasted one.
  if (!allDecks.length || /^https?:\/\//i.test(deckUrlInput.value.trim())) {
    openDropdown(false);
    return;
  }
  if (!list.length) {
    // Zero matches still answers: a silently vanishing dropdown reads as "search
    // broken" (or as the decks having been lost).
    activeIndex = -1;
    deckUrlInput.removeAttribute('aria-activedescendant');
    // role=presentation: a listbox may only hold options, and this row is a
    // message, not a choice.
    deckDropdown.innerHTML = `<div class="deck-dropdown-empty" role="presentation">${esc(chrome.i18n.getMessage('noDeckMatches'))}</div>`;
    openDropdown(true);
    return;
  }
  renderDropdown(list);
  openDropdown(true);
}

deckUrlInput.addEventListener('input', () => { pickedUrl = ''; suggest(); });
deckUrlInput.addEventListener('focus', suggest);

deckDropdown.addEventListener('click', e => {
  const opt = e.target.closest('.deck-option');
  if (opt) commitOption(opt);
});

deckUrlInput.addEventListener('keydown', e => {
  const open = deckDropdown.classList.contains('open');
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!open) { suggest(); setActiveOption(0); return; }
    setActiveOption(activeIndex + (e.key === 'ArrowDown' ? 1 : -1));
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const opts = deckDropdown.querySelectorAll('.deck-option');
    if (open && activeIndex >= 0 && opts[activeIndex]) commitOption(opts[activeIndex]);
    // No option armed but the user TYPED a query with matches on screen: commit
    // the first one instead of submitting the search text as a URL, which could
    // only error. An empty field (the dropdown auto-opens with every deck) must
    // not commit an arbitrary deck — it falls through to the guidance message.
    else if (open && opts.length && deckUrlInput.value.trim()) commitOption(opts[0]);
    // The no-match state is open: the row on screen is the answer — closing it
    // beats submitting the search text as a URL, which could only error.
    else if (open && !opts.length) openDropdown(false);
    else runComparison(targetUrl());
  } else if (e.key === 'Escape' && open) {
    e.preventDefault();
    openDropdown(false);
  }
});

document.addEventListener('click', e => {
  if (!e.target.closest('.deck-search-wrap')) openDropdown(false);
});

compareBtn.addEventListener('click', () => runComparison(targetUrl()));

// --- Settings panel ---
// Settings replaces the main view rather than stacking on top of it: shown together they
// made the popup far taller than it needs to be. The header stays so the panel still
// reads as part of the extension and the gear remains reachable.
// #status deliberately stays visible: it is where deck loading reports progress and
// errors, which happen while the settings panel is the only thing on screen.
const mainViews = ['.p-body']
  .map(sel => document.querySelector(sel))
  .filter(Boolean);

function showSettings(show) {
  settingsPanel.style.display = show ? 'block' : 'none';
  for (const el of mainViews) el.style.display = show ? 'none' : '';
}

document.getElementById('settings-toggle').addEventListener('click', () => {
  showSettings(settingsPanel.style.display === 'none');
});
document.getElementById('settings-close').addEventListener('click', () => showSettings(false));

// The "configure your account" notice names the fix and is styled like a button, so it
// performs it rather than sitting there inert.
moxHint.addEventListener('click', () => {
  if (moxHint.classList.contains('hint-configure')) showSettings(true);
});

// In-page button toggle — the content script watches this key and mounts/unmounts live.
// On by default since 1.1: an absent key reads as on and only an explicit false removes the
// button, so whoever never opened Settings gets it and whoever switched it off keeps that.
// Some supported pages need access the extension doesn't hold by default: Moxfield (its
// decks come from api2.moxfield.com, not the page) and the www/non-www twins of sites
// declared under only one form. They are optional permissions — chrome.permissions.request
// needs a user gesture, so they can never be granted at install — asked for from the
// toggle's click or, later, from the "Allow the button on Moxfield" action, and revoked
// when the button is switched off. Declining costs only the button on those hosts.
// One list, in shared.js — background.js registers scripts from the same table,
// so a host cannot be granted here but never injected there (or the reverse).
const OPTIONAL_ORIGINS = Shared.OPTIONAL_SCRIPTS.map(s => s.origin);

// True when `url` sits on one of those optional hosts: the page a fresh grant cannot reach
// without a reload (registerContentScripts only applies to later loads, and the storage
// listener that mounts the button live only fires where the script already runs), and the
// page whose popup should offer the grant.
const onOptionalHost = (url) => {
  if (!url) return false;
  let host;
  try { host = new URL(url).hostname; } catch (_) { return false; }
  return OPTIONAL_ORIGINS.some(o => Shared.originMatchesHost(o, host));
};

// "Allow the button on Moxfield" shows only while the button is on and those hosts are not
// granted — the one state where a supported deck page carries no button. Under the toggle
// always; on the main view only when this very tab is such a page.
async function refreshInjectGrant() {
  let granted = false;
  try { granted = await chrome.permissions.contains({ origins: OPTIONAL_ORIGINS }); } catch (_) {}
  const missing = settingsInject.checked && !granted;
  injectGrant.hidden = !missing;
  injectGrantMain.hidden = !(missing && detectedSite && onOptionalHost(currentTab?.url));
}

async function requestInjectGrant() {
  let granted = false;
  try { granted = await chrome.permissions.request({ origins: OPTIONAL_ORIGINS }); }
  catch (_) { granted = false; }
  if (granted) setStatus(onOptionalHost(currentTab?.url) ? chrome.i18n.getMessage('injectReload') : '');
  else setStatus(chrome.i18n.getMessage('injectDeclined'), true);
  await refreshInjectGrant();
}

injectGrant.addEventListener('click', requestInjectGrant);
injectGrantMain.addEventListener('click', requestInjectGrant);

settingsInject.addEventListener('change', async () => {
  if (!settingsInject.checked) {
    chrome.storage.local.set({ [Shared.INJECT_KEY]: false });
    try { await chrome.permissions.remove({ origins: OPTIONAL_ORIGINS }); } catch (_) {}
    setStatus('');
    await refreshInjectGrant();
    return;
  }
  // On applies at once wherever the extension already reads the page; the optional hosts
  // are asked for from this same click. A decline no longer unchecks the box — it costs
  // Moxfield only, and the grant stays one click away just below.
  chrome.storage.local.set({ [Shared.INJECT_KEY]: true });
  await requestInjectGrant();
});

// --- Pool analyzer entry ---
document.getElementById('pool-btn').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('pool.html') });
  window.close();
});

// --- Loading your decks -------------------------------------------------------------
// One button per source instead of a select plus a Save button: picking the service and
// confirming were two gestures for one intent.
document.querySelectorAll('.source-row [data-source]').forEach(btn => {
  btn.addEventListener('click', () => { currentSource = btn.dataset.source; loadUserDecks(btn.dataset.source); });
});
// Enter targets the source the user actually works with (persisted deckSource,
// or the button they last clicked) — a Magic-Ville pseudo sent to Moxfield either
// errors or saves a stranger's same-named decks.
settingsUser.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const btn = document.querySelector(`.source-row [data-source="${currentSource}"]`)
    || document.querySelector('.source-row [data-source]');
  btn?.click();
});

async function loadUserDecks(source) {
  const username = settingsUser.value.trim();
  if (!username) { setStatus(chrome.i18n.getMessage('enterMoxUser'), true); settingsUser.focus(); return; }

  const buttons = document.querySelectorAll('.source-row [data-source]');
  buttons.forEach(b => { b.disabled = true; });
  setStatus(chrome.i18n.getMessage('loadingDecks'));

  try {
    const msgType = DECK_SOURCES.find(s => s.id === source).msg;
    const resp = await sendToRuntime({ type: msgType, username });
    if (resp.error) { setStatus(`${chrome.i18n.getMessage('error')}: ${resp.error}`, true); return; }
    if (!resp.decks?.length) { setStatus(chrome.i18n.getMessage('noPublicDecks'), true); return; }

    await chrome.storage.local.set({
      deckSource: source,
      [`${source}User`]: username,
      [`${source}Decks`]: resp.decks
    });
    await loadSavedDecks();
    setStatus('');
    settingsHint.innerHTML = `<b>${resp.decks.length}</b> ${chrome.i18n.getMessage('decksLoaded')}`;
    // Back to the main view — hiding the panel alone would leave the popup blank.
    showSettings(false);
    deckUrlInput.focus();
  } catch (err) {
    setStatus(`${chrome.i18n.getMessage('error')}: ${err.message}`, true);
  } finally {
    buttons.forEach(b => { b.disabled = false; });
  }
}

function updateMoxHint(configured) {
  if (configured.length) {
    moxHint.className = 'hint';
    moxHint.innerHTML = configured.map(c => `<b>${c.id}</b> · ${esc(c.user)}`).join(' · ') +
      ` · <b>${allDecks.length}</b> decks`;
  } else {
    moxHint.className = 'hint-configure';
    moxHint.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>${chrome.i18n.getMessage('settingsNotConfigured')}`;
  }
}

// --- Shared comparison logic ---
async function runComparison(url) {
  if (!url) { setStatus(chrome.i18n.getMessage('pasteOrSelect'), true); return; }
  if (!detectedSite) { setStatus(chrome.i18n.getMessage('openSupportedFirst'), true); return; }

  compareBtn.disabled = true;

  try {
    setStatus(`${chrome.i18n.getMessage('readingDeck')} ${detectedSite.label}…`);

    // Deck B never depends on deck A, so start it now instead of after A resolves —
    // this is the only real wait in the product and it was being paid twice, in series.
    // The guard keeps an early return from surfacing as an unhandled rejection.
    const targetPromise = sendToRuntime({ type: 'FETCH_DECK', url });
    targetPromise.catch(() => {});

    let sourceDeck;
    try {
      const resp = await sendToTab(currentTab.id, { type: 'GET_DECKLIST' });
      sourceDeck = resp?.deck;
    } catch (_) { sourceDeck = null; }

    const deckIsEmpty = !sourceDeck
      || sourceDeck._needsApiFetch
      || (!Object.keys(sourceDeck.mainboard || {}).length && !Object.keys(sourceDeck.commanders || {}).length);

    if (deckIsEmpty) {
      setStatus(chrome.i18n.getMessage('fetchingApi'));
      const apiResp = await sendToRuntime({ type: 'FETCH_DECK', url: currentTab.url });
      if (apiResp.error) { setStatus(`${chrome.i18n.getMessage('error')}: ${apiResp.error}`, true); resetButtons(); return; }
      sourceDeck = apiResp.deck;
    }

    if (!sourceDeck || (!Object.keys(sourceDeck.mainboard || {}).length && !Object.keys(sourceDeck.commanders || {}).length)) {
      setStatus(chrome.i18n.getMessage('unableToRead'), true); resetButtons(); return;
    }

    setStatus(chrome.i18n.getMessage('fetchingSecond'));
    const targetResp = await targetPromise;
    if (targetResp.error) { setStatus(`${chrome.i18n.getMessage('error')}: ${targetResp.error}`, true); resetButtons(); return; }

    setStatus(chrome.i18n.getMessage('openingResults'));
    sourceDeck.url = currentTab.url;
    targetResp.deck.url = url;
    await chrome.storage.local.set({ compareData: { deckA: sourceDeck, deckB: targetResp.deck } });
    chrome.tabs.create({ url: chrome.runtime.getURL('compare.html') });
    window.close();
  } catch (err) {
    setStatus(`${chrome.i18n.getMessage('error')}: ${err.message}`, true);
    resetButtons();
  }
}

function resetButtons() {
  compareBtn.disabled = false;
  tabpickList.querySelectorAll('.tabpick-item').forEach(b => { b.disabled = false; });
}

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.className = isError ? 'error' : '';
}

function sendToTab(tabId, msg) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, msg, resp => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(resp);
    });
  });
}

function sendToRuntime(msg) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, resp => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(resp);
    });
  });
}
