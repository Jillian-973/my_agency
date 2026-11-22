// L'API du QG en ligne (une seule fonction Vercel, qui reçoit toutes les adresses /api/… et /.well-known/…).
//
// Qui peut quoi :
// - tout le monde : visiter le QG et voir qui travaille (sans le contenu des tâches) ;
// - avec le PIN (session de 12 h) : discuter avec les agents, lire les tâches, les missions et les connecteurs ;
// - chaque nouvelle tâche (et chaque mise à la corbeille) : le PIN, de nouveau, à chaque fois ;
// - le Claude relié par OAuth (connecteur) : confier des demandes à la CEO, sans PIN.
// Rien ne s'exécute ici : tout passe par la file d'attente jusqu'au QG local (live/en-ligne.js).
import { redisPret } from './_lib/redis.js';
import { verifierPin, ouvrirSession, sessionValide } from './_lib/securite.js';
import { demanderAuPc, etatPc, evenementsTache, lireMission, listeMissions } from './_lib/file.js';
import { ressourceProtegee, serveurAutorisation, inscrire, pageAutorisation, autoriser, jeton, accesValide, origine } from './_lib/oauth.js';
import { traiterMcp } from './_lib/mcp.js';

const ENTETES = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (statut, obj, extra = {}) => new Response(JSON.stringify(obj), { status: statut, headers: { 'Content-Type': 'application/json; charset=utf-8', ...ENTETES, ...extra } });
const texte = (s, max) => (typeof s === 'string' ? s.trim().slice(0, max) : '');
async function corpsJSON(request) {
  if (!(request.headers.get('content-type') || '').includes('application/json')) throw Object.assign(new Error('JSON attendu.'), { statut: 415 });
  const brut = await request.text();
  if (brut.length > 64 * 1024) throw Object.assign(new Error('Demande trop grosse.'), { statut: 413 });
  try { return JSON.parse(brut || '{}'); } catch { throw Object.assign(new Error('JSON invalide.'), { statut: 400 }); }
}

