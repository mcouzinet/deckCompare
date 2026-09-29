# Store listings

Source of truth for what the four stores show (Chrome Web Store, Edge Add-ons,
addons.mozilla.org, Mac App Store): texts, privacy answers and media. The consoles version
nothing, so this file does; the media sit beside it in `store/`.

**Rule: never write more than two site names in a row.** On 2026-09-02 the Chrome Web Store
rejected the listing for keyword stuffing (case *Yellow Argon*): the detailed description ended
on a bare comma-separated run of every site name. The facts were fine, the shape was not. The
texts state the count and name at most two sites inside a sentence; the full list lives in the
extension and in the README.

## Listings and submissions

- Chrome Web Store: https://chromewebstore.google.com/detail/deck-compare-%E2%80%93-mtg/miijiappldgijnnokopjfiponelkdhcg
- Edge Add-ons: https://microsoftedge.microsoft.com/addons/detail/deck-compare-%E2%80%93-mtg/akklkakfdidemfbbnjmhiofkhkcnhfbc
- addons.mozilla.org: https://addons.mozilla.org/firefox/addon/deck-compare-mtg/
- Mac App Store: app `io.github.mcouzinet.deckcompare`, not on sale yet.

| Version | Chrome Web Store | Edge Add-ons | addons.mozilla.org | Mac App Store |
|---|---|---|---|---|
| 1.3 | sent 2026-09-29 | sent 2026-09-29 | sent 2026-09-29 | build 4, sent 2026-09-29 |
| 1.2 | live 2026-09-25 | first listing, live 2026-09-25 | first listing, live 2026-09-27 | first listing, build 2, sent 2026-09-25 |
| 1.1 | cut 2026-09-08 | | | |
| 1.0.13 | live 2026-09-05 | | | |

Each release uploads `dist/deckcompare-X.Y-chrome.zip` (Chrome Web Store and Edge Add-ons),
`dist/deckcompare-X.Y-firefox.zip` (addons.mozilla.org) and an Xcode archive of `safari/` (Mac App
Store, see *App Store* below), with the two descriptions, the new patch note above the others, and
the media. Still to redo for ManaBox: the promo video, which says eight sites
(`store/reel/reel.html`, two places).

## Short description (132 characters max)

Comes from `src/_locales/*/messages.json` → `appDescription`. **112 characters at most**: Safari rejects
the package above that (the French one was shortened on 2026-09-24; a test guards the limit).

- **EN**: Instantly compare two Magic: The Gathering decklists side by side with a visual diff and similarity score.
- **FR**: Comparez deux decklists Magic: The Gathering côte à côte, avec un diff visuel et un score de similarité.

---

## Detailed description (English)

Compare two Magic: The Gathering decklists side by side, without copying or pasting anything.

Open a deck page, click the extension, and choose the second deck: from another deck tab you already have open, from your own saved decks, or from a pasted link. You get a full visual breakdown in a new tab — cards unique to each deck shown as image grids, shared cards listed with their quantity differences highlighted, and a similarity figure.

Because it reads the decklist straight from the page you are already on, a deck hosted on one site can be compared against a deck hosted on another. Nine deck sites are supported, Moxfield, Archidekt and ManaBox among them; the extension shows the full list under its settings.

Also included:

• Cross-compare — paste several decklists and see the most-played cards across them, the average decklist, the mana curve and the top sideboard choices
• A Compare button added to each site's own toolbar, which you can switch off in the settings
• Load your public decks by username, then find them by name
• Board filters for commanders, mainboard and sideboard, with every figure recalculated for what you are looking at
• Card images and types from Scryfall

No account, no sign-in, no analytics, no data collected. Everything runs locally in your browser.

---

## Detailed description (Français)

Comparez deux listes de cartes Magic: The Gathering côte à côte, sans rien copier ni coller.

