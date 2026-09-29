# Journal des modifications

Toutes les modifications notables de **Deck Compare — MTG** sont consignées ici.
Le format s'inspire de [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/).
Les releases sont numérotées **`X.Y`** (1.1, 1.2…) et taguées `vX.Y` ; entre deux releases, les
builds de dev se lisent **`X.Y.Z`** (1.1.5, 1.1.6… après la 1.1), `Z` bumpé à chaque itération
testée (voir `AGENTS.md`).

## [1.3] - 2026-09-29

Quatrième version publiée sur le Chrome Web Store, deuxième sur Edge Add-ons et addons.mozilla.org,
quatre builds de dev après la 1.2 (1.2.1 → 1.2.4). **Aucune permission requise ajoutée** : ManaBox
(`manabox.app`, `www.manabox.app`) entre dans les hôtes optionnels, demandés sur un clic, et le CSP
perd les hôtes de Google Fonts, les polices étant désormais embarquées.

### Ajouté

- **Ma liste face aux decks** (comparaison croisée). « Comparer ma liste » (à côté des vues) prend
  un lien, un deck de tes decks enregistrés ou une liste collée : elle reste à part, aucun chiffre
  de la comparaison ne la compte, et un lien vers un deck déjà présent épingle celui-ci au lieu de
  le dupliquer. Un bandeau sous le commandant la mesure à l'ensemble : similarité à la decklist
  moyenne (la formule de la page de résultats), part de ses cartes dans le consensus (« 58/99 »,
  avec celle du deck médian), cartes en commun jouées, manques du consensus et cartes peu jouées
  ailleurs (et signale une liste menée par un autre commandant) ; ces deux derniers chiffres
  ouvrent la vue « Écarts seulement », qui liste aussi les
  cartes du consensus jouées en un autre nombre d'exemplaires. Dans les listes, un point orange
  marque les cartes qu'elle joue, « toi ×2 » son nombre d'exemplaires quand il diffère de la
  moyenne, « manque » une carte du consensus absente ; le reste passe en retrait, et les outils de
  chaque ligne (copier, garder, écarter) attendent le survol ou le focus. Des liens
  l'ouvrent sur la page de résultats (même pourcentage que le bandeau) : « Face à la decklist
  moyenne », « Face au plus proche » (le deck du lot qui lui ressemble le plus) et, pour un deck
  épinglé, « Face à ma liste ». Ma liste est gardée en local, à part du pool ; venue d'un lien,
  « Relire la liste » la relit sur sa page après une modification. Depuis le popup, sur
  une page de deck qui n'y est pas encore et avec une comparaison croisée enregistrée, « Ce deck
  face aux N decks » (suivi de leur commandant) l'y envoie directement comme ma liste.
- **Un deck du pool mis en avant** : survoler une ligne du rail (ou y mettre le focus) montre ce
  deck de la même façon, bandeau compris, et son nombre de cartes du consensus ; un clic
  l'épingle comme référence. Il est alors mesuré aux autres decks, pas à un pool qui le
  contient. Au clavier, les flèches haut et bas parcourent les decks de la même façon. La page du
  deck s'ouvre désormais par la flèche de la ligne. Sous 1000 px de large, la liste des decks
  reste affichée, compacte, au-dessus des résultats (elle disparaissait avec le rail).
- **ManaBox** (manabox.app), neuvième site : le bouton « Comparer » dans la barre d'actions du
  deck, après « Download », la détection de l'onglet actif et le collage d'URL. Le deck est
  toujours lu depuis sa page, l'onglet déjà ouvert ou un onglet d'arrière-plan ouvert puis
  refermé, jamais par une requête de l'extension. L'accès au site est **optionnel** (aucune
  permission requise ajoutée) : le popup lit sans lui le deck de l'onglet ManaBox ouvert, et un
  lien ManaBox (deck 2, page de résultats, comparaison croisée) le demande au clic qui le lit,
  une fois pour toutes. « Autoriser le bouton sur ce site » dans le popup d'un onglet ManaBox, ou
  « Autoriser le bouton sur Moxfield et ManaBox » dans les réglages, le donnent aussi. Refusé, un
  lien ManaBox reste illisible, avec un message qui dit comment l'autoriser.
