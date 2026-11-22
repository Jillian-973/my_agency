// Accès à Redis (Upstash, ajouté au projet par la Marketplace Vercel) par son API REST, sans dépendance.
// Les variables d'environnement sont posées par l'intégration : KV_REST_API_URL / KV_REST_API_TOKEN
// (ou UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN). Aucune clé n'est écrite dans le code.

const URL_REDIS = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const JETON_REDIS = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const redisPret = () => !!(URL_REDIS && JETON_REDIS);

/** Une commande Redis : redis('SET', 'cle', 'valeur', 'EX', 60) → résultat. */
export async function redis(...commande) {
  if (!redisPret()) throw new Error('Stockage non configuré (Upstash Redis manquant sur Vercel).');
  const r = await fetch(URL_REDIS, {
    method: 'POST',
    headers: { Authorization: `Bearer ${JETON_REDIS}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commande.map(String)),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(`Stockage : ${j.error || r.status}`);
  return j.result;
}

/** Plusieurs commandes en un aller-retour : pipeline([['GET','a'], ['INCR','b']]) → [résultats]. */
export async function pipeline(commandes) {
  if (!commandes.length) return [];
  const r = await fetch(`${URL_REDIS}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${JETON_REDIS}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commandes.map(c => c.map(String))),
  });
  const j = await r.json().catch(() => []);
  if (!r.ok) throw new Error(`Stockage : ${r.status}`);
  return j.map(x => x.result);
}

export const lireJSON = async (cle) => { const v = await redis('GET', cle); try { return v ? JSON.parse(v) : null; } catch { return null; } };
export const ecrireJSON = (cle, valeur, secondes) => (secondes ? redis('SET', cle, JSON.stringify(valeur), 'EX', secondes) : redis('SET', cle, JSON.stringify(valeur)));
