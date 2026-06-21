# Récupération des decklists Duel Commander par site

## Contexte

Les decks sont normalisés en un objet commun :

```js
{
  name: "Nom du deck",
  source: "moxfield",
  mainboard: { "Card Name": qty, ... },
  sideboard: { "Card Name": qty, ... },
  commanders: { "Card Name": qty, ... }
}
```

Fichiers concernés :
- `background.js` — fetch des decks via API/scraping (contourne le CORS)
- `content.js` — extraction depuis le DOM de la page active
- `compare.js` — moteur de diff, applique les heuristiques post-fetch

---

## Sites supportés

### 1. Moxfield — API REST

**Fonction :** `background.js` → `fetchMoxfieldDeck()`

```
GET https://api2.moxfield.com/v3/decks/all/{deckId}
```

La réponse contient `data.boards` avec trois clés : `mainboard`, `sideboard`, `commanders`. Le commandant est dans `boards.commanders.cards`. Explicite, aucune heuristique nécessaire.

```js
for (const boardName of ['mainboard', 'sideboard', 'commanders']) {
  const board = data.boards?.[boardName];
  // entry.card.name + entry.quantity
}
```

---

### 2. MTGGoldfish — DOM + endpoint téléchargement

**Fonctions :** `content.js` → `parseMtgGoldfish()` / `background.js` → `fetchMtgGoldfishDeck()`

**Via DOM (prioritaire) :**
- Le commandant est détecté via `tr.deck-category-header` dont le texte contient `"commander"`.
- Le reste des cartes est parsé depuis `#deck_input_deck` (hidden textarea format MTGO).

**Via `/deck/download/{id}` (fallback) :**
- Format texte MTGO brut — pas de section Commander, le commandant est dans `Sideboard`.
- → **Heuristique nécessaire** (voir section dédiée).

---

### 3. Archidekt — Next.js data + API REST

**Fonctions :** `content.js` → `parseArchidekt()` / `background.js` → `fetchArchidektDeck()`

**Via `__NEXT_DATA__` (prioritaire) :**
```js
const deckData = nextData?.props?.pageProps?.redux?.deck;
// entry.categories contient ["Commander"] pour le commandant
```

**Via API (fallback quand `_needsApiFetch: true`) :**
```
GET https://archidekt.com/api/decks/{id}/
```
Chaque carte a `entry.categories`. Si `"Commander"` est présent → `deck.commanders`. Explicite, pas d'heuristique.

---

### 4. mtgtop8 — DOM + téléchargement MTGO

**Fonctions :** `content.js` → `parseMtgTop8()` / `background.js` → `fetchMtgTop8Deck()`

**Via DOM (prioritaire) :**
- Les sections sont des `div.O14`. Si le texte est exactement `"COMMANDER"`, les `div.deck_line` suivants sont mappés vers `deck.commanders`.
- Les lignes sideboard ont un `id` préfixé `"sb"`.

**Via téléchargement MTGO (`/mtgo?d={deckId}`) :**
- Format texte brut avec séparateur `Sideboard`. Le commandant se retrouve dans le sideboard.
- → **Heuristique nécessaire** (voir section dédiée).

---

### 5. Magic-Ville — scraping HTML

**Fonction :** `background.js` → `fetchMagicVilleDeck()` (toujours via background, jamais via content script)

La page est en ISO-8859-1 et chargée avec `?decklanglocal=eng` pour forcer les noms anglais :

```js
const buf = await res.arrayBuffer();
const html = new TextDecoder('iso-8859-1').decode(buf);
```

Les sections sont des `<td class="O14" colspan="...">`. Le commandant est détecté si le header contient `"commandant"` ou `"commander"` :

```js
if (headerText.includes('commandant') || headerText.includes('commander')) {
  currentSection = 'commanders';
}
```

---

### 6. mtgdecks.net — textarea Arena

**Fonctions :** `content.js` → `parseMtgDecks()` / `background.js` → `fetchMtgDecksDeck()`

Les deux lisent `<textarea id="arena_deck">`. Format Arena :

```
Commander
1 Raffine, Scheming Seer

Deck
1 Thoughtseize
...

Sideboard
1 Grafdigger's Cage
```

Parsing par mots-clés `Commander` / `Deck` / `Sideboard` (case-insensitive). Les tags de set sont strippés : `"Thoughtseize (2XM) 97"` → `"Thoughtseize"`.

---

## Heuristique de fallback

Pour les sources sans section Commander explicite (MTGGoldfish download, mtgtop8 MTGO), une heuristique est appliquée dans `compare.js` → `fixCommanderHeuristic()` :

```js
// Pas de commanders + sideboard de 1-2 cartes + mainboard >= 90 → sideboard = commandant
if (cmdrCount === 0 && sideCount >= 1 && sideCount <= 2 && mainCount >= 90) {
  deck.commanders = { ...deck.sideboard };
  deck.sideboard = {};
}
```

Couvre le DC (1 commandant) et Commander classique (2 commandants en partner).

---

## Résumé

| Site | Commander explicite | Source principale | Heuristique |
|---|---|---|---|
| Moxfield | Oui (`boards.commanders`) | API REST | Non |
| MTGGoldfish | Oui via DOM | `content.js` | Oui (download fallback) |
| Archidekt | Oui (`categories`) | `__NEXT_DATA__` | Non |
| mtgtop8 | Oui via DOM | `content.js` | Oui (MTGO fallback) |
| Magic-Ville | Oui (header `O14`) | `background.js` scraping | Non |
| mtgdecks.net | Oui (Arena format) | `textarea#arena_deck` | Non |
