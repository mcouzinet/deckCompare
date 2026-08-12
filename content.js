// Content script – runs on supported deck sites. Parsing lives in dom-parsers.js
// (loaded first by the manifest) so it can be unit-tested with jsdom. This file
// just bridges the page to the popup.

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'GET_DECKLIST') {
    const deck = DomParsers.parseDeckFromCurrentSite(document, window.location.href);
    sendResponse({ deck });
  }
  return true;
});
