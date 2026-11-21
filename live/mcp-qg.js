#!/usr/bin/env node
// MCP du QG : depuis une session Claude Code, tes demandes passent par Jillian, la CEO, qui distribue le travail
// à l'équipe. Ce programme parle à Claude Code par l'entrée et la sortie standard (protocole MCP, JSON-RPC ligne
// par ligne, écrit à la main, sans dépendance) et au serveur du QG en marche (live/server.js), sur cet ordinateur.
//
// Outils : demander_au_ceo, suivre_mission, etat_du_qg. Commande : /mcp__qg__demander <ta demande>.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const SESSION = path.join(__dirname, '.qg-session.json');   // écrit par le serveur du QG à son démarrage
const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const journal = (...a) => process.stderr.write(a.join(' ') + '\n');   // la sortie standard est réservée au protocole

/* ---------- le serveur du QG ---------- */
class QgEteint extends Error {}
function session() {
  try { const s = JSON.parse(fs.readFileSync(SESSION, 'utf8')); if (s.port && s.jeton) return s; } catch { /* pas démarré */ }
  throw new QgEteint('Le QG n\'est pas démarré. Lance-le dans un terminal : node live/server.js (dans le dossier du projet), puis réessaie.');
}
function appeler(methode, chemin, corps) {
  const s = session();
  return new Promise((resolve, reject) => {
    const donnees = corps ? JSON.stringify(corps) : null;
    const req = http.request({
      host: '127.0.0.1', port: s.port, path: chemin, method: methode,
      headers: { 'x-qg-jeton': s.jeton, ...(donnees ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(donnees) } : {}) },
    }, (res) => {
      let t = ''; res.setEncoding('utf8');
      res.on('data', d => { t += d; });
      res.on('end', () => {
        let j = {}; try { j = JSON.parse(t || '{}'); } catch { /* réponse vide */ }
        if (res.statusCode >= 400) return reject(new Error(j.erreur || `Le QG a répondu ${res.statusCode}.`));
        resolve(j);
      });
    });
    req.setTimeout(6 * 60e3, () => req.destroy(new Error('Le QG ne répond pas.')));
    req.on('error', (e) => reject(e.code === 'ECONNREFUSED' ? new QgEteint('Le QG n\'est pas démarré (connexion refusée). Lance node live/server.js, puis réessaie.') : e));
    if (donnees) req.write(donnees);
    req.end();
  });
}

/* ---------- mise en forme des réponses ---------- */
const ETATS = { attente: 'en attente', 'en cours': 'en cours', terminee: 'terminé', echec: 'arrêté' };
function decrire(m, { consignes = false } = {}) {
  const l = [];
  const titre = { planification: 'en préparation par la CEO', 'en cours': `en cours (étape ${m.etape})`, synthese: 'la CEO rédige son compte rendu', terminee: 'terminée', echec: 'échouée' }[m.etat] || m.etat;
  l.push(`Mission ${m.id} : ${titre}.`);
  if (m.message) l.push(`Jillian : ${m.message}`);
  for (const st of m.sousTaches) {
    l.push(`- ${st.prenom}${m.sousTaches.some(x => x.etape > 1) ? ` (étape ${st.etape})` : ''} : ${ETATS[st.etat] || st.etat}`);
    if (consignes) l.push(`  consigne : ${st.consigne}`);
    if (st.fichiers && st.fichiers.length) l.push(`  fichiers : ${st.fichiers.join(', ')}`);
  }
  if (m.etat === 'terminee' && m.synthese) {
    l.push('', '— Compte rendu de la CEO —', m.synthese);
    if (m.fichier) l.push('', `(compte rendu enregistré dans ${m.fichier})`);
  }
  if (typeof m.cout === 'number' && m.cout > 0) l.push(``, `Coût de la mission jusqu'ici : ${m.cout.toFixed(2)} $`);
  return l.join('\n');
}
const fini = (m) => m.etat === 'terminee' || m.etat === 'echec';
const pause = (ms) => new Promise(r => setTimeout(r, ms));

