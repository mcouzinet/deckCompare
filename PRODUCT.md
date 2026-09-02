# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Magic: The Gathering players who want to know how two decklists differ. Three audiences,
explicitly weighted equally by the maintainer — no one of them is the primary:

- **Competitive / cEDH** — comparing their build against lists that perform, looking for
  the precise gap. Reads numbers, wants the missing-cards list.
- **Commander casual** — refining a deck, exploring how other people build the same
  commander. Discovers cards as much as compares them.
- **Creators / organisers** — preparing analyses, content, or events; need to get data
  back out in a presentable form.

Both usage rhythms are real and both must hold: a one-off check (open, read the answer,
close) and a deckbuilding session with several comparisons in a row.

## Product Purpose

Compare two decklists side by side and show what actually differs — cards unique to each
side, cards in common, quantity deltas, and a similarity figure — without the user having
to copy, paste, or re-type anything.

A second surface analyses a pool of N decklists together (card usage across the pool, mana
curve, average decklist).

Success is that the user gets the answer from the page they were already on, in one or two
clicks, and can act on it.

## Positioning

It is a browser extension, not a website. That is the mechanism, and it is what a
competing web tool cannot truthfully copy: the extension reads the deck from the page the
user is already looking at, holds host permissions for eight deck sites, and therefore
needs no copy-paste, no export step, and no CORS proxy. Cross-site comparison follows from
the same property — a Moxfield list against an mtgtop8 top-8 list is one flow, not two
exports.

## Operating Context

- Used inside the browser, alongside the deck sites themselves: Moxfield, MTGGoldfish,
  Archidekt, mtgtop8, Magic-Ville, mtgdecks.net, Melee, getpaird.
- Three surfaces: a 400px-wide toolbar popup, a full-tab comparison page, a full-tab pool
  analysis page. Plus an optional Compare button injected into each site's own toolbar.
- The popup is subject to Chrome's 800×600 ceiling and dies on focus loss.
- Card data and images come from Scryfall; deck data from each site's own API or DOM.
- MTG vocabulary is the domain language and is not jargon to be simplified away:
  mainboard, sideboard, commander, mana curve, archetype, format.

## Capabilities and Constraints

- Chrome Manifest V3. Vanilla JS, no build step, no framework, no bundler.
- A shared `theme.css` carries the palette and the single button component across the
  three extension pages, and `shared.js` carries the cross-surface logic (deck
  normalisation, saved-deck reader, optional-origin table); the injected in-page button
  re-declares the tokens inside its shadow root, the one place a linked stylesheet cannot
  reach.
- Internationalised through `chrome.i18n` / `_locales`: English and French, resolved from
  the browser language. Every user-facing string lives in `_locales`.
- No account, no backend, no analytics, no cookies. Everything runs client-side.
- Optional host permissions are requested only when the user enables the in-page button;
  adding a *required* host permission would disable the extension for every existing user
  until they re-accept, so that must never happen.
- The similarity figure is `sharedQty / max(totalA, totalB)` — a containment ratio, not
  Jaccard. It is not comparable across formats, and the product does not currently say so.

## Brand Commitments

Locked by the maintainer; a visual replacement must build around these, not over them.

- **The icon** — two overlapping cards, orange and teal. It is the Web Store identity.
  `icons/icon16|48|128.png`, redrawn as inline SVG in `inject-button.js`.
- **The wordmark** — "Deck" + bold "Compare", orange then teal, in Bricolage Grotesque.
- **The A/B/shared colour encoding** — deck 1 orange `#e3a24f`, deck 2 teal `#56b6c9`,
  shared green `#74bd84`. It carries identical meaning across all four surfaces including
  the injected shadow DOM, and it is the one system the product already has.

Name: Deck Compare — MTG. Published on the Chrome Web Store.

## Evidence on Hand

- Live product on the Chrome Web Store; v1.0.0 tagged and submitted.
- Real card data and imagery via the Scryfall API (`image_uris`, type lines).
- Unit tests over the eight site parsers with fixtures in `test/fixtures/`.
- A design critique snapshot at `.impeccable/critique/` scoring the pre-v1 UI 20/40.
- Promo assets `promo-marquee-1400x560.jpg`, `promo-small-440x280.jpg`.
- No user research, no analytics, no install numbers, no testimonials — none exist, and
  future work must not invent them.

## Product Principles

1. **The answer comes to the page the user is on.** Anything that makes the user leave,
   copy, or re-type is the failure mode the product exists to remove.
2. **Serve three audiences without picking one.** The same screen has to work for someone
   counting a three-card gap and someone browsing what other people play.
3. **Both rhythms hold.** A single check must feel immediate; a long session must not
   accumulate cost — no extra tab, no repeated setup, no re-entering what was entered.
4. **MTG vocabulary is the user's own.** Board names, commander, mana curve and archetype
   stay; they are not simplified away.
5. **Local by default.** No account, no backend, no telemetry — and no required permission
   added after the fact.

## Accessibility & Inclusion

WCAG 2.1 AA is the working bar, established during the v1.0 pass: text contrast ≥ 4.5:1,
a visible focus ring on every control, `prefers-reduced-motion` honoured, custom controls
carrying their ARIA state, and every flow completable by keyboard. Card preview must not
be hover-only. Bilingual EN/FR is a product requirement, not a nicety.