Ouvrez une page de deck, cliquez sur l'extension, et choisissez le second deck : parmi les autres onglets de deck déjà ouverts, parmi vos decks enregistrés, ou à partir d'un lien collé. Vous obtenez une comparaison visuelle complète dans un nouvel onglet — les cartes propres à chaque deck en grilles d'images, les cartes communes en liste avec les écarts de quantité mis en évidence, et un score de similarité.

Comme la liste est lue directement depuis la page où vous êtes, un deck hébergé sur un site peut être comparé à un deck hébergé sur un autre. Neuf sites de decks sont pris en charge, dont Moxfield, Archidekt et ManaBox ; l'extension affiche la liste complète dans ses réglages.

Également inclus :

• Comparaison croisée — collez plusieurs listes et voyez les cartes les plus jouées, la decklist moyenne, la courbe de mana et les meilleurs choix de réserve
• Un bouton Comparer ajouté à la barre d'outils de chaque site, désactivable dans les réglages
• Chargez vos decks publics par nom d'utilisateur, puis retrouvez-les par leur nom
• Filtres par zone — commandants, deck principal, réserve — avec tous les chiffres recalculés pour ce que vous regardez
• Images et types de cartes via Scryfall

Aucun compte, aucune connexion, aucune analyse d'audience, aucune donnée collectée. Tout s'exécute localement dans votre navigateur.

---

## Patch notes

Shown under the detailed description in both listings, newest first, one short paragraph per
version. Newest first: **v1.3**, **v1.2**, **v1.1**, then **v1.0.13**.

### Français

**v1.3**

ManaBox rejoint les sites pris en charge : le bouton « Comparer » s'y ajoute sur autorisation, en un clic, et le deck se lit depuis sa page. Comparaison croisée : « Comparer ma liste » mesure ta propre liste à l'ensemble sans la compter (similarité à la decklist moyenne, cartes du consensus, manques, cartes peu jouées ailleurs, deck le plus proche), chaque deck du lot se met en avant d'un survol ou d'un clic, et depuis le popup « Ce deck face aux N decks » y envoie le deck ouvert. La page de résultats montre plus de cartes par écran, dit ce que compte le pourcentage, copie chaque liste pour un éditeur de decks et filtre les écarts de quantité ; le popup, le panneau des sites et « Comparer un autre » proposent tes onglets de deck ouverts. Tout se charge plus vite, et les polices sont intégrées : l'extension ne contacte plus Google. Aucune permission requise en plus : ManaBox reste facultatif.

**v1.2**

Les pages d'archétype MTGGoldfish sont reconnues : le bouton y apparaît et le popup lit le deck. Sur MTGGoldfish, le bouton « Comparer » retrouve sa place dans la barre du deck ; sur Moxfield, il rejoint la barre même quand la page charge lentement. Les noms de cartes s'apparient mieux d'un site à l'autre : codes d'édition, apostrophes, listes tapées à la main. Aucune permission supplémentaire à la mise à jour.

**v1.1**

Le bouton « Comparer » est désormais présent d'office sur les sites de decks, désactivable dans les Réglages ; Moxfield s'autorise en un clic. Le panneau qu'il ouvre adopte le monde clair de l'extension. Comparaison croisée : « + Ajouter » rejoint la liste des decks, les cartes en commun et distinctes se copient d'un clic, et les cartes recto-verso sont reconnues d'une source à l'autre. La légende de la comparaison directe précise exemplaires et cartes. Quand Cloudflare bloque la lecture directe d'un deck (MTGGoldfish notamment), elle repasse par un onglet. Aucune permission supplémentaire à la mise à jour.

**v1.0.13**

Le bouton « Comparer » arrive sur les sites de decks eux-mêmes (opt-in dans les Réglages) ; le deuxième deck se choisit en un clic parmi tes onglets ouverts ; la page de résultats gagne « Comparer un autre » et l'inversion des decks. L'analyse de pool devient la « Comparaison croisée » : elle se lance en un clic depuis une page d'archétype mtgtop8, filtre les decks par carte et fonctionne sans commandant. Les cartes recto-verso sont reconnues d'un site à l'autre et Magic-Ville se charge de nouveau. L'identité visuelle est entièrement remplacée — un mémo sur papier crème, en Beleren. Aucune permission supplémentaire n'est exigée à la mise à jour.

