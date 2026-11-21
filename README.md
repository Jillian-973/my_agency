# JILL KORP · le QG

Le quartier général de mes agents IA, en 3D, dans le navigateur : une île qui flotte dans le ciel, un bureau sans toit pour voir dans chaque pièce, une salle par pôle et chaque agent à son poste.

Tout tourne en local : la bibliothèque 3D et les modèles sont dans le dépôt, et le serveur n'écoute que sur `127.0.0.1`.

## Lancer le QG

Il faut [Node.js](https://nodejs.org) (aucune dépendance à installer).

```powershell
node live/server.js
```

Puis ouvrir <http://127.0.0.1:8787>. Autre port : `$env:PORT=9000; node live/server.js`.

Pour parler aux agents, [Claude Code](https://claude.com/claude-code) doit être installé et connecté sur cet ordinateur (commande `claude`). Après une modification de `live/server.js`, arrêter le serveur (Ctrl+C) et le relancer.

## Dans le QG

- **Caméra** : elle tourne lentement autour de l'île ; clic gauche pour pivoter, molette ou pincement pour zoomer, clic droit, ZQSD ou flèches pour se déplacer, Échap pour revenir à la vue d'ensemble.
- **Pôles** : un clic sur une salle (ou sur un pôle dans le panneau) fait voler la caméra jusqu'à elle et affiche la liste de ses agents.
- **Onglets du bas** : deux petits onglets. « Pôles » parcourt un par un les sept pôles puis le Quartier Général et chaque lieu commun (précédent, suivant, ou un point par lieu) ; la caméra y vole et la fiche de la salle s'ouvre. « Équipe » montre ce que fait chaque agent en ce moment, regroupé par pôle : les tâches en cours (depuis quand, le début de la consigne et la dernière action, rafraîchis toutes les 4 secondes par le serveur local) et, pour les autres, leur situation habituelle. Un clic sur un agent ouvre sa fenêtre, « Voir » fait voler la caméra jusqu'à son bureau. Le nombre de tâches en cours s'affiche sur l'onglet.
- **Bandeau des connecteurs** : en haut de l'écran, les logos de tes connecteurs qui marchent. Il défile avec les flèches, la molette ou en glissant. Quand un agent se sert d'un connecteur pendant une tâche, son logo s'allume (halo à la couleur de la marque, prénom de l'agent) et le bandeau défile jusqu'à lui ; il redevient normal quelques secondes après le dernier appel. Logos : Simple Icons (CC0) pour les marques présentes, dessinés pour le QG pour les autres (`site/ui/logos`).
- **Outils** : un troisième onglet liste tes connecteurs, regroupés (claude.ai, extensions, cet ordinateur), avec leur état : connecté, à connecter, non configuré ou en panne. Le serveur lit « claude mcp list » (au plus une fois par minute, ou sur « Vérifier ») et ne transmet à la page que le nom et l'état de chacun : jamais une adresse, une commande ni un message d'erreur (`live/outils-mcp.js`). L'onglet affiche une pastille rouge si un connecteur est en panne.
- **Un QG vivant** : des figurants sans étiquette travaillent aux bureaux libres de l'Atelier. Six promeneurs vont et viennent entre le café, l'arcade, la terrasse et le Hall ; ils boivent un café, jouent aux bornes et discutent quand ils se retrouvent (bulles au-dessus de la tête). De temps en temps, un agent en pause va au café ou à l'arcade, puis revient s'asseoir (l'onglet « Équipe » le dit). Et quelques détails un peu fous : quelqu'un travaille sur son ordinateur en marchant sur un tapis de course, un drone part du comptoir du café pour déposer un café sur un bureau, et un robot aspirateur fait le ménage dans le Hall.
- **Réunion** : dans l'onglet « Équipe », coche des agents (ou « Tout cocher ») puis clique sur le sifflet. Ils se lèvent et marchent jusqu'à la salle de réunion par les couloirs : ils contournent murs et meubles, prennent l'escalier de la Forge, et les portes s'ouvrent devant eux puis se referment. Les huit premiers s'assoient autour de la table, les suivants restent debout autour. Leur étiquette passe à « en réunion » en version courte, pour que la table reste lisible. « Fin de réunion » les renvoie s'asseoir à leur bureau.
- **Agents** : chacun a son bureau et une étiquette au-dessus de la tête — prénom, poste et état (*au travail*, *en pause*, *en attente*).
- **Le ciel** : huit planètes tournent autour du bureau, chacune à sa distance (les plus lointaines plus lentement), et la Lune, satellite le plus proche, affiche sa phase réelle du jour (rappelée dans le panneau).
- **Visite à la première personne** : bouton « J'entre » (ou « J'entre dans cette salle » depuis la fiche d'un pôle, ou double-clic sur une salle). Z Q S D ou flèches pour marcher, Maj pour courir, la souris pour regarder, E pour ouvrir une porte (ou lever la barrière du pont), Échap pour rendre la souris, « Vue d'en haut » pour revenir au-dessus de l'île. On ne traverse ni les murs ni les meubles. Si le navigateur refuse de capturer la souris, on regarde en glissant avec le clic gauche. Une minimap en haut à droite montre le plan autour de soi (nord en haut), les agents et le nom de la salle.
- **Fiche d'un agent** : clic sur un agent (son personnage, ou son nom dans la fiche de la salle ou l'onglet « Équipe »), ou touche E devant lui pendant la visite. Sa fiche dit qui il est (portrait en 3D, poste, pôle, lieu de travail), ce qu'il fait en ce moment (une tâche avec sa dernière action, une réunion, une pause, ou sa situation habituelle) et son rôle au QG (missions, outils — ● quand c'est un connecteur branché — et collègues de pôle, cliquables). En bas de la fiche, deux boutons :
  - **Discuter** : Claude Code répond sans aucun outil, avec la personnalité de l'agent (son prénom, son poste et ses missions lus dans `EQUIPE.md`). Rien n'est enregistré.
  - **Confier une tâche** : une vraie session Claude Code travaille dans `live/travaux/<Prénom>/`, avec seulement la lecture, l'écriture et la modification de fichiers et la recherche web. 4 tâches en même temps au plus.
  - **Modèles** : chaque agent a son modèle et son plafond par tâche, affichés dans sa fiche (`live/modeles.js`). Opus 5.5 (4 $) pour Jillian, Théo, Max, Zoé, Ada et Iris ; Haiku 5.5 (1 $) pour Hugo, Nour, Milo et Joss ; Sonnet 5.5 (2 $) pour tous les autres. Les discussions passent toutes par Haiku 5.5. Pendant ce temps l'agent tape à son bureau et la fenêtre montre seulement le nom de chaque outil utilisé et du fichier touché ; à la fin, son compte rendu, les fichiers créés et un bouton pour ouvrir son dossier.
  - **Connecteurs** : d'après la ligne « Outils » de `EQUIPE.md`, certains agents utilisent aussi tes connecteurs claude.ai pendant leurs tâches (Gmail, Google Agenda, Notion, Google Drive pour Sheets, Slides et Docs, Gamma pour les présentations, Figma, Vercel, Cloudflare). Chacun n'a que les outils précis prévus pour son poste (`live/connecteurs.js`) ; tous les autres outils de tous les connecteurs lui sont cachés, et un garde-fou arrête la session au moindre appel interdit. Aucun mail n'est jamais envoyé.
  - **Corbeille Gmail sur ton accord** : quand Léa trie la boîte, elle ne supprime rien ; elle propose une liste. La fenêtre l'affiche avec une case par mail, et seuls les mails que tu coches partent à la corbeille (récupérables 30 jours), par une seconde session qui n'a que cet outil.
  - **Sécurité** : le serveur n'écoute que sur `127.0.0.1` et refuse toute demande qui ne vient pas de la page du QG (adresse, origine et jeton secret recréé à chaque démarrage). Les travaux des agents restent sur cet ordinateur (`live/travaux/` n'est pas versionné).
