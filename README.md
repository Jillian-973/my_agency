# JILL KORP · le QG

Le quartier général de mes agents IA, en 3D, dans le navigateur : une île qui flotte dans le ciel, un bureau sans toit pour voir dans chaque pièce, une salle par pôle et chaque agent à son poste.

Tout tourne en local : la bibliothèque 3D et les modèles sont dans le dépôt, et le serveur n'écoute que sur `127.0.0.1`.

## Lancer le QG

Il faut [Node.js](https://nodejs.org) (aucune dépendance à installer).

```powershell
node live/server.js
```

Puis ouvrir <http://127.0.0.1:8787>. Autre port : `$env:PORT=9000; node live/server.js`.

## Dans le QG

- **Caméra** : elle tourne lentement autour de l'île ; clic gauche pour pivoter, molette ou pincement pour zoomer, clic droit, ZQSD ou flèches pour se déplacer, Échap pour revenir à la vue d'ensemble.
- **Pôles** : un clic sur une salle (ou sur un pôle dans le panneau) fait voler la caméra jusqu'à elle et affiche la liste de ses agents.
- **Agents** : chacun a son bureau et une étiquette au-dessus de la tête — prénom, poste et état (*au travail*, *en pause*, *en attente*).
- **Le ciel** : huit planètes tournent autour du bureau, chacune à sa distance (les plus lointaines plus lentement), et la Lune, satellite le plus proche, affiche sa phase réelle du jour (rappelée dans le panneau).
- **Visite à la première personne** : bouton « J'entre » (ou « J'entre dans cette salle » depuis la fiche d'un pôle, ou double-clic sur une salle). Z Q S D ou flèches pour marcher, Maj pour courir, la souris pour regarder, E pour ouvrir une porte (ou lever la barrière du pont), Échap pour rendre la souris, « Vue d'en haut » pour revenir au-dessus de l'île. On ne traverse ni les murs ni les meubles. Si le navigateur refuse de capturer la souris, on regarde en glissant avec le clic gauche. Une minimap en haut à droite montre le plan autour de soi (nord en haut), les agents et le nom de la salle.
- **Interface** : panneaux, boutons et viseur dans le style sci-fi de Kenney ; titres en Kenney Future, tout le reste en Inter.

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
  ui/kenney/       interface sci-fi et tuiles de la minimap (Kenney, CC0), polices Kenney Future
  js/modeles.js    chargement des modèles Kenney
  js/outils.js     matériaux, formes et textures communes
  js/main.js       caméra, interactions, optimisation, boucle d'affichage
  vendor/three/    three.js r160 (MIT)
  models/kenney/   modèles 3D Kenney (CC0)
live/server.js     serveur local sans dépendance
maquettes/         les 7 maquettes successives (la 7 a été validée)
BRIEF.md           le cahier des charges
EQUIPE.md          les pôles, les agents, les lieux et les mascottes
```

## Feuille de route

1. ~~Maquettes à valider~~
2. ~~L'île en 3D, caméra qui tourne, clic sur un pôle pour y voler~~
3. ~~Étiquette au-dessus de chaque agent : prénom, poste, état~~
4. ~~Bouton « J'entre » : marcher à la première personne et ouvrir les portes~~
5. Parler à un agent et lui confier une tâche qui lance une vraie session Claude Code (en local uniquement)
6. Brancher certains agents sur mes outils

## Crédits

- Modèles 3D, images et interface : [Kenney](https://kenney.nl) — *Furniture Kit*, *Nature Kit*, *Mini Arcade*, *Planets*, *UI Pack: Sci-fi* (avec les polices Kenney Future) et *Minimap Pack*, licence CC0.
- Bibliothèque 3D : [three.js](https://threejs.org), licence MIT.
- Police du texte : [Inter](https://rsms.me/inter/), SIL Open Font License 1.1 (enregistrée dans `site/ui/inter`).

Le détail est dans la page **Mentions** du QG.