- **Paquet Safari** (`npm run build safari`), pour le packager d'extensions Safari d'Apple (App
  Store Connect ou Xcode). Il porte `browser_specific_settings.safari`, sans quoi chaque install
  Safari aurait affiché le badge DEV (aucune n'a d'`update_url`), et une icône 1024 px tirée de
  `icons/icon.svg`, dont Apple fabrique l'icône de l'app : sinon, notre 128 px agrandie huit fois.
  Safari 16.4 minimum. L'app macOS qui l'embarque est le projet Xcode de `safari/`, qui référence
  `dist/safari/` au lieu d'en copier le code : identifiant `io.github.mcouzinet.deckcompare`,
  macOS 12 minimum, catégorie Divertissement, chiffrement exempté déclaré.
- **Copier une liste depuis la page de résultats** : le compteur de chaque zone (« Unique à … »
  des deux côtés, « Cartes en commun ») copie ses cartes visibles, une par ligne au format
  « 1 Nom », celui qu'importent les éditeurs de decks ; le filtre de board décide de ce qui part.
- **Le panneau « Comparer » des sites propose les onglets de deck ouverts** (toutes les fenêtres,
  la sienne d'abord) : un clic lance la comparaison, sans copier d'adresse. Le popup les cherche
  aussi dans toutes les fenêtres, pour deux decks ouverts côte à côte, et le menu « Comparer un
  autre » de la page de résultats les propose à son tour (hors les deux decks affichés), sous un
  intitulé qui dit quel deck il remplace (« Remplacer « … » par »).
- **README** : lien d'installation Firefox (la fiche addons.mozilla.org est publique depuis le
  27 septembre) et copie des listes.
- **Licence MIT** (`LICENSE`). La police Beleren et les extraits de pages des fixtures de test
  n'en relèvent pas ; le README le précise, avec la mention Fan Content de Wizards.

### Modifié

- **Comparaison croisée accessible** : chaque case à cocher des listes porte le nom de sa carte
  pour les lecteurs d'écran, et l'indice « Survole une carte » passe au contraste AA. Un audit axe
  (WCAG A et AA) ne relève plus aucune violation, liste épinglée, écarts ou popin ouverte.
- **Page de résultats** : un nom de deck long tient en deux lignes (le nom entier au survol) et
  les deux côtés s'alignent par le bas ; les en-têtes « Unique à … » et la légende de la barre
  tiennent sur une ligne ; chaque entrée de la légende mène à ses cartes (la table commune est à
  plus de 11 000 px sous deux grilles de 100 cartes). Le pourcentage dit ce qu'il compte (« 25
  cartes en commun sur 100 »). Un côté ou la table commune vidé par la paire ou par un filtre
  l'écrit (« Aucune carte exclusive », « Aucune carte en commun ») au lieu de rester blanc, « 0
  écart de quantité » ne porte plus le point rouge pour rien, et sans comparaison « Inverser » et
  « Comparer un autre » disparaissent. Tant qu'aucune carte n'est tenue, la feuille de droite se
  replie sur son indice (« Survole une carte pour la voir en grand ») au lieu d'un grand cadre
  vide. L'onglet porte le nom des deux decks (« A contre B · Deck Compare ») au lieu du même
  titre anglais pour chaque comparaison ouverte.
- **Page de résultats, suite** : sous 1080 px de large (fenêtres côte à côte), la carte survolée
  flotte dans le coin de l'écran au lieu de s'afficher sous les deux grilles, des milliers de
  pixels plus bas ; elle se range quand le pointeur ou le focus quitte les cartes, sur Échap ou
  sur un clic ailleurs. « Cartes » compte partout les exemplaires, comme la ligne sous le
  pourcentage : la légende lit « 29 cartes · 21 distinctes », ou « 25 cartes » quand les deux
  comptes sont égaux (decks singleton), au lieu de « 29 exemplaires · 21 cartes » juste sous « 29
  cartes en commun ». Un filtre de board le dit sous le pourcentage (« similaire ·
  Commandants ») : « 100 % » sur le seul commandant se lisait comme deux decks identiques. « N
  écarts de quantité » devient un bouton qui ne garde que ces lignes dans la table commune.
  Pluriels corrigés partout (« 0 carte », « 1 carte en commun » sur la comparaison croisée). Le
  nom du deck 2, aligné à droite, garde ses points de suspension quand il est coupé. Sous 760 px,
  le bouton café ne garde que sa tasse et les deux actions tiennent sur la ligne du haut.
