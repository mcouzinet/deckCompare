# Journal des modifications

Toutes les modifications notables de **Deck Compare — MTG** sont consignées ici.
Le format s'inspire de [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/).
Les versions du manifeste suivent le schéma **`major.prod.dev`** (voir `CLAUDE.md`) : `prod`
avance d'un quand on ouvre la ligne qui suit une publication sur le Web Store, jamais au moment
de publier (1.0.13 partie telle quelle → la suivante se lit `1.1.<dev>`) ; `dev` est bumpé à
chaque itération testée.

## [Non publié]

### Ajouté

- **Comparaison croisée : « cartes en commun » et « cartes distinctes » se copient d'un clic.**
  Les deux chiffres-clés de l'en-tête sont désormais des boutons : un clic met la liste
  correspondante dans le presse-papiers (un nom par ligne, comme les boutons « Copier » des
  sections) et le libellé confirme « copié ! » un instant — annoncé aussi aux lecteurs
  d'écran. Le libellé souligné au survol et l'infobulle signalent l'action ; à zéro, le
  chiffre reste un simple texte (rien à copier).

### Modifié

- **Le bouton « Comparer » sur les sites de decks est activé par défaut.** Il n'apparaissait
  qu'après avoir coché un réglage que rien ne signalait, au point de passer pour un bug. Il
  est désormais là dès l'installation sur les sites dont l'extension lit déjà les pages, et
  le réglage sert à le retirer. Moxfield et les variantes sans www demandent une autorisation
  que Chrome n'accorde que sur un clic : elle se donne depuis les Réglages (« Autoriser le
  bouton sur Moxfield »), ou depuis le popup ouvert sur l'un de ces sites (« Autoriser le
  bouton sur ce site ») ; refuser ne coûte que ces sites, plus tout le bouton comme avant. À la
  mise à jour depuis une 1.0.x, le réglage est remis à zéro pour tout le monde : en 1.0.13 un
  simple refus de l'autorisation Moxfield décochait la case, et ce faux « non » ne se distingue
  pas d'un vrai ; le bouton se retire de nouveau en un clic dans les Réglages.
- **Le panneau « Comparer » injecté sur les sites passe au monde clair « Le mémo ».** Il
  gardait le fond noir et le CTA rouge de l'ancienne interface : désormais papier crème, encre
  chaude, wordmark orange/teal, libellé « Comparer ce deck » en teal avec sa pastille, champs en
  feuilles blanches à filet, pilule teal « Comparer → » (le rouge ne reste que pour l'erreur).
  Le bouton noir posé sur le site ne change pas.
- **« + Ajouter des decks » rejoint l'en-tête du panneau « Decks comparés »**, en petite pilule
  à droite, le compteur venant se coller au titre. La barre pointillée pleine largeur en tête de
  colonne était le reste du formulaire qui se dépliait là ; depuis qu'il s'ouvre en popin,
  l'action vit avec la liste qu'elle alimente, toujours visible dans le rail, et le commandant
  remonte en haut de la page. À la fermeture de la popin, le focus revient sur la pilule.

### Corrigé

- **Panneau « Comparer » injecté** : à la première ouverture, il se plaçait avant que la liste
  des decks enregistrés n'ajoute son champ et pouvait recouvrir le bouton flottant ; il se
  replace une fois la liste chargée. Les polices web qu'il nommait (impossibles à charger
  depuis un content-script) laissent place à la police système, palette du mémo conservée.
- **Comparaison croisée** : deux copies rapprochées des stats n'étaient annoncées qu'une fois
  aux lecteurs d'écran, et la première coupait l'annonce de la seconde.
- **Popup** : « Autoriser le bouton sur Moxfield » s'affichait aussi sur mtgtop8, MTGGoldfish,
  Magic-Ville et mtgdecks sans www. L'offre dit désormais « sur ce site », ne demande que
  l'hôte de l'onglet courant (la fenêtre Chrome ne liste plus que ce site), n'apparaît que si
  cet hôte manque vraiment (vérification origine par origine) et le refus parle de « ces
  sites ». Le réglage, lui, demande toujours tous les hôtes optionnels d'un coup.

## [1.0.13] — 2026-09-03

