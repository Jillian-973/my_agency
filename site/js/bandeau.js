// Bandeau du haut : les logos de tes connecteurs qui marchent. Il défile avec les flèches, la molette ou en glissant.
// Un logo s'allume (halo à la couleur de la marque, prénom de l'agent) tant qu'un agent se sert de ce connecteur,
// puis redevient normal. Le serveur ne transmet que des noms et des marques (jamais d'adresse ni de commande).
import { SANS_SERVEUR, appeler } from './api.js';

// marque → fichier de site/ui/logos (Simple Icons, CC0 ; les autres sont dessinés pour le QG)
const LOGOS = {
  'claude docs': 'claude', claude: 'claude', gamma: 'gamma', adobe: 'adobe', stripe: 'stripe', atlassian: 'atlassian', cloudflare: 'cloudflare',
  notion: 'notion', vercel: 'vercel', figma: 'figma', gmail: 'gmail', 'google calendar': 'googlecalendar', 'google drive': 'googledrive',
  shopify: 'shopify', slack: 'slack', linear: 'linear', intercom: 'intercom', airwallex: 'airwallex', apollo: 'apollo', canva: 'canva',
  clay: 'clay', emergent: 'emergent', expensify: 'expensify', gusto: 'gusto', mailchimp: 'mailchimp', quickbooks: 'quickbooks',
  monday: 'monday', myob: 'myob', paypal: 'paypal', ramp: 'ramp', ringex: 'ringex', square: 'square', tiktok: 'tiktok', trello: 'trello',
  wix: 'wix', zapier: 'zapier', zoho: 'zoho',
};
const CLAIRS = new Set(['intercom', 'mailchimp']);            // logos pâles : posés sur une pastille sombre
const COULEURS = {                                             // halo de surbrillance, à la couleur de la marque
  claude: '#d97757', gamma: '#6d28d9', adobe: '#e1251b', stripe: '#635bff', atlassian: '#0052cc', cloudflare: '#f38020', notion: '#475569',
  vercel: '#475569', figma: '#f24e1e', gmail: '#ea4335', googlecalendar: '#4285f4', googledrive: '#4285f4', shopify: '#7ab55c',
  slack: '#ecb22e', linear: '#5e6ad2', intercom: '#1f8f86', canva: '#00a3b4', mailchimp: '#e0b800', quickbooks: '#2ca01c',
  paypal: '#002991', zapier: '#ff4f00', zoho: '#e42527', trello: '#0052cc', wix: '#0c6efc', tiktok: '#475569', square: '#3e4348',
};
const fichierDe = (marque) => LOGOS[marque] || LOGOS[marque.split(' ')[0]] || null;
const titreDe = (nom) => nom.charAt(0).toUpperCase() + nom.slice(1);

/** Logo de secours, dessiné à la volée, pour un connecteur que le QG ne connaît pas encore. */
function logoMaison(nom) {
  let h = 0; for (const ch of nom) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
  const r = document.createElementNS(ns, 'rect');
  Object.entries({ x: 1, y: 1, width: 22, height: 22, rx: 6, fill: `hsl(${h % 360} 55% 42%)` }).forEach(([k, v]) => r.setAttribute(k, v));
  const t = document.createElementNS(ns, 'text');
  Object.entries({ x: 12, y: 16.6, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 800, fill: '#fff', 'font-family': 'Inter, sans-serif' }).forEach(([k, v]) => t.setAttribute(k, v));
  t.textContent = (nom.match(/[a-z0-9]/i) || ['?'])[0].toUpperCase();
  svg.append(r, t);
  return svg;
}

