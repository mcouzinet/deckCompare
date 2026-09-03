# Journal des modifications

Toutes les modifications notables de **Deck Compare — MTG** sont consignées ici.
Le format s'inspire de [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/).
Les versions du manifeste suivent le schéma **`major.prod.dev`** (voir `CLAUDE.md`) : `prod`
reste à `0` tant que la version n'est pas publiée, `dev` est bumpé à chaque itération testée.

## [Non publié]

La v1.0.0 taguée le 2026-09-02 a été **annulée en production** ; la vraie 1.0 sortira avec ce
lot. Manifeste en cours : `1.0.10`. **56 tests verts. Aucune permission requise ajoutée.**

### Ajouté

- **Analyse d'un archétype mtgtop8 en un clic.** Sur une page archétype (`/archetype?…`), un
  bouton « Analyser tous les decks » récupère TOUTES les decklists de l'archétype (toutes les
  pages, max 100) et ouvre l'analyseur de pool pré-rempli. Le pool est **frais et éphémère** :
  il n'écrase pas le pool sauvegardé et disparaît à la fermeture de l'onglet. Chaque deck est
  nommé **« Pilote — Event »**.
- **Picker d'onglets ouverts dans l'analyseur de pool.** Un clic ajoute au pool un deck déjà
  ouvert dans un onglet (même détection que le popup).
- **Filtres par carte dans le pool.** Garder ou exclure les decks qui jouent une carte donnée.

### Modifié

- **Refonte visuelle « Le mémo »** des trois pages de l'extension (popup, comparaison, pool),
  inspirée d'un one-pager d'investissement : fond papier crème, encre chaude, feuilles blanches
  à filet, boutons en pilules, une seule couleur d'action (rouge profond), chiffres-clés et noms
  de decks en **Beleren** (la police des cartes, embarquée dans `fonts/`), interface en Archivo. **L'or disparaît** : l'accent ambre
  ne sert plus nulle part ; les couleurs deck 1 / deck 2 / commun deviennent orange brûlé, teal
  et vert profonds, lisibles sur fond clair (≥ 4,9:1). L'icône et le wordmark sont inchangés ;
  les boutons injectés sur les sites ne bougent pas. `theme.css` reste le seul monde partagé.
- **Aperçus de cartes rognés au vrai rayon de la carte** : certaines images Scryfall (JPG)
  remplissent l'extérieur des coins arrondis en blanc, qui dépassait des coins de 5–6 px.
- **Boutons injectés redessinés** : noir avec un fin liseré clair et l'icône deux-tons de
  l'extension (au lieu du rouge), lisibles aussi bien sur sites clairs que sombres.
- **Images de grille toujours en pleine résolution** (`normal`) : fini les cartes floues sur
  écran non-retina.
- **Analyseur de pool** : la liste de decks scrolle à l'intérieur du rail et la prévisualisation
  de carte reste toujours visible (un gros pool la poussait hors écran). Les decks affichent leur
  vrai nom au lieu de leur source.
- **Liste des onglets ouverts du popup** plafonnée (scroll au-delà de ~4 lignes).
- **Pastilles de couleur de l'analyseur de pool** : les cinq pastilles WUBRG utilisent désormais
  les vraies couleurs Magic (blanc ivoire, bleu, noir, rouge, vert) au lieu d'un violet
  approximatif pour le noir.

### Corrigé

- **Bouton mtgtop8 en vue « visuelle »** : il réapparaît et lit correctement le deck (le cookie
  de vue visuelle collant cassait la lecture et masquait le bouton).
- **Cartes recto/verso partagées entre sources** : `Life // Death` (Moxfield) et `Life/Death`
  (export MTGO mtgtop8) sont reconnues comme la même carte — plus de doublon dans les deux
  colonnes « unique ».

## [1.0.0] — 2026-09-02

Première version majeure. Elle apporte le bouton « Comparer » directement sur les sites de
decks, raccourcit nettement le chemin entre deux decklists et remplace l'identité visuelle
de l'extension. Aucune permission supplémentaire n'est exigée à la mise à jour.

### Refonte visuelle — « La table »

Le monde visuel a été remplacé, pas retouché. La surface est un tapis de jeu vu de dessus
sous une lumière unique : le fond est de la feutrine chaude, l'élévation est une vraie
ombre portée vers le bas, et une zone est sérigraphiée sur le tapis avec un filet et un
nom. L'icône, le wordmark et le codage orange/teal restent inchangés — le monde est
construit autour d'eux.