Première version mise en ligne sur le Chrome Web Store depuis la **0.9.0** (en ligne le
2026-09-05). La v1.0.0, taguée le 2026-09-02, avait été annulée avant publication : son contenu
est repris ici, relu à l'aune de ce qui a changé depuis, pour que cette entrée décrive ce qu'un
utilisateur de la 0.9 découvre réellement. **Aucune permission d'hôte requise ajoutée** : seule
l'API `scripting`, qui n'affiche aucun avertissement à la mise à jour ; les hôtes
supplémentaires du bouton in-page sont optionnels et demandés à l'activation (voir *Sécurité et
vie privée*).

### Refonte visuelle — « Le mémo »

Le monde visuel a été remplacé, pas retouché. Les trois pages (popup, comparaison, comparaison
croisée) se lisent comme un one-pager sur papier crème, en plein jour : encre chaude, feuilles
blanches à filet posées sur le papier, boutons en pilules, chiffres-clés et noms de decks en
**Beleren** (la police des cartes, embarquée dans `fonts/`), interface en Archivo. L'icône et
le wordmark sont inchangés ; le monde est construit autour d'eux.

- **Les deux encres du logo font le travail de l'interface** : le teal pour tout ce qu'on
  presse, choisit ou focalise (pilule principale, segment sélectionné, anneau de focus, cases à
  cocher), l'orange pour le commandant et les graphiques ; le rouge ne reste que pour l'alarme
  (erreurs, écarts de quantité, exclusions).
- **L'or disparaît** : l'accent ambre ne sert plus nulle part hors de l'icône. Les couleurs
  deck 1 / deck 2 / commun deviennent orange brûlé, teal et vert profonds, lisibles sur fond
  clair (≥ 4,9:1), et n'apparaissent que sur ce qu'elles désignent — un nom, un compte, un
  segment de barre.
- **`theme.css`** : le monde vit dans un seul fichier lié par les trois pages. La palette
  était recopiée dans chacune, ce qui avait déjà produit deux tailles différentes pour les
  mêmes chips et une page figée en français.
- **Un seul composant bouton** (quatre variantes) remplace les neuf traitements inventés au
  fil de l'eau dans trois fichiers.
- **Plus aucune auréole** : les onze halos colorés à décalage nul ont disparu, remplacés par
  trois niveaux d'élévation et un d'enfoncement, tous issus d'une lumière zénithale unique —
  rien ne brille, rien ne floute, rien n'est embossé.
- **Des feuilles, plus des boîtes** : fin des panneaux imbriqués. Une feuille repose sur le
  papier, jamais sur une autre feuille ; les lignes d'une liste sont séparées par des filets.
- **Échelle typographique** : 18 tailles ad hoc, dont 76 déclarations sur 117 coincées entre
  10 et 13 px, remplacées par une rampe nommée de huit pas (11 → 56 px).
- Surfaces navigateur habillées : sélection, curseur, barres de défilement, anneau de focus,
  chiffres tabulaires.
- **Boutons injectés sur les sites** : noir avec un fin liseré clair et l'icône deux-tons de
  l'extension, lisibles aussi bien sur sites clairs que sombres.

### Ajouté

- **Bouton « Comparer » directement sur les sites de decks** — optionnel et **désactivé par
  défaut**, activable dans les Réglages du popup. Il s'insère dans la barre d'actions propre à
  chaque site, aux 8 endroits attendus : Melee à côté de *Visual View* ; Archidekt à côté de
  *More* (groupe Clone deck / More) ; getpaird à côté de *Playtest* ; mtgtop8 à côté de
  *Switch to Visual* ; Magic-Ville après *Proxies* ; mtgdecks dans la barre d'onglets ;
  MTGGoldfish près du titre ; Moxfield en fin de barre du deck. Il reprend la taille,
  l'alignement et l'espacement du bouton voisin, et bascule en version compacte au milieu d'un
  menu de liens texte. Si un site refond son interface, le bouton revient en flottant : le
  placement est perdu, jamais la fonctionnalité.
