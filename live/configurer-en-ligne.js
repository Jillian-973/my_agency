#!/usr/bin/env node
// Configuration du QG en ligne, à lancer une fois sur ton ordinateur : node live/configurer-en-ligne.js
//
// Il te demande :
// - l'adresse du site Vercel du QG ;
// - l'adresse REST et le jeton de ton stockage Upstash Redis (Vercel → Storage → ta base → onglet « .env.local »,
//   lignes KV_REST_API_URL et KV_REST_API_TOKEN) ;
// - ton PIN à 6 chiffres, deux fois.
// Il écrit live/.qg-en-ligne.json (jamais versionné) pour relier ton QG local, et range dans Redis seulement
// l'empreinte de ton PIN (scrypt + sel) : le PIN lui-même n'est écrit nulle part.
'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const readline = require('node:readline');
const { FICHIER } = require('./en-ligne.js');

function question(texte, cache = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (cache) rl._writeToOutput = (s) => { if (s.includes(texte)) process.stdout.write(texte); else if (s === '\r\n' || s === '\n') process.stdout.write('\n'); };
    rl.question(texte, (r) => { rl.close(); if (cache) process.stdout.write('\n'); resolve(r.trim()); });
  });
}

(async () => {
  console.log('Configuration du QG en ligne. Rien de ce que tu tapes n\'est affiché ni envoyé ailleurs qu\'à ton stockage Upstash.\n');
  const ancien = (() => { try { return JSON.parse(fs.readFileSync(FICHIER, 'utf8')); } catch { return {}; } })();
  let site = await question(`Adresse du site du QG${ancien.site ? ` [${ancien.site}]` : ''} : `) || ancien.site || '';
  site = site.replace(/\/+$/, '');
  const redisUrl = (await question(`KV_REST_API_URL${ancien.redisUrl ? ' [garder l\'actuelle]' : ''} : `) || ancien.redisUrl || '').replace(/\/+$/, '');
  const redisJeton = await question(`KV_REST_API_TOKEN (caché)${ancien.redisJeton ? ' [Entrée pour garder l\'actuel]' : ''} : `, true) || ancien.redisJeton || '';
  if (!/^https:\/\//.test(redisUrl) || !redisJeton) { console.error('Adresse ou jeton Upstash manquant.'); process.exit(1); }

  const pin = await question('Choisis ton PIN à 6 chiffres (caché, Entrée pour garder l\'actuel) : ', true);
  let empreinte = null;
  if (pin) {
    if (!/^\d{6}$/.test(pin)) { console.error('Le PIN doit faire exactement 6 chiffres.'); process.exit(1); }
    if (/^(\d)\1{5}$/.test(pin) || ['123456', '654321', '012345', '000000'].includes(pin)) { console.error('PIN trop facile à deviner : choisis-en un autre.'); process.exit(1); }
    if (await question('Retape ton PIN (caché) : ', true) !== pin) { console.error('Les deux PIN ne correspondent pas.'); process.exit(1); }
    const sel = crypto.randomBytes(16), N = 16384, r = 8, p = 1;
    const h = crypto.scryptSync(pin, sel, 32, { N, r, p, maxmem: 64 * 1024 * 1024 });
    empreinte = ['scrypt', N, r, p, sel.toString('base64'), h.toString('base64')].join('$');
  }

  // essai du stockage, et empreinte du PIN
  const commandes = [['PING']];
  if (empreinte) commandes.push(['SET', 'qg:pin', empreinte], ['DEL', 'qg:essais:global']);
  const rep = await fetch(`${redisUrl}/pipeline`, { method: 'POST', headers: { Authorization: `Bearer ${redisJeton}`, 'Content-Type': 'application/json' }, body: JSON.stringify(commandes) });
  if (!rep.ok) { console.error(`Le stockage Upstash refuse la connexion (${rep.status}) : vérifie l'adresse et le jeton.`); process.exit(1); }

  fs.writeFileSync(FICHIER, JSON.stringify({ site, redisUrl, redisJeton }, null, 2), { mode: 0o600 });
  console.log(`\nC'est prêt.${empreinte ? ' Ton PIN est enregistré (seulement son empreinte).' : ''}`);
  console.log(`Liaison écrite dans ${FICHIER} (jamais versionné).`);
  console.log('Redémarre le QG local (node live/server.js) : il se reliera au site en ligne.');
})().catch((e) => { console.error(e.message); process.exit(1); });
