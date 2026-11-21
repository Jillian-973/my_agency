// Connecteurs des agents (claude.ai : Gmail, Google Agenda, Notion, Google Drive, Figma, Vercel, Cloudflare…).
//
// Seuls certains agents s'en servent pendant leurs tâches, d'après la ligne « Outils » de EQUIPE.md.
// Pour chacun : la liste précise des outils autorisés (--allowedTools) ; TOUS les autres outils de TOUS les
// connecteurs sont interdits (--disallowedTools), pour que la session ne les voie même pas.
// Les discussions et les agents sans connecteur n'utilisent jamais ce module.
'use strict';

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

// préfixes des outils, tels que les nomme Claude Code : « claude.ai Google Drive » → mcp__claude_ai_Google_Drive__…
const GMAIL = 'claude_ai_Gmail', AGENDA = 'claude_ai_Google_Calendar', NOTION = 'claude_ai_Notion', DRIVE = 'claude_ai_Google_Drive',
  FIGMA = 'claude_ai_Figma', VERCEL = 'claude_ai_Vercel', CLOUDFLARE = 'claude_ai_Cloudflare_Developer_Platform';
const NOMS = { [GMAIL]: 'Gmail', [AGENDA]: 'Google Agenda', [NOTION]: 'Notion', [DRIVE]: 'Google Drive', [FIGMA]: 'Figma', [VERCEL]: 'Vercel', [CLOUDFLARE]: 'Cloudflare' };
// mots de la ligne « Outils » de EQUIPE.md qui correspondent à chaque connecteur (pour vérifier la cohérence au démarrage)
const MOTS = { [GMAIL]: /gmail/i, [AGENDA]: /agenda/i, [NOTION]: /notion/i, [DRIVE]: /google (sheets|slides|docs)/i, [FIGMA]: /figma/i, [VERCEL]: /vercel/i, [CLOUDFLARE]: /cloudflare/i };

/* ---------- jeux d'outils ---------- */
const NOTION_LIRE = ['notion-search', 'notion-fetch'];
const NOTION_ECRIRE = [...NOTION_LIRE, 'notion-create-pages', 'notion-update-page'];
const GMAIL_LIRE = ['search_threads', 'get_thread', 'get_message', 'list_labels'];
// trier : lire, brouillons, libellés. Jamais l'envoi (send_message, reply, forward), jamais la suppression.
const GMAIL_TRIER = [...GMAIL_LIRE, 'list_drafts', 'get_draft', 'create_draft', 'create_label', 'label_thread', 'label_message', 'unlabel_thread', 'unlabel_message'];
const AGENDA_LIRE = ['list_calendars', 'list_events', 'search_events', 'get_event'];
const AGENDA_GERER = [...AGENDA_LIRE, 'suggest_time', 'create_event', 'update_event', 'delete_event', 'respond_to_event'];
const DRIVE_LIRE = ['search_files', 'list_recent_files', 'get_file_metadata', 'read_file_content'];
const DRIVE_CREER = [...DRIVE_LIRE, 'create_file'];
const FIGMA_LIRE = ['get_design_context', 'get_screenshot', 'get_metadata', 'get_variable_defs'];
const VERCEL_LIRE = ['list_projects', 'get_project', 'list_deployments', 'get_deployment', 'list_deployment_events'];
const VERCEL_SUIVRE = [...VERCEL_LIRE, 'get_runtime_logs', 'get_runtime_errors'];
const CLOUDFLARE_LIRE = ['workers_list', 'workers_get_worker', 'search_cloudflare_documentation'];

/** Agent (id de EQUIPE.md) → connecteur → outils autorisés. */
const PAR_AGENT = {
  jillian: { [NOTION]: NOTION_ECRIRE },
  lea: { [GMAIL]: GMAIL_TRIER, [AGENDA]: AGENDA_GERER, [NOTION]: NOTION_LIRE },
  hugo: { [NOTION]: [...NOTION_ECRIRE, 'notion-move-pages'] },
  maya: { [NOTION]: NOTION_LIRE, [DRIVE]: DRIVE_CREER },
  sacha: { [NOTION]: [...NOTION_LIRE, 'notion-create-pages'] },
  iris: { [NOTION]: NOTION_ECRIRE, [DRIVE]: DRIVE_CREER },
  emma: { [NOTION]: NOTION_ECRIRE },
  ravi: { [DRIVE]: DRIVE_CREER },
  jade: { [FIGMA]: FIGMA_LIRE, [VERCEL]: VERCEL_LIRE },
  lila: { [FIGMA]: [...FIGMA_LIRE, 'search_design_system', 'get_libraries'] },
  zoe: { [VERCEL]: VERCEL_SUIVRE, [CLOUDFLARE]: CLOUDFLARE_LIRE },
  ines: { [DRIVE]: [...DRIVE_CREER, 'copy_file'] },
  // Basile lit librement ; il n'écrit que dans Notion (traces) et Drive (tableaux de suivi). Rien vers l'extérieur.
  basile: { [GMAIL]: GMAIL_LIRE, [AGENDA]: AGENDA_LIRE, [NOTION]: NOTION_ECRIRE, [VERCEL]: VERCEL_SUIVRE, [CLOUDFLARE]: CLOUDFLARE_LIRE, [DRIVE]: DRIVE_CREER },
};
// Les agents qui trient Gmail peuvent PROPOSER des mails à supprimer ; la corbeille n'a lieu qu'après accord, dans la page.
const PROPOSE_CORBEILLE = new Set(['lea']);
const CORBEILLE = `mcp__${GMAIL}__trash_thread`;

