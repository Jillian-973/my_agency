// OAuth 2.1 du connecteur Claude : tu relies le connecteur une fois, en entrant ton PIN sur une page du QG ;
// Claude reçoit alors un jeton d'accès, et ses demandes passent sans PIN. Inscription dynamique des clients (DCR),
// PKCE obligatoire (S256), redirections limitées à Claude (claude.ai, claude.com) et à un poste local (Claude Code).
// Les jetons sont aléatoires et rangés dans Redis sous leur empreinte : ils ne sont jamais stockés en clair.
import crypto from 'node:crypto';
import { redis, lireJSON, ecrireJSON } from './redis.js';
import { aleatoire, empreinte, verifierPin } from './securite.js';

const DUREE_CODE = 5 * 60, DUREE_ACCES = 30 * 24 * 3600, DUREE_RENOUVELLEMENT = 180 * 24 * 3600, DUREE_CLIENT = 365 * 24 * 3600;

export const origine = (request) => {
  const h = request.headers.get('x-forwarded-host') || request.headers.get('host');
  return `${request.headers.get('x-forwarded-proto') || 'https'}://${h}`;
};

function redirectionPermise(uri) {
  try {
    const u = new URL(uri);
    if (u.protocol === 'https:' && ['claude.ai', 'claude.com', 'www.claude.ai', 'www.claude.com'].includes(u.hostname)) return true;
    if (u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname)) return true;   // Claude Code sur ton ordinateur
    return false;
  } catch { return false; }
}

/* ---------- découverte ---------- */
export const ressourceProtegee = (request) => ({
  resource: `${origine(request)}/api/mcp`,
  authorization_servers: [origine(request)],
  bearer_methods_supported: ['header'],
  resource_name: 'QG JILL KORP',
});
export const serveurAutorisation = (request) => {
  const o = origine(request);
  return {
    issuer: o,
    authorization_endpoint: `${o}/api/oauth/autoriser`,
    token_endpoint: `${o}/api/oauth/jeton`,
    registration_endpoint: `${o}/api/oauth/inscription`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ['qg'],
  };
};

