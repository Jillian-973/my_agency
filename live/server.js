// Serveur du QG — aucune dépendance, uniquement les modules fournis avec Node.
//
// 1. Il sert le dossier ../site, et n'écoute que sur 127.0.0.1 : joignable depuis cet ordinateur seulement.
// 2. Il fait parler les agents avec Claude Code (CLI « claude », mode non interactif) :
//    - Discuter : réponse sans aucun outil, avec la personnalité de l'agent (EQUIPE.md). Rien n'est enregistré.
//    - Confier une tâche : vraie session Claude Code, modèle Sonnet, dans live/travaux/<Prénom>/,
//      outils de lecture, d'écriture et de modification de fichiers + recherche web, 2 $ maximum par tâche,
//      4 tâches en même temps au maximum. La page ne reçoit que le nom de l'outil et le nom du fichier.
// 3. L'API refuse toute demande qui ne vient pas de la page du QG (hôte, origine, jeton secret).
//
// Lancement :  node live/server.js
// Autre port : PowerShell : $env:PORT=9000; node live/server.js
// Autre chemin pour Claude Code : $env:QG_CLAUDE="C:\chemin\claude.exe"

'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { spawn, spawnSync } = require('node:child_process');

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT) || 8787;
const RACINE = path.resolve(__dirname, '..');
const ROOT = path.join(RACINE, 'site');
const TRAVAUX = path.join(__dirname, 'travaux');
const EQUIPE_MD = path.join(RACINE, 'EQUIPE.md');

const BUDGET_TACHE = 2;            // dollars par tâche
const BUDGET_DISCUSSION = 0.25;    // dollars par réponse en discussion
const TACHES_MAX = 4;              // tâches en même temps
const DUREE_MAX_TACHE = 30 * 60e3; // une tâche est arrêtée au bout de 30 minutes
const OUTILS_TACHE = ['Read', 'Write', 'Edit', 'WebSearch', 'WebFetch'];
const BUDGET_CORBEILLE = 0.5;      // dollars pour mettre à la corbeille les mails que tu as validés
const CNX = require('./connecteurs.js');

// Jeton secret, recréé à chaque démarrage : il est glissé dans la page du QG et exigé par l'API.
// Une page d'un autre site ne peut pas le lire (même origine obligatoire), donc ne peut pas appeler l'API.
const JETON = crypto.randomBytes(24).toString('hex');
const HOTES_OK = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
const ORIGINES_OK = new Set([`http://127.0.0.1:${PORT}`, `http://localhost:${PORT}`]);

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
  // polices : sans le bon type, avec « nosniff », certains navigateurs les refusent et affichent la police système
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '': 'text/plain; charset=utf-8',
};

