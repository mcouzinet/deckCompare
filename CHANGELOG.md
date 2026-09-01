# Journal des modifications

Toutes les modifications notables de **Deck Compare — MTG** sont consignées ici.
Le format s'inspire de [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
et le projet suit le [versionnage sémantique](https://semver.org/lang/fr/).

## [1.0.0] — 2026-09-01

### Ajouté
- **Bouton « Comparer » directement sur les sites de decks** — optionnel et **désactivé
  par défaut**, activable dans les Réglages du popup (icône ⚙️). Il s'insère dans la
  barre d'actions propre à chaque site, aux 8 endroits attendus :
  - Melee, à côté de *Visual View* ; Archidekt, à côté de *Playtester* ;
    getpaird, à côté de *Playtest* ; mtgtop8, à côté de *Switch to Visual* ;
    Magic-Ville, après *Proxies* ; mtgdecks, dans la barre d'onglets ;
    MTGGoldfish, près du titre ; Moxfield, en fin de barre du deck.
  - Il reprend la taille, l'alignement et l'espacement du bouton voisin, et bascule en
    version compacte au milieu d'un menu de liens texte.
  - Si un site refond son interface, le bouton revient en flottant : le placement est
    perdu, jamais la fonctionnalité.
- Le panneau ouvert par ce bouton s'identifie clairement comme **Deck Compare** et reprend
  la charte de l'extension.

### Modifié
- **Chargement des images de cartes nettement plus fiable et plus rapide.** Elles étaient
  récupérées une par une par le service worker puis converties en base64, faute de quoi la
  politique de sécurité les bloquait — d'où des lots séquentiels, un cache perdu à chaque
  rechargement et des images manquantes lorsque Scryfall limitait le débit. Elles sont
  désormais chargées directement, avec le cache du navigateur, en parallèle, et seulement
  quand elles arrivent à l'écran.
- Dans le popup, les **Réglages remplacent la vue principale** au lieu de s'y ajouter, ce
  qui rendait la fenêtre beaucoup trop haute.

### Sécurité et vie privée
- L'accès aux pages Moxfield et aux variantes www/sans-www est demandé **uniquement au
  moment où le bouton est activé**, et révoqué lorsqu'il est désactivé. Aucune permission
  supplémentaire n'est exigée à la mise à jour : les utilisateurs existants ne sont pas
  interrompus.
- Le proxy d'images interne, devenu inutile, a été supprimé.

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