export function creerBandeau() {
  const racine = document.getElementById('bandeau');
  const piste = racine.querySelector('.piste'), prec = racine.querySelector('.prec'), suiv = racine.querySelector('.suiv');
  const tuiles = new Map();                                    // marque → { li, legende }
  let actifs = new Map(), minuteur = 0, rafraichi = 0;

  function tuile(marque, nom) {
    if (tuiles.has(marque)) return tuiles.get(marque);
    const li = document.createElement('li'), f = fichierDe(marque);
    li.dataset.marque = marque; li.title = nom;
    li.style.setProperty('--halo', COULEURS[f] || '#1c9be0');
    if (f && CLAIRS.has(f)) li.classList.add('sombre');
    const pastille = document.createElement('span'); pastille.className = 'pastille';
    if (f) { const img = document.createElement('img'); img.src = `ui/logos/${f}.svg`; img.alt = ''; img.draggable = false; pastille.append(img); }
    else pastille.append(logoMaison(nom));
    const legende = document.createElement('span'); legende.className = 'legende';
    li.append(pastille, legende);
    const t = { li, legende, nom };
    tuiles.set(marque, t);
    return t;
  }

  /* ---------- la liste : connecteurs qui marchent, une tuile par marque ---------- */
  async function chargerListe() {
    try {
      const r = await appeler('/api/outils');
      const vus = new Map();
      for (const c of r.connecteurs || []) if (c.etat === 'ok' && c.marque && !vus.has(c.marque)) vus.set(c.marque, titreDe(c.nom));
      for (const [m] of tuiles) if (!vus.has(m) && !actifs.has(m)) { tuiles.get(m).li.remove(); tuiles.delete(m); }
      const ordre = [...vus].sort((a, b) => a[1].localeCompare(b[1], 'fr'));
      for (const [m, nom] of ordre) piste.append(tuile(m, nom).li);
      racine.hidden = !tuiles.size;
      majFleches();
    } catch { /* serveur ancien ou injoignable : on réessaiera */ }
  }

  /* ---------- surbrillance : qui utilise quoi, en ce moment ---------- */
  async function suivre() {
    clearTimeout(minuteur);
    let enCours = 0;
    try {
      const etat = await appeler('/api/etat');
      enCours = (etat.enCours || []).length;
      actifs = new Map((etat.actifs || []).map(a => [a.marque, a.agents || []]));
    } catch { actifs = new Map(); }
    for (const [m, agents] of actifs) {
      if (!tuiles.has(m)) { piste.prepend(tuile(m, titreDe(m)).li); racine.hidden = false; majFleches(); }   // utilisé mais absent de la liste
    }
    let premier = null;
    for (const [m, t] of tuiles) {
      const agents = actifs.get(m), allume = !!agents;
      if (allume && !t.li.classList.contains('actif')) premier ||= t.li;
      t.li.classList.toggle('actif', allume);
      t.legende.textContent = allume ? agents.join(', ') : '';
      t.li.title = allume ? `${t.nom} · utilisé par ${agents.join(', ')}` : t.nom;
    }
    if (premier) premier.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });   // on montre le logo qui vient de s'allumer
    if (Date.now() - rafraichi > 5 * 60000) { rafraichi = Date.now(); chargerListe(); }
    minuteur = setTimeout(suivre, document.hidden ? 15000 : enCours || actifs.size ? 1500 : 6000);
  }

  /* ---------- place : centré dans la fenêtre, sans toucher le panneau ni la minimap ---------- */
  function placer() {
    if (racine.hidden || innerWidth <= 640) return;              // téléphone : toute la largeur (feuille de style)
    const gauche = 306, droite = document.body.classList.contains('en-visite') ? 280 : 14;
    racine.style.setProperty('--bandeau-max', Math.max(120, innerWidth - gauche - droite) + 'px');
    const w = racine.offsetWidth;
    racine.style.setProperty('--bandeau-gauche', Math.round(Math.min(Math.max((innerWidth - w) / 2, gauche), innerWidth - droite - w)) + 'px');
  }
  addEventListener('resize', placer);
  new MutationObserver(placer).observe(document.body, { attributes: true, attributeFilter: ['class'] });   // entrée et sortie de visite

  /* ---------- défilement : flèches, molette, glisser ---------- */
  function majFleches() {
    placer();
    const max = piste.scrollWidth - piste.clientWidth;
    prec.disabled = piste.scrollLeft <= 2; suiv.disabled = piste.scrollLeft >= max - 2;
    const avant = racine.classList.contains('deborde');
    racine.classList.toggle('deborde', max > 2);
    if (avant !== max > 2) placer();                               // les flèches changent la largeur
  }
  const pas = () => Math.max(120, piste.clientWidth * .7);
  prec.addEventListener('click', () => piste.scrollBy({ left: -pas(), behavior: 'smooth' }));
  suiv.addEventListener('click', () => piste.scrollBy({ left: pas(), behavior: 'smooth' }));
  piste.addEventListener('scroll', majFleches, { passive: true });
  addEventListener('resize', majFleches);
  piste.addEventListener('wheel', (e) => {
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (!d) return;
    e.preventDefault(); piste.scrollLeft += d;
  }, { passive: false });
  let glisse = null;
  piste.addEventListener('pointerdown', (e) => { if (e.button === 0) glisse = { x: e.clientX, depart: piste.scrollLeft, id: e.pointerId, bouge: false }; });
  piste.addEventListener('pointermove', (e) => {
    if (!glisse || e.pointerId !== glisse.id) return;
    const dx = e.clientX - glisse.x;
    if (!glisse.bouge && Math.abs(dx) > 4) { glisse.bouge = true; piste.setPointerCapture(e.pointerId); piste.classList.add('glisse'); }
    if (glisse.bouge) piste.scrollLeft = glisse.depart - dx;
  });
  const lacher = () => { glisse = null; piste.classList.remove('glisse'); };
  piste.addEventListener('pointerup', lacher); piste.addEventListener('pointercancel', lacher);

  if (!SANS_SERVEUR) { rafraichi = Date.now(); chargerListe().then(suivre); }
  return { recharger: chargerListe };
}
