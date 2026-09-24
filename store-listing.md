# Chrome Web Store listing

Source of truth for the listing text, kept here because it is edited in the developer
console and is not otherwise versioned anywhere.

> **2026-09-02 — rejected for keyword stuffing** (case *Yellow Argon*). The detailed
> description ended on a bare comma-separated run of all eight site names, in both the
> English and the French listing:
>
> > Works with eight platforms: Moxfield, Archidekt, MTGGoldfish, mtgtop8, Magic-Ville,
> > mtgdecks.net, Melee, getpaird.
>
> The sites are genuinely supported, so the facts were not the problem — the *shape* was.
> An enumerated list of proper nouns is the pattern their heuristic looks for. The text
> below states the count and names at most two sites inside a sentence; the full list
> lives in the extension itself and in the README, where it belongs.
>
> **Rule for future edits: never write more than two site names in a row.**

> **2026-09-05 — 1.0.13 is live** (store page: Version 1.0.13, updated September 5, 2026;
> previous live version 0.9.0). The console text is behind this file on two points: both
> descriptions still say « Analyse de pool » / "Pool analysis" instead of « Comparaison
> croisée » / "Cross-compare", and the patch note shown is the **v1.0** one, which describes
> the cancelled 1.0.0 world ("a playmat under a single overhead light") that never shipped.
> Paste the v1.0.13 notes below in its place. **Note (1.1):** the description bullets below
> already describe 1.1, where the Compare button is on by default; a 1.0.13 console update
> must keep « désactivé par défaut » / "off by default" until 1.1 is live.
>
> **2026-09-08 — 1.1 cut** (manifest `1.1`, tag `v1.1`, `deckcompare-v1.1.zip`): the bullets
> below now match the shipped build. Console to-do at upload: replace both descriptions, and
> paste the **v1.1** and **v1.0.13** patch notes (newest first) in place of the v1.0 one.

---

> **2026-09-24 — 1.2 cut** (manifest `1.2`, tag `v1.2`). Three uploads, same texts and media:
> `dist/deckcompare-1.2-chrome.zip` to the Chrome Web Store and to Edge Add-ons,
> `dist/deckcompare-1.2-firefox.zip` to addons.mozilla.org (first Firefox listing — see
> *Firefox and Edge listings* below for the fields those two consoles ask for).
> Edge Add-ons: 1.2 submitted on 2026-09-24 (first Edge listing, logo + EN/FR descriptions).

## Short description (132 characters max)

Comes from `_locales/*/messages.json` → `appDescription`. Unchanged, not flagged.

- **EN** — Instantly compare two Magic: The Gathering decklists side by side with a visual diff and similarity score.
- **FR** — Comparez instantanément deux listes de cartes Magic: The Gathering côte à côte avec un diff visuel et un score de similarité.

---

## Detailed description — English

Compare two Magic: The Gathering decklists side by side, without copying or pasting anything.

Open a deck page, click the extension, and choose the second deck: from another deck tab you already have open, from your own saved decks, or from a pasted link. You get a full visual breakdown in a new tab — cards unique to each deck shown as image grids, shared cards listed with their quantity differences highlighted, and a similarity figure.

Because it reads the decklist straight from the page you are already on, a deck hosted on one site can be compared against a deck hosted on another. Eight deck sites are supported, Moxfield and Archidekt among them; the extension shows the full list under its settings.

Also included:

• Cross-compare — paste several decklists and see the most-played cards across them, the average decklist, the mana curve and the top sideboard choices
• A Compare button added to each site's own toolbar, which you can switch off in the settings
• Load your public decks by username, then find them by name
• Board filters for commanders, mainboard and sideboard, with every figure recalculated for what you are looking at
• Card images and types from Scryfall

No account, no sign-in, no analytics, no data collected. Everything runs locally in your browser.

---

## Detailed description — Français

Comparez deux listes de cartes Magic: The Gathering côte à côte, sans rien copier ni coller.

Ouvrez une page de deck, cliquez sur l'extension, et choisissez le second deck : parmi les autres onglets de deck déjà ouverts, parmi vos decks enregistrés, ou à partir d'un lien collé. Vous obtenez une comparaison visuelle complète dans un nouvel onglet — les cartes propres à chaque deck en grilles d'images, les cartes communes en liste avec les écarts de quantité mis en évidence, et un score de similarité.