const nomComplet = (prefixe, outil) => `mcp__${prefixe}__${outil}`;
const aDesConnecteurs = (id) => !!PAR_AGENT[id];
const connecteursDe = (id) => Object.keys(PAR_AGENT[id] || {}).map(p => NOMS[p]);
/** Nom lisible d'un outil pour le journal : « Gmail · search_threads » (jamais ses paramètres). */
function nomLisible(outil) {
  const m = /^mcp__(.+?)__(.+)$/.exec(outil || '');
  if (!m) return outil;
  return `${NOMS[m[1]] || m[1].replace(/^claude_ai_/, '').replace(/_/g, ' ')} · ${m[2]}`;
}

/* ---------- découverte des connecteurs branchés ----------
   On démarre une session Claude Code non interactive et on l'arrête dès qu'elle annonce ses outils (événement
   « init »), avant tout appel au modèle : on obtient la liste exacte des outils de chaque connecteur, sans coût. */
let decouverte = null, enCoursDeDecouverte = null;
const DUREE_CACHE = 10 * 60e3;
function decouvrir(claude) {
  if (decouverte && Date.now() - decouverte.date < DUREE_CACHE) return Promise.resolve(decouverte);
  if (enCoursDeDecouverte) return enCoursDeDecouverte;
  enCoursDeDecouverte = new Promise((resolve) => {
    const dossier = path.join(os.tmpdir(), 'qg-jill-korp-connecteurs');
    fs.mkdirSync(dossier, { recursive: true });
    const args = ['-p', '--model', 'sonnet', '--restricted', '--disable-slash-commands', '--tools', '', '--no-session-persistence',
      '--max-budget-usd', '0.01', '--output-format', 'stream-json', '--verbose'];
    const enfant = spawn(claude, args, { cwd: dossier, windowsHide: true, env: { ...process.env, MCP_CONNECTION_NONBLOCKING: 'false' } });
    let tampon = '', fini = false;
    const finir = (resultat) => {
      if (fini) return; fini = true; clearTimeout(minuteur);
      try { enfant.kill(); } catch { /* déjà arrêtée */ }
      if (resultat) decouverte = resultat;
      enCoursDeDecouverte = null;
      resolve(resultat || decouverte || { date: 0, serveurs: [], outils: [] });
    };
    const minuteur = setTimeout(() => finir(null), 90e3);
    enfant.stdout.on('data', (d) => {
      tampon += d;
      let i;
      while ((i = tampon.indexOf('\n')) >= 0) {
        const ligne = tampon.slice(0, i); tampon = tampon.slice(i + 1);
        let j; try { j = JSON.parse(ligne); } catch { continue; }
        if (j.type === 'system' && j.subtype === 'init') {
          const serveurs = (j.mcp_servers || []).map(s => ({ nom: s.name, statut: s.status, prefixe: String(s.name).replace(/[^A-Za-z0-9_-]/g, '_') }));
          finir({ date: Date.now(), serveurs, outils: (j.tools || []).filter(t => t.startsWith('mcp__')) });
        }
      }
    });
    enfant.on('error', () => finir(null));
    enfant.on('close', () => finir(null));
    enfant.stdin.end('ok');
  });
  return enCoursDeDecouverte;
}

/**
 * Options de lancement d'une tâche avec connecteurs.
 * mode 'tache' : outils de fichiers + outils de l'agent ; mode 'corbeille' : uniquement trash_thread.
 * Renvoie { autorises, interdits, absents } : absents = connecteurs prévus mais pas branchés (ex. à reconnecter).
 */