- **Graphismes** : ombres adoucies et plus fines (carte d'ombres 4096 quand la carte graphique le permet, recalculée seulement quand une façade change), matériaux physiques sous la lumière d'origine du QG, et des vitres qui reflètent une ambiance de ciel calculée au démarrage. Les personnages qui marchent ont une ombre douce sous les pieds. Le panneau propose « Graphismes : élevés / légers » (choix gardé dans le navigateur) ; si l'ordinateur peine même à la plus basse résolution, le QG passe tout seul en graphismes légers (matériaux Lambert, bien plus simples à calculer).
- **Interface** : panneaux, boutons et viseur dans le style sci-fi de Kenney ; titres en Kenney Future, tout le reste en Inter. Chaque fenêtre a sa forme (en-tête doré pour le panneau principal, en-tête à la couleur du pôle pour la fiche d'une salle, onglet en biseau pour un agent, verre aux coins coupés pour la minimap, onglet à encoche pour la pause), et la fiche, la fenêtre d'un agent et les boutons prennent la couleur de son pôle. Le bouton fermer et les curseurs de la souris viennent aussi du pack.

## Organisation

```
site/              le QG (servi tel quel)
  index.html       page principale
  mentions.html    crédits des modèles et de la bibliothèque 3D
  css/qg.css       styles de l'interface
  js/donnees.js    pôles, agents et états (repris de EQUIPE.md)
  js/monde.js      l'île, le bâtiment, les salles et leur contenu
  js/mobilier.js   meubles, personnages et mascottes
  js/etiquettes.js étiquettes des salles et des agents
  js/details.js    petits objets : tasses, livres, lampes, enseignes des pôles…
  js/visite.js     visite à la première personne (marche, regard, portes)
  js/collisions.js murs et meubles qu'on ne traverse pas
  js/planetes.js   planètes en orbite et Lune à sa vraie phase
  js/minimap.js    plan affiché en haut à droite pendant la visite
  js/fenetre-agent.js fenêtre d'un agent : discuter, confier une tâche, suivre son travail
  ui/kenney/       interface sci-fi et tuiles de la minimap (Kenney, CC0), polices Kenney Future,
                   variantes aux couleurs des pôles (ui-pack-sci-fi/couleurs)
  js/modeles.js    chargement des modèles Kenney
  js/outils.js     matériaux, formes et textures communes
  js/main.js       caméra, interactions, optimisation, boucle d'affichage
  vendor/three/    three.js r160 (MIT)
  models/kenney/   modèles 3D Kenney (CC0)
live/server.js     serveur local sans dépendance : le site et l'API des agents (Claude Code)
live/connecteurs.js outils de connecteurs autorisés pour chaque agent, garde-fou, propositions de corbeille
live/travaux/      dossiers de travail des agents (créés à la première tâche, non versionnés)
maquettes/         les 7 maquettes successives (la 7 a été validée)
BRIEF.md           le cahier des charges
EQUIPE.md          les pôles, les agents, les lieux et les mascottes
```

## Feuille de route

1. ~~Maquettes à valider~~
2. ~~L'île en 3D, caméra qui tourne, clic sur un pôle pour y voler~~
3. ~~Étiquette au-dessus de chaque agent : prénom, poste, état~~
4. ~~Bouton « J'entre » : marcher à la première personne et ouvrir les portes~~
5. ~~Parler à un agent et lui confier une tâche qui lance une vraie session Claude Code (en local uniquement)~~
6. Brancher certains agents sur mes outils

## Crédits

- Modèles 3D, images et interface : [Kenney](https://kenney.nl) — *Furniture Kit*, *Nature Kit*, *Mini Arcade*, *Planets*, *UI Pack: Sci-fi* (avec les polices Kenney Future) et *Minimap Pack*, licence CC0.
- Bibliothèque 3D : [three.js](https://threejs.org), licence MIT.
- Police du texte : [Inter](https://rsms.me/inter/), SIL Open Font License 1.1 (enregistrée dans `site/ui/inter`).

Le détail est dans la page **Mentions** du QG.
