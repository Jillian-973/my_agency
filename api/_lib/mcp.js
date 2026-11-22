// Le connecteur Claude du QG (MCP, transport HTTP « streamable », réponses JSON). Mêmes outils que le MCP local
// (live/mcp-qg.js) : demander_au_ceo, suivre_mission, etat_du_qg. Les demandes passent par la file d'attente
// jusqu'à ton QG local, qui les fait exécuter par la CEO et l'équipe. Réservé au Claude relié par OAuth.
import { demanderAuPc, etatPc, lireMission, listeMissions } from './file.js';

const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const ETATS = { attente: 'en attente', 'en cours': 'en cours', terminee: 'terminé', echec: 'arrêté' };
const pause = (ms) => new Promise(r => setTimeout(r, ms));
const fini = (m) => m.etat === 'terminee' || m.etat === 'echec';

function decrire(m, { consignes = false } = {}) {
  const l = [];
  const titre = { planification: 'en préparation par la CEO', 'en cours': `en cours (étape ${m.etape})`, synthese: 'la CEO rédige son compte rendu', terminee: 'terminée', echec: 'échouée' }[m.etat] || m.etat;
  l.push(`Mission ${m.id} : ${titre}.`);
  if (m.message) l.push(`Jillian : ${m.message}`);
  for (const st of m.sousTaches || []) {
    l.push(`- ${st.prenom}${m.sousTaches.some(x => x.etape > 1) ? ` (étape ${st.etape})` : ''} : ${ETATS[st.etat] || st.etat}`);
    if (consignes) l.push(`  consigne : ${st.consigne}`);
    if (st.fichiers && st.fichiers.length) l.push(`  fichiers (sur ton ordinateur) : ${st.fichiers.join(', ')}`);
  }
  if (m.etat === 'terminee' && m.synthese) {
    l.push('', '— Compte rendu de la CEO —', m.synthese);
    if (m.fichier) l.push('', `(compte rendu enregistré sur ton ordinateur dans ${m.fichier})`);
  }
  if (typeof m.cout === 'number' && m.cout > 0) l.push('', `Coût de la mission jusqu'ici : ${m.cout.toFixed(2)} $`);
  return l.join('\n');
}

const OUTILS = [
  {
    name: 'demander_au_ceo',
    description: "Confie une demande au QG de JILL KORP. Elle passe par Jillian, la CEO, qui connaît toute l'équipe : elle découpe la demande en missions, " +
      "attribue chacune au bon agent (développeurs, veille, design, montage, SEO, cabinet…) et fait lancer leur travail sur l'ordinateur du QG. Renvoie la mission et " +
      "le plan de la CEO ; suis ensuite l'avancement avec suivre_mission. Les agents n'envoient jamais rien à l'extérieur.",
    inputSchema: { type: 'object', properties: { demande: { type: 'string', description: 'La demande, avec le plus de détails possible (contexte, livrable attendu, contraintes).' } }, required: ['demande'], additionalProperties: false },
    async lancer({ demande }) {
      const d = String(demande || '').trim().slice(0, 8000);
      if (!d) throw new Error('Demande vide.');
      if (!(await etatPc())) throw new Error('Le QG local est éteint : allume ton ordinateur et lance node live/server.js, puis réessaie.');
      const r = await demanderAuPc('ceo', { demande: d }, 240000);
      if (r.erreur) throw new Error(r.erreur);
      const m = r.mission;
      if (m.etat === 'echec') throw new Error(`La CEO n'a pas pu préparer la mission : ${m.message}`);
      return decrire(m, { consignes: true }) + (fini(m) ? '' : `\n\nSuis la mission avec suivre_mission (mission : "${m.id}", attendre_secondes : 240) jusqu'à ce qu'elle soit terminée.`);
    },
  },
  {
    name: 'suivre_mission',
    description: "Donne l'avancement d'une mission confiée à la CEO (par défaut la plus récente) et, une fois terminée, le compte rendu final de la CEO. " +
      'Avec attendre_secondes, attend jusqu\'à la fin de la mission (au plus 240 secondes) avant de répondre.',
    inputSchema: { type: 'object', properties: {
      mission: { type: 'string', description: 'Identifiant de la mission (facultatif : la plus récente sinon).' },
      attendre_secondes: { type: 'integer', minimum: 0, maximum: 240, description: 'Attendre la fin de la mission jusqu\'à ce nombre de secondes (0 : réponse immédiate).' },
    }, additionalProperties: false },
    async lancer({ mission, attendre_secondes: attendre = 0 }) {
      let id = mission;
      if (!id) { const l = await listeMissions(); if (!l.length) return 'Aucune mission récente.'; id = l[0].id; }
      if (!/^[0-9a-f-]{36}$/.test(String(id))) throw new Error('Identifiant de mission invalide.');
      const limite = Date.now() + Math.min(240, Math.max(0, attendre | 0)) * 1000;
      let m = await lireMission(id);
      if (!m) throw new Error('Mission inconnue.');
      while (!fini(m) && Date.now() < limite) { await pause(5000); m = (await lireMission(id)) || m; }
      return decrire(m) + (fini(m) ? '' : '\n\nLa mission continue : rappelle suivre_mission pour la suite.');
    },
  },
  {
    name: 'etat_du_qg',
    description: 'Ce qui se passe au QG en ce moment : les missions que pilote la CEO et les agents en train de travailler.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    async lancer() {
      const e = await etatPc();
      if (!e) return 'Le QG local est éteint : aucune tâche ne peut tourner pour le moment.';
      const l = [];
      const ms = e.missions || [];
      l.push(ms.length ? `Missions pilotées par la CEO : ${ms.length}` : 'Aucune mission en cours pour la CEO.');
      for (const m of ms) l.push(`- ${m.id} : « ${m.demande} » · ${m.faites}/${m.total} terminées`);
      const t = e.enCours || [];
      l.push('', t.length ? `Agents au travail : ${t.length} (au plus ${e.max} à la fois)` : 'Aucun agent sur une tâche.');
      for (const x of t) l.push(`- ${x.agent} : ${x.resume || 'tâche'}${x.derniere ? ` (dernière action : ${x.derniere})` : ''}`);
      return l.join('\n');
    },
  },
];