- **Analyse d'un archétype mtgtop8 en un clic.** Sur une page archétype (`/archetype?…`), un
  bouton « Comparer tous les decks » récupère TOUTES les decklists de l'archétype (toutes les
  pages, max 100) et ouvre la comparaison croisée pré-remplie, titrée du nom de l'archétype
  (« Slivers »). Le pool est **frais et éphémère** : il n'écrase pas le pool sauvegardé et
  disparaît à la fermeture de l'onglet. Chaque deck est nommé **« Pilote — Event »**.
- **Le deuxième deck se choisit en un clic** parmi les pages de deck déjà ouvertes dans la
  fenêtre. L'extension listait déjà les onglets et sait lire les 8 sites : plus besoin d'aller
  chercher une URL dans une autre barre d'adresse. Aucune autorisation nouvelle. Le même
  sélecteur d'onglets existe dans la comparaison croisée pour ajouter un deck au pool.
- **« Comparer un autre » et « Inverser les decks »** sur la page de résultats, qui était un
  cul-de-sac : changer de deck imposait de revenir sur un onglet et de tout recommencer, dans
  un nouvel onglet à chaque fois.
- **Filtres par carte dans la comparaison croisée** : garder ou exclure les decks qui jouent
  une carte donnée.
- **« + Ajouter des decks » s'ouvre en popin** (fond assombri, boîte centrée, fermeture par la
  croix, un clic hors de la boîte ou Échap) au lieu de se déplier en ligne en haut de page —
  repérable même en étant scrollé loin dans l'analyse.
- Le deck détecté est **nommé** dans le popup, au lieu d'afficher « Détecté » deux fois.
- Navigation **au clavier** dans la liste de decks sauvegardés (flèches, Entrée, Échap).
- La densité d'affichage choisie sur la page de résultats est **mémorisée**.

### Modifié

- **« Analyse de pool » devient « Comparaison croisée »** (EN : Cross-compare) : « pool »
  désigne un pool de scellé en Magic ; le nouveau nom prolonge la marque (Compare à deux,
  croisée à N). Entrée du popup, en-tête de la page, bouton archétype mtgtop8, README et fiche
  Store suivent.
- **Comparaison croisée sans commandant** : pour un format à 60 cartes, le héros montre la
  carte la plus jouée (hors terrains) avec son image, et les couleurs du consensus remplacent
  celles du commandant ; le libellé « Commandant » disparaît.
- **Le résultat s'affiche immédiatement.** Il attendait un appel Scryfall purement cosmétique
  avant de rien montrer, sans limite de temps ; le diff et le score sont calculés en local et
  n'attendent plus rien.
- **Un seul champ pour le deuxième deck** : il accepte une URL **ou** filtre tes decks
  sauvegardés à la frappe, dans **toutes** les sources chargées. Le sélecteur de source, le
  second bouton Comparer et le bouton Recharger sont supprimés ; un bouton par service fait le
  choix et le chargement d'un seul geste.
- **Le filtre par zone recalcule les chiffres qu'il filtre.** « Réserve » pouvait afficher
  3 cartes sous un en-tête indiquant 24, avec un score inchangé.
- Les deux decks sont récupérés **en parallèle** au lieu de l'un après l'autre.
- L'aperçu d'une carte répond aussi au **clic et au clavier**, plus seulement au survol.
- **Chargement des images de cartes plus fiable et plus rapide.** Elles étaient récupérées une
  par une par le service worker puis converties en base64 ; elles sont désormais chargées
  directement depuis le CDN, avec le cache du navigateur, et seulement quand elles arrivent à
  l'écran.
- **Images de grille toujours en pleine résolution** (`normal`) : nettes sur tous les écrans,
  HiDPI comme non-retina.
- **Aperçus de cartes rognés au vrai rayon de la carte** : certaines images Scryfall (JPG)
  remplissent l'extérieur des coins arrondis en blanc, qui dépassait des coins de 5–6 px.
- Dans le popup, les **Réglages remplacent la vue principale** au lieu de s'y ajouter.
- **Comparaison croisée** : la liste de decks scrolle à l'intérieur du rail et la
  prévisualisation de carte reste toujours visible (un gros pool la poussait hors écran). Les
  decks affichent leur vrai nom au lieu de leur source.
