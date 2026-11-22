// La file d'attente entre le site en ligne et ton QG local. Le site dépose une demande (discussion, tâche, mission
// pour la CEO) dans Redis ; le QG local (live/en-ligne.js) la prend, l'exécute avec tes agents et tes connecteurs,
// et dépose la réponse. Le QG local publie aussi son état toutes les 3 secondes.
import { redis, lireJSON, ecrireJSON } from './redis.js';
import { aleatoire } from './securite.js';

const pause = (ms) => new Promise(r => setTimeout(r, ms));
const FRAICHEUR_PC = 20 * 1000;     // au-delà, le QG local est considéré comme éteint

/** État publié par le QG local, ou null s'il est éteint (pas de nouvelles depuis 20 s). */
export async function etatPc() {
  const e = await lireJSON('qg:pc:etat');
  if (!e || Date.now() - (e.date || 0) > FRAICHEUR_PC) return null;
  return e;
}

/** Dépose une demande et attend la réponse du QG local (au plus `attente` ms). */
export async function demanderAuPc(type, contenu, attente = 25000) {
  const id = aleatoire(16);
  await redis('RPUSH', 'qg:file', JSON.stringify({ id, type, date: Date.now(), ...contenu }));
  await redis('EXPIRE', 'qg:file', 24 * 60 * 60);
  const limite = Date.now() + attente;
  while (Date.now() < limite) {
    await pause(700);
    const r = await lireJSON(`qg:reponse:${id}`);
    if (r) { await redis('DEL', `qg:reponse:${id}`); return r; }
  }
  return { erreur: 'Le QG local n\'a pas répondu à temps. Vérifie qu\'il tourne sur ton ordinateur (node live/server.js).', statut: 504 };
}

/** Événements d'une tâche (début, outils utilisés, fin), publiés par le QG local, à partir du n-ième. */
export async function evenementsTache(id, depuis = 0) {
  const liste = await redis('LRANGE', `qg:tache:${id}:evts`, depuis, -1);
  return (liste || []).map(e => { try { return JSON.parse(e); } catch { return null; } }).filter(Boolean);
}

export const lireMission = (id) => lireJSON(`qg:mission:${id}`);
export async function listeMissions() {
  const ids = (await redis('LRANGE', 'qg:missions', 0, 29)) || [];
  const vues = await Promise.all(ids.map(lireMission));
  return vues.filter(Boolean);
}
export { ecrireJSON };