const PROMPTS = [{
  name: 'demander',
  description: 'Confier une demande au QG : la CEO la découpe et distribue le travail à l\'équipe, puis te rend son compte rendu.',
  arguments: [{ name: 'demande', description: 'Ce que tu veux que le QG fasse', required: true }],
  texte: (a) => `Confie cette demande au QG de JILL KORP avec l'outil demander_au_ceo, telle quelle :\n\n${a.demande || ''}\n\n` +
    "Montre-moi en quelques lignes comment la CEO a réparti le travail. Puis suis la mission avec suivre_mission (attendre_secondes : 240), " +
    'autant de fois que nécessaire, jusqu\'à ce qu\'elle soit terminée, et présente-moi le compte rendu final de la CEO.',
}];

/** Traite un message JSON-RPC ; renvoie la réponse, ou null pour une notification. */
export async function traiterMcp(msg) {
  const { id, method, params = {} } = msg || {};
  const ok = (result) => (id === undefined ? null : { jsonrpc: '2.0', id, result });
  const ko = (code, message) => (id === undefined ? null : { jsonrpc: '2.0', id, error: { code, message } });
  switch (method) {
    case 'initialize':
      return ok({ protocolVersion: VERSIONS.includes(params.protocolVersion) ? params.protocolVersion : VERSIONS[0],
        capabilities: { tools: {}, prompts: {} }, serverInfo: { name: 'qg-jill-korp', version: '1.0.0' },
        instructions: "Le QG de JILL KORP : pour une demande à confier à l'équipe d'agents, utilise demander_au_ceo, puis suivre_mission jusqu'à la fin." });
    case 'ping': return ok({});
    case 'tools/list': return ok({ tools: OUTILS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case 'tools/call': {
      const o = OUTILS.find(x => x.name === params.name);
      if (!o) return ko(-32602, `Outil inconnu : ${params.name}`);
      try { return ok({ content: [{ type: 'text', text: await o.lancer(params.arguments || {}) }] }); }
      catch (e) { return ok({ content: [{ type: 'text', text: e.message }], isError: true }); }
    }
    case 'prompts/list': return ok({ prompts: PROMPTS.map(({ name, description, arguments: a }) => ({ name, description, arguments: a })) });
    case 'prompts/get': {
      const p = PROMPTS.find(x => x.name === params.name);
      if (!p) return ko(-32602, `Commande inconnue : ${params.name}`);
      return ok({ description: p.description, messages: [{ role: 'user', content: { type: 'text', text: p.texte(params.arguments || {}) } }] });
    }
    default:
      if (method && method.startsWith('notifications/')) return null;
      return ko(-32601, `Méthode inconnue : ${method}`);
  }
}