Comme la liste est lue directement depuis la page où vous êtes, un deck hébergé sur un site peut être comparé à un deck hébergé sur un autre. Huit sites de decks sont pris en charge, dont Moxfield et Archidekt ; l'extension affiche la liste complète dans ses réglages.

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
version. Newest first: **v1.2**, **v1.1**, then **v1.0.13**.

### Français

**v1.2**

Les pages d'archétype MTGGoldfish sont reconnues : le bouton y apparaît et le popup lit le deck. Sur MTGGoldfish, le bouton « Comparer » retrouve sa place dans la barre du deck ; sur Moxfield, il rejoint la barre même quand la page charge lentement. Les noms de cartes s'apparient mieux d'un site à l'autre : codes d'édition, apostrophes, listes tapées à la main. Aucune permission supplémentaire à la mise à jour.

**v1.1**

Le bouton « Comparer » est désormais présent d'office sur les sites de decks, désactivable dans les Réglages ; Moxfield s'autorise en un clic. Le panneau qu'il ouvre adopte le monde clair de l'extension. Comparaison croisée : « + Ajouter » rejoint la liste des decks, les cartes en commun et distinctes se copient d'un clic, et les cartes recto-verso sont reconnues d'une source à l'autre. La légende de la comparaison directe précise exemplaires et cartes. Quand Cloudflare bloque la lecture directe d'un deck (MTGGoldfish notamment), elle repasse par un onglet. Aucune permission supplémentaire à la mise à jour.

**v1.0.13**

Le bouton « Comparer » arrive sur les sites de decks eux-mêmes (opt-in dans les Réglages) ; le deuxième deck se choisit en un clic parmi tes onglets ouverts ; la page de résultats gagne « Comparer un autre » et l'inversion des decks. L'analyse de pool devient la « Comparaison croisée » : elle se lance en un clic depuis une page d'archétype mtgtop8, filtre les decks par carte et fonctionne sans commandant. Les cartes recto-verso sont reconnues d'un site à l'autre et Magic-Ville se charge de nouveau. L'identité visuelle est entièrement remplacée — un mémo sur papier crème, en Beleren. Aucune permission supplémentaire n'est exigée à la mise à jour.

**v0.9**

Prise en charge de deux nouveaux sites, au même niveau que les six existants : Melee (melee.gg) et getpaird (getpaird.io). Les deux fonctionnent partout : collage d'URL, détection de l'onglet actif et analyseur de pool.

**v0.8**

Magic-Ville réparé — les decks Magic-Ville ne se chargeaient plus. C'est corrigé, y compris la détection du commandant en Duel Commander. Messages d'erreur plus clairs quand une page ne contient pas de decklist lisible. Vérifications automatiques ajoutées sur les sites supportés.

### English

**v1.2**

MTGGoldfish archetype pages are now recognized: the button shows up and the popup reads the deck. On MTGGoldfish the Compare button is back in the deck toolbar; on Moxfield it joins the toolbar even when the page loads slowly. Card names match better across sites: set codes, apostrophes, hand-typed lists. No new permission on update.

**v1.1**

The Compare button now ships on the deck sites out of the box, and can be switched off in Settings; Moxfield is one click away. The panel it opens takes the extension's light look. Cross-compare: "+ Add" moves next to the deck list, shared and distinct cards copy in one click, and double-faced cards are matched across sources. The direct comparison's legend now states copies and cards. When Cloudflare blocks a direct deck read (MTGGoldfish among others), the read goes through a tab instead. No new permission on update.

**v1.0.13**

The "Compare" button lands on the deck sites themselves (opt-in in Settings); the second deck is one click away from your open tabs; the results page gains "Compare another" and deck swapping. Pool analysis becomes "Cross-compare": it opens in one click from an mtgtop8 archetype page, filters decks by card, and works without a commander. Double-faced cards are matched across sites and Magic-Ville loads again. The visual identity is fully replaced — a memo on cream paper, set in Beleren. No new permission is required on update.

**v0.9**

Two new sites supported at full parity with the existing six: Melee (melee.gg) and getpaird (getpaird.io) — URL paste, active-tab detection and the pool analyser all work.

**v0.8**

Magic-Ville fixed (including Duel Commander commander detection), clearer error messages on unreadable pages, automated checks on supported sites.

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
> page's display density), the decks they add to a cross-comparison and its card filters, the
> comparison handed from the popup to the results page, and a cache of card data (types and image
> URLs) from Scryfall so pages do not refetch it. Nothing is synced or sent anywhere.

**scripting justification**

