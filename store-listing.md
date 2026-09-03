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

• Pool analysis — paste several decklists and see the most-played cards across them, the average decklist, the mana curve and the top sideboard choices
• An optional Compare button added to each site's own toolbar, off by default
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

• Analyse de pool — collez plusieurs listes et voyez les cartes les plus jouées, la decklist moyenne, la courbe de mana et les meilleurs choix de réserve
• Un bouton Comparer optionnel ajouté à la barre d'outils de chaque site, désactivé par défaut
• Chargez vos decks publics par nom d'utilisateur, puis retrouvez-les par leur nom
• Filtres par zone — commandants, deck principal, réserve — avec tous les chiffres recalculés pour ce que vous regardez
• Images et types de cartes via Scryfall

Aucun compte, aucune connexion, aucune analyse d'audience, aucune donnée collectée. Tout s'exécute localement dans votre navigateur.