### English

**v1.3**

ManaBox joins the supported sites: the Compare button appears there once allowed, in one click, and the deck is read from its own page. Cross-compare: "Compare my list" measures your own list against the set without counting it (similarity to the average decklist, share of the consensus, missing cards, cards seldom played elsewhere, closest deck), any deck of the set can be put forward with a hover or a click, and from the popup "This deck against the N decks" sends the open deck there. The results page shows more cards per screen, says what its percentage counts, copies each list for a deck builder and filters quantity mismatches; the popup, the panel on deck sites and "Compare another" offer your open deck tabs. Everything loads faster, and the fonts now ship inside: the extension no longer contacts Google. No new required permission: ManaBox stays optional.

**v1.2**

MTGGoldfish archetype pages are now recognized: the button shows up and the popup reads the deck. On MTGGoldfish the Compare button is back in the deck toolbar; on Moxfield it joins the toolbar even when the page loads slowly. Card names match better across sites: set codes, apostrophes, hand-typed lists. No new permission on update.

**v1.1**

The Compare button now ships on the deck sites out of the box, and can be switched off in Settings; Moxfield is one click away. The panel it opens takes the extension's light look. Cross-compare: "+ Add" moves next to the deck list, shared and distinct cards copy in one click, and double-faced cards are matched across sources. The direct comparison's legend now states copies and cards. When Cloudflare blocks a direct deck read (MTGGoldfish among others), the read goes through a tab instead. No new permission on update.

**v1.0.13**

The "Compare" button lands on the deck sites themselves (opt-in in Settings); the second deck is one click away from your open tabs; the results page gains "Compare another" and deck swapping. Pool analysis becomes "Cross-compare": it opens in one click from an mtgtop8 archetype page, filters decks by card, and works without a commander. Double-faced cards are matched across sites and Magic-Ville loads again. The visual identity is fully replaced — a memo on cream paper, set in Beleren. No new permission is required on update.

---

## Privacy practices (Chrome Web Store dashboard)

The dashboard's **Privacy practices** tab. Every field is required; answers stay in place from one
version to the next. English on purpose: these texts are read by the reviewers, not shown on the
listing. Each justification field takes up to 1,000 characters. Reuse them wherever another store
asks the same thing (Edge, Opera, an AMO reviewer).

**Single purpose description**

> Compare Magic: The Gathering decklists. The extension reads decklists from supported deck sites
> (or pasted text) and shows how two decks differ — cards unique to each, shared cards, quantity
> gaps and a similarity score — or what a group of decks has in common (cross-compare).

**activeTab justification**

> When the user clicks the toolbar icon, the popup reads the page open in the active tab — its
> address and, on a supported deck site, its decklist — so that deck can be the first side of the
> comparison. Access is limited to that tab, happens only on that click, and no other page is read.

**storage justification**

> Stores data locally in the browser only (chrome.storage.local): the user's settings (the in-page
> button switch, the deck-site usernames they enter to list their own public decks, the results
> page's display density), the decks they add to a cross-comparison, its card filters and the
> user's own list compared to it, the
> comparison handed from the popup to the results page, and a cache of card data (types and image
> URLs) from Scryfall so pages do not refetch it. Nothing is synced or sent anywhere.

**scripting justification**

> Used for two things, both with the extension's own packaged files. It registers the extension's
> content script (the in-page Compare button) on the optional hosts (Moxfield and ManaBox deck
> pages, and the www / non-www variants of supported sites) once the user grants those hosts, and
> unregisters it when they are revoked. And when the user clicks the toolbar icon on a supported
> deck page that has no content script (ManaBox before its access is granted), it injects the
> packaged deck reader into that tab only, under activeTab, so the popup can read the deck.
> On ManaBox that script is also how a deck is read: the extension never requests ManaBox itself.
> No code is injected from strings and nothing is fetched to be executed.