function regles(id, d, mode = 'tache') {
  const prevus = mode === 'corbeille' ? { [GMAIL]: ['trash_thread'] } : (PAR_AGENT[id] || {});
  const autorises = [];
  for (const [p, liste] of Object.entries(prevus)) for (const o of liste) autorises.push(nomComplet(p, o));
  const permis = new Set(autorises), interdits = [], absents = [];
  const prefixes = new Set(d.serveurs.map(s => s.prefixe));
  for (const p of Object.keys(prevus)) prefixes.add(p);
  for (const p of prefixes) {
    const outilsDuServeur = d.outils.filter(t => t.startsWith(`mcp__${p}__`));
    if (!prevus[p]) { interdits.push(`mcp__${p}`); continue; }                 // connecteur entier interdit
    if (!outilsDuServeur.length) { interdits.push(`mcp__${p}`); absents.push(NOMS[p] || p); continue; }   // pas branché : interdit par prudence
    for (const t of outilsDuServeur) if (!permis.has(t)) interdits.push(t);     // un par un, sauf les autorisés
  }
  return { autorises, interdits, absents };
}

/** Garde-fou pendant une tâche : un appel interdit arrête aussitôt la session. Renvoie un message ou null. */
function controler(id, outil, entree, mode, idsCorbeille) {
  if (mode === 'corbeille') {
    if (outil !== CORBEILLE) return `outil inattendu (${nomLisible(outil)})`;
    if (!idsCorbeille.has(String(entree && entree.threadId))) return 'mail hors de la liste que tu as validée';
    return null;
  }
  if (outil === CORBEILLE || /__trash_|__mark_.*spam|__send_message$|__reply$|__forward$/.test(outil)) return `outil interdit (${nomLisible(outil)})`;
  // mettre le libellé TRASH ou SPAM revient à supprimer : interdit sans accord
  const libelles = entree && (entree.labelIds || entree.addLabelIds);
  if (Array.isArray(libelles) && libelles.some(l => /^(TRASH|SPAM)$/i.test(String(l)))) return 'tentative de mise à la corbeille sans ton accord';
  return null;
}

/** Consignes ajoutées à la personnalité d'un agent qui a des connecteurs. */
function consignes(id) {
  const liste = connecteursDe(id).join(', ');
  let texte = `Tu as aussi accès à ces connecteurs : ${liste}, avec seulement les outils prévus pour ton poste. ` +
    'Tu ne peux rien envoyer à l\'extérieur (aucun mail envoyé, aucune publication).';
  if (PROPOSE_CORBEILLE.has(id)) {
    texte += ' Tu ne supprimes jamais de mail toi-même. Si des mails méritent d\'être supprimés, écris-les dans le fichier ' +
      'a-supprimer.json de ton dossier : un tableau JSON d\'objets {"threadId", "de", "objet", "date", "raison"} ' +
      '(threadId = identifiant du fil Gmail). Ta patronne ou ton patron les validera dans la page du QG avant toute suppression.';
  }
  return texte;
}

/** Propositions de corbeille écrites pendant la tâche (a-supprimer.json), vérifiées et nettoyées. */
function lirePropositions(dossier, depuis) {
  const f = path.join(dossier, 'a-supprimer.json');
  try {
    if (fs.statSync(f).mtimeMs < depuis) return [];
    const brut = JSON.parse(fs.readFileSync(f, 'utf8'));
    const t = (v) => (typeof v === 'string' ? v.trim().slice(0, 200) : '');
    const vus = new Set();
    return (Array.isArray(brut) ? brut : []).map(m => ({ threadId: t(m && m.threadId), de: t(m && m.de), objet: t(m && m.objet), date: t(m && m.date), raison: t(m && m.raison) }))
      .filter(m => /^[A-Za-z0-9_-]{6,64}$/.test(m.threadId) && !vus.has(m.threadId) && vus.add(m.threadId)).slice(0, 200);
  } catch { return []; }
}

/** Avertissements au démarrage : un connecteur accordé qui n'apparaît pas dans la ligne « Outils » de EQUIPE.md. */
function verifierEquipe(equipe) {
  const alertes = [];
  for (const [id, cnx] of Object.entries(PAR_AGENT)) {
    const a = equipe[id];
    if (!a) { alertes.push(`${id} : absent de EQUIPE.md`); continue; }
    const ligne = a.outils.join(', ');
    for (const p of Object.keys(cnx)) if (!MOTS[p].test(ligne) && !(id === 'basile' && /connecteurs/i.test(ligne) && new RegExp(NOMS[p].split(' ').pop(), 'i').test(ligne))) alertes.push(`${a.prenom} : ${NOMS[p]} n'est pas dans sa ligne « Outils »`);
  }
  return alertes;
}

module.exports = { aDesConnecteurs, connecteursDe, nomLisible, decouvrir, regles, controler, consignes, lirePropositions, verifierEquipe, PROPOSE_CORBEILLE };