/* ===================== L'équipe, lue dans EQUIPE.md ===================== */
const sansAccents = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
function lireEquipe() {
  const agents = {};
  let pole = null, courant = null;
  for (const ligne of fs.readFileSync(EQUIPE_MD, 'utf8').split(/\r?\n/)) {
    const p = ligne.match(/^##\s+Pôle\s+(.+?)\s*(\(|$)/);
    if (p) { pole = p[1].trim(); courant = null; continue; }
    if (/^##\s/.test(ligne)) { pole = null; courant = null; continue; }
    const a = pole && ligne.match(/^-\s+(\S+)\s+·\s+(.+)$/);
    if (a) {
      const prenom = a[1].trim();
      courant = { id: sansAccents(prenom).toLowerCase(), prenom, poste: a[2].trim(), pole, missions: [], outils: [] };
      agents[courant.id] = courant;
      continue;
    }
    const m = courant && ligne.match(/^\s+Missions\s*:\s*(.+)$/);
    if (m) { courant.missions = [m[1].trim()]; continue; }
    const o = courant && ligne.match(/^\s+Outils\s*:\s*(.+)$/);
    if (o) courant.outils = o[1].split(',').map(s => s.trim());
  }
  return agents;
}
let EQUIPE = {};
try { EQUIPE = lireEquipe(); } catch (e) { console.error('EQUIPE.md illisible :', e.message); }

function personnalite(a) {
  return [
    `Tu es ${a.prenom}, ${a.poste} du pôle ${a.pole} au QG de JILL KORP, l'agence de la personne qui te parle (c'est ta patronne ou ton patron).`,
    `Tes missions : ${a.missions.join(' ; ')}.`,
    `Tes outils habituels : ${a.outils.join(', ')}.`,
    `Tu parles en français, tu tutoies, ton direct et chaleureux, comme un collègue. Tu restes dans ton rôle et dans ton domaine.`,
  ].join('\n');
}

/* ===================== Claude Code ===================== */
function trouverClaude() {
  if (process.env.QG_CLAUDE) return process.env.QG_CLAUDE;
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['claude'], { encoding: 'utf8' });
  const lignes = (r.stdout || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  return lignes.find(l => /\.exe$/i.test(l)) || lignes[0] || null;
}
const CLAUDE = trouverClaude();
// options communes : pas de serveurs MCP, pas de commandes, réglages personnels ignorés,
// outils de fichiers confinés au dossier de travail (--restricted)
const COMMUNES = ['--restricted', '--strict-mcp-config', '--disable-slash-commands'];

/** Discuter : une réponse, sans aucun outil, sans rien enregistrer. */
function discuter(agent, messages) {
  return new Promise((resolve, reject) => {
    if (!CLAUDE) return reject(new Error('Claude Code est introuvable sur cet ordinateur.'));
    const dossier = path.join(os.tmpdir(), 'qg-jill-korp-discussion');   // dossier vide : aucun CLAUDE.md de projet
    fs.mkdirSync(dossier, { recursive: true });
    const systeme = personnalite(agent) + '\n' +
      'Dans cette discussion tu n\'as accès à aucun outil : tu ne peux ni lire ni écrire de fichier ni chercher sur le web. ' +
      'Si on te demande d\'agir, explique gentiment qu\'il faut te confier une tâche (bouton « Confier une tâche »). ' +
      'Réponds en quelques phrases, sans titres ni listes longues.';
    const fil = messages.map(m => `${m.role === 'agent' ? agent.prenom : 'Moi'} : ${m.texte}`).join('\n\n');
    const consigne = `Voici notre discussion jusqu'ici :\n\n${fil}\n\nRéponds au dernier message, en tant que ${agent.prenom}.`;
    const args = ['-p', '--model', 'sonnet', ...COMMUNES, '--tools', '', '--no-session-persistence',
      '--max-budget-usd', String(BUDGET_DISCUSSION), '--output-format', 'json', '--system-prompt', systeme];
    const enfant = spawn(CLAUDE, args, { cwd: dossier, windowsHide: true });
    let sortie = '', erreurs = '';
    enfant.stdout.on('data', d => { sortie += d; });
    enfant.stderr.on('data', d => { erreurs += d; });
    const minuteur = setTimeout(() => enfant.kill(), 120e3);
    enfant.on('error', (e) => { clearTimeout(minuteur); reject(e); });
    enfant.on('close', () => {
      clearTimeout(minuteur);
      try {
        const j = JSON.parse(sortie);
        if (j.is_error) return reject(new Error(j.result || 'Claude Code a renvoyé une erreur.'));
        resolve({ reponse: String(j.result || '').trim() });
      } catch { reject(new Error((erreurs || sortie || 'Réponse illisible de Claude Code.').slice(0, 300))); }
    });
    enfant.stdin.end(consigne);
  });
}

/* ===================== Tâches ===================== */
const taches = new Map();   // id → tâche (gardées en mémoire, les 50 dernières)
const enCours = () => [...taches.values()].filter(t => t.etat === 'en cours');

function listerFichiers(dossier, base = dossier, acc = new Set()) {
  if (!fs.existsSync(dossier)) return acc;
  for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
    const p = path.join(dossier, e.name);
    if (e.isDirectory()) listerFichiers(p, base, acc); else acc.add(path.relative(base, p).split(path.sep).join('/'));
  }
  return acc;
}
function diffuser(t, evt) {
  t.evenements.push(evt);
  const ligne = `data: ${JSON.stringify(evt)}\n\n`;
  for (const res of t.abonnes) res.write(ligne);
}
/** Nom du fichier touché par un outil (jamais son contenu, jamais une requête ou une adresse web). */
function fichierDe(entree) {
  const p = entree && (entree.file_path || entree.path || entree.notebook_path);
  return typeof p === 'string' ? path.basename(p) : null;
}

/**
 * Lance une tâche. Trois cas :
 * - agent sans connecteur : outils de fichiers et recherche web seulement, aucun serveur MCP (--strict-mcp-config) ;
 * - agent avec connecteurs (EQUIPE.md, ligne « Outils ») : en plus, les outils précis prévus pour lui (live/connecteurs.js),
 *   tous les autres outils de tous les connecteurs interdits, et la session attend que les connecteurs soient branchés ;
 * - mode « corbeille » : uniquement trash_thread, sur la liste exacte de mails que tu as validée dans la page.
 */
function lancerTache(agent, consigne, { mode = 'tache', idsCorbeille = null } = {}) {
  const id = crypto.randomUUID();
  const dossier = path.join(TRAVAUX, agent.prenom);
  fs.mkdirSync(dossier, { recursive: true });
  const avant = listerFichiers(dossier);
  const t = { id, agent: agent.id, prenom: agent.prenom, mode, etat: 'en cours', debut: Date.now(), dossier, evenements: [], abonnes: new Set(), corbeille: [] };
  taches.set(id, t);
  if (taches.size > 50) for (const [k, v] of taches) { if (v.etat !== 'en cours') { taches.delete(k); break; } }
  const budgetMax = mode === 'corbeille' ? BUDGET_CORBEILLE : BUDGET_TACHE;
  diffuser(t, { type: 'debut', prenom: agent.prenom });
  demarrer().catch((e) => terminer({ erreur: `Impossible de lancer Claude Code : ${e.message}` }));

  async function demarrer() {
    const avecConnecteurs = mode === 'corbeille' || CNX.aDesConnecteurs(agent.id);
    let systeme = personnalite(agent) + '\n' +
      'Tu travailles dans ton dossier de travail (le dossier courant) : c\'est là que tu ranges tout ce que tu produis, sous forme de fichiers. ' +
      'Tu peux lire, écrire et modifier des fichiers de ce dossier et chercher sur le web' + (avecConnecteurs ? '. ' + CNX.consignes(agent.id) + ' ' : ' ; rien d\'autre. ') +
      'Quand tu as fini, termine par un compte rendu court en français : ce que tu as fait, les fichiers créés, et ce qu\'il reste éventuellement à faire.';
    const fin = ['--permission-mode', 'acceptEdits', '--max-budget-usd', String(budgetMax), '--output-format', 'stream-json', '--verbose'];
    let args, env = process.env;
    if (!avecConnecteurs) {
      args = ['-p', '--model', 'sonnet', ...COMMUNES, '--tools', OUTILS_TACHE.join(','), '--allowedTools', OUTILS_TACHE.join(','), ...fin];
    } else {
      diffuser(t, { type: 'info', texte: 'Branchement des connecteurs…' });
      const d = await CNX.decouvrir(CLAUDE);
      if (t.etat !== 'en cours') return;
      const r = CNX.regles(agent.id, d, mode);
      if (r.absents.length) diffuser(t, { type: 'info', texte: `Pas branché : ${r.absents.join(', ')} (à reconnecter avec /mcp dans un terminal « claude »).` });
      if (mode === 'corbeille') {
        if (r.absents.length) return terminer({ erreur: 'Gmail n\'est pas branché : aucun mail n\'a été touché.' });
        systeme = personnalite(agent) + '\nTu mets à la corbeille Gmail exactement les fils listés dans la consigne, avec l\'outil trash_thread, un appel par identifiant, ' +
          'et rien d\'autre. Termine par un compte rendu court en français : combien de fils sont partis à la corbeille.';
      }
      const outilsFichiers = mode === 'corbeille' ? [] : OUTILS_TACHE;
      // sans --strict-mcp-config : la session charge tes connecteurs claude.ai ; --disallowedTools les cache tous sauf les outils prévus
      args = ['-p', '--model', 'sonnet', '--restricted', '--disable-slash-commands', '--tools', outilsFichiers.join(','),
        '--allowedTools', [...outilsFichiers, ...r.autorises].join(','), '--disallowedTools', r.interdits.join(','), ...fin];
      env = { ...process.env, MCP_CONNECTION_NONBLOCKING: 'false' };   // attendre que les connecteurs soient branchés avant de commencer
    }
    args.push('--append-system-prompt', systeme);
    if (args.join(' ').length > 30000) return terminer({ erreur: 'Liste d\'outils trop longue pour la ligne de commande.' });
    lancer(args, env);
  }

  let enfant = null;
  function lancer(args, env) {
    try { enfant = spawn(CLAUDE, args, { cwd: dossier, windowsHide: true, env }); }
    catch (e) { return terminer({ erreur: e.message }); }
    t.enfant = enfant;
    let tampon = '', resultat = null, erreurs = '';
    enfant.stdout.on('data', (d) => {
      tampon += d;
      let i;
      while ((i = tampon.indexOf('\n')) >= 0) {
        const ligne = tampon.slice(0, i).trim(); tampon = tampon.slice(i + 1);
        if (!ligne) continue;
        let j; try { j = JSON.parse(ligne); } catch { continue; }
        if (j.type === 'assistant' && j.message && Array.isArray(j.message.content)) {
          for (const c of j.message.content) {
            if (c.type !== 'tool_use') continue;
            diffuser(t, { type: 'outil', outil: CNX.nomLisible(c.name), fichier: fichierDe(c.input) });
            // garde-fou : un appel interdit (envoi, corbeille sans accord, mail hors liste…) arrête aussitôt la session
            if (String(c.name).startsWith('mcp__')) {
              const alerte = CNX.controler(agent.id, c.name, c.input, mode, idsCorbeille);
              if (alerte) { try { enfant.kill(); } catch { /* déjà arrêtée */ } return terminer({ erreur: `Session arrêtée par le garde-fou : ${alerte}.`, fichiers: nouveaux() }); }
              if (mode === 'corbeille') t.corbeille.push(String(c.input.threadId));
            }
          }
        } else if (j.type === 'result') resultat = j;
      }
    });
    enfant.stderr.on('data', (d) => { erreurs += d; if (erreurs.length > 4000) erreurs = erreurs.slice(-4000); });
    const minuteur = setTimeout(() => { enfant.kill(); erreurs += '\nTâche arrêtée : plus de 30 minutes.'; }, DUREE_MAX_TACHE);
    enfant.on('error', (e) => { clearTimeout(minuteur); terminer({ erreur: `Impossible de lancer Claude Code : ${e.message}` }); });
    enfant.on('close', () => {
      clearTimeout(minuteur);
      if (t.etat !== 'en cours') return;
      const crees = nouveaux();
      if (!resultat) return terminer({ erreur: (erreurs.trim() || 'Claude Code s\'est arrêté sans compte rendu.').slice(-400), fichiers: crees });
      const budget = /budget/i.test(resultat.subtype || '');
      terminer({
        ok: !resultat.is_error,
        compteRendu: String(resultat.result || '').trim() || (budget ? `Tâche arrêtée : le plafond de ${budgetMax} $ est atteint.` : ''),
        erreur: resultat.is_error ? (budget ? `Plafond de ${budgetMax} $ atteint.` : `Arrêt : ${resultat.subtype || 'erreur'}`) : null,
        fichiers: crees,
        cout: typeof resultat.total_cost_usd === 'number' ? Math.round(resultat.total_cost_usd * 100) / 100 : null,
      });
    });
    enfant.stdin.end(consigne);
  }
  const nouveaux = () => [...listerFichiers(dossier)].filter(f => !avant.has(f)).sort();

  function terminer(fin) {
    if (t.etat !== 'en cours') return;
    t.etat = 'terminee'; t.fin = Date.now(); delete t.enfant;
    // mails que l'agent propose de mettre à la corbeille (a-supprimer.json) : tu les valides dans la page
    t.propositions = mode === 'tache' && CNX.PROPOSE_CORBEILLE.has(agent.id) ? CNX.lirePropositions(dossier, t.debut) : [];
    diffuser(t, {
      type: 'fin', ok: !!fin.ok, compteRendu: fin.compteRendu || '', erreur: fin.erreur || null, fichiers: fin.fichiers || [], cout: fin.cout ?? null,
      propositions: t.propositions, corbeille: mode === 'corbeille' ? t.corbeille.length : undefined,
    });
    for (const res of t.abonnes) res.end();
    t.abonnes.clear();
  }
  return t;
}

function ouvrirDossier(dossier) {
  fs.mkdirSync(dossier, { recursive: true });
  const [cmd, args] = process.platform === 'win32' ? ['explorer.exe', [dossier]] : process.platform === 'darwin' ? ['open', [dossier]] : ['xdg-open', [dossier]];
  spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: false }).unref();
}