/* ---------- les outils ---------- */
const OUTILS = [
  {
    name: 'demander_au_ceo',
    description: "Confie une demande au QG de JILL KORP. Elle passe par Jillian, la CEO, qui connaît toute l'équipe : elle découpe la demande en missions, " +
      "attribue chacune au bon agent (développeurs, veille, design, montage, SEO, cabinet…) et fait lancer leur travail. Renvoie la mission et le plan de la CEO ; " +
      "suis ensuite l'avancement avec suivre_mission. Les agents travaillent dans leurs dossiers live/travaux/<Prénom>/ et n'envoient jamais rien à l'extérieur.",
    inputSchema: { type: 'object', properties: { demande: { type: 'string', description: 'La demande, avec le plus de détails possible (contexte, livrable attendu, contraintes).' } }, required: ['demande'], additionalProperties: false },
    async lancer({ demande }) {
      const d = String(demande || '').trim();
      if (!d) throw new Error('Demande vide.');
      const m = await appeler('POST', '/api/ceo', { demande: d });
      if (m.etat === 'echec') throw new Error(`La CEO n'a pas pu préparer la mission : ${m.message}`);
      return decrire(m, { consignes: true }) + (fini(m) ? '' : `\n\nSuis la mission avec suivre_mission (mission : "${m.id}", attendre_secondes : 240) jusqu'à ce qu'elle soit terminée.`);
    },
  },
  {
    name: 'suivre_mission',
    description: "Donne l'avancement d'une mission confiée à la CEO (par défaut la plus récente) et, une fois terminée, le compte rendu final de la CEO. " +
      "Avec attendre_secondes, attend jusqu'à la fin de la mission (au plus 300 secondes) avant de répondre.",
    inputSchema: { type: 'object', properties: {
      mission: { type: 'string', description: 'Identifiant de la mission (facultatif : la plus récente sinon).' },
      attendre_secondes: { type: 'integer', minimum: 0, maximum: 300, description: 'Attendre la fin de la mission jusqu\'à ce nombre de secondes (0 : réponse immédiate).' },
    }, additionalProperties: false },
    async lancer({ mission, attendre_secondes: attendre = 0 }) {
      let id = mission;
      if (!id) { const l = (await appeler('GET', '/api/missions')).missions || []; if (!l.length) return 'Aucune mission en mémoire (le QG a peut-être redémarré).'; id = l[0].id; }
      const limite = Date.now() + Math.min(300, Math.max(0, attendre | 0)) * 1000;
      let m = await appeler('GET', `/api/missions/${encodeURIComponent(id)}`);
      while (!fini(m) && Date.now() < limite) { await pause(5000); m = await appeler('GET', `/api/missions/${encodeURIComponent(id)}`); }
      return decrire(m) + (fini(m) ? '' : '\n\nLa mission continue : rappelle suivre_mission pour la suite.');
    },
  },
  {
    name: 'etat_du_qg',
    description: 'Ce qui se passe au QG en ce moment : les missions que pilote la CEO et les agents en train de travailler.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    async lancer() {
      const e = await appeler('GET', '/api/etat');
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

/* ---------- la commande /mcp__qg__demander ---------- */
const PROMPTS = [{
  name: 'demander',
  description: 'Confier une demande au QG : la CEO la découpe et distribue le travail à l\'équipe, puis te rend son compte rendu.',
  arguments: [{ name: 'demande', description: 'Ce que tu veux que le QG fasse', required: true }],
  texte: (a) => `Confie cette demande au QG de JILL KORP avec l'outil demander_au_ceo, telle quelle :\n\n${a.demande || ''}\n\n` +
    "Montre-moi en quelques lignes comment la CEO a réparti le travail. Puis suis la mission avec suivre_mission (attendre_secondes : 240), " +
    'autant de fois que nécessaire, jusqu\'à ce qu\'elle soit terminée, et présente-moi le compte rendu final de la CEO.',
}];

/* ---------- protocole MCP (JSON-RPC 2.0, un message par ligne) ---------- */
const envoyer = (msg) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...msg }) + '\n');
async function traiter(msg) {
  const { id, method, params = {} } = msg;
  const repondre = (result) => { if (id !== undefined) envoyer({ id, result }); };
  const erreur = (code, message) => { if (id !== undefined) envoyer({ id, error: { code, message } }); };
  switch (method) {
    case 'initialize':
      return repondre({
        protocolVersion: VERSIONS.includes(params.protocolVersion) ? params.protocolVersion : VERSIONS[0],
        capabilities: { tools: {}, prompts: {} },
        serverInfo: { name: 'qg', version: '1.0.0' },
        instructions: "Le QG de JILL KORP : pour une demande à confier à l'équipe d'agents, utilise demander_au_ceo, puis suivre_mission jusqu'à la fin.",
      });
    case 'ping': return repondre({});
    case 'tools/list': return repondre({ tools: OUTILS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case 'tools/call': {
      const outil = OUTILS.find(o => o.name === params.name);
      if (!outil) return erreur(-32602, `Outil inconnu : ${params.name}`);
      // une session d'agent du QG ne rappelle jamais la CEO (pas de boucle, pas de dépenses en cascade)
      if (process.env.QG_AGENT) return repondre({ content: [{ type: 'text', text: 'Refusé : un agent du QG ne peut pas confier de demande à la CEO.' }], isError: true });
      try { return repondre({ content: [{ type: 'text', text: await outil.lancer(params.arguments || {}) }] }); }
      catch (e) { return repondre({ content: [{ type: 'text', text: e.message }], isError: true }); }
    }
    case 'prompts/list': return repondre({ prompts: PROMPTS.map(({ name, description, arguments: a }) => ({ name, description, arguments: a })) });
    case 'prompts/get': {
      const p = PROMPTS.find(x => x.name === params.name);
      if (!p) return erreur(-32602, `Commande inconnue : ${params.name}`);
      return repondre({ description: p.description, messages: [{ role: 'user', content: { type: 'text', text: p.texte(params.arguments || {}) } }] });
    }
    default:
      if (method && method.startsWith('notifications/')) return;   // initialized, cancelled… : rien à répondre
      return erreur(-32601, `Méthode inconnue : ${method}`);
  }
}

let tampon = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => {
  tampon += d;
  let i;
  while ((i = tampon.indexOf('\n')) >= 0) {
    const ligne = tampon.slice(0, i).trim(); tampon = tampon.slice(i + 1);
    if (!ligne) continue;
    let msg; try { msg = JSON.parse(ligne); } catch { envoyer({ id: null, error: { code: -32700, message: 'JSON illisible' } }); continue; }
    traiter(msg).catch((e) => journal('MCP du QG :', e.message));
  }
});
process.stdin.on('end', () => process.exit(0));
journal('MCP du QG prêt.');
