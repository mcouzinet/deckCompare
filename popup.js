const statusEl = document.getElementById('status');
const compareBtn = document.getElementById('compare-btn');
const deckUrlInput = document.getElementById('deck-url');
const detectedEl = document.getElementById('detected');
const detectedName = document.getElementById('detected-name');
const detectedSub = document.getElementById('detected-sub');
const detectedLive = document.getElementById('detected-live');
const deckSearchInput = document.getElementById('deck-search');
const deckDropdown = document.getElementById('deck-dropdown');
const compareMoxfieldBtn = document.getElementById('compare-moxfield-btn');
const refreshBtn = document.getElementById('refresh-btn');
const moxHint = document.getElementById('mox-hint');
const deckSourceSelect = document.getElementById('deck-source');
const settingsPanel = document.getElementById('settings-panel');
const settingsUser = document.getElementById('settings-user');
const settingsSave = document.getElementById('settings-save');
const settingsHint = document.getElementById('settings-hint');

const SUPPORTED_SITES = [
  { pattern: 'mtggoldfish.com/deck/', label: 'MTGGoldfish' },
  { pattern: 'mtgtop8.com/event', label: 'mtgtop8' },
  { pattern: 'archidekt.com/decks/', label: 'Archidekt' },
  { pattern: 'moxfield.com/decks/', label: 'Moxfield' },
  { pattern: 'magic-ville.com/fr/decks/showdeck', label: 'Magic-Ville' },
  { pattern: 'mtgdecks.net/', label: 'mtgdecks' }
];

let currentTab = null;
let detectedSite = null;

// Deck names/formats come from external APIs and are injected into innerHTML
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// --- Translate static UI ---
document.getElementById('bmc-text').textContent = chrome.i18n.getMessage('buyMeCoffee');
document.getElementById('lbl-deck1').textContent = `Deck 1 · ${chrome.i18n.getMessage('activeTab')}`;
document.getElementById('lbl-deck2').textContent = `Deck 2 · ${chrome.i18n.getMessage('compareAgainst')}`;
document.getElementById('vs-text').textContent = chrome.i18n.getMessage('versus');
document.getElementById('tab-url-text').textContent = chrome.i18n.getMessage('pasteUrl');
document.getElementById('tab-mox-text').textContent = chrome.i18n.getMessage('myMoxfield');
document.getElementById('cmp-url-text').textContent = chrome.i18n.getMessage('compare');
document.getElementById('cmp-mox-text').textContent = chrome.i18n.getMessage('compare');
document.getElementById('url-hint').textContent = chrome.i18n.getMessage('worksWithAny');
deckSearchInput.placeholder = chrome.i18n.getMessage('selectDeck');
document.getElementById('supports-lbl').textContent = chrome.i18n.getMessage('supports');
document.getElementById('detected-badge').textContent = chrome.i18n.getMessage('detected');
document.getElementById('detected-name').textContent = chrome.i18n.getMessage('scanning');
document.getElementById('settings-title').textContent = chrome.i18n.getMessage('settings');
document.getElementById('settings-source-label').textContent = chrome.i18n.getMessage('settingsSource');
document.getElementById('settings-user-label').textContent = chrome.i18n.getMessage('settingsUser');
document.getElementById('settings-save-text').textContent = chrome.i18n.getMessage('settingsSave');
deckUrlInput.placeholder = chrome.i18n.getMessage('pasteADeckUrl');
document.getElementById('onboarding-title').textContent = chrome.i18n.getMessage('onboardingTitle');
document.getElementById('onboarding-step1').textContent = chrome.i18n.getMessage('onboardingStep1');
document.getElementById('onboarding-step2').textContent = chrome.i18n.getMessage('onboardingStep2');
document.getElementById('onboarding-step3').textContent = chrome.i18n.getMessage('onboardingStep3');
document.getElementById('pool-btn').title = chrome.i18n.getMessage('poolEntryTitle');
document.getElementById('pool-entry-text').textContent = chrome.i18n.getMessage('poolAnalysis');
document.getElementById('pool-entry-sub').textContent = chrome.i18n.getMessage('poolEntrySub');

// --- Source toggle (persisted) ---
function switchPane(pane) {
  document.querySelectorAll('.src-toggle button').forEach(b =>
    b.classList.toggle('active', b.dataset.pane === pane));
  document.querySelectorAll('.pane').forEach(p => p.classList.remove('active'));
  document.getElementById('pane-' + pane).classList.add('active');
}

