# Deck Compare — notes pour agents

Extension Chrome (MV3) qui compare deux decklists Magic côte à côte + analyse un **pool** de
decks. Pas de build : Chrome charge le dossier tel quel. Tests : `npm test` (node:test + jsdom ;
`npm install` une fois pour jsdom).

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

État au 2026-09-08 : **`1.1`** = release taguée `v1.1`, paquet `deckcompare-v1.1.zip` à déposer
sur le Web Store (fait par l'utilisateur). La **1.0.13** reste en ligne jusque-là ; la 1.1 n'ajoute
aucun hôte requis (baseline permissions inchangée). Le dev a repris à **`1.1.5`** (les
builds 1.1.1 → 1.1.4 ont précédé la release) ; la release suivante sera `1.2`, puis le dev
`1.2.1`, `1.2.2`…

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

- **Pas de permission requise ajoutée** sans prévenir : ça désactive l'extension pour tous les
  utilisateurs jusqu'à ré-acceptation. Nouveaux hôtes → `optional_host_permissions`. Ajouter un
  content-script sur un **path** d'un hôte **déjà permis** (ex. `mtgtop8.com/archetype*` alors que
  `www.mtgtop8.com/*` est déjà là) ne déclenche rien.
- **Pas de couche UI partagée** : popup / compare / pool ont chacun leur palette et leur `esc()`.
  `theme.css` centralise le monde visuel des pages ; `shared.js` centralise la logique
  (normalisation, sites supportés, scan d'onglets…).
- **`deckDisplayName` (pool.js) lit `d.label`**, PAS `d.name`. `label` est posé par
  **`pool-analyze.js`** (`label: d.name || "Deck N"`) sur les objets `analysis.decks` que le
  rendu affiche. Piège vécu cette session : le passer à `.name` casse tout l'affichage.
- **Deux boutons injectés** partagent le même langage visuel : `inject-button.js` (« Comparer »,
  formes flottant/inline/compact) et `inject-archetype.js` (« Comparer tous les decks »). Design
  actuel : **noir `#141414` + liseré `rgba(255,255,255,.18)` + icône deux-tons orange/teal**
  (le liseré est indispensable pour que le noir tienne sur les sites sombres type Moxfield). Le
  **panneau** qu'ouvre « Comparer » n'est pas « sur le site » : depuis 1.1.1 c'est une feuille du
  monde clair « Le mémo » (tokens de `theme.css` recopiés en dur dans le `<style>` du shadow root
  de `inject-button.js` — à garder synchrones ; pilule teal, rouge réservé à l'erreur).
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
- **mtgtop8** : la vue « visuelle » (cookie collant `mtgtop8_deck_display=visual`) n'a pas de
  `deck_line`/`L14` → `parseMtgTop8` renvoie vide → on pose `_needsApiFetch` (via la bascule
  « Switch to Text ») pour lire le deck via le fetch `/mtgo?d=` indépendant de la vue.
- **Cartes recto/verso** : la clé de comparaison est la face avant, mais le séparateur varie
  (`Life // Death` Moxfield vs `Life/Death` export MTGO mtgtop8) → `Shared.normalizeName` splitte
  sur `/` ou ` // `. Même tolérance dans `enrich.js:nameKeys`. Depuis 1.1.4, **`Shared.normalizeDeck`** ré-indexe
  chaque deck à son entrée (background `fetchDeckByUrl`, `content.js`, `inject-button.js`, pool.js
  texte collé + restauration) : ne pas re-normaliser en aval, ne pas indexer des noms bruts.

Voir `CHANGELOG.md` (section « Non publié ») pour le détail du lot en cours, et
`.claude/projects/.../memory/` pour l'historique de session.