/* ===================== Sécurité de l'API ===================== */
// Une demande n'est acceptée que si : elle arrive par l'adresse locale (protège du « DNS rebinding »),
// son origine est la page du QG quand le navigateur l'indique, et elle porte le jeton secret de la page.
function hoteOk(req) { return HOTES_OK.has(String(req.headers.host || '').toLowerCase()); }
function demandeDuQG(req) {
  if (!hoteOk(req)) return false;
  const origine = req.headers.origin;
  if (origine && !ORIGINES_OK.has(origine)) return false;
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin') return false;
  const jeton = req.headers['x-qg-jeton'];            // en-tête seulement : le jeton n'apparaît jamais dans une adresse
  if (typeof jeton !== 'string' || jeton.length !== JETON.length) return false;
  return crypto.timingSafeEqual(Buffer.from(jeton), Buffer.from(JETON));
}

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
  res.end(body);
}
const json = (res, status, obj) => send(res, status, JSON.stringify(obj), 'application/json; charset=utf-8');
function lireCorps(req, max = 32 * 1024) {
  return new Promise((resolve, reject) => {
    let n = 0; const morceaux = [];
    req.on('data', (d) => { n += d.length; if (n > max) { reject(new Error('trop gros')); req.destroy(); } else morceaux.push(d); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(morceaux).toString('utf8') || '{}')); } catch { reject(new Error('JSON invalide')); } });
    req.on('error', reject);
  });
}
const texte = (s, max) => (typeof s === 'string' ? s.trim().slice(0, max) : '');