- **`theme.css`** : le monde vit dans un seul fichier lié par les trois pages. La palette
  était recopiée dans chacune, ce qui avait déjà produit deux tailles différentes pour les
  mêmes chips et une page figée en français.
- **Un seul composant bouton** (quatre variantes) remplace les neuf traitements inventés
  au fil de l'eau dans trois fichiers.
- **Plus aucune auréole** : les onze halos colorés à décalage nul ont disparu, remplacés
  par trois niveaux d'élévation et un d'enfoncement, tous issus d'une lumière zénithale
  unique. Le rouge d'action a été réchauffé pour partager cette lumière.
- **Des zones, plus des boîtes** : fin des panneaux imbriqués. Le score de similarité est
  estampé dans la feutrine au lieu d'être un cadran flottant.
- **Échelle typographique** : 18 tailles ad hoc, dont 76 déclarations sur 117 coincées
  entre 10 et 13 px, remplacées par une rampe nommée de 7 pas (11 → 34 px).
- Surfaces navigateur habillées : sélection, curseur, barres de défilement, anneau de
  focus, chiffres tabulaires.

### Ajouté

- **Bouton « Comparer » directement sur les sites de decks** — optionnel et **désactivé
  par défaut**, activable dans les Réglages du popup. Il s'insère dans la barre d'actions
  propre à chaque site, aux 8 endroits attendus : Melee à côté de *Visual View* ;
  Archidekt à côté de *Playtester* ; getpaird à côté de *Playtest* ; mtgtop8 à côté de
  *Switch to Visual* ; Magic-Ville après *Proxies* ; mtgdecks dans la barre d'onglets ;
  MTGGoldfish près du titre ; Moxfield en fin de barre du deck. Il reprend la taille,
  l'alignement et l'espacement du bouton voisin, et bascule en version compacte au milieu
  d'un menu de liens texte. Si un site refond son interface, le bouton revient en
  flottant : le placement est perdu, jamais la fonctionnalité.
- **Le deuxième deck se choisit en un clic** parmi les pages de deck déjà ouvertes dans la
  fenêtre. L'extension listait déjà les onglets et sait lire les 8 sites : plus besoin
  d'aller chercher une URL dans une autre barre d'adresse. Aucune autorisation nouvelle.
- **« Comparer un autre » et « Inverser les decks »** sur la page de résultats, qui était
  un cul-de-sac : changer de deck imposait de revenir sur un onglet et de tout recommencer,
  dans un nouvel onglet à chaque fois.
- Le deck détecté est **nommé** dans le popup, au lieu d'afficher « Détecté » deux fois.
- Navigation **au clavier** dans la liste de decks sauvegardés (flèches, Entrée, Échap).
- La densité d'affichage choisie sur la page de résultats est **mémorisée**.

### Modifié

- **Le résultat s'affiche immédiatement.** Il attendait un appel Scryfall purement
  cosmétique avant de rien montrer, sans limite de temps ; le diff et le score sont
  calculés en local et n'attendent plus rien.
- **Un seul champ pour le deuxième deck** : il accepte une URL **ou** filtre tes decks
  sauvegardés à la frappe, dans **toutes** les sources chargées. Le sélecteur de source,
  le second bouton Comparer et le bouton Recharger sont supprimés ; un bouton par service
  fait le choix et le chargement d'un seul geste.
- **Le filtre par zone recalcule les chiffres qu'il filtre.** « Réserve » pouvait afficher
  3 cartes sous un en-tête indiquant 24, avec un score inchangé.
- Les deux decks sont récupérés **en parallèle** au lieu de l'un après l'autre.
- L'aperçu d'une carte répond aussi au **clic et au clavier**, plus seulement au survol.
- **Chargement des images de cartes plus fiable et plus rapide.** Elles étaient récupérées
  une par une par le service worker puis converties en base64 ; elles sont désormais
  chargées directement depuis le CDN, avec le cache du navigateur, et seulement quand
  elles arrivent à l'écran.
- Dans le popup, les **Réglages remplacent la vue principale** au lieu de s'y ajouter.

### Corrigé

- **L'aperçu de carte se vidait après quelques survols.** Chaque survol appelait l'API
  Scryfall — pas le CDN — donc traverser une grille suffisait à se faire limiter, et un
  échec laissait le cadre vide pour de bon. Les URLs d'images sont désormais lues dans le
  lot déjà effectué pour les types de cartes.
- **Les cartes de la grille ne sont plus floues sur écran HiDPI.**
- **L'activation du bouton in-page n'échoue plus en silence** : l'autorisation est demandée
  avant d'être enregistrée, un refus décoche la case et l'explique, et les pages déjà
  ouvertes indiquent qu'un rechargement est nécessaire.
