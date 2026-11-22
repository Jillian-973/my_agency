// Liaison avec le serveur du QG, partagée par la fenêtre d'agent, les onglets et le bandeau.
// - En local (node live/server.js) : le serveur glisse un jeton secret dans la page ; l'API refuse toute demande sans lui.
// - En ligne (Vercel) : la visite est libre ; discuter et lire les tâches demandent une session ouverte avec le PIN
//   à 6 chiffres, et chaque nouvelle tâche demande le PIN de nouveau. Le travail se fait toujours sur ton ordinateur.
import { demanderPin } from './pin.js';

export const JETON = document.querySelector('meta[name="qg-jeton"]')?.content || '';
export const EN_LIGNE = location.protocol === 'https:' && !['localhost', '127.0.0.1'].includes(location.hostname);
export const SANS_SERVEUR = !EN_LIGNE && (!JETON || JETON.startsWith('__'));

let session = '';
try { session = sessionStorage.getItem('qg-session') || ''; } catch { /* stockage indisponible : PIN à chaque ouverture */ }
export const aSession = () => !EN_LIGNE || !!session;
function oublierSession() { session = ''; try { sessionStorage.removeItem('qg-session'); } catch { /* rien */ } }

export async function appeler(chemin, corps) {
  const entetes = EN_LIGNE ? (session ? { 'x-qg-session': session } : {}) : { 'x-qg-jeton': JETON };
  if (corps) entetes['Content-Type'] = 'application/json';
  const r = await fetch(chemin, { method: corps ? 'POST' : 'GET', headers: entetes, body: corps ? JSON.stringify(corps) : undefined, cache: 'no-store' });
  let j = {};
  try { j = await r.json(); } catch { /* réponse vide */ }
  if (!r.ok) {
    if (r.status === 401 && j.pin && EN_LIGNE && !(corps && corps.pin)) oublierSession();   // session expirée
    throw Object.assign(new Error(j.erreur || `Le serveur a répondu ${r.status}.`), { statut: r.status, pin: !!j.pin });
  }
  return j;
}

/** En ligne : ouvre une session avec le PIN (12 h). */
export async function ouvrirSession(pin) {
  const r = await fetch('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }), cache: 'no-store' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.erreur || 'PIN refusé.'), { statut: r.status });
  session = j.session;
  try { sessionStorage.setItem('qg-session', session); } catch { /* rien */ }
  dispatchEvent(new Event('qg:session'));                   // bandeau et onglets se rechargent
}

/** En ligne, demande le PIN si aucune session n'est ouverte. Renvoie faux si l'utilisateur annule. */
export async function assurerSession(texte = 'Entre ton PIN pour discuter avec les agents et voir leur travail.') {
  if (aSession()) return true;
  for (let erreur = ''; ;) {
    const pin = await demanderPin({ titre: 'Code PIN', texte, erreur });
    if (!pin) return false;
    try { await ouvrirSession(pin); return true; } catch (e) { erreur = e.message; if (e.statut === 429) { await demanderPin({ titre: 'Code PIN', texte: e.message, info: true }); return false; } }
  }
}

/** Appel qui demande le PIN si la session manque, puis réessaie une fois. */
export async function appelerAvecSession(chemin, corps) {
  if (!(await assurerSession())) throw Object.assign(new Error('PIN requis.'), { annule: true });
  try { return await appeler(chemin, corps); }
  catch (e) {
    if (!e.pin || !(await assurerSession())) throw e;
    return appeler(chemin, corps);
  }
}

/** Les événements d'une tâche : flux en direct en local, relevé toutes les 1,5 s en ligne. */
export async function suivreFlux(id, surEvenement) {
  if (EN_LIGNE) {
    let n = 0;
    for (;;) {
      const { evenements } = await appeler(`/api/taches/${id}/evenements?depuis=${n}`);
      for (const e of evenements) { n++; surEvenement(e); if (e.type === 'fin') return; }
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  const r = await fetch(`/api/taches/${id}/flux`, { headers: { 'x-qg-jeton': JETON }, cache: 'no-store' });
  if (!r.ok || !r.body) throw new Error(r.status === 404 ? 'Tâche inconnue : le serveur a sans doute redémarré.' : `Le serveur a répondu ${r.status}.`);
  const lecteur = r.body.pipeThrough(new TextDecoderStream()).getReader();
  let tampon = '';
  for (;;) {
    const { value, done } = await lecteur.read();
    if (done) return;
    tampon += value;
    let i;
    while ((i = tampon.indexOf('\n\n')) >= 0) {
      const bloc = tampon.slice(0, i); tampon = tampon.slice(i + 2);
      const donnees = bloc.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('\n');
      if (donnees) { try { surEvenement(JSON.parse(donnees)); } catch { /* ligne illisible : ignorée */ } }
    }
  }
}