**Host permission justification**

> Each host is a deck site the extension reads decklists from, or Scryfall for card data:
> api2.moxfield.com (Moxfield's deck API); archidekt.com, www.mtggoldfish.com, www.mtgtop8.com,
> www.magic-ville.com, mtgdecks.net, melee.gg and getpaird.io (deck pages the extension reads and
> adds its Compare button to); api.scryfall.com and cards.scryfall.io (card types and images).
> Requests are made only to fetch a deck the user chose to compare and the cards on screen. The
> optional hosts (moxfield.com pages, manabox.app, www / non-www twins) are requested at runtime,
> only from a click: in the popup, for the in-page button, and for manabox.app also from the click
> that reads a ManaBox deck link; ManaBox decks are read from the deck page in a tab, never fetched
> by the extension. The popup, the in-page panel and the results page list the open tabs on these
> sites (address and title) to offer them as the second deck.

**Are you using remote code?** No.

> All JavaScript ships in the package (CSP script-src 'self'). Data fetched from the deck sites and
> Scryfall — JSON, HTML and plain-text decklists — is parsed as data and never executed.

**Data usage**

- What user data do you plan to collect: tick **Website content** only (the decklists read from
  the pages), as the live listing already declares. Nothing else — no personal, authentication,
  location, history or activity data.
- Tick the three certifications: no sale or transfer to third parties outside the approved use
  cases; no use unrelated to the single purpose; no use for creditworthiness or lending.

**Privacy policy URL**: https://mcouzinet.github.io/deckCompare/privacy-policy.html

## Firefox and Edge listings

Same name, short and detailed descriptions, screenshots and promo images as the Chrome Web
Store. What differs:

**addons.mozilla.org** (Firefox)

- Package: `dist/deckcompare-X.Y-firefox.zip`. Add-on id `deckcompare@mcouzinet.github.io`
  (in the manifest; permanent once published).
- Summary (250 characters max): the short description above.
- Add one sentence to the detailed description, Firefox only —
  EN: *On Firefox, allow access to the deck sites in one click from the popup the first time.*
  FR : *Sur Firefox, autorisez l'accès aux sites de decks en un clic depuis le popup, la première fois.*
- Category: Games & Entertainment. Support site: https://github.com/mcouzinet/deckCompare.
  Privacy policy: https://mcouzinet.github.io/deckCompare/privacy-policy.html.
- License: MIT (the repository's `LICENSE`).
- Source code: not needed — nothing is minified or bundled; the build only rewrites the manifest.
  If a reviewer asks, point to the GitHub tag `vX.Y` and `npm run build`.
- Data collection: declared in the manifest as none.
- Version notes: the version's patch note, English and French (the first listing, 1.2, said
  *First release for Firefox.* / *Première version pour Firefox.*).

**Edge Add-ons** (Partner Center)

- Package: `dist/deckcompare-X.Y-chrome.zip`, the Chrome package, unchanged.
- Category: Entertainment. Privacy policy URL as above.
- Required for **each language in the package** — English and French, since `_locales` ships both:
  a description and the **extension logo** `store/logo-300x300.png` (1:1, 300×300 recommended,
  128×128 minimum). Fill English, then use **Duplicate** for French.
- Optional: screenshots (1280×800, six at most — the five in `store/screenshots/`) and the promo
  tiles `store/promo-small-440x280.png` and `store/promo-marquee-1400x560.png`. Edge takes PNG;
  the Chrome Web Store accepts the same files (24-bit, no alpha).

## App Store (Safari, macOS)

Same texts and media as the other stores, packaged by Apple's **Safari Web Extension Packager**.
Start with macOS only: iOS would need portrait screenshots and its own testing.

**Package**: `dist/deckcompare-X.Y-safari.zip` (`npm run build safari`, or the default build).
It differs from the Chrome package in two places: `browser_specific_settings.safari`
(`strict_min_version` 16.4, and the key that keeps the DEV badge off) and a 1024 px icon, from
which the packager builds the app's App Store icon. Without it, the icon is the 128 px one
enlarged, visibly pixelated.

**Upload through Xcode.** App Store Connect's web packager sits behind Xcode Cloud's onboarding,
which starts in Xcode anyway (seen 2026-09-24: the Xcode Cloud page only offers « Ouvrir Xcode »).
The wrapper app lives in `safari/Deck Compare/Deck Compare.xcodeproj`; it references
`dist/safari/`, it does not copy it.

1. App Store Connect › Apps › **New App**: platform **macOS**, name = the extension's `appName`, bundle ID
   `io.github.mcouzinet.deckcompare` (registered in Certificates, Identifiers & Profiles; permanent),
   SKU `deckcompare-safari`. Done on 2026-09-24.
2. `npm run build safari`, then open the project in Xcode. Team `6DTUA72PA3`, automatic signing,
   version and build number are already set in the project.
3. Scheme **Deck Compare**, destination **Any Mac** › Product › **Archive**. In the Organizer:
   **Distribute App** › App Store Connect › Distribute. Xcode creates the distribution certificate
   if the team has none.
4. Once the build is processed, attach it to the version in App Store Connect and submit (a new
   version is created with « + » beside « macOS App » once the previous one is approved). Test it
   first with TestFlight on the Mac if you like.
5. Each new upload needs a higher build number (`CURRENT_PROJECT_VERSION`), higher than every build
   already uploaded whatever its version (macOS never restarts at 1: 1.2 went up to build 3, 1.3
   is build 4), and each release the
   new `MARKETING_VERSION`, both in the app **and** the extension target.

**Listing** (fill English, then add the French localization)

- Name: the extension's `appName` (`src/_locales/en/messages.json`).
- Subtitle (30 max): EN `Compare MTG decklists` · FR `Comparez vos decklists MTG`.
- Promotional text (170 max):
  EN: Compare two Magic: The Gathering decklists side by side, right from the deck page: shared cards, exclusives, quantity gaps and a similarity score.
  FR : Comparez deux decklists Magic: The Gathering côte à côte depuis la page du deck : cartes communes, exclusives, écarts de quantité et score de similarité.
- Description (4,000 max): the detailed description above, plus:
  EN: *In Safari, allow Deck Compare on the deck sites when Safari asks, or in Safari Settings ›
  Extensions.* FR : *Dans Safari, autorisez Deck Compare sur les sites de decks quand Safari le
  demande, ou dans Réglages › Extensions.*
- Keywords (100 bytes max, no spaces): EN `mtg,magic,gathering,deck,decklist,compare,diff,commander,edh,cards,similarity` · FR `mtg,magic,deck,decklist,comparer,comparaison,commander,edh,cartes,similarité`. Site names stay out:
  Apple's guideline 2.3.7 treats third-party trademarks in keywords as keyword stuffing.
- Support URL: https://github.com/mcouzinet/deckCompare/issues · Marketing URL (optional):
  https://github.com/mcouzinet/deckCompare · Privacy policy: https://mcouzinet.github.io/deckCompare/privacy-policy.html
- Copyright: `2026 Mickael Couzinet`. Category: Entertainment, as on the Chrome Web Store.
  Age rating: answer *none* throughout → 4+.
- Screenshots (Mac, 1280×800, PNG without alpha, 1 to 10): the five in `store/screenshots/`.
- App Privacy: **Data Not Collected** (App Privacy page, with the privacy policy URL; only an
  Account Holder or Admin can publish it).
- Content rights (App Information): the app **shows and accesses third-party content** (card
  images and types from Scryfall, decklists read from the deck sites), used as fan content under
  Wizards' Fan Content Policy and Scryfall's API terms. Answering it is the owner's own attestation.
- App Review contact (version page): first name, last name, email and phone, seen by Apple only;
  sign-in not required.
- App Review notes: *The app installs a Safari web extension. In Safari › Settings › Extensions,
  enable Deck Compare and allow it on archidekt.com, then open
  https://archidekt.com/decks/4868475 and click « Compare » in the site's toolbar.*

**Known limits on Safari**: Apple documents neither `optional_host_permissions` nor its
behaviour: the in-page button on Moxfield, on ManaBox and on the www / non-www variants may not
appear, and ManaBox decks may not be readable at all.
Guideline 4.4 wants the containing app to offer "some functionality, such as help screens"; the
packager's app shows only how to enable the extension, which reviewers may question.

## Media

All in the light « Le mémo » world, French UI, captured from real builds (1.1 for screenshots 2
to 5, 1.3 for the first) in a driven Chrome for Testing with the extension loaded (real sites,
real decks, real Scryfall images).
Store screenshots are 1280×800 PNG, in this order:

1. `store/screenshots/1-le-bouton-sur-neuf-sites.png` (1.3): the « Comparer » button captured in
   the action bar of each of the nine sites (real pages), as clippings taped on the extension's
   paper, each button ringed in orange marker, the site's name on the tape, ManaBox tagged
   « Nouveau », a « 9 sites de decks » stamp. First slot on purpose: the other captures are
   taken on Archidekt and read as "Archidekt only".
2. `store/screenshots/2-bouton-et-panneau-sur-archidekt.png` — Archidekt deck page, the black
   « Comparer » button in the site's own toolbar, the panel open with a second deck URL.
3. `store/screenshots/3-comparaison.png` — the results page: « Lore Of The Rings (budget build) »
   vs its upgrade build, 82 %, the bar with the « exemplaires · cartes » legend, a card held.
4. `store/screenshots/4-comparaison-croisee.png` — cross-compare seeded from the mtgtop8
   « Aragorn, King of Gondor » archetype (23 decks), the « + Ajouter » pill, a card hovered.
5. `store/screenshots/5-popup.png` — the popup over that Archidekt page: deck detected, the
   other open deck tab offered. **Staged**: real popup markup and code, but the tab list and
   the saved-decks line are supplied by a harness (a popup opened as a page cannot see another
   active tab).

Promo images, English (one set serves every locale), redrawn on cream paper with the current
icon: `store/promo-small-440x280.png`, `store/promo-marquee-1400x560.png` (the marquee embeds a crop of
screenshot 2). Two site names at most appear in a row, as in the descriptions.

Promo video (2026-09-28), English, 15 s, 1920×1080, 60 fps: `store/reel/`, the dark reel of the
Endstep Tracker and Whozic videos, same method (`reel.html` is a pure function of time captured
frame by frame, `sfx.js` synthesizes the sound on the same timeline). Story: the winner's list on
mtgtop8, the black button, your own deck picked in the panel (nothing pasted), the cards sorted,
95 % similar, 4 cards apart; the cube (no copy-paste, 8 deck sites, whole archetypes); the
signature. Real Scryfall images, made-up decks held to the product's formula (71 of 75).
`node store/reel/render.js` writes `store/reel/out/deckcompare-15s.mp4` (git-ignored); the render
loads Google Fonts and Scryfall, so it needs the network. The stores take it as a YouTube link.

Pipeline: puppeteer-core and Chrome for Testing with `--load-extension` (the branded Chrome
refuses that flag since 137), 2× capture then Lanczos resize to the exact size. The first
screenshot is a collage of per-site tiles: Archidekt, getPaird and ManaBox were captured for 1.3
(headless, a test copy of the package with the optional hosts granted at install); the six others
come from the 1.2 montage, because Cloudflare blocks automated Chrome on Moxfield, MTGGoldfish,
mtgdecks, Melee and Magic-Ville, and mtgtop8 shows a consent wall. To redo those, capture the pages
from the user's own Chrome.

---

## YouTube (promo video, 2026-09-28)

Upload `store/reel/out/deckcompare-15s.mp4` (render it first, see *Media*) with the thumbnail
`store/youtube-thumbnail-1280x720.jpg` (source `store/reel/thumbnail.html`,
`node store/reel/render.js thumbnail`; a custom thumbnail needs a phone-verified channel). Then paste
the video link in the Chrome Web Store console, in the listing's promo video field.

Settings: video language English; category Gaming (game: Magic: The Gathering); not made for kids;
altered or synthetic content: no (motion design, nothing realistic); no paid promotion.
To do when they are live: add the Firefox and Mac App Store links under the two below. At the 1.3
upload (ManaBox), "Eight deck sites" becomes nine, here and in the video (`reel.html`, two places).

**Title** (100 characters max; the first 60 or so show in search):

    Deck Compare: compare two MTG decklists in one click

Alternatives: `What changed? Compare two MTG decklists in one click | Deck Compare` ·
`Compare MTG decklists right on the deck page | Deck Compare`.

**Description** (the first two lines show above « more »):

```
Compare two Magic: The Gathering decklists side by side, right on the deck page. A free browser extension for Chrome, Edge, Firefox and Safari.

Open a deck, click Compare and pick the other deck: one of your saved decks, another open tab, or a link. Every card comes back sorted (only in one deck, only in the other, shared), with the quantity gaps and a similarity figure. Lists from two different sites compare just as well, a Moxfield build against an mtgtop8 winner for instance. Eight deck sites are supported.

Cross-compare goes further: a whole archetype at once, with the most-played cards, the average decklist, the mana curve and the top sideboard choices.

No account, no sign-in, nothing collected: everything runs in your browser.

Chrome Web Store: https://chromewebstore.google.com/detail/deck-compare-%E2%80%93-mtg/miijiappldgijnnokopjfiponelkdhcg
Microsoft Edge: https://microsoftedge.microsoft.com/addons/detail/deck-compare-%E2%80%93-mtg/akklkakfdidemfbbnjmhiofkhkcnhfbc
Source code: https://github.com/mcouzinet/deckCompare
Privacy policy: https://mcouzinet.github.io/deckCompare/privacy-policy.html

The decks in the video are examples. Card images: Scryfall.
Deck Compare is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.

#MTG #MagicTheGathering #Deckbuilding
```

**Tags** (500 characters max):

```
Deck Compare, MTG, Magic The Gathering, decklist, compare decklists, deck comparison, MTG deckbuilding, deck diff, Moxfield, mtgtop8, MTGGoldfish, Archidekt, Modern, Commander, sideboard, metagame, browser extension, Chrome extension
```

**French translation** (YouTube Studio › Languages › add French: title and description):

    Deck Compare : comparez deux decklists MTG en un clic

```
Comparez deux decklists Magic: The Gathering côte à côte, directement sur la page du deck. Une extension gratuite pour Chrome, Edge, Firefox et Safari.

Ouvrez un deck, cliquez sur Comparer et choisissez l'autre deck : un de vos decks enregistrés, un autre onglet ouvert, ou un lien. Chaque carte revient triée (propre à un deck, propre à l'autre, en commun), avec les écarts de quantité et un score de similarité. Deux listes de sites différents se comparent tout aussi bien, une version Moxfield face à une liste gagnante sur mtgtop8 par exemple. Huit sites de decks sont pris en charge.

La comparaison croisée va plus loin : tout un archétype d'un coup, avec les cartes les plus jouées, la decklist moyenne, la courbe de mana et les meilleurs choix de réserve.

Aucun compte, aucune connexion, aucune donnée collectée : tout s'exécute dans votre navigateur.

Chrome Web Store : https://chromewebstore.google.com/detail/deck-compare-%E2%80%93-mtg/miijiappldgijnnokopjfiponelkdhcg
Microsoft Edge : https://microsoftedge.microsoft.com/addons/detail/deck-compare-%E2%80%93-mtg/akklkakfdidemfbbnjmhiofkhkcnhfbc
Code source : https://github.com/mcouzinet/deckCompare
Politique de confidentialité : https://mcouzinet.github.io/deckCompare/privacy-policy.html

Les decks de la vidéo sont des exemples. Images des cartes : Scryfall.
Deck Compare is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.

#MTG #MagicTheGathering #Deckbuilding
```