- **Contraste** : le bouton Comparer lui-même était sous le seuil WCAG AA (4,17:1), tout
  comme les 42 usages du gris le plus discret de la palette.
- Anneau de focus visible sur tous les contrôles, respect de `prefers-reduced-motion`,
  états ARIA sur les segmentés, région live sur les messages de statut, titres de page.
- La page d'analyse de pool n'est plus figée en français.
- Le lien « Configure ton compte » ouvre les Réglages au lieu d'être inerte.
- Le panneau du bouton in-page se ferme avec Échap ou un clic à l'extérieur.
- Plus de liseré blanc au bord du popup.

### Supprimé

- **Le panneau « Détail de la comparaison »** : ses 5 lignes étaient déjà toutes lisibles
  ailleurs sur la page. La colonne de diff récupère la largeur.
- Le proxy d'images interne, devenu inutile.

### Sécurité et vie privée

- L'accès aux pages Moxfield et aux variantes www/sans-www est demandé **uniquement au
  moment où le bouton est activé**, et révoqué lorsqu'il est désactivé. Aucune permission
  d'hôte supplémentaire n'est exigée à la mise à jour : les utilisateurs existants ne sont
  pas interrompus.


## [0.9.0] — 2026-08-31

### Ajouté
- Prise en charge de deux nouveaux sites, au même niveau que les six existants :
  **Melee** (`melee.gg`) et **getpaird** (`getpaird.io`). Les deux fonctionnent
  partout : collage d'URL, détection de l'onglet actif et analyseur de pool.
  - **Melee** — lecture des decklists rendues côté serveur (catégories
    Commandant / Créature / Terrain / Réserve / Compagnon).
  - **getpaird** — lecture du bloc JSON `_deckCards` intégré à la page.
- Récupération **sans cookie** pour les deux sites (HTTP 200 direct, sans Cloudflare) —
  plus simple que MTGGoldfish / mtgdecks.
- Nouveaux jeux de tests et fixtures pour les deux sites : **36 tests** au total
  (contre 30).

### Détails techniques
- L'extraction getpaird utilise un compteur d'accolades tenant compte des chaînes,
  afin que les symboles de mana comme `{C};` présents dans le texte des cartes ne
  tronquent pas le JSON.
- Le parseur DOM getpaird lit le contenu du `<script>` intégré (la variable globale
  de la page est hors d'atteinte depuis le monde isolé du script de contenu).

### À noter
- Les cartes recto-verso de Melee utilisent le nom complet
  (`Face avant // Face arrière`). Une comparaison entre sites n'est fiable que si
  les deux listes suivent la même convention de nommage.

## [0.8.0] — 2026-08-12

### Corrigé
- Parseur **Magic-Ville** : prise en charge des attributs HTML non quotés
  (`id=aff_texte`), des lignes de cartes sur plusieurs lignes et des en-têtes O14,
  qui cassaient l'ancien parseur.

### Ajouté
- Harnais de test complet des parseurs (`parsers.js` / `dom-parsers.js` en double
  mode, testables sous Node) pour les six sites — garde-fou anti-régression.
- Garde « aucune carte » : une page sans carte renvoie une erreur explicite au lieu
  d'une comparaison vide.

## [0.7.0] — 2026-08-09

### Corrigé
- Récupération derrière Cloudflare (MTGGoldfish, mtgdecks) via
  `credentials:'include'`, avec un message d'erreur explicite en cas de 403.

### Ajouté
- Caches Scryfall persistants ; le pool est conservé entre les sessions ; nouvelle
  tentative automatique côté Scryfall.
- Premiers tests unitaires.

## [0.6.0] — 2026-07-02

### Modifié
- Internationalisation de l'analyseur de pool, heuristique de commandant partagée et
  suppression de code mort.

## [0.5.0] — 2026-06-21

### Modifié
- Migration vers l'API native d'internationalisation de Chrome.

## [0.4.0] — 2026-06-21

### Ajouté
- Séparation des créatures, vue en liste, cartes plus grandes et nettoyage de code.

[1.0.0]: https://github.com/mcouzinet/deckCompare/compare/v0.9.0...v1.0.0
[0.9.0]: https://github.com/mcouzinet/deckCompare/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/mcouzinet/deckCompare/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/mcouzinet/deckCompare/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/mcouzinet/deckCompare/compare/v0.4.0...v0.6.0
[0.4.0]: https://github.com/mcouzinet/deckCompare/releases/tag/v0.4.0