function chemin(request) {
  const u = new URL(request.url);
  const c = u.searchParams.get('chemin');
  return (c !== null ? c : u.pathname.replace(/^\/api\//, '')).replace(/^\/+|\/+$/g, '');
}

/** L'état du QG, réduit pour un visiteur sans PIN (qui travaille, sans le contenu). */
function etatPublic(e, complet) {
  if (!e) return { enLigne: true, pc: false, claude: false, enCours: [], missions: [], max: 4 };
  if (complet) return { enLigne: true, pc: true, ...e };
  return {
    enLigne: true, pc: true, claude: e.claude, max: e.max, modeles: e.modeles, discussion: e.discussion,
    enCours: (e.enCours || []).map(t => ({ id: t.id, agent: t.agent, mode: t.mode === 'corbeille' ? 'tache' : t.mode, debut: t.debut })),
    missions: (e.missions || []).map(m => ({ id: m.id, demande: '', etat: m.etat, etape: m.etape, total: m.total, faites: m.faites })),
  };
}

async function router(request) {
  const c = chemin(request), m = request.method;
  if (!redisPret()) return json(503, { erreur: 'Le QG en ligne n\'est pas encore configuré (stockage Upstash Redis à relier au projet Vercel).' });

  /* ---------- OAuth et découverte (connecteur Claude) ---------- */
  if (m === 'GET' && /^well-known\/oauth-protected-resource/.test(c)) return json(200, ressourceProtegee(request));
  if (m === 'GET' && /^well-known\/(oauth-authorization-server|openid-configuration)/.test(c)) return json(200, serveurAutorisation(request));
  if (c === 'oauth/inscription' && m === 'POST') { const r = await inscrire(await corpsJSON(request)); return json(r.statut, r.json); }
  if (c === 'oauth/autoriser' && m === 'GET') return pageAutorisation(request);
  if (c === 'oauth/autoriser' && m === 'POST') return autoriser(request);
  if (c === 'oauth/jeton' && m === 'POST') { const r = await jeton(request); return json(r.statut, r.json); }

  /* ---------- le connecteur MCP : seulement avec un jeton d'accès ---------- */
  if (c === 'mcp') {
    if (!(await accesValide(request))) {
      return json(401, { error: 'invalid_token', error_description: 'Relie le connecteur au QG (OAuth).' },
        { 'WWW-Authenticate': `Bearer resource_metadata="${origine(request)}/.well-known/oauth-protected-resource"` });
    }
    if (m !== 'POST') return json(405, { erreur: 'Utilise POST.' }, { Allow: 'POST' });
    const corps = await corpsJSON(request);
    const lot = Array.isArray(corps) ? corps : [corps];
    const reponses = (await Promise.all(lot.map(traiterMcp))).filter(Boolean);
    if (!reponses.length) return new Response(null, { status: 202, headers: ENTETES });
    return json(200, Array.isArray(corps) ? reponses : reponses[0]);
  }

  /* ---------- PIN : ouvrir une session ---------- */
  if (c === 'session' && m === 'POST') {
    const r = await verifierPin(request, String((await corpsJSON(request)).pin || ''));
    if (!r.ok) return json(r.statut, { erreur: r.erreur });
    return json(201, { session: await ouvrirSession() });
  }

  const session = await sessionValide(request);
  const exigerSession = () => json(401, { erreur: 'PIN requis.', pin: true });

  if (c === 'etat' && m === 'GET') return json(200, etatPublic(await etatPc(), session));
  if (c === 'outils' && m === 'GET') {
    if (!session) return exigerSession();
    const e = await etatPc();
    return json(200, { date: e ? e.date : Date.now(), connecteurs: e ? e.outils || [] : [], echec: !e });
  }

  if (c === 'discuter' && m === 'POST') {
    if (!session) return exigerSession();
    const corps = await corpsJSON(request);
    if (!(await etatPc())) return json(503, { erreur: 'Le QG local est éteint : ton ordinateur doit faire tourner node live/server.js.' });
    const messages = (Array.isArray(corps.messages) ? corps.messages : []).slice(-12)
      .map(x => ({ role: x && x.role === 'agent' ? 'agent' : 'moi', texte: texte(x && x.texte, 2000) })).filter(x => x.texte);
    if (!messages.length || messages[messages.length - 1].role !== 'moi') return json(400, { erreur: 'Message vide.' });
    const r = await demanderAuPc('discussion', { agent: texte(corps.agent, 40), messages }, 60000);
    return r.erreur ? json(r.statut || 502, { erreur: r.erreur }) : json(200, { reponse: r.reponse });
  }

  if (c === 'taches' && m === 'POST') {
    const corps = await corpsJSON(request);
    const pin = await verifierPin(request, String(corps.pin || ''));      // le PIN, à chaque tâche
    if (!pin.ok) return json(pin.statut, { erreur: pin.erreur, pin: true });
    if (!(await etatPc())) return json(503, { erreur: 'Le QG local est éteint : la tâche ne peut pas démarrer.' });
    const r = await demanderAuPc('tache', { agent: texte(corps.agent, 40), consigne: texte(corps.consigne, 8000) }, 25000);
    return r.erreur ? json(r.statut || 409, { erreur: r.erreur }) : json(201, { id: r.id });
  }
  const t = c.match(/^taches\/([0-9a-f-]{36})\/(evenements|corbeille|ouvrir)$/);
  if (t && t[2] === 'evenements' && m === 'GET') {
    if (!session) return exigerSession();
    const depuis = Math.max(0, parseInt(new URL(request.url).searchParams.get('depuis'), 10) || 0);
    return json(200, { evenements: await evenementsTache(t[1], depuis) });
  }
  if (t && t[2] === 'corbeille' && m === 'POST') {
    const corps = await corpsJSON(request);
    const pin = await verifierPin(request, String(corps.pin || ''));
    if (!pin.ok) return json(pin.statut, { erreur: pin.erreur, pin: true });
    const ids = (Array.isArray(corps.threadIds) ? corps.threadIds : []).map(String).filter(x => /^[A-Za-z0-9_-]{6,64}$/.test(x)).slice(0, 200);
    const r = await demanderAuPc('corbeille', { tache: t[1], threadIds: ids }, 25000);
    return r.erreur ? json(r.statut || 409, { erreur: r.erreur }) : json(201, { id: r.id });
  }
  if (t && t[2] === 'ouvrir') return json(400, { erreur: 'Le dossier de l\'agent est sur ton ordinateur : ouvre-le depuis le QG local.' });

  if (c === 'missions' && m === 'GET') return session ? json(200, { missions: await listeMissions() }) : exigerSession();
  const mm = c.match(/^missions\/([0-9a-f-]{36})$/);
  if (mm && m === 'GET') {
    if (!session) return exigerSession();
    const v = await lireMission(mm[1]);
    return v ? json(200, v) : json(404, { erreur: 'Mission inconnue.' });
  }

  return json(404, { erreur: 'Route inconnue.' });
}

async function servir(request) {
  try { return await router(request); }
  catch (e) { return json(e.statut || 500, { erreur: e.statut ? e.message : 'Erreur du serveur.' }); }
}
export { servir as GET, servir as POST, servir as PUT, servir as DELETE };
