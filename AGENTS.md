# Deck Compare — notes pour agents

Extension navigateur (MV3 ; Chrome, Edge, Firefox) qui compare deux decklists Magic côte à côte
et analyse un **pool** de decks (la « comparaison croisée »). En dev, le navigateur charge le
dossier tel quel ; `npm run build` ne sert qu'à produire les paquets des stores. Tests :
`npm test` (node:test + jsdom ; `npm install` une fois pour jsdom).

## Règle de versioning (IMPORTANT)

`manifest.json` suit **`X.Y` pour une release, `X.Y.Z` pour un build de dev** :

- **Release** — `X.Y` (1.1, 1.2…) : la version publiée sur le Chrome Web Store, taguée `vX.Y`.
  `Y` avance d'un à chaque release ; `X` pour une release majeure/cassante.
- **Dev** — `X.Y.Z` entre deux releases : après la release `X.Y`, les builds de test se lisent
  `X.Y.1`, `X.Y.2`… **On bumpe `Z` à CHAQUE lot de modifs que l'utilisateur va tester dans le
  navigateur.** La release suivante repasse à deux chiffres (`X.(Y+1)`).
- Chrome compare composant par composant, un composant absent vaut 0 : `1.1` = 1.1.0 < `1.1.5`
  < `1.2`. Une release doit rester strictement supérieure à la version publiée précédente
  (`1.1` > `1.0.13`, OK).

L'état courant se lit dans l'environnement, pas ici : version dans `manifest.json`, releases
dans les tags git `vX.Y`, lot en cours en tête de `CHANGELOG.md` (« Non publié »).

**Couper une release `X.Y`** (fait quand les zips sont dans `dist/` et le tag sur `origin`) :

1. `manifest.json` → `"X.Y"` ; `CHANGELOG.md` : « Non publié » devient `[X.Y] — date`, avec son
   lien de comparaison en bas ; `store-listing.md` : note de version `vX.Y` FR et EN.
2. `npm test`, `npm run build`, puis `npx web-ext lint --source-dir dist/firefox` (0 erreur).
   Vérifier qu'aucun hôte **requis** n'a été ajouté depuis la release précédente
   (`git diff vX.(Y-1) -- manifest.json`).
3. Commit `chore(release): X.Y`, tag **léger** `vX.Y`, puis `git push origin main` **et**
   `git push origin vX.Y` : un tag léger ne part pas avec `--follow-tags`.
4. Les dépôts (Chrome Web Store, Edge Add-ons, addons.mozilla.org, Mac App Store) sont faits par
   l'utilisateur, avec `dist/deckcompare-X.Y-chrome.zip` (Chrome et Edge),
   `dist/deckcompare-X.Y-firefox.zip`, et pour Safari une archive Xcode du projet `safari/` (versions
   montées comme ci-dessus).

**Pourquoi bumper à chaque itération** : Chrome ne recharge PAS les content-scripts d'un onglet
déjà ouvert quand on recharge l'extension. Le numéro visible dans `chrome://extensions` est le
seul moyen sûr de vérifier que la nouvelle build est bien chargée. Bump systématique = debug
sans ambiguïté. (Un changement de version ne déclenche aucun re-consentement ; seuls les
changements de permissions le font.)

## Workflow de reload (à dire à l'utilisateur)

1. `chrome://extensions` → **Actualiser** → vérifier le **numéro de version**.
2. **Recharger l'onglet du site** (Cmd+R) : les content-scripts (`inject-button.js`,
   `inject-archetype.js`) ne se mettent à jour qu'au rechargement de la PAGE, pas de l'extension.
3. La page `pool.html` s'ouvre neuve à chaque fois → elle prend toujours le dernier code sans
   recharger d'onglet.

## Contraintes durables