document.querySelectorAll('.src-toggle button').forEach(btn => {
  btn.addEventListener('click', () => {
    switchPane(btn.dataset.pane);
    chrome.storage.local.set({ preferredPane: btn.dataset.pane });
  });
});

// --- On popup open: detect active tab + restore saved username ---
(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;

  detectedSite = SUPPORTED_SITES.find(s => tab?.url?.includes(s.pattern));
  if (detectedSite) {
    detectedEl.classList.remove('none');
    detectedName.textContent = chrome.i18n.getMessage('detected');
    detectedSub.innerHTML = `<span class="src-chip">${detectedSite.label}</span>`;
    detectedLive.style.display = '';
  } else {
    detectedName.textContent = chrome.i18n.getMessage('noDetected');
    detectedSub.textContent = '';
    // Hide deck 2 section when no deck detected
    document.querySelectorAll('.deck2-section').forEach(el => el.style.display = 'none');
  }

  const stored = await chrome.storage.local.get(['moxfieldUser', 'moxfieldDecks', 'archidektUser', 'archidektDecks', 'magicvilleUser', 'magicvilleDecks', 'preferredPane', 'deckSource']);
  if (stored.preferredPane) switchPane(stored.preferredPane);

  // Restore deck source and username
  const source = stored.deckSource || 'moxfield';
  deckSourceSelect.value = source;
  const savedUser = stored[`${source}User`];
  const savedDecks = stored[`${source}Decks`];
  if (savedUser) settingsUser.value = savedUser;
  if (savedDecks?.length) populateSelect(savedDecks);
  updateMoxHint(source, savedUser || '');
})();

// --- URL comparison ---
compareBtn.addEventListener('click', () => runComparison(deckUrlInput.value.trim()));
deckUrlInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') runComparison(deckUrlInput.value.trim());
});

// --- My Decks (searchable dropdown) ---
let allDecks = [];
let selectedDeckUrl = '';

compareMoxfieldBtn.addEventListener('click', () => {
  if (selectedDeckUrl) runComparison(selectedDeckUrl);
});

refreshBtn.addEventListener('click', async () => {
  refreshBtn.disabled = true;
  await loadUserDecks();
  refreshBtn.disabled = false;
});

// --- Settings panel ---
document.getElementById('settings-toggle').addEventListener('click', () => {
  const visible = settingsPanel.style.display !== 'none';
  settingsPanel.style.display = visible ? 'none' : 'block';
});
document.getElementById('settings-close').addEventListener('click', () => {
  settingsPanel.style.display = 'none';
});

// --- Pool analyzer entry ---
document.getElementById('pool-btn').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('pool.html') });
  window.close();
});

// When source changes in settings, restore saved username
deckSourceSelect.addEventListener('change', async () => {
  const source = deckSourceSelect.value;
  const stored = await chrome.storage.local.get([`${source}User`]);
  settingsUser.value = stored[`${source}User`] || '';
});

// Save & load
settingsSave.addEventListener('click', loadUserDecks);
settingsUser.addEventListener('keydown', e => {
  if (e.key === 'Enter') loadUserDecks();
});

async function loadUserDecks() {
  const username = settingsUser.value.trim();
  const source = deckSourceSelect.value;
  if (!username) { setStatus(chrome.i18n.getMessage('enterMoxUser'), true); return; }

  settingsSave.disabled = true;
  setStatus(chrome.i18n.getMessage('loadingMoxDecks'));

  try {
    const MSG_TYPES = { moxfield: 'LIST_MOXFIELD_DECKS', archidekt: 'LIST_ARCHIDEKT_DECKS', magicville: 'LIST_MAGICVILLE_DECKS' };
    const msgType = MSG_TYPES[source] || 'LIST_MOXFIELD_DECKS';
    const resp = await sendToRuntime({ type: msgType, username });
    if (resp.error) { setStatus(`${chrome.i18n.getMessage('error')}: ${resp.error}`, true); settingsSave.disabled = false; return; }
    if (!resp.decks?.length) { setStatus(chrome.i18n.getMessage('noPublicDecks'), true); settingsSave.disabled = false; return; }

    await chrome.storage.local.set({
      deckSource: source,
      [`${source}User`]: username,
      [`${source}Decks`]: resp.decks
    });
    populateSelect(resp.decks);
    setStatus('');
    const now = new Date().toLocaleTimeString();
    settingsHint.innerHTML = `<b>${resp.decks.length}</b> ${chrome.i18n.getMessage('decksLoaded')}`;
    moxHint.className = 'hint';
    moxHint.innerHTML = `<b>${source}</b> · ${esc(username)} · <b>${resp.decks.length}</b> decks · ${now}`;
    // Auto-close settings after success
    settingsPanel.style.display = 'none';
  } catch (err) {
    setStatus(`${chrome.i18n.getMessage('error')}: ${err.message}`, true);
  } finally {
    settingsSave.disabled = false;
  }
}

