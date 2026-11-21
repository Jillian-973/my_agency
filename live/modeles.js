// Modèle Claude et plafond de dépense de chaque agent.
//
// La règle : Opus là où une erreur coûte cher ou se propage (architecture, code serveur, sécurité, décisions du CEO),
// Haiku pour le travail répétitif et facile à vérifier, Sonnet pour le reste. Les discussions (réponses courtes,
// sans outil) passent toutes par Haiku. Pour changer le modèle d'un agent, il suffit de modifier PAR_AGENT.
'use strict';

const MODELES = {
  opus: { id: 'claude-opus-5-5', nom: 'Opus 5.5', plafond: 4 },       // plafond : dollars au plus par tâche
  sonnet: { id: 'claude-sonnet-5-5', nom: 'Sonnet 5.5', plafond: 2 },
  haiku: { id: 'claude-haiku-5-5', nom: 'Haiku 5.5', plafond: 1 },
};

// identifiant de EQUIPE.md → modèle ; les agents absents de cette liste travaillent avec Sonnet
const PAR_AGENT = {
  jillian: 'opus', theo: 'opus', max: 'opus', zoe: 'opus', ada: 'opus', iris: 'opus',
  hugo: 'haiku', nour: 'haiku', milo: 'haiku', joss: 'haiku',
};

const DISCUSSION = MODELES.haiku;   // toutes les discussions
const CORBEILLE = MODELES.haiku;    // la mise à la corbeille des mails validés (simple application d'une liste)

const modeleDe = (id) => MODELES[PAR_AGENT[id]] || MODELES.sonnet;

module.exports = { MODELES, PAR_AGENT, DISCUSSION, CORBEILLE, modeleDe };