/* ---------- inscription d'un client (Claude) ---------- */
export async function inscrire(corps) {
  const uris = Array.isArray(corps && corps.redirect_uris) ? corps.redirect_uris.map(String) : [];
  if (!uris.length || uris.length > 5 || !uris.every(redirectionPermise)) {
    return { statut: 400, json: { error: 'invalid_redirect_uri', error_description: 'Seuls Claude (claude.ai, claude.com) et un poste local peuvent se relier au QG.' } };
  }
  const client_id = `qg-${aleatoire(12)}`;
  const nom = String((corps && corps.client_name) || 'Claude').slice(0, 80);
  await ecrireJSON(`qg:oauth:client:${client_id}`, { redirect_uris: uris, nom }, DUREE_CLIENT);
  return { statut: 201, json: { client_id, client_name: nom, redirect_uris: uris, grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' } };
}

/* ---------- page d'autorisation : le PIN, une seule fois ---------- */
const echapper = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function page(p, message = '') {
  const champs = ['client_id', 'redirect_uri', 'state', 'code_challenge', 'code_challenge_method', 'scope', 'resource']
    .map(k => `<input type="hidden" name="${k}" value="${echapper(p[k] || '')}">`).join('');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Relier Claude au QG</title><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:linear-gradient(#6fbcf2,#eef8ff);font:15px/1.5 system-ui,"Segoe UI",sans-serif;color:#2b2f45}
main{background:#fff;max-width:360px;margin:16px;padding:24px;border-radius:14px;box-shadow:0 10px 30px rgba(20,30,60,.25)}
h1{margin:0 0 8px;font-size:18px}p{margin:0 0 14px;color:#5b6078}input[type=password]{width:100%;box-sizing:border-box;font-size:24px;letter-spacing:.4em;text-align:center;padding:10px;border:1px solid #cbd5e1;border-radius:8px}
button{margin-top:14px;width:100%;padding:11px;border:0;border-radius:8px;background:#c9971c;color:#fff;font-weight:700;font-size:15px;cursor:pointer}.err{color:#b91c1c;font-weight:600}
</style></head><body><main><h1>Relier ${echapper(p.nom || 'Claude')} au QG de JILL KORP</h1>
<p>Une fois relié, ce Claude pourra confier des demandes à la CEO du QG sans PIN. Entre ton PIN à 6 chiffres pour l'autoriser.</p>
${message ? `<p class="err">${echapper(message)}</p>` : ''}
<form method="post" action="/api/oauth/autoriser">${champs}
<input type="password" name="pin" inputmode="numeric" autocomplete="off" pattern="\\d{6}" maxlength="6" required autofocus aria-label="PIN à 6 chiffres">
<button type="submit">Autoriser</button></form></main></body></html>`;
}
// form-action doit aussi permettre l'adresse de retour (déjà vérifiée) : le navigateur applique cette règle à la
// redirection qui suit l'envoi du formulaire, et bloquerait sinon le retour vers Claude avec le code.
const html = (texte, statut = 200, retour = '') => new Response(texte, { status: statut, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; form-action 'self'${retour ? ' ' + retour : ''}; frame-ancestors 'none'` } });
const origineRetour = (uri) => { try { return new URL(uri).origin; } catch { return ''; } };

async function verifierDemande(p) {
  const client = await lireJSON(`qg:oauth:client:${p.client_id}`);
  if (!client) return { erreur: 'Client inconnu : relie de nouveau le connecteur depuis Claude.' };
  if (!client.redirect_uris.includes(p.redirect_uri)) return { erreur: 'Adresse de retour non autorisée.' };
  if (!p.code_challenge || (p.code_challenge_method || 'S256') !== 'S256') return { erreur: 'PKCE (S256) obligatoire.' };
  return { client };
}
export async function pageAutorisation(request) {
  const q = Object.fromEntries(new URL(request.url).searchParams);
  if (q.response_type && q.response_type !== 'code') return html(page(q, 'Type de réponse non pris en charge.'), 400);
  const v = await verifierDemande(q);
  if (v.erreur) return html(page(q, v.erreur), 400);
  return html(page({ ...q, nom: v.client.nom }), 200, origineRetour(q.redirect_uri));
}
export async function autoriser(request) {
  const p = Object.fromEntries(new URLSearchParams(await request.text()));
  const v = await verifierDemande(p);
  if (v.erreur) return html(page(p, v.erreur), 400);
  const pin = await verifierPin(request, p.pin);
  if (!pin.ok) return html(page({ ...p, nom: v.client.nom }, pin.erreur), pin.statut, origineRetour(p.redirect_uri));
  const code = aleatoire();
  await ecrireJSON(`qg:oauth:code:${empreinte(code)}`, { client_id: p.client_id, redirect_uri: p.redirect_uri, code_challenge: p.code_challenge }, DUREE_CODE);
  const retour = new URL(p.redirect_uri);
  retour.searchParams.set('code', code);
  if (p.state) retour.searchParams.set('state', p.state);
  return new Response(null, { status: 302, headers: { Location: retour.toString(), 'Cache-Control': 'no-store' } });
}

/* ---------- échange du code, renouvellement ---------- */
async function emettre(client_id) {
  const acces = aleatoire(), renouvellement = aleatoire();
  await Promise.all([
    redis('SET', `qg:oauth:acces:${empreinte(acces)}`, client_id, 'EX', DUREE_ACCES),
    redis('SET', `qg:oauth:renouv:${empreinte(renouvellement)}`, client_id, 'EX', DUREE_RENOUVELLEMENT),
  ]);
  return { access_token: acces, token_type: 'Bearer', expires_in: DUREE_ACCES, refresh_token: renouvellement, scope: 'qg' };
}
export async function jeton(request) {
  const type = request.headers.get('content-type') || '';
  const brut = await request.text();
  const p = type.includes('json') ? JSON.parse(brut || '{}') : Object.fromEntries(new URLSearchParams(brut));
  const err = (e, d) => ({ statut: 400, json: { error: e, error_description: d } });
  if (p.grant_type === 'authorization_code') {
    const cle = `qg:oauth:code:${empreinte(p.code || '')}`;
    let c = null;
    try { c = JSON.parse(await redis('GETDEL', cle) || 'null'); } catch { /* illisible */ }   // lu et effacé d'un coup : un code ne sert qu'une fois
    if (!c) return err('invalid_grant', 'Code inconnu ou expiré.');
    if (c.client_id !== p.client_id || c.redirect_uri !== p.redirect_uri) return err('invalid_grant', 'Code émis pour un autre client.');
    const calcule = crypto.createHash('sha256').update(String(p.code_verifier || '')).digest('base64url');
    if (calcule !== c.code_challenge) return err('invalid_grant', 'Vérification PKCE échouée.');
    return { statut: 200, json: await emettre(c.client_id) };
  }
  if (p.grant_type === 'refresh_token') {
    const cle = `qg:oauth:renouv:${empreinte(p.refresh_token || '')}`;
    const client_id = await redis('GETDEL', cle);              // rotation : l'ancien ne sert plus, même en cas d'erreur
    if (!client_id || (p.client_id && p.client_id !== client_id)) return err('invalid_grant', 'Jeton de renouvellement inconnu.');
    return { statut: 200, json: await emettre(client_id) };
  }
  return err('unsupported_grant_type', 'Seuls authorization_code et refresh_token sont pris en charge.');
}

/** Le jeton d'accès d'une requête au connecteur est-il valide ? */
export async function accesValide(request) {
  const h = request.headers.get('authorization') || '';
  const m = h.match(/^Bearer\s+([0-9a-f]{64})$/i);
  if (!m) return false;
  return !!(await redis('GET', `qg:oauth:acces:${empreinte(m[1].toLowerCase())}`));
}
