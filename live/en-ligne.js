// Liaison entre ton QG local et le QG en ligne (Vercel). Ton ordinateur reste le moteur : toutes les 1,5 seconde,
// il prend les demandes déposées en ligne (discussions, tâches, mises à la corbeille, missions pour la CEO) dans
// la file d'attente Redis, les fait exécuter par tes agents, et dépose les réponses. Il publie aussi son état,
// les événements des tâches et les missions de la CEO, pour que le site et le connecteur Claude les montrent.
//
// La liaison ne démarre que si live/.qg-en-ligne.json existe (créé par live/configurer-en-ligne.js, jamais versionné).
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const FICHIER = path.join(__dirname, '.qg-en-ligne.json');
const PAS = 1500, PAS_ETAT = 3000;

function lireConfig() {
  try {
    const c = JSON.parse(fs.readFileSync(FICHIER, 'utf8'));
    if (c.redisUrl && c.redisJeton) return c;
  } catch { /* pas de liaison */ }
  return null;
}

function creerLien({ traiter, etat, missions }) {
  const config = lireConfig();
  if (!config) return null;

  async function redis(commandes) {
    const r = await fetch(`${config.redisUrl}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.redisJeton}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(commandes.map(c => c.map(String))),
    });
    if (!r.ok) throw new Error(`stockage en ligne : ${r.status}`);
    return (await r.json()).map(x => x.result);
  }

  const evenements = [];                       // [cle, json] en attente d'envoi
  const missionsPubliees = new Map();          // id → empreinte du dernier envoi
  let dernierEtat = 0, derniereErreur = 0, enCours = false, connecte = false;

  function publierEvenement(tacheId, evt) { evenements.push([`qg:tache:${tacheId}:evts`, JSON.stringify(evt)]); }

  async function executer(job) {
    let reponse;
    try { reponse = await traiter(job); } catch (e) { reponse = { erreur: e.message }; }
    await redis([['SET', `qg:reponse:${job.id}`, JSON.stringify(reponse || {}), 'EX', 600]]);
  }

  async function tour() {
    if (enCours) return;
    enCours = true;
    try {
      // 1. les demandes en attente (une discussion trop ancienne n'est plus attendue : on la laisse)
      const [lot] = await redis([['LPOP', 'qg:file', 10]]);
      const jobs = (Array.isArray(lot) ? lot : lot ? [lot] : []).map(j => { try { return JSON.parse(j); } catch { return null; } }).filter(Boolean);
      for (const job of jobs) {
        if (job.type === 'discussion' && Date.now() - (job.date || 0) > 70e3) continue;
        executer(job).catch((e) => console.error('QG en ligne, demande :', e.message));
      }
      // 2. les événements des tâches
      const envoi = evenements.splice(0, 200);
      const cmds = [];
      for (const [cle, valeur] of envoi) cmds.push(['RPUSH', cle, valeur], ['EXPIRE', cle, 2 * 24 * 3600]);
      // 3. l'état du QG et les missions de la CEO, toutes les 3 secondes
      if (Date.now() - dernierEtat > PAS_ETAT) {
        dernierEtat = Date.now();
        cmds.push(['SET', 'qg:pc:etat', JSON.stringify({ ...etat(), date: Date.now() }), 'EX', 60]);
        for (const m of missions()) {
          const e = JSON.stringify(m);
          if (missionsPubliees.get(m.id) === e) continue;
          if (!missionsPubliees.has(m.id)) cmds.push(['LPUSH', 'qg:missions', m.id], ['LTRIM', 'qg:missions', 0, 29]);
          missionsPubliees.set(m.id, e);
          cmds.push(['SET', `qg:mission:${m.id}`, e, 'EX', 7 * 24 * 3600]);
        }
      }
      if (cmds.length) await redis(cmds);
      if (!connecte) { connecte = true; console.log(`QG en ligne : relié${config.site ? ` (${config.site})` : ''}.`); }
    } catch (e) {
      if (Date.now() - derniereErreur > 60e3) { derniereErreur = Date.now(); console.error('QG en ligne :', e.message); }
      connecte = false;
    } finally { enCours = false; }
  }

  setInterval(tour, PAS);
  tour();
  return { publierEvenement, site: config.site || null };
}

module.exports = { creerLien, FICHIER };