- **Une source, un paquet par navigateur** : `npm run build` (`scripts/build.js`, sans dépendance)
  écrit `dist/chrome/`, `dist/firefox/`, `dist/safari/` et `dist/deckcompare-<version>-<cible>.zip` ; c'est
  désormais le paquet à déposer (le zip Chrome sert aussi à Edge/Brave/Opera/Vivaldi). Seul le
  manifest diffère par cible ; **le code source reste neutre** : pas de `if (isFirefox)` épars.
  Firefox : `background.scripts` (pas de service worker MV3) → `background.js` garde son
  `importScripts` derrière `typeof importScripts === 'function'` ; `browser_specific_settings.gecko`
  avec l'id **`deckcompare@mcouzinet.github.io` — permanent une fois publié sur AMO, ne jamais le
  changer** ; `strict_min_version` 128 (`optional_host_permissions`) ; déclaration
  `data_collection_permissions: none`. Sur Firefox MV3 les `host_permissions` sont optionnelles à
  l'installation → le popup montre « Autoriser Deck Compare sur les sites de decks »
  (`REQUIRED_ORIGINS` = host_permissions ∪ matches, un seul `permissions.request`) tant que
  `permissions.contains` est faux ; sur Chrome ce bouton ne s'affiche jamais. Le badge DEV est
  désactivé quand `browser_specific_settings` est présent : aucun install Firefox ni Safari n'a
  d'`update_url`. **Toute nouvelle cible hors Chrome doit donc porter `browser_specific_settings`**,
  sinon chaque utilisateur voit l'icône marquée DEV. Safari : `browser_specific_settings.safari`
  (`strict_min_version` 16.4, pour `scripting.registerContentScripts`) et une icône 1024 dans le
  manifest, dont le packager d'Apple tire l'icône App Store de l'app ; `optional_host_permissions`
  n'est pas documenté par Apple. L'app hôte Safari est le projet Xcode
  `safari/Deck Compare/Deck Compare.xcodeproj` : il **référence** `dist/safari/` (lancer
  `npm run build safari` avant d'archiver) et porte l'identifiant `io.github.mcouzinet.deckcompare`
  (définitif), l'équipe `6DTUA72PA3`, macOS 12 minimum, la catégorie Divertissement et le chiffrement
  exempté. À chaque release, `MARKETING_VERSION` et `CURRENT_PROJECT_VERSION` montent dans les deux
  cibles, app et extension. Modifier ce projet plutôt que le régénérer : le convertisseur d'Apple en
  mode macOS ignore l'identifiant demandé pour l'app, met la version 1.0, cible la version de macOS
  du SDK et omet la catégorie. L'envoi valide chaque `messages.json` : `appDescription` fait
  **112 caractères au plus** dans chaque langue (test à l'appui).
  Les avertissements `UNSAFE_VAR_ASSIGNMENT` du linter Mozilla sont les `innerHTML` échappés via
  `esc()`. Test réel sur Firefox : `web-ext run --args=-headless --args=--remote-debugging-port=9333`
  puis puppeteer en WebDriver BiDi (`installExtension` échoue sur Firefox 134).

- **Politique de confidentialité et réponses des stores suivent le code** : toute permission,
  donnée stockée ou requête réseau nouvelle se reporte dans `privacy-policy.html` (servie par
  GitHub Pages, liée par les trois stores) et dans la section « Privacy practices » de
  `store-listing.md`, dans le même commit.
- **Pas de permission requise ajoutée** sans prévenir : ça désactive l'extension pour tous les
  utilisateurs jusqu'à ré-acceptation. Nouveaux hôtes → `optional_host_permissions`. Ajouter un
  content-script sur un **path** d'un hôte **déjà permis** (ex. `mtgtop8.com/archetype*` alors que
  `www.mtgtop8.com/*` est déjà là) ne déclenche rien.
- **Deux sources partagées, pas plus** : `theme.css` porte le monde visuel des trois pages
  (popup, compare, pool) et `shared.js` la logique commune (normalisation, sites supportés, scan
  d'onglets…). Chaque page garde son propre `esc()`.
- **`deckDisplayName` (pool.js) reçoit deux formes de deck** : les decks du pool portent `name`,
  les références d'analyse portent `label` (posé par `pool-analyze.js` : `label: d.name || "Deck N"`).
  Il lit `label || name` ; n'en lire qu'un seul casse l'affichage de l'autre moitié des appels.
- **Deux boutons injectés** partagent le même langage visuel : `inject-button.js` (« Comparer »,
  formes flottant/inline/compact) et `inject-archetype.js` (« Comparer tous les decks »). Design
  actuel : **noir `#141414` + liseré `rgba(255,255,255,.18)` + icône deux-tons orange/teal**
  (le liseré est indispensable pour que le noir tienne sur les sites sombres type Moxfield). Le
  **panneau** qu'ouvre « Comparer » n'est pas « sur le site » : depuis 1.1.1 c'est une feuille du
  monde clair « Le mémo » (tokens de `theme.css` recopiés en dur dans le `<style>` du shadow root
  de `inject-button.js` — à garder synchrones ; pilule teal, rouge réservé à l'erreur).
  Ancrage : `mountWhenReady` attend la barre du site 8 s puis monte flottant ; depuis 1.1.8
  `watchForAnchor` continue d'observer 90 s après ce repli et **déplace le même host** dans la
  barre quand elle apparaît (Moxfield « Loading… » dépasse souvent les 8 s), sauf panneau ouvert.
- **Bouton injecté activé par défaut depuis 1.1** : clé `injectButton` absente = actif, seul
  `false` l'éteint (`Shared.injectEnabled` / `Shared.INJECT_KEY` — ne pas redéfinir ce défaut
  ailleurs). Moxfield et les jumeaux www/sans-www restent des `optional_host_permissions`
  demandées sur un clic (la case, ou « Autoriser le bouton sur Moxfield ») ; un refus ne
  décoche plus la case, il ne coûte que ces hôtes.
- **Sites derrière Cloudflare** (MTGGoldfish, mtgdecks, Magic-Ville) : le fetch du service
  worker part de `chrome-extension://…` (cross-site, sans Referer ni cookie de challenge) et
  se fait 403 « Just a moment… » quand Cloudflare durcit. Depuis 1.1.5, un **403 seul** est
  taggé `blocked` et `fetchDeckByUrl` rebascule sur un **onglet** (`deckFromTab` : celui déjà
  ouvert sur ce deck, sinon un onglet d'arrière-plan ouvert puis refermé) où le content-script
  lit le DOM. Ne pas élargir ce repli aux autres erreurs : un deck introuvable doit échouer vite.
- **MTGGoldfish `/archetype/<slug>`** = un deck complet avec le DOM d'une page `/deck/` (input
  `#deck_input_deck`, table, barre `ul.deck-action-menu`) : content-script déclaré sur ce path,
  entrée SUPPORTED_SITES dédiée (deckRe `/archetype/[^/?#]+`), et `fetchMtgGoldfishDeck` résout
  l'id numérique via le premier lien `/deck/<id>` de la page (`Parsers.mtggoldfishDeckId`, lien
  « Deck Page ») avant de télécharger ; 403 → repli onglet comme les pages `/deck/`.
- **mtgtop8** : la vue « visuelle » (cookie collant `mtgtop8_deck_display=visual`) n'a pas de
  `deck_line`/`L14` → `parseMtgTop8` renvoie vide → on pose `_needsApiFetch` (via la bascule
  « Switch to Text ») pour lire le deck via le fetch `/mtgo?d=` indépendant de la vue.
- **Cartes recto/verso** : la clé de comparaison est la face avant, mais le séparateur varie
  (`Life // Death` Moxfield vs `Life/Death` export MTGO mtgtop8) → `Shared.normalizeName` splitte
  sur `/` ou ` // `. Même tolérance dans `enrich.js:nameKeys`.
- **Tout ce que les exports accrochent au nom se nettoie dans `Shared.normalizeName`, nulle
  part ailleurs** (1.1.6) : code d'édition `[EOC]` / `(LTC) 284`, `*F*`, `[Catégorie]`,
  commentaire `#`, apostrophe typographique, espace insécable. Les parsers rendent le nom brut ;
  ne pas y remettre un `.replace()` local, c'est ce qui avait laissé passer `Dispatch [EOC]`
  (MTGGoldfish) alors que mtgdecks et le texte collé, eux, nettoyaient.
- **Casse** : `normalizeName` remet en casse de titre les noms **tout-minuscule ou tout-capitale**
  (une liste tapée à la main), et seulement ceux-là — toute source écrit la casse canonique, et
  la réécrire casserait `R&D's Secret Lair`. La comparaison reste sensible à la casse ailleurs.
- **HTML scrapé = entités à décoder** : `parsers.js:decodeEntities` gère le numérique (`&#x27;`
  Melee/ASP.NET, `&#39;` Magic-Ville) en plus des nommées. Les parsers DOM lisent `textContent`,
  déjà décodé — d'où le risque de divergence entre les deux chemins d'un même site. Depuis 1.1.4, **`Shared.normalizeDeck`** ré-indexe
  chaque deck à son entrée (background `fetchDeckByUrl`, `content.js`, `inject-button.js`, pool.js
  texte collé + restauration) : ne pas re-normaliser en aval, ne pas indexer des noms bruts.

## Où trouver quoi

- Lot en cours et historique des versions : `CHANGELOG.md`.
- Textes des fiches, réponses de confidentialité, médias : `store-listing.md` ; images dans `store/`.
- Icône : la source est `icons/icon.svg` ; les PNG 16/48/128 et `store/logo-300x300.png` en
  dérivent. La rendre avec Chrome (puppeteer) : ImageMagick rend ses dégradés faux.
- Avant de toucher à l'interface : `DESIGN.md` (le monde « Le mémo », tokens et règles nommées).
- Public, objectifs et principes du produit : `PRODUCT.md`.