- **Liste des onglets ouverts du popup** plafonnée (scroll au-delà de ~4 lignes).
- **Pastilles de couleur de la comparaison croisée** : les cinq pastilles WUBRG utilisent
  désormais les vraies couleurs Magic (blanc ivoire, bleu, noir, rouge, vert) au lieu d'un
  violet approximatif pour le noir.

### Corrigé

- **L'aperçu de carte se vidait après quelques survols.** Chaque survol appelait l'API
  Scryfall — pas le CDN — donc traverser une grille suffisait à se faire limiter, et un échec
  laissait le cadre vide pour de bon. Les URLs d'images sont désormais lues dans le lot déjà
  effectué pour les types de cartes.
- **Erreur « Erreur Magic-Ville: 403 » à la comparaison.** Magic-Ville rejette désormais les
  requêtes sans cookie (même protection anti-bot que MTGGoldfish/mtgdecks) ; la récupération du
  deck et la liste des decks d'un joueur passent en `credentials:'include'` pour envoyer le
  cookie de session, avec un message d'erreur explicite (`errMagicVilleBlocked`) si le 403
  persiste malgré tout.
- **Bouton mtgtop8 en vue « visuelle »** : il réapparaît et lit correctement le deck (le cookie
  de vue visuelle collant cassait la lecture et masquait le bouton).
- **Cartes recto/verso partagées entre sources** : `Life // Death` (Moxfield) et `Life/Death`
  (export MTGO mtgtop8) sont reconnues comme la même carte — plus de doublon dans les deux
  colonnes « unique ».
- **« Extension context invalidated » sur les boutons injectés** : après un rechargement de
  l'extension, l'ancien script restait actif dans l'onglet et levait une erreur au clic. Les
  deux boutons détectent le contexte perdu, ne touchent plus aux API `chrome.*`, et le bouton
  archétype affiche « Recharge la page pour utiliser ce bouton ».
- **L'activation du bouton in-page n'échoue plus en silence** : l'autorisation est demandée
  avant d'être enregistrée, un refus décoche la case et l'explique, et les pages déjà ouvertes
  indiquent qu'un rechargement est nécessaire.
- **Contraste** : le bouton Comparer de la 0.9 était sous le seuil WCAG AA (4,17:1), tout
  comme les 42 usages du gris le plus discret de son ancienne palette.
- Anneau de focus visible sur tous les contrôles, respect de `prefers-reduced-motion`, états
  ARIA sur les segmentés, région live sur les messages de statut, titres de page.
- La comparaison croisée n'est plus figée en français.
- Le lien « Configure ton compte » ouvre les Réglages au lieu d'être inerte.
- Le panneau du bouton in-page se ferme avec Échap ou un clic à l'extérieur.
- Plus de liseré blanc au bord du popup.

### Supprimé

- **Le panneau « Détail de la comparaison »** : ses 5 lignes étaient déjà toutes lisibles
  ailleurs sur la page. La colonne de diff récupère la largeur.
- Le proxy d'images interne, devenu inutile.

### Sécurité et vie privée

- L'accès aux pages Moxfield et aux variantes www/sans-www est demandé **uniquement au moment
  où le bouton est activé**, et révoqué lorsqu'il est désactivé (`optional_host_permissions`).
  Aucune permission d'hôte supplémentaire n'est exigée à la mise à jour : les utilisateurs de
  la 0.9 ne sont pas interrompus.
- Toujours aucun compte, aucune connexion, aucune donnée collectée ; tout s'exécute
  localement.

### Détails techniques

- **58 tests** (contre 36 en 0.9.0) : la logique partagée (`shared.js` — normalisation des
  noms, sites supportés, scan d'onglets), l'analyse croisée (`pool-analyze.js`) et
  l'enrichissement Scryfall (`enrich.js`) rejoignent les parseurs sous harnais.

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

[Non publié]: https://github.com/mcouzinet/deckCompare/compare/v1.0.13...HEAD
[1.0.13]: https://github.com/mcouzinet/deckCompare/compare/v0.9.0...v1.0.13
[0.9.0]: https://github.com/mcouzinet/deckCompare/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/mcouzinet/deckCompare/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/mcouzinet/deckCompare/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/mcouzinet/deckCompare/compare/v0.4.0...v0.6.0
[0.4.0]: https://github.com/mcouzinet/deckCompare/releases/tag/v0.4.0