async function api(req, res, url) {
  if (!demandeDuQG(req)) return json(res, 403, { erreur: 'Demande refusée : elle ne vient pas de la page du QG.' });
  const p = url.pathname;

  if (req.method === 'GET' && p === '/api/etat') {
    const connecteurs = Object.fromEntries(Object.keys(EQUIPE).filter(CNX.aDesConnecteurs).map(id => [id, CNX.connecteursDe(id)]));
    return json(res, 200, { claude: !!CLAUDE, enCours: enCours().map(t => ({ id: t.id, agent: t.agent })), max: TACHES_MAX, connecteurs });
  }

  if (req.method === 'POST' && (p === '/api/discuter' || p === '/api/taches')) {
    if ((req.headers['content-type'] || '').split(';')[0] !== 'application/json') return json(res, 415, { erreur: 'JSON attendu.' });
    let corps; try { corps = await lireCorps(req); } catch (e) { return json(res, 400, { erreur: e.message }); }
    const agent = EQUIPE[String(corps.agent || '')];
    if (!agent) return json(res, 404, { erreur: 'Agent inconnu dans EQUIPE.md.' });
    if (!CLAUDE) return json(res, 503, { erreur: 'Claude Code est introuvable sur cet ordinateur (commande « claude »).' });

    if (p === '/api/discuter') {
      const messages = (Array.isArray(corps.messages) ? corps.messages : []).slice(-12)
        .map(m => ({ role: m && m.role === 'agent' ? 'agent' : 'moi', texte: texte(m && m.texte, 2000) })).filter(m => m.texte);
      if (!messages.length || messages[messages.length - 1].role !== 'moi') return json(res, 400, { erreur: 'Message vide.' });
      try { return json(res, 200, await discuter(agent, messages)); }
      catch (e) { return json(res, 502, { erreur: e.message }); }
    }

    const consigne = texte(corps.consigne, 8000);
    if (!consigne) return json(res, 400, { erreur: 'Consigne vide.' });
    if (enCours().some(t => t.agent === agent.id)) return json(res, 409, { erreur: `${agent.prenom} est déjà sur une tâche.` });
    if (enCours().length >= TACHES_MAX) return json(res, 429, { erreur: `${TACHES_MAX} tâches tournent déjà : attends qu'une se termine.` });
    const t = lancerTache(agent, consigne);
    return json(res, 201, { id: t.id, dossier: path.relative(RACINE, t.dossier).split(path.sep).join('/') });
  }

  const m = p.match(/^\/api\/taches\/([0-9a-f-]{36})\/(flux|ouvrir|corbeille)$/);
  const t = m && taches.get(m[1]);
  if (m && !t) return json(res, 404, { erreur: 'Tâche inconnue.' });

  // Corbeille Gmail, seulement sur ton accord : les mails cochés dans la page, parmi ceux que l'agent a proposés
  if (m && m[2] === 'corbeille' && req.method === 'POST') {
    if ((req.headers['content-type'] || '').split(';')[0] !== 'application/json') return json(res, 415, { erreur: 'JSON attendu.' });
    let corps; try { corps = await lireCorps(req); } catch (e) { return json(res, 400, { erreur: e.message }); }
    const agent = EQUIPE[t.agent];
    if (t.etat !== 'terminee' || !t.propositions || !t.propositions.length) return json(res, 400, { erreur: 'Aucune proposition à valider pour cette tâche.' });
    if (t.corbeilleLancee) return json(res, 409, { erreur: 'Ces propositions ont déjà été traitées.' });
    const proposes = new Map(t.propositions.map(x => [x.threadId, x]));
    const ids = [...new Set((Array.isArray(corps.threadIds) ? corps.threadIds : []).map(String))];
    if (!ids.length || ids.some(i => !proposes.has(i))) return json(res, 400, { erreur: 'Choisis des mails parmi ceux que l\'agent a proposés.' });
    if (enCours().some(x => x.agent === agent.id)) return json(res, 409, { erreur: `${agent.prenom} est déjà sur une tâche.` });
    if (enCours().length >= TACHES_MAX) return json(res, 429, { erreur: `${TACHES_MAX} tâches tournent déjà : attends qu'une se termine.` });
    t.corbeilleLancee = true;
    const liste = ids.map(i => { const x = proposes.get(i); return `- ${i} (${x.de} · ${x.objet})`; }).join('\n');
    const nt = lancerTache(agent, `Mets à la corbeille ces ${ids.length} fils Gmail, que j'ai validés :\n${liste}`, { mode: 'corbeille', idsCorbeille: new Set(ids) });
    return json(res, 201, { id: nt.id });
  }
  if (m && m[2] === 'flux' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Content-Type-Options': 'nosniff' });
    for (const evt of t.evenements) res.write(`data: ${JSON.stringify(evt)}\n\n`);
    if (t.etat !== 'en cours') return res.end();
    t.abonnes.add(res);
    const pouls = setInterval(() => res.write(': pouls\n\n'), 20e3);
    req.on('close', () => { clearInterval(pouls); t.abonnes.delete(res); });
    return;
  }
  if (m && m[2] === 'ouvrir' && req.method === 'POST') { ouvrirDossier(t.dossier); return json(res, 200, { ok: true }); }

  return json(res, 404, { erreur: 'Route inconnue.' });
}