- **Page de résultats, grille et barre** : la grille par défaut montre au moins trois cartes par
  côté à toute largeur (125 px à partir de 1280 px), au lieu de deux de 192 px à partir de 1440
  (et trois à 1366 : la taille sautait avec la fenêtre) ; la table commune remonte de 11 500 à 5
  450 px avec deux decks de 100 cartes, et la carte survolée reste là pour lire le texte. La vue
  compacte en montre toujours une de plus par côté (quatre à 1440). La barre de recouvrement
  compte enfin les exemplaires en surnombre (10 Forest contre 6) : un segment plus clair du côté
  concerné et une entrée « En surnombre » dans la légende, qui mène aux seuls écarts de la table
  commune ; chaque côté tombe juste (68 + 7 + 25 = 100 au lieu de 93). Sous 1000 px, la légende
  passe à la ligne au lieu de couper les noms. La carte flottante (sous 1080 px) se place dans le
  coin opposé à la carte ou à la ligne montrée, pour ne jamais la cacher, et ses pastilles de deck
  tiennent sur une ligne. Une carte survolée avant la réponse de Scryfall s'affiche à l'arrivée
  des images ; une carte sans image chez Scryfall le dit (« Pas d'image pour cette carte ») au
  lieu de relancer l'API pour un 404 certain ; un filtre de board range la carte tenue qu'il
  masque, nom compris. Le filtre des écarts dit comment l'enlever (« 3 écarts de quantité · tout
  afficher »), prend l'encre d'action quand il est actif et se relâche quand « Comparer un autre »
  change de paire. L'onglet met le deck 2 en premier (« B contre A »), celui qui change d'un
  onglet à l'autre ; sans comparaison, il s'appelle simplement Deck Compare.
- **Popup** : le nom du deck détecté tient en deux lignes et perd le badge « Détecté » une fois lu
  (en attendant, le titre de l'onglet remplace le mot « Détecté » répété deux fois). La liste des
  decks enregistrés ne s'ouvre plus d'elle-même à l'ouverture (un clic, la frappe ou ↓ l'ouvrent)
  et prend toute la largeur du popup. Les messages (lecture, erreur) s'affichent sous le champ,
  plus sous les entrées de comparaison croisée, que voici réunies en un seul bloc. Les onglets de deck
  ouverts s'affichent par le nom du deck, sans ce que le site ajoute autour (« • (Altruism Commander
  deck) • Archidekt », « Deck for Magic: the Gathering »), sur deux lignes et sans la puce du site
  quand tous viennent du même ; la liste, comptée (« Tes onglets de deck ouverts (4) »), s'arrête à
  deux lignes et demie, et l'invitation à configurer son compte devient une ligne de texte (qui
  ouvre les réglages) qu'un message d'état remplace, pour tenir sous le plafond de 600 px de
  Chrome. Un message des réglages ne reste plus sous le champ une fois ceux-ci fermés, et le
  compte chargé lit « 1 deck ».
- **Panneau « Comparer » des sites** : titré « Deck 2 · Comparer avec », il nomme le site qu'il lit
  (« Lecture du deck depuis Archidekt… »). Sa racine shadow est désormais **fermée** : les scripts
  du site hôte ne peuvent plus lire ce qu'il affiche (tes decks enregistrés, tes autres onglets de
  deck). La politique de confidentialité et la justification des hôtes (`store-listing.md`)
  mentionnent la lecture des onglets ouverts sur les sites de decks, que le popup fait depuis la
  1.0.13. Ouvert au clavier, il place le focus sur le premier onglet proposé (à la souris, le
  curseur reste dans le champ : ouvrir, coller, Entrée) ; il se ferme quand le focus le quitte et
  une fois la comparaison ouverte. Les noms d'onglets gardent le nom d'un site quand il fait
  partie du nom du deck (« Isshin - Melee Attack Triggers »).
