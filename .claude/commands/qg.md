---
description: Confier une demande au QG de JILL KORP — la CEO distribue le travail à l'équipe et te rend son compte rendu
argument-hint: <ta demande>
allowed-tools: mcp__qg__demander_au_ceo, mcp__qg__suivre_mission, mcp__qg__etat_du_qg
---
Voici une demande pour le QG de JILL KORP :

$ARGUMENTS

Si la demande ci-dessus est vide, donne-moi simplement l'état du QG avec l'outil mcp__qg__etat_du_qg, puis arrête-toi.

Sinon :
1. Confie-la telle quelle à la CEO avec l'outil mcp__qg__demander_au_ceo, sans la reformuler.
2. Montre-moi en quelques lignes comment la CEO a réparti le travail (quel agent fait quoi, à quelle étape).
3. Suis la mission avec mcp__qg__suivre_mission (attendre_secondes : 240), autant de fois que nécessaire, jusqu'à ce qu'elle soit terminée.
4. Présente-moi le compte rendu final de la CEO, avec les fichiers produits.

Si le QG n'est pas démarré, dis-le-moi et rappelle-moi de lancer `node live/server.js` dans le dossier du projet.