/* ===================== Fichiers du site ===================== */
const server = http.createServer((req, res) => {
  if (!hoteOk(req)) return send(res, 403, 'Accès refusé');
  let url;
  try { url = new URL(req.url, `http://${req.headers.host}`); } catch { return send(res, 400, 'Adresse invalide'); }
  if (url.pathname.startsWith('/api/')) return void api(req, res, url).catch(() => json(res, 500, { erreur: 'Erreur du serveur.' }));
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Méthode non autorisée');

  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { return send(res, 400, 'Adresse invalide'); }
  let file = path.resolve(ROOT, '.' + path.sep + pathname);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return send(res, 403, 'Accès refusé');

  fs.stat(file, (err, stat) => {
    if (!err && stat.isDirectory()) { file = path.join(file, 'index.html'); return serve(file); }
    if (err) return send(res, 404, 'Introuvable : ' + pathname);
    serve(file, stat);
  });

  function serve(f, knownStat) {
    const go = (stat) => {
      const type = TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream';
      // la page du QG reçoit le jeton secret de ce démarrage (jamais mise en cache)
      if (path.basename(f) === 'index.html' && path.dirname(f) === ROOT) {
        return fs.readFile(f, 'utf8', (e, html) => e ? send(res, 500, 'Erreur') : send(res, 200, html.replace('__JETON_QG__', JETON), type));
      }
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.size, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(f).on('error', () => res.destroy()).pipe(res);
    };
    if (knownStat) return go(knownStat);
    fs.stat(f, (err, stat) => (err || !stat.isFile()) ? send(res, 404, 'Introuvable : ' + pathname) : go(stat));
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') console.error(`Le port ${PORT} est déjà utilisé. Essaie un autre port (variable PORT).`);
  else console.error(err);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`QG JILL KORP prêt : http://${HOST}:${PORT}`);
  console.log('Accessible uniquement depuis cet ordinateur. Ctrl+C pour arrêter.');
  console.log(CLAUDE ? `Claude Code : ${CLAUDE}` : 'Attention : Claude Code introuvable, les agents ne pourront pas répondre.');
  console.log(`Agents lus dans EQUIPE.md : ${Object.keys(EQUIPE).length}`);
  for (const a of CNX.verifierEquipe(EQUIPE)) console.log(`Attention, connecteurs : ${a}`);
  // repérage des connecteurs branchés dès le démarrage, pour que la première tâche démarre plus vite
  if (CLAUDE) CNX.decouvrir(CLAUDE).then((d) => {
    if (!d.serveurs.length) return console.log('Connecteurs : aucun repéré (ils seront recherchés à la première tâche).');
    console.log('Connecteurs : ' + d.serveurs.map(s => `${s.nom.replace(/^claude\.ai /, '')}${s.statut === 'connected' ? '' : ` (${s.statut})`}`).join(', '));
  });
});
