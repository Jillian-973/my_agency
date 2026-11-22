// Sécurité du QG en ligne : PIN à 6 chiffres, sessions, limitation des essais, jetons aléatoires.
//
// Le PIN n'est jamais stocké : seule son empreinte (scrypt + sel) est dans Redis, posée depuis ton ordinateur par
// live/configurer-en-ligne.js. Après 5 erreurs, une adresse attend 15 minutes ; après 30 erreurs en une heure,
// toute vérification du PIN est suspendue une heure (un PIN à 6 chiffres ne se devine pas à ce rythme).
import crypto from 'node:crypto';
import { redis } from './redis.js';

const ESSAIS_PAR_ADRESSE = 5, FENETRE_ADRESSE = 15 * 60;
const ESSAIS_GLOBAUX = 30, FENETRE_GLOBALE = 60 * 60;
const DUREE_SESSION = 12 * 60 * 60;

export const aleatoire = (octets = 32) => crypto.randomBytes(octets).toString('hex');
export const empreinte = (texte) => crypto.createHash('sha256').update(String(texte)).digest('hex');

export function adresse(request) {
  const f = request.headers.get('x-forwarded-for') || '';
  return (f.split(',')[0] || request.headers.get('x-real-ip') || 'inconnue').trim().slice(0, 64);
}

/** Vérifie un PIN. Renvoie { ok } ou { ok: false, statut, erreur }. */
export async function verifierPin(request, pin) {
  const ip = empreinte(adresse(request)).slice(0, 24);
  const [parAdresse, global] = await Promise.all([redis('GET', `qg:essais:${ip}`), redis('GET', 'qg:essais:global')]);
  if (Number(global) >= ESSAIS_GLOBAUX) return { ok: false, statut: 429, erreur: 'Trop d\'essais de PIN récemment : la vérification est suspendue une heure.' };
  if (Number(parAdresse) >= ESSAIS_PAR_ADRESSE) return { ok: false, statut: 429, erreur: 'Trop d\'essais de PIN : réessaie dans 15 minutes.' };
  if (typeof pin !== 'string' || !/^\d{6}$/.test(pin)) return echec(ip, 'Le PIN fait 6 chiffres.');
  const stocke = await redis('GET', 'qg:pin');
  if (!stocke) return { ok: false, statut: 503, erreur: 'Aucun PIN n\'est configuré. Lance live/configurer-en-ligne.js sur ton ordinateur.' };
  const [algo, N, r, p, sel, attendu] = stocke.split('$');
  if (algo !== 'scrypt') return { ok: false, statut: 500, erreur: 'Empreinte du PIN illisible.' };
  const calcule = crypto.scryptSync(pin, Buffer.from(sel, 'base64'), 32, { N: Number(N), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
  const ref = Buffer.from(attendu, 'base64');
  if (ref.length !== calcule.length || !crypto.timingSafeEqual(ref, calcule)) return echec(ip, 'PIN incorrect.');
  await redis('DEL', `qg:essais:${ip}`);
  return { ok: true };
}
async function echec(ip, erreur) {
  await Promise.all([
    redis('INCR', `qg:essais:${ip}`).then(() => redis('EXPIRE', `qg:essais:${ip}`, FENETRE_ADRESSE)),
    redis('INCR', 'qg:essais:global').then((n) => (Number(n) === 1 ? redis('EXPIRE', 'qg:essais:global', FENETRE_GLOBALE) : null)),
  ]);
  return { ok: false, statut: 401, erreur };
}

/** Session ouverte avec le PIN (discussions, contenu des tâches) : un jeton aléatoire, gardé 12 h. */
export async function ouvrirSession() {
  const jeton = aleatoire();
  await redis('SET', `qg:session:${empreinte(jeton)}`, '1', 'EX', DUREE_SESSION);
  return jeton;
}
export async function sessionValide(request) {
  const j = request.headers.get('x-qg-session');
  if (!j || !/^[0-9a-f]{64}$/.test(j)) return false;
  return (await redis('GET', `qg:session:${empreinte(j)}`)) === '1';
}
