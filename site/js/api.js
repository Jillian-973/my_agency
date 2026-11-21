// Liaison avec le serveur local (live/server.js), partagée par la fenêtre d'agent et les onglets du bas.
// Le serveur glisse un jeton secret dans la page à chaque démarrage ; l'API refuse toute demande sans lui.
export const JETON = document.querySelector('meta[name="qg-jeton"]')?.content || '';
export const SANS_SERVEUR = !JETON || JETON.startsWith('__');

export async function appeler(chemin, corps) {
  const entetes = { 'x-qg-jeton': JETON };
  if (corps) entetes['Content-Type'] = 'application/json';
  const r = await fetch(chemin, { method: corps ? 'POST' : 'GET', headers: entetes, body: corps ? JSON.stringify(corps) : undefined, cache: 'no-store' });
  let j = {};
  try { j = await r.json(); } catch { /* réponse vide */ }
  if (!r.ok) throw new Error(j.erreur || `Le serveur a répondu ${r.status}.`);
  return j;
}
