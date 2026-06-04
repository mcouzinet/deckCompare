const statusEl = document.getElementById('status');
const compareBtn = document.getElementById('compare-btn');
const deckUrlInput = document.getElementById('deck-url');
const detectedEl = document.getElementById('detected');
const detectedName = document.getElementById('detected-name');
const detectedSub = document.getElementById('detected-sub');
const detectedLive = document.getElementById('detected-live');
const moxfieldUserInput = document.getElementById('moxfield-user');
const loadDecksBtn = document.getElementById('load-decks-btn');
const deckSelect = document.getElementById('deck-select');
const compareMoxfieldBtn = document.getElementById('compare-moxfield-btn');
const moxHint = document.getElementById('mox-hint');

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

// --- Translate static UI ---
document.getElementById('bmc-text').textContent = t('buyMeCoffee');
document.getElementById('lbl-deck1').textContent = `Deck 1 · ${t('activeTab')}`;
document.getElementById('lbl-deck2').textContent = `Deck 2 · ${t('compareAgainst')}`;
document.getElementById('vs-text').textContent = t('versus');
document.getElementById('tab-url-text').textContent = t('pasteUrl');
document.getElementById('tab-mox-text').textContent = t('myMoxfield');
document.getElementById('cmp-url-text').textContent = t('compare');
document.getElementById('cmp-mox-text').textContent = t('compare');
document.getElementById('url-hint').textContent = t('worksWithAny');
document.getElementById('load-text').textContent = t('load');
document.getElementById('select-default').textContent = t('loadYourDecks');
document.getElementById('mox-hint').textContent = t('enterUsername');
document.getElementById('supports-lbl').textContent = t('supports');
document.getElementById('detected-badge').textContent = t('detected');
document.getElementById('detected-name').textContent = t('scanning');
deckUrlInput.placeholder = t('pasteADeckUrl');
moxfieldUserInput.placeholder = t('moxfieldUsername');

// --- Source toggle ---
document.querySelectorAll('.src-toggle button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.src-toggle button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.pane').forEach(p => p.classList.remove('active'));
    document.getElementById('pane-' + btn.dataset.pane).classList.add('active');
  });
});

// --- On popup open: detect active tab + restore saved username ---
(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;

  detectedSite = SUPPORTED_SITES.find(s => tab?.url?.includes(s.pattern));
  if (detectedSite) {
    detectedEl.classList.remove('none');
    detectedName.textContent = t('detected');
    detectedSub.innerHTML = `<span class="src-chip">${detectedSite.label}</span>`;
    detectedLive.style.display = '';
  } else {
    detectedName.textContent = t('noDetected');
    detectedSub.textContent = t('openSupported');
  }

  const { moxfieldUser, moxfieldDecks } = await chrome.storage.local.get(['moxfieldUser', 'moxfieldDecks']);
  if (moxfieldUser) {
    moxfieldUserInput.value = moxfieldUser;
    if (moxfieldDecks?.length) populateSelect(moxfieldDecks);
  }
})();

// --- URL comparison ---
compareBtn.addEventListener('click', () => runComparison(deckUrlInput.value.trim()));
deckUrlInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') runComparison(deckUrlInput.value.trim());
});

// --- Moxfield deck list ---
loadDecksBtn.addEventListener('click', loadMoxfieldDecks);
moxfieldUserInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') loadMoxfieldDecks();
});
compareMoxfieldBtn.addEventListener('click', () => {
  const url = deckSelect.value;
  if (url) runComparison(url);
});

async function loadMoxfieldDecks() {
  const username = moxfieldUserInput.value.trim();
  if (!username) { setStatus(t('enterMoxUser'), true); return; }

  loadDecksBtn.disabled = true;
  setStatus(t('loadingMoxDecks'));

  try {
    const resp = await sendToRuntime({ type: 'LIST_MOXFIELD_DECKS', username });
    if (resp.error) { setStatus(`${t('error')}: ${resp.error}`, true); loadDecksBtn.disabled = false; return; }
    if (!resp.decks?.length) { setStatus(t('noPublicDecks'), true); loadDecksBtn.disabled = false; return; }

    await chrome.storage.local.set({ moxfieldUser: username, moxfieldDecks: resp.decks });
    populateSelect(resp.decks);
    setStatus('');
    moxHint.innerHTML = `<b>${resp.decks.length}</b> ${t('decksLoaded')}`;
  } catch (err) {
    setStatus(`${t('error')}: ${err.message}`, true);
  } finally {
    loadDecksBtn.disabled = false;
  }
}

function populateSelect(decks) {
  deckSelect.innerHTML = `<option value="">${t('selectDeck')}</option>`;
  for (const d of decks) {
    const opt = document.createElement('option');
    opt.value = d.url;
    opt.textContent = d.format ? `${d.name} [${d.format}]` : d.name;
    deckSelect.appendChild(opt);
  }
  deckSelect.disabled = false;
  compareMoxfieldBtn.disabled = false;
}

// --- Shared comparison logic ---
async function runComparison(targetUrl) {
  if (!targetUrl) { setStatus(t('pasteOrSelect'), true); return; }
  if (!detectedSite) { setStatus(t('openSupportedFirst'), true); return; }

  compareBtn.disabled = true;
  compareMoxfieldBtn.disabled = true;

  try {
    setStatus(`${t('readingDeck')} ${detectedSite.label}…`);
    let sourceDeck;

    try {
      const resp = await sendToTab(currentTab.id, { type: 'GET_DECKLIST' });
      sourceDeck = resp?.deck;
    } catch (_) { sourceDeck = null; }

    const deckIsEmpty = !sourceDeck
      || sourceDeck._needsApiFetch
      || (!Object.keys(sourceDeck.mainboard || {}).length && !Object.keys(sourceDeck.commanders || {}).length);

    if (deckIsEmpty) {
      setStatus(t('fetchingApi'));
      const apiResp = await sendToRuntime({ type: 'FETCH_DECK', url: currentTab.url });
      if (apiResp.error) { setStatus(`${t('error')}: ${apiResp.error}`, true); resetButtons(); return; }
      sourceDeck = apiResp.deck;
    }

    if (!sourceDeck || (!Object.keys(sourceDeck.mainboard || {}).length && !Object.keys(sourceDeck.commanders || {}).length)) {
      setStatus(t('unableToRead'), true); resetButtons(); return;
    }

    setStatus(t('fetchingSecond'));
    const targetResp = await sendToRuntime({ type: 'FETCH_DECK', url: targetUrl });
    if (targetResp.error) { setStatus(`${t('error')}: ${targetResp.error}`, true); resetButtons(); return; }

    setStatus(t('openingResults'));
    sourceDeck.url = currentTab.url;
    targetResp.deck.url = targetUrl;
    await chrome.storage.local.set({ compareData: { deckA: sourceDeck, deckB: targetResp.deck } });
    chrome.tabs.create({ url: chrome.runtime.getURL('compare.html') });
    window.close();
  } catch (err) {
    setStatus(`${t('error')}: ${err.message}`, true);
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
