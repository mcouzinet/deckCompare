# Deck Compare — notes pour agents

Extension Chrome (MV3) qui compare deux decklists Magic côte à côte + analyse un **pool** de
decks. Pas de build : Chrome charge le dossier tel quel. Tests : `npm test` (node:test + jsdom ;
`npm install` une fois pour jsdom).

## Règle de versioning (IMPORTANT)

`manifest.json` suit **`major.prod.dev`** :

- **major** — release majeure/cassante.
- **prod** — numéro de la version de production. **Reste `0` tant que cette version prod n'est
  pas réellement publiée sur le Chrome Web Store.**
- **dev** — compteur d'itérations de dev. **On le bumpe à CHAQUE lot de modifs que l'utilisateur
  va tester dans le navigateur.**

État au 2026-09-03 : **`1.0.6`**. La v1.0.0 avait été taguée puis **annulée en prod** ; la vraie
1.0 sortira avec le lot de correctifs ci-dessous. Donc tant que rien n'est en prod, on lit
`1.0.<dev>` (prochaines : 1.0.7, 1.0.8…). Quand la vraie 1.0 est publiée, elle devient la
baseline prod.

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
  CTA rouge à l'intérieur du panneau compare reste rouge (il n'est pas « sur le site »).
- **mtgtop8** : la vue « visuelle » (cookie collant `mtgtop8_deck_display=visual`) n'a pas de
  `deck_line`/`L14` → `parseMtgTop8` renvoie vide → on pose `_needsApiFetch` (via la bascule
  « Switch to Text ») pour lire le deck via le fetch `/mtgo?d=` indépendant de la vue.
- **Cartes recto/verso** : la clé de comparaison est la face avant, mais le séparateur varie
  (`Life // Death` Moxfield vs `Life/Death` export MTGO mtgtop8) → `Shared.normalizeName` splitte
  sur `/` ou ` // `. Même tolérance dans `enrich.js:nameKeys`.

Voir `CHANGELOG.md` (section « Non publié ») pour le détail du lot en cours, et
`.claude/projects/.../memory/` pour l'historique de session.
