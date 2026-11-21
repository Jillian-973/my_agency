// État de tes connecteurs, pour l'onglet « Outils » du QG, d'après « claude mcp list ».
//
// La page ne reçoit que le NOM de chaque connecteur et un état parmi quatre mots fixes
// (ok, a-connecter, non-configure, en-panne, ou inconnu). Jamais l'adresse d'un serveur, la commande
// qui le lance, ni un message d'erreur : tout le reste de la ligne est jeté ici, côté serveur.
'use strict';

const { spawn } = require('node:child_process');

const DUREE_CACHE = 60 * 1000, DELAI_MAX = 90 * 1000;
let cache = null, enCours = null;

/** État lu dans la fin de ligne (« ✔ Connected », « ! Needs authentication »…), réduit à un mot fixe. */
function etatDe(fin) {
  if (/connected/i.test(fin) && !/not connected|disconnected/i.test(fin)) return 'ok';
  if (/auth/i.test(fin)) return 'a-connecter';
  if (/not configured|disabled/i.test(fin)) return 'non-configure';
  if (/fail|error|✗|timed? ?out/i.test(fin)) return 'en-panne';
  return 'inconnu';
}

/** « claude.ai Gmail » → Gmail (claude.ai) ; « plugin:design:slack » → slack (extension design) ; sinon local. */
function rangerNom(brut) {
  let nom = brut, groupe = 'local';
  if (/^claude\.ai /i.test(nom)) { nom = nom.slice(10); groupe = 'claude.ai'; }
  else { const m = nom.match(/^plugin:([^:]+):(.+)$/); if (m) { groupe = `extension ${m[1]}`; nom = m[2]; } }
  return { nom, groupe };
}

/**
 * Marque d'un connecteur, la même qu'on parte de son nom (« claude.ai Gmail », « plugin:small-business:gmail »)
 * ou du préfixe de ses outils (« claude_ai_Gmail », « plugin_small-business_gmail ») : « gmail ».
 * Elle relie les logos du bandeau aux outils qu'utilisent les agents.
 */
const ALIAS = { 'atlassian mcp': 'atlassian', 'cloudflare developer platform': 'cloudflare', 'intuit mailchimp': 'mailchimp',
  'intuit quickbooks': 'quickbooks', 'monday com': 'monday', 'apollo io': 'apollo', 'ringex chat': 'ringex' };
function marqueDe(nom) {
  const m = String(nom).replace(/^claude\.ai /i, '').replace(/^claude_ai_/i, '').replace(/^plugin[:_][^:_]+[:_]/i, '')
    .toLowerCase().replace(/[-_]+/g, ' ').replace(/[^a-z0-9 .]/g, '').replace(/\s+/g, ' ').trim();
  return ALIAS[m] || m;
}

/** Une ligne « nom: cible - état » → { nom, groupe, marque, etat }, ou null. La cible (adresse ou commande) est ignorée. */
function lireLigne(ligne) {
  const l = ligne.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  const i = l.indexOf(': '), j = l.lastIndexOf(' - ');
  if (i <= 0 || j <= i) return null;
  const brut = l.slice(0, i).trim();
  // un nom qui ressemblerait à une adresse ou à un chemin n'est pas affiché
  if (!brut || brut.length > 80 || /[\\/]|:\/\/|@|\s{2,}/.test(brut)) return null;
  return { ...rangerNom(brut), marque: marqueDe(brut), etat: etatDe(l.slice(j + 3)) };
}

function lireSortie(texte) {
  const vus = new Set(), liste = [];
  for (const ligne of String(texte).split(/\r?\n/)) {
    const c = lireLigne(ligne);
    if (!c) continue;
    const cle = `${c.groupe}|${c.nom}`;
    if (!vus.has(cle)) { vus.add(cle); liste.push(c); }
  }
  return liste;
}

/** Lance « claude mcp list » (au plus une fois à la fois, résultat gardé une minute). */
function lireConnecteurs(claude, dossier, forcer = false) {
  if (!forcer && cache && Date.now() - cache.date < DUREE_CACHE) return Promise.resolve(cache);
  if (enCours) return enCours;
  enCours = new Promise((resolve) => {
    let sortie = '', fini = false;
    const finir = (ok) => {
      if (fini) return; fini = true; clearTimeout(minuteur); enCours = null;
      if (ok) cache = { date: Date.now(), liste: lireSortie(sortie) };
      resolve(ok ? cache : { date: Date.now(), liste: [], erreur: true });   // erreur : un simple drapeau, aucun détail
    };
    let enfant;
    try { enfant = spawn(claude, ['mcp', 'list'], { cwd: dossier, windowsHide: true, env: process.env }); }
    catch { return finir(false); }
    const minuteur = setTimeout(() => { try { enfant.kill(); } catch { /* déjà arrêté */ } finir(false); }, DELAI_MAX);
    enfant.stdout.on('data', (d) => { sortie += d; if (sortie.length > 200000) sortie = sortie.slice(-200000); });
    enfant.stderr.resume();                         // les erreurs ne sont ni lues ni transmises
    enfant.on('error', () => finir(false));
    enfant.on('close', (code) => finir(code === 0));
  });
  return enCours;
}

/* ---------- connecteurs en cours d'utilisation par les agents (pour faire briller leur logo) ---------- */
const RESTE_ALLUME = 6000;                         // un logo reste en surbrillance 6 s après le dernier appel
const appels = new Map();                          // id de l'appel → { marque, prenom, tache }
const derniers = new Map();                        // marque → { fin, prenoms }
function debutUsage(id, prefixe, prenom, tache) { appels.set(id, { marque: marqueDe(prefixe), prenom, tache }); }
function finUsage(id) {
  const a = appels.get(id); if (!a) return;
  appels.delete(id);
  const d = derniers.get(a.marque) || { prenoms: new Set() };
  d.fin = Date.now() + RESTE_ALLUME; d.prenoms.add(a.prenom); derniers.set(a.marque, d);
}
function finTache(tache) { for (const [id, a] of appels) if (a.tache === tache) finUsage(id); }
/** [{ marque, agents: [prénoms] }] : appels en cours, ou terminés il y a moins de 6 s. */
function usagesActifs() {
  const parMarque = new Map(), maintenant = Date.now();
  for (const a of appels.values()) { if (!parMarque.has(a.marque)) parMarque.set(a.marque, new Set()); parMarque.get(a.marque).add(a.prenom); }
  for (const [m, d] of derniers) {
    if (d.fin < maintenant) { derniers.delete(m); continue; }
    if (!parMarque.has(m)) parMarque.set(m, new Set());
    for (const p of d.prenoms) parMarque.get(m).add(p);
  }
  return [...parMarque].map(([marque, agents]) => ({ marque, agents: [...agents] }));
}

module.exports = { lireConnecteurs, lireSortie, marqueDe, debutUsage, finUsage, finTache, usagesActifs };
