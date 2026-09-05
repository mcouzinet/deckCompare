# Deck Compare — notes pour agents

Extension Chrome (MV3) qui compare deux decklists Magic côte à côte + analyse un **pool** de
decks. Pas de build : Chrome charge le dossier tel quel. Tests : `npm test` (node:test + jsdom ;
`npm install` une fois pour jsdom).

## Règle de versioning (IMPORTANT)

`manifest.json` suit **`major.prod.dev`** :

- **major** — release majeure/cassante.
- **prod** — numéro de la ligne de production en cours. **Il n'avance d'un que lorsqu'on ouvre la
  ligne suivante après une publication sur le Chrome Web Store** ; la version publiée part telle
  quelle (1.0.13 en ligne → l'arbre passe à `1.1.<dev>`).
- **dev** — compteur d'itérations de dev. **On le bumpe à CHAQUE lot de modifs que l'utilisateur
  va tester dans le navigateur.**

État au 2026-09-05 : **`1.1.3`** dans l'arbre de travail (1.1.1 = `b7c4dbf`). La **1.0.13** est publiée sur le Chrome
Web Store (la v1.0.0 taguée le 2026-09-02 n'a jamais été mise en ligne) : c'est la baseline
permissions. La ligne suivante se lit `1.1.<dev>` (1.1.1, 1.1.2…) jusqu'à sa publication ;
`prod` avance d'un quand on ouvre une nouvelle ligne, pas au moment de la publication (la
1.0.13 est partie telle quelle).

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
- **mtgtop8** : la vue « visuelle » (cookie collant `mtgtop8_deck_display=visual`) n'a pas de
  `deck_line`/`L14` → `parseMtgTop8` renvoie vide → on pose `_needsApiFetch` (via la bascule
  « Switch to Text ») pour lire le deck via le fetch `/mtgo?d=` indépendant de la vue.
- **Cartes recto/verso** : la clé de comparaison est la face avant, mais le séparateur varie
  (`Life // Death` Moxfield vs `Life/Death` export MTGO mtgtop8) → `Shared.normalizeName` splitte
  sur `/` ou ` // `. Même tolérance dans `enrich.js:nameKeys`.

Voir `CHANGELOG.md` (section « Non publié ») pour le détail du lot en cours, et
`.claude/projects/.../memory/` pour l'historique de session.
