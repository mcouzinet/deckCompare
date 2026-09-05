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

---

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
version. The **v1.0.13** note replaces the v1.0 note.

### Français

**v1.0.13**

Le bouton « Comparer » arrive sur les sites de decks eux-mêmes (opt-in dans les Réglages) ; le deuxième deck se choisit en un clic parmi tes onglets ouverts ; la page de résultats gagne « Comparer un autre » et l'inversion des decks. L'analyse de pool devient la « Comparaison croisée » : elle se lance en un clic depuis une page d'archétype mtgtop8, filtre les decks par carte et fonctionne sans commandant. Les cartes recto-verso sont reconnues d'un site à l'autre et Magic-Ville se charge de nouveau. L'identité visuelle est entièrement remplacée — un mémo sur papier crème, en Beleren. Aucune permission supplémentaire n'est exigée à la mise à jour.

**v0.9**

Prise en charge de deux nouveaux sites, au même niveau que les six existants : Melee (melee.gg) et getpaird (getpaird.io). Les deux fonctionnent partout : collage d'URL, détection de l'onglet actif et analyseur de pool.

**v0.8**

Magic-Ville réparé — les decks Magic-Ville ne se chargeaient plus. C'est corrigé, y compris la détection du commandant en Duel Commander. Messages d'erreur plus clairs quand une page ne contient pas de decklist lisible. Vérifications automatiques ajoutées sur les sites supportés.

### English

**v1.0.13**

The "Compare" button lands on the deck sites themselves (opt-in in Settings); the second deck is one click away from your open tabs; the results page gains "Compare another" and deck swapping. Pool analysis becomes "Cross-compare": it opens in one click from an mtgtop8 archetype page, filters decks by card, and works without a commander. Double-faced cards are matched across sites and Magic-Ville loads again. The visual identity is fully replaced — a memo on cream paper, set in Beleren. No new permission is required on update.

**v0.9**

Two new sites supported at full parity with the existing six: Melee (melee.gg) and getpaird (getpaird.io) — URL paste, active-tab detection and the pool analyser all work.

**v0.8**

Magic-Ville fixed (including Duel Commander commander detection), clearer error messages on unreadable pages, automated checks on supported sites.
