# Brief : formulaire Tally « Avis et suggestions » pour Deck Compare

Tu crées un formulaire sur Tally (tally.so), avec le compte Tally de l'utilisateur. L'utilisateur se
connecte lui-même : tu ne saisis jamais de mot de passe. À la fin, tu rends l'adresse publique du
formulaire (`https://tally.so/r/xxxx`).

## Contexte

Deck Compare est une extension de navigateur gratuite (Chrome, Edge, Firefox, Safari). Elle compare
deux decklists Magic: The Gathering côte à côte, sur onze sites de decks (Moxfield, Archidekt,
MTGGoldfish, mtgtop8, ManaBox, Endstep, Melee, mtgdecks.net, Magic-Ville, getpaird, Pauper Duel
Commander). Le formulaire recueille les bugs, les idées et les sites à ajouter. Il sera lié depuis
la page de présentation (deckcompare.tolarianstudio.com), le popup de l'extension et sa page de
résultats.

Les utilisateurs sont anglophones et francophones. Le formulaire est **bilingue dans chaque
libellé**, l'anglais d'abord puis le français après une barre oblique, par exemple « Your message /
Ton message ». Il doit rester court : on le remplit en moins d'une minute.

## Titre et introduction

- Titre : **Deck Compare: feedback / Ton avis**
- Introduction : « A bug, an idea, a deck site to add? Tell us. / Un bug, une idée, un site de
  decks à ajouter ? Dis-le-nous. »

## Questions, dans l'ordre

1. **What is it about? / C'est à propos de quoi ?** Choix unique, obligatoire :
   - Something doesn't work / Quelque chose ne marche pas
   - An idea / Une idée
   - A deck site to add / Un site de decks à ajouter
   - Other / Autre
2. **Your message / Ton message.** Texte long, obligatoire.
3. **Deck page concerned (optional) / Page de deck concernée (facultatif).** Champ URL, facultatif.
   Aide : « The link of the deck where it happens, or of the site to add. / Le lien du deck où ça
   se produit, ou du site à ajouter. »
4. **Your email, if you'd like a reply (optional) / Ton e-mail, si tu veux une réponse
   (facultatif).** Champ e-mail, facultatif. Aide : « Only used to answer you. / Sert seulement à
   te répondre. »

Aucune autre donnée personnelle : pas de nom, pas de case obligatoire.

## Champs cachés

Ajoute trois champs cachés (Hidden fields), remplis par l'adresse du lien. L'extension les passera,
par exemple `?version=1.4&browser=chrome&source=popup` :

- `version` : la version de l'extension
- `browser` : chrome, edge, firefox ou safari
- `source` : d'où vient le clic (site, popup, results)

## Après l'envoi

Page de remerciement : « Thanks, it's read! / Merci, c'est lu ! »

## Réglages

- Notification par e-mail à chaque réponse, vers l'adresse du compte Tally.
- Pas de limite de réponses ni de date de fermeture.
- Apparence : fond clair, couleur d'accent teal `#137083` (la couleur de l'extension), police par
  défaut de Tally.
- Si le logo est possible, utilise l'icône `src/icons/icon128.png` du dépôt deckCompare.
- Ne publie pas le formulaire ailleurs que par son lien (pas de galerie Tally).

## À rendre

1. L'adresse publique du formulaire.
2. Les identifiants exacts des trois champs cachés tels que Tally les a enregistrés.
3. Une capture du formulaire tel qu'un visiteur le voit.