- **Noms en Beleren** : les lettres ornées de fin de mot (« Aragorŋ the Uniter ») sont coupées sur
  les trois pages ; elles vont à un titre de carte, pas au nom d'un deck.
- **Textes** : « Erreur : » avec l'espace française, « Échec du chargement » au lieu de « Échec du
  fetch », « Récupération du deck… » au lieu de « Récupération via API… ». Un lien d'un site non
  pris en charge le dit, et renvoie à la liste des réglages, au lieu de « Source non supportée. ». Les cartes
  de la page de résultats annoncent leur nombre aux lecteurs d'écran (« 4 Lightning Bolt »,
  « Forest : 10 contre 8 »). La légende de la courbe de mana ne mélange plus anglais et
  symboles (« Le consensus : les non-terrains joués par au moins la moitié des decks. »), et les
  messages ne portent plus de tiret cadratin (« Sélectionne un deck… », « …puis réessaie, ou colle
  le texte du deck. », les decks d'un archétype mtgtop8 nommés « Joueur · Tournoi »). Les
  pourcentages de la comparaison croisée s'écrivent à la française (« 85,7 % »), comme le reste de
  la page.
- **Plus rapide, page de résultats** : les images des cartes déjà connues partent dès l'ouverture,
  sans attendre la recherche Scryfall (cache chaud : premières images en 67 ms, une seule mise en
  page au lieu de deux) ; une comparaison détaillée ouverte depuis la comparaison croisée puise
  dans le cache de celle-ci et s'affiche complète en 134 ms, sans appel à Scryfall. Une image ne
  se charge que quand sa carte approche de l'écran : 12 requêtes à l'ouverture au lieu d'une
  cinquantaine, et les cartes visibles ne font plus la queue derrière les autres. Quand la
  recherche échoue ou tarde, les cartes affichent leur nom au lieu de lancer une rafale de
  requêtes vers l'API de Scryfall, qui bloquait l'extension 30 s ; un nom que Scryfall ne connaît
  pas est retenu un jour au lieu d'être redemandé à chaque ouverture. La vue enregistrée
  (compacte, liste) s'applique dès le premier affichage, sans flash de la grille.
- **Plus rapide, comparaison croisée** : les lots de cartes partent vers Scryfall côte à côte au
  lieu de s'attendre, chaque requête (nouveaux essais compris) prenant sa place dans une file
  espacée de 550 ms, la limite de Scryfall étant de deux requêtes par seconde : 10 decks à froid
  en 5,4 s, un pool de 100 decks en une douzaine de secondes au lieu d'une quarantaine, les decks
  affichés dès 130 ms au premier chargement (types, images et courbe complétés à l'arrivée), avec
  l'avancée à l'écran (« Recherche des cartes sur Scryfall… 150 / 558 », « Récupération de 12
  decks… »). Un nom que Scryfall ne connaît pas n'est plus redemandé carte par carte, ni à chaque
  clic de filtre, ni à chaque ouverture (retenu un jour, comme sur la page de résultats), et un
  filtre n'enregistre plus que les filtres. Les lignes hors écran ne sont plus rendues : survoler
  la liste des decks d'un pool de 100 decks coûte 9 ms de recalcul de style au lieu de 225, sans
  tâche longue.
- **Polices embarquées** : Archivo, Bricolage Grotesque et Geist Mono sont livrées avec
  l'extension (168 Ko, licence OFL jointe) au lieu d'être chargées depuis Google Fonts. Le premier
  affichage des trois pages ne dépend plus du réseau, et l'extension ne contacte plus Google : la
  politique de confidentialité perd sa ligne Google Fonts, le CSP ses hôtes Google.
- **Réseau** : toute requête vers un site de decks ou Scryfall abandonne après 15 s avec un
  message clair (« Le site ne répond pas »), au lieu de laisser le popup sur « Récupération… » et
  la comparaison croisée sans fin. Une recherche de cartes déjà en cours n'est plus relancée par
  un « Inverser » pendant qu'elle tourne. Les listes d'onglets ne mélangent plus navigation privée
  et fenêtres ordinaires. « Comparer tous les decks » (archétype mtgtop8) ne reste plus bloqué sur
  « Collecte des decks… » quand une page de l'archétype ne répond pas. Le bouton injecté cherche la barre du site une fois par salve
  de modifications de la page, plus à chacune.
- **Ma liste face au pool, chiffres du consensus** : dans un pool Commander, les terrains de base
  ne comptent plus dans la part du consensus, ni dans les manques ou les autres nombres
  d'exemplaires. Chaque deck en aligne des dizaines : ils faisaient 11 des « 21/99 » de ma liste
  (10/88 désormais), désignaient comme le plus typique le deck qui en jouait 28 (39/99, 11/71
  maintenant), et remplissaient seuls « Autre nombre d'exemplaires ». Un pool de 60 cartes les
  garde : quatre Mountain contre trois y est un choix.
- **Comparaison croisée, lisibilité** : dans la liste des decks, chaque nom commence là où les
  decks diffèrent (« Spellslinger Deck Bracket 2/3 », « (budget) ») au lieu d'être coupé juste
  après le nom du commandant qu'ils partagent tous ; le nom entier reste au survol, et la source
  n'apparaît que si les decks viennent de plusieurs sites. Sous 1000 px, cette liste ne reste plus
  collée par-dessus le contenu (un tiers d'une fenêtre partagée) : une règle plus loin dans la
  feuille de style l'emportait. La popin « Ajouter des decks » a un titre et se comporte en vraie
  boîte de dialogue : le clavier ne s'échappe plus vers la page derrière. La decklist moyenne
  prend la taille médiane des decks : un seul deck de 107 cartes la portait à 101, illégale en
  Commander. L'onglet porte le nom du commandant, la puce du bandeau le nom du site
  (« Archidekt », pas « archidekt »), l'onglet de ma liste n'est plus proposé comme deck du pool,
  et les decks écartés par un filtre gardent un contraste AA dans la liste. Chaque copie le
  confirme, comme sur la page de résultats (une coche dans l'encre d'action, « copié ! » pour les
  lecteurs d'écran) : les icônes des lignes, « Copier » des sections et de la sélection restaient
  muets. Sous 1000 px, la carte survolée flotte dans un coin de la fenêtre, comme sur la page de
  résultats, au lieu de ne pas s'afficher du tout. À 1024 px, les cinq chiffres du bandeau tiennent
  sur une ligne (ils passaient à 4 + 1) ; sur un téléphone, une ligne de carte garde son nom (sur
  deux lignes au besoin) au lieu de le réduire à une lettre. Mesurée à moins de trois decks, une liste n'affiche plus
  ses manques du consensus en rouge : le bandeau dit qu'un consensus se lit à partir de 3 decks
  (avec deux, « joué par au moins la moitié » veut dire joué par l'un des deux). Retirer un deck
  laisse le clavier dans la liste, sur le deck qui prend sa place, et l'annonce aux lecteurs
  d'écran ; le focus tombait sur la page. Dans le popup, « Ce deck face aux N decks » dit
  au survol qu'il remplace ma liste.
- **Comparaison croisée, colonne de droite** : tant qu'aucune carte n'est survolée, la carte tenue
  se replie sur son indice (« Survole une carte pour la voir en grand ») : la courbe de mana
  apparaît sans défiler, sous la liste des decks.
- **Comparaison croisée, haut de page** : replié, le panneau d'ajout ne laisse plus de bande vide
  (ni de filet) au-dessus du commandant.
- **Endstep Tracker cesse de promouvoir Deck Compare quand il est déjà installé** : Deck Compare
  répond « installé » à son message (`runtime.onMessageExternal`), sans rien partager d'autre et
  sans nouvelle permission.
- **Le bouton « Comparer » tient sur les pages qui s'hydratent** : sur une page Astro (ManaBox),
  il attend la fin de l'hydratation avant de se poser, et se remet en place si le site le retire
  en ré-rendant sa barre. Avant, React le jetait à l'hydratation.
- **Description courte française raccourcie** : « Comparez deux decklists Magic: The Gathering côte
  à côte, avec un diff visuel et un score de similarité. » L'ancienne faisait 125 caractères et
  l'App Store refuse le paquet Safari au-delà de 112, langue par langue.
- **Politique de confidentialité réécrite** (`privacy-policy.html`, celle que lient les trois
  stores). Elle datait de juin et décrivait une extension Chrome à six sites : elle couvre
  désormais Chrome, Edge et Firefox, les huit sites, tout ce qui est gardé en local (comparaison,
  pool et filtres, réglages, cache Scryfall de 30 jours), les requêtes vers les sites (cookies
  transmis pour passer leur anti-bot, onglet d'arrière-plan en cas de blocage), Scryfall et Google
  Fonts, et chaque permission. Contact : les issues GitHub.

## [1.2] — 2026-09-24

Troisième version publiée sur le Chrome Web Store, six builds de dev après la 1.1 (1.1.6 →
1.1.11), et **première version pour Firefox** (addons.mozilla.org) ; le paquet Chrome sert aussi
la fiche Edge Add-ons. **Aucune permission requise ajoutée** : le manifest Chrome ne change que
par un chemin de content-script sur un hôte déjà autorisé (`www.mtggoldfish.com/archetype/*`).

### Ajouté

- **Les pages d'archétype MTGGoldfish sont reconnues.** `/archetype/<nom>` affiche un deck complet
  avec la même page qu'un deck ordinaire, mais l'extension n'y voyait rien : pas de bouton, et
  « Aucun deck détecté » dans le popup. Le bouton y apparaît désormais, le popup lit le deck, et
  l'URL d'un archétype se colle comme second deck (l'extension retrouve le deck numéroté que la
  page montre). Même hôte déjà autorisé : aucune nouvelle permission.
- **Un paquet par navigateur, depuis la même source.** `npm run build` produit les paquets
  Chrome (qui sert aussi à Edge, Brave, Opera et Vivaldi) et **Firefox** (128 et plus). Seul le
  manifest diffère : Firefox n'a pas de service worker de fond, il charge les mêmes scripts en
  page d'arrière-plan ; l'extension y porte un identifiant d'add-on et la déclaration « aucune
  donnée collectée » que Mozilla exige. Sur Firefox, les accès aux sites sont optionnels à
  l'installation : le popup propose « Autoriser Deck Compare sur les sites de decks » en un clic
  tant qu'ils ne sont pas accordés (jamais affiché sur Chrome, où ils le sont d'office).

### Corrigé

- **MTGGoldfish : le bouton « Comparer » retrouve la barre d'outils du deck.** Il s'accrochait au
  titre, que le site affiche désormais en bloc : le bouton se retrouvait seul sur sa ligne, sous
  « by … », loin de toute action. Il ferme maintenant le groupe « Stats · View Options », juste
  avant le menu des prix.
- **Le bouton « Comparer » rejoint la barre du site même quand elle arrive tard.** Il attend
  la barre 8 secondes, puis se repliait en pilule flottante en bas à droite pour de bon : sur
  Moxfield, dont l'écran « Loading Moxfield… » dure parfois plus longtemps, le bouton finissait
  toujours flottant, facile à manquer. Après le repli, il continue de guetter la barre (90 s au
  plus) et s'y installe dès qu'elle apparaît, panneau et écouteurs conservés ; il ne bouge pas
  tant que son panneau est ouvert.
- **Le code d'édition collé au nom d'une carte ne crée plus de faux écart.** Certains exports
  (la liste MTGGoldfish, l'export Arena) écrivent `Dispatch [EOC]` ou `Dispatch (EOC) 42` :
  la carte se retrouvait en « unique » des deux côtés face à un deck qui écrit `Dispatch`.
  `Shared.normalizeName` retire maintenant tout ce que les exports accrochent au nom (code
  d'édition, `*F*` foil, `[Catégorie]`, commentaire `#`), donc tous les decks entrent indexés
  pareil (le `normalizeDeck` de 1.1.4 s'applique à toutes les entrées). Les trois nettoyages
  partiels qui traînaient (parser mtgdecks ×2, parser de texte collé) sont supprimés.
- **Les apostrophes des decks lus en HTML ne cassent plus l'appariement.** Melee (ASP.NET)
  écrit `Urza&#x27;s Saga`, Magic-Ville `&#39;`, mtgdecks n'était pas décodé du tout : le nom
  arrivait tel quel et ne matchait ni Moxfield ni Scryfall. Le décodage d'entités est
  maintenant numérique (décimal + hexa) et couvre aussi mtgdecks.
- **Une decklist tapée à la main en minuscules (ou en capitales) s'apparie enfin.** `4 dispatch`
  ou `4 SOL RING` restaient à côté du `Dispatch` du site. Ces deux formes ne portent aucune
  information de casse : `Shared.normalizeName` les repasse en casse de titre (petits mots en
  minuscule, capitale après un trait d'union). Un nom déjà casé par une source n'est jamais
  réécrit — `R&D's Secret Lair` ne se devine pas.
- **Apostrophe typographique et espace insécable** (`Urza’s Saga`, `&nbsp;` dans une cellule
  scrapée) ramenés à la forme droite/simple, même raison.

## [1.1] — 2026-09-08

Deuxième version publiée sur le Chrome Web Store, cinq builds de dev après la 1.0.13 (1.1.1 →
1.1.5) et première release numérotée `X.Y`. **Aucune permission requise ajoutée** : le manifest
ne change que par l'ajout de `shared.js` au script des pages archétype mtgtop8, sur un hôte déjà
permis.

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

- **Les decks MTGGoldfish (et mtgdecks, Magic-Ville) ne renvoient plus « bloque la
  récupération automatique » dès que Cloudflare est de mauvaise humeur.** Le service worker
  demande `/deck/download/<id>` depuis `chrome-extension://…` : requête cross-site, sans
  Referer, sans cookie de challenge — Cloudflare répond « Just a moment… » en 403. La page,
  elle, s'ouvre normalement dans un onglet, et le content-script sait déjà la lire. Sur un
  403 (et seulement là — un deck introuvable échoue toujours aussi vite), la récupération
  repasse donc par un onglet : celui déjà ouvert sur ce deck s'il existe, sinon un onglet
  d'arrière-plan ouvert puis refermé. Corrigé en un point (`fetchDeckByUrl`), donc valable
  pour le popup, le bouton injecté et le pool à la fois.
- **Un seul point de normalisation des noms de cartes.** Chaque deck est ré-indexé par le nom
  de sa face avant à l'entrée de l'extension (lecture API, lecture de la page, texte collé,
  pool restauré) ; la comparaison croisée comptait deux fois une carte recto/verso venue de deux
  sources (« Life // Death » Moxfield contre « Life/Death » mtgtop8), seule la comparaison directe
  normalisait. Les filtres par carte enregistrés suivent.
- **Comparaison directe : la légende dit ce qu'elle compte.** « En commun · 42 » comptait des
  exemplaires, commandant et terrains de base compris, quand la comparaison croisée affichait
  « 27 cartes en commun » pour les deux mêmes decks : elle compte des noms distincts du deck
  principal. Les deux calculs sont justes ; la légende de la barre affiche désormais les deux
  mesures pour chaque segment (« 42 exemplaires · 28 cartes »).
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

[Non publié]: https://github.com/mcouzinet/deckCompare/compare/v1.2...HEAD
[1.3]: https://github.com/mcouzinet/deckCompare/compare/v1.2...v1.3
[1.2]: https://github.com/mcouzinet/deckCompare/compare/v1.1...v1.2
[1.1]: https://github.com/mcouzinet/deckCompare/compare/v1.0.13...v1.1
[1.0.13]: https://github.com/mcouzinet/deckCompare/compare/v0.9.0...v1.0.13
[0.9.0]: https://github.com/mcouzinet/deckCompare/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/mcouzinet/deckCompare/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/mcouzinet/deckCompare/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/mcouzinet/deckCompare/compare/v0.4.0...v0.6.0
[0.4.0]: https://github.com/mcouzinet/deckCompare/releases/tag/v0.4.0