> Used only to register the extension's own packaged content script — the in-page Compare button —
> on the optional hosts (Moxfield deck pages and the www / non-www variants of supported sites),
> after the user grants those hosts from the settings, and to unregister it when they are revoked.
> No code is injected from strings and nothing is fetched to be executed.

**Host permission justification**

> Each host is a deck site the extension reads decklists from, or Scryfall for card data:
> api2.moxfield.com (Moxfield's deck API); archidekt.com, www.mtggoldfish.com, www.mtgtop8.com,
> www.magic-ville.com, mtgdecks.net, melee.gg and getpaird.io (deck pages the extension reads and
> adds its Compare button to); api.scryfall.com and cards.scryfall.io (card types and images).
> Requests are made only to fetch a deck the user chose to compare and the cards on screen. The
> optional hosts (moxfield.com pages, www / non-www twins) are requested at runtime, only when the
> user turns on the in-page button.

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

## Firefox and Edge listings (1.2)

Same name, short and detailed descriptions, screenshots and promo images as the Chrome Web
Store. What differs:

**addons.mozilla.org** (Firefox, first listing)

- Package: `dist/deckcompare-1.2-firefox.zip`. Add-on id `deckcompare@mcouzinet.github.io`
  (in the manifest; permanent once published).
- Summary (250 characters max): the short description above.
- Add one sentence to the detailed description, Firefox only —
  EN: *On Firefox, allow access to the deck sites in one click from the popup the first time.*
  FR : *Sur Firefox, autorisez l'accès aux sites de decks en un clic depuis le popup, la première fois.*
- Category: Games & Entertainment. Support site: https://github.com/mcouzinet/deckCompare.
  Privacy policy: https://mcouzinet.github.io/deckCompare/privacy-policy.html.
- License: to pick in the console (the repository has no LICENSE file).
- Source code: not needed — nothing is minified or bundled; the build only rewrites the manifest.
  If a reviewer asks, point to the GitHub tag `v1.2` and `npm run build`.
- Data collection: declared in the manifest as none.
- Version notes — EN: *First release for Firefox.* FR : *Première version pour Firefox.*

**Edge Add-ons** (Partner Center)

- Package: `dist/deckcompare-1.2-chrome.zip` — the Chrome package, unchanged.
- Category: Entertainment. Privacy policy URL as above.
- Required for **each language in the package** — English and French, since `_locales` ships both:
  a description and the **extension logo** `store/logo-300x300.png` (1:1, 300×300 recommended,
  128×128 minimum). Fill English, then use **Duplicate** for French.
- Optional: screenshots (1280×800, six at most — the five in `store/screenshots/`) and the promo
  tiles `store/promo-small-440x280.png` and `store/promo-marquee-1400x560.png`. Edge takes PNG;
  the Chrome Web Store accepts the same files (24-bit, no alpha).

## Media (1.1, 2026-09-08)

All in the light « Le mémo » world, French UI, captured from the real 1.1 build in a driven
Chrome for Testing with the extension loaded (real sites, real decks, real Scryfall images).
Store screenshots are 1280×800 PNG, in this order:

1. `store/screenshots/1-le-bouton-sur-huit-sites.png` — montage: the « Comparer » button captured
   in the action bar of each of the eight sites (real pages: Moxfield, Archidekt, MTGGoldfish,
   mtgtop8, Magic-Ville, mtgdecks, Melee, getpaird), laid out on the extension's paper. First
   slot on purpose: the other captures are taken on Archidekt and read as "Archidekt only".
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

Alternates (full-page captures by the user, reduced): `store/alternates/`.

Promo images, English (one set serves every locale), redrawn on cream paper with the current
icon: `store/promo-small-440x280.png`, `store/promo-marquee-1400x560.png` (the marquee embeds a crop of
screenshot 2). Two site names at most appear in a row, as in the descriptions.

Pipeline: `scratchpad/shots/*.js` (puppeteer-core + Chrome for Testing, `--load-extension`;
the branded Chrome ≥ 137 refuses that flag), 2× capture then Lanczos resize to exact size.
Montage tiles: six sites cropped in a headful Chrome for Testing (Moxfield through a test copy of
the package that declares its content script statically — the shipped build asks for that host
at runtime); MTGGoldfish, Magic-Ville and mtgdecks sit behind Cloudflare challenges that block
automated Chrome, so their tiles come from the user's own Chrome (page zoomed 2×, frame exported
as GIF, cropped). Composition: `scratchpad/montage/montage.html` rendered at 2×.
