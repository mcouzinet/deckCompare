// Content script – runs on supported deck sites. Parsing lives in dom-parsers.js
// (loaded first by the manifest) so it can be unit-tested with jsdom. This file
// just bridges the page to the popup.

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'GET_DECKLIST') {
    // Endstep's deck comes from its API, signed in as the user on this page.
    const reading = location.hostname === 'endstep.cc'
      ? DomParsers.readEndstepDeck(location.href).catch(() => null)
      : Promise.resolve(DomParsers.parseDeckFromCurrentSite(document, window.location.href));
    reading.then((deck) => sendResponse({ deck: Shared.normalizeDeck(deck) }));
  }
  return true;
});
