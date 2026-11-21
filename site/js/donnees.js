// Données du QG JILL KORP : pôles, salles et agents (repris de EQUIPE.md).
// L'état de chaque agent (au travail, en pause, en attente) est fixe pour l'instant ;
// il sera piloté plus tard par les vraies sessions Claude Code.

export const ETATS = {
  'au travail': { couleur: '#22c55e' },
  'en pause': { couleur: '#f59e0b' },
  'en attente': { couleur: '#94a3b8' },
};

export const POLES = {
  cabinet: { nom: 'Cabinet', couleur: '#3b82f6', salle: 'cabinet' },
  radar: { nom: 'Radar', couleur: '#8b5cf6', salle: 'radar' },
  atelier: { nom: 'Atelier', couleur: '#22c55e', salle: 'atelier' },
  forge: { nom: 'Forge', couleur: '#f97316', salle: 'forge' },
  studio: { nom: 'Studio', couleur: '#ec4899', salle: 'studio' },
  montage: { nom: 'Montage', couleur: '#ef4444', salle: 'projection' },
  phare: { nom: 'Phare', couleur: '#facc15', salle: 'phare' },
};

export const AGENTS = [
  // Pôle Cabinet
  { id: 'lea', prenom: 'Léa', poste: 'Cheffe de cabinet', pole: 'cabinet', etat: 'au travail',
    missions: ['Trier la boîte Gmail et préparer des brouillons de réponse', 'Remettre chaque jour un résumé avec agenda et priorités'], outils: ['Gmail', 'Google Agenda', 'Notion'] },
  { id: 'hugo', prenom: 'Hugo', poste: 'Archiviste', pole: 'cabinet', etat: 'au travail',
    missions: ['Classer et résumer notes, articles et réunions dans Notion', 'Tenir à jour la base de connaissances et les modèles de pages'], outils: ['Notion'] },
  { id: 'maya', prenom: 'Maya', poste: 'Contrôleuse de gestion', pole: 'cabinet', etat: 'en pause',
    missions: ['Tenir les tableaux Excel (temps, coûts, abonnements, devis)', 'Repérer les dépenses inutiles'], outils: ['Excel', 'Notion'] },
  // Pôle Radar
  { id: 'sacha', prenom: 'Sacha', poste: 'Veilleur concurrentiel', pole: 'radar', etat: 'au travail',
    missions: ['Surveiller chaque semaine sites, offres et contenus des concurrents', 'Livrer une note de veille d\'une page'], outils: ['Web', 'Notion'] },
  { id: 'iris', prenom: 'Iris', poste: 'Analyste benchmark', pole: 'radar', etat: 'au travail',
    missions: ['Produire des benchmarks comparatifs (UX, tech, SEO, vidéo)', 'Maintenir des fiches comparatives réutilisables'], outils: ['Web', 'Excel', 'Notion'] },
  { id: 'nour', prenom: 'Nour', poste: 'Veilleuse tech et outils', pole: 'radar', etat: 'en attente',
    missions: ['Suivre les nouvelles versions des frameworks et les nouveaux outils', 'Proposer des alternatives moins chères ou gratuites'], outils: ['Web', 'GitHub'] },
  // Pôle Atelier
  { id: 'theo', prenom: 'Théo', poste: 'Architecte', pole: 'atelier', etat: 'au travail',
    missions: ['Cadrer chaque projet (stack, structure, base de données)', 'Relire le code des autres agents avant livraison'], outils: ['GitHub', 'Prisma', 'PostgreSQL', 'MongoDB', 'SQLite'] },
  { id: 'jade', prenom: 'Jade', poste: 'Développeuse front', pole: 'atelier', etat: 'au travail',
    missions: ['Écrire les composants et pages en Vue, React et TypeScript', 'Intégrer les maquettes Figma'], outils: ['Figma', 'GitHub', 'Vercel'] },
  { id: 'max', prenom: 'Max', poste: 'Développeur back', pole: 'atelier', etat: 'au travail',
    missions: ['Construire les API (Express, Symfony) et les schémas Prisma', 'Gérer les migrations et les bases de données'], outils: ['Express', 'Symfony', 'Prisma', 'PostgreSQL', 'MongoDB', 'Render'] },
  { id: 'zoe', prenom: 'Zoé', poste: 'Qualité et déploiement', pole: 'atelier', etat: 'en attente',
    missions: ['Écrire les tests et vérifier la sécurité', 'Automatiser les déploiements et surveiller les environnements'], outils: ['GitHub', 'Vercel', 'Cloudflare', 'Render'] },
  // Pôle Forge
  { id: 'ada', prenom: 'Ada', poste: 'Forgeronne d\'outils', pole: 'forge', etat: 'au travail',
    missions: ['Transformer chaque tâche répétitive en script, CLI ou mini-app', 'Tenir le catalogue des outils avec leur mode d\'emploi'], outils: ['JavaScript', 'TypeScript', 'GitHub'] },
  { id: 'basile', prenom: 'Basile', poste: 'Câbleur d\'automatisations', pole: 'forge', etat: 'en pause',
    missions: ['Relier les apps entre elles (Gmail, Notion, GitHub, Agenda)', 'Planifier les tâches récurrentes'], outils: ['Connecteurs', 'Tâches planifiées'] },
  // Pôle Studio
  { id: 'lila', prenom: 'Lila', poste: 'Directrice artistique et web designer', pole: 'studio', etat: 'au travail',
    missions: ['Proposer des maquettes et des design systems', 'Garder la cohérence visuelle entre les projets'], outils: ['Figma'] },
  { id: 'noe', prenom: 'Noé', poste: 'Graphiste', pole: 'studio', etat: 'en pause',
    missions: ['Créer logos, visuels et déclinaisons pour les réseaux', 'Préparer les exports pour le web et l\'impression'], outils: ['Illustrator', 'Photoshop'] },
  { id: 'blaise', prenom: 'Blaise', poste: 'Artiste 3D (à la demande)', pole: 'studio', etat: 'en attente',
    missions: ['Créer des scènes et rendus 3D pour des mockups ou des visuels', 'Automatiser les rendus répétitifs'], outils: ['Blender'] },
  // Pôle Montage
  { id: 'milo', prenom: 'Milo', poste: 'Dérusheur', pole: 'montage', etat: 'au travail',
    missions: ['Transcrire et trier les rushes, repérer les meilleurs passages', 'Poser des marqueurs et un plan de montage'], outils: ['Librairie GitHub vidéo', 'Transcription'] },
  { id: 'clara', prenom: 'Clara', poste: 'Monteuse', pole: 'montage', etat: 'au travail',
    missions: ['Assembler le pré-montage à partir du plan de Milo', 'Préparer les sous-titres et la structure du projet'], outils: ['Premiere Pro', 'Librairie GitHub vidéo'] },
  { id: 'joss', prenom: 'Joss', poste: 'Finisseur', pole: 'montage', etat: 'en attente',
    missions: ['Exporter dans tous les formats (YouTube, Reels, TikTok)', 'Créer miniatures et titres'], outils: ['Premiere Pro', 'Photoshop'] },
  // Pôle Phare
  { id: 'sam', prenom: 'Sam', poste: 'Expert SEO', pole: 'phare', etat: 'au travail',
    missions: ['Auditer les sites et trouver des mots-clés', 'Suivre les positions et proposer des corrections techniques'], outils: ['Search Console', 'Semrush', 'Analytics'] },
  { id: 'emma', prenom: 'Emma', poste: 'Contenu et réseaux sociaux', pole: 'phare', etat: 'en pause',
    missions: ['Tenir le calendrier éditorial', 'Rédiger les posts et les newsletters'], outils: ['Réseaux sociaux', 'Emailing', 'Notion'] },
  { id: 'ravi', prenom: 'Ravi', poste: 'Analyste de données', pole: 'phare', etat: 'au travail',
    missions: ['Produire des rapports mensuels (trafic, campagnes, conversions)', 'Garder la trace de tout dans des tableaux Excel propres'], outils: ['Analytics', 'Excel'] },
];

// Le CEO de JILL KORP (hors pôles)
export const CEO = { id: 'ceo', prenom: 'CEO', poste: 'Direction · JILL KORP', pole: null, etat: 'au travail', missions: [], outils: [] };

export const agentParId = Object.fromEntries([...AGENTS, CEO].map(a => [a.id, a]));
