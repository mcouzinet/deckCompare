# Deck Compare — MTG

<p align="center">
  <img src="icons/icon128.png" width="96" alt="Deck Compare icon">
</p>

Chrome extension to compare Magic: The Gathering decklists side by side, across all major platforms.

## Features

- **Visual diff** — cards unique to each deck displayed as image grids, shared cards in a list with quantity deltas highlighted
- **Similarity score** — Jaccard-based percentage with donut chart and overlap bar
- **6 supported sites** — Moxfield, MTGGoldfish, Archidekt, mtgtop8, Magic-Ville, mtgdecks.net
- **Cross-site comparison** — compare a Moxfield deck against an mtgtop8 list, etc.
- **Moxfield deck loader** — enter your username to browse and pick from your public decks
- **Board filters** — filter by All / Commanders / Mainboard / Sideboard
- **View modes** — compact, comfortable, or large card grids
- **Card preview** — hover any card to see the full image via Scryfall
- **Bilingual** — English / French based on browser language
- **No account needed** — no data collected, 100% client-side

## How it works

1. Open a deck on any supported site
2. Click the extension icon and paste a second deck URL (or pick one from your Moxfield collection)
3. Get a full visual breakdown in a new tab

## Install

### From Chrome Web Store

*(Coming soon)*

### Manual install (developer mode)

1. Clone this repo
2. Go to `chrome://extensions/`
3. Enable **Developer mode**
4. Click **Load unpacked** and select the project folder

## Tech

- Chrome Extension Manifest V3
- Vanilla JS, no build step
- Card images via [Scryfall API](https://scryfall.com/docs/api)
- Fonts: Bricolage Grotesque + Geist

## Privacy

No data collected. No analytics. No cookies. Everything runs locally.

See the full [Privacy Policy](https://mcouzinet.github.io/deckCompare/privacy-policy.html).

## Support

If you find this useful, consider [buying me a coffee](https://www.buymeacoffee.com/mcouzineth).