function updateMoxHint(source, username) {
  if (username) {
    moxHint.className = 'hint';
    moxHint.innerHTML = `<b>${source}</b> · ${esc(username)} · ${chrome.i18n.getMessage('settingsConfigured')}`;
  } else {
    moxHint.className = 'hint-configure';
    moxHint.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>${chrome.i18n.getMessage('settingsNotConfigured')}`;
  }
}

function populateSelect(decks) {
  allDecks = decks;
  selectedDeckUrl = '';
  deckSearchInput.disabled = false;
  deckSearchInput.value = '';
  deckSearchInput.placeholder = chrome.i18n.getMessage('selectDeck');
  compareMoxfieldBtn.disabled = true;
  refreshBtn.style.display = '';
  renderDropdown(decks);
}

function renderDropdown(filtered) {
  if (!filtered.length) {
    deckDropdown.innerHTML = `<div class="deck-dropdown-empty">${chrome.i18n.getMessage('noPublicDecks')}</div>`;
    return;
  }
  deckDropdown.innerHTML = filtered.map(d => {
    const fmt = d.format ? `<span class="fmt">${esc(d.format)}</span>` : '';
    return `<div class="deck-option" data-url="${esc(d.url)}"><span class="nm">${esc(d.name)}</span>${fmt}</div>`;
  }).join('');
}

// Search input: filter + show dropdown
deckSearchInput.addEventListener('input', () => {
  const q = deckSearchInput.value.toLowerCase();
  const filtered = allDecks.filter(d => d.name.toLowerCase().includes(q) || (d.format && d.format.toLowerCase().includes(q)));
  renderDropdown(filtered);
  deckDropdown.classList.add('open');
});

deckSearchInput.addEventListener('focus', () => {
  if (allDecks.length) {
    const q = deckSearchInput.value.toLowerCase();
    const filtered = q ? allDecks.filter(d => d.name.toLowerCase().includes(q) || (d.format && d.format.toLowerCase().includes(q))) : allDecks;
    renderDropdown(filtered);
    deckDropdown.classList.add('open');
  }
});

// Click on a deck option
deckDropdown.addEventListener('click', e => {
  const opt = e.target.closest('.deck-option');
  if (!opt) return;
  selectedDeckUrl = opt.dataset.url;
  const nameEl = opt.querySelector('.nm');
  deckSearchInput.value = nameEl ? nameEl.textContent : '';
  deckDropdown.classList.remove('open');
  compareMoxfieldBtn.disabled = false;
});

// Close dropdown when clicking outside
document.addEventListener('click', e => {
  if (!e.target.closest('.deck-search-wrap')) {
    deckDropdown.classList.remove('open');
  }
});

// --- Shared comparison logic ---
async function runComparison(targetUrl) {
  if (!targetUrl) { setStatus(chrome.i18n.getMessage('pasteOrSelect'), true); return; }
  if (!detectedSite) { setStatus(chrome.i18n.getMessage('openSupportedFirst'), true); return; }

  compareBtn.disabled = true;
  compareMoxfieldBtn.disabled = true;

  try {
    setStatus(`${chrome.i18n.getMessage('readingDeck')} ${detectedSite.label}…`);
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
    const targetResp = await sendToRuntime({ type: 'FETCH_DECK', url: targetUrl });
    if (targetResp.error) { setStatus(`${chrome.i18n.getMessage('error')}: ${targetResp.error}`, true); resetButtons(); return; }

    setStatus(chrome.i18n.getMessage('openingResults'));
    sourceDeck.url = currentTab.url;
    targetResp.deck.url = targetUrl;
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
  compareMoxfieldBtn.disabled = false;
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
