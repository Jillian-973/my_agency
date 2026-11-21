// Mobilier, personnages et mascottes du QG.
// Les meubles « génériques » (bureaux, chaises, canapés, plantes, frigo…) viennent du kit Kenney (CC0) ;
// les objets propres au QG (écrans aux contenus métier, tableaux, mur d'écrans, mascottes…) sont dessinés ici.
import * as THREE from 'three';
import { R, pick, tint, shade, mat, glow, glassMat, grp, box, cyl, sph, plane, screenMat, animate, wiggle } from './outils.js';
import { poser, aModele } from './modeles.js';
import { etiquetteAgent } from './etiquettes.js';
import { POLES } from './donnees.js';
import { habillerBureau } from './details.js';

export const WOOD = '#d6ae84', DARKWOOD = '#7a4f2e', METAL = '#94a3b8', DARK = '#334155';

/* ---------- postes de travail ---------- */
export function desk(p, x, z, r = 0, kind = 'code', o = {}) {
  const g = grp(p, x, 0, z, r), w = o.w || 1.4;
  if (!o.w && aModele('desk')) {
    // le bureau Kenney est très profond (1,07) : on le ramène à 0,7 pour que les bureaux dos à dos ne se chevauchent pas
    const d = poser(g, 'desk', 0, 0, 0); d.scale.z = .7 / d.userData.taille.z;
  } else {
    box(g, w, .06, .7, 0, .7, 0, o.top || WOOD);
    for (const s of [-1, 1]) box(g, .06, .7, .62, s * (w / 2 - .05), 0, 0, o.leg || '#cbd5e1');
  }
  for (const sx of (o.triple ? [-0.62, 0, 0.62] : [0])) {
    const m = grp(g, sx, 0, -.12, o.triple ? -sx * 0.5 : 0);
    box(m, .08, .24, .08, 0, .73, -.05, DARK);
    box(m, .62, .4, .04, 0, .93, -.06, '#1f2937');
    plane(m, .56, .34, 0, 1.13, -.035, screenMat(kind));
  }
  if (aModele('computerKeyboard')) poser(g, 'computerKeyboard', 0, .15, 0, { s: 1.6 }).position.y = .73;
  else box(g, .46, .02, .15, 0, .73, .14, '#e5e7eb');
  if (o.mug) cyl(g, .045, .04, .1, w / 2 - .2, .73, .12, o.mug, 8);
  return g;
}
export function laptop(p, x, y, z, r, kind) {
  const g = grp(p, x, y, z, r);
  box(g, .42, .025, .3, 0, 0, 0, '#cbd5e1');
  const s = grp(g, 0, .025, -.15); s.rotation.x = -0.25;
  box(s, .42, .28, .02, 0, 0, 0, '#cbd5e1'); plane(s, .38, .24, 0, .14, .012, screenMat(kind));
  return g;
}
export function chair(p, x, z, r, c = DARK) {
  if (aModele('chairDesk')) return poser(p, 'chairDesk', x, z, r, { teinte: { carpet: c } });
  const g = grp(p, x, 0, z, r);
  box(g, .07, .4, .07, 0, 0, 0, '#475569'); box(g, .5, .05, .5, 0, 0, 0, '#475569');
  box(g, .5, .08, .5, 0, .38, .02, c); box(g, .5, .55, .07, 0, .46, -.24, c);
  return g;
}

/* ---------- personnages ---------- */
const SKIN = ['#f5d0b0', '#e8b48f', '#c98c5f', '#8d5a3b', '#5c3a24', '#fbe0c8'];
export const A = (shirt, skin, hair, style, extra = {}) => ({ shirt, skin: SKIN[skin], hair, style, ...extra });

/**
 * Personnage cubique. pose : 'stand' ou 'sit'. etat : 'au travail' (tape au clavier, bras animés),
 * 'en pause' (tourné, une tasse à la main), 'en attente' (mains sur les genoux).
 */
export function personnage(p, x, z, r, s, pose = 'stand', etat = 'au travail') {
  const g = grp(p, x, 0, z, r);
  const pants = s.pants || '#334155', shoe = '#1f2937', skin = s.skin, shirt = s.shirt;
  if (pose === 'sit') {
    if (s.siege !== false) chair(g, 0, -.02, 0, s.chair || DARK);
    for (const sx of [-.11, .11]) { box(g, .17, .15, .44, sx, .42, .15, pants); box(g, .17, .4, .17, sx, .04, .34, pants); box(g, .18, .07, .25, sx, 0, .38, shoe); }
  } else {
    for (const sx of [-.11, .11]) { box(g, .17, .5, .2, sx, .04, 0, pants); box(g, .18, .07, .27, sx, 0, .03, shoe); }
  }
  box(g, .5, .56, .3, 0, .52, 0, shirt);
  box(g, .2, .05, .02, 0, 1.0, .155, tint(shirt, .5));
  const bras = [];
  for (const sx of [-1, 1]) {
    const a = grp(g, sx * .32, 1.04, 0);
    box(a, .13, .44, .16, 0, -.46, 0, shirt); box(a, .11, .1, .12, 0, -.56, 0, skin);
    if (pose === 'sit') a.rotation.x = etat === 'en attente' ? -.5 : -1.05;
    else a.rotation.z = sx * .06;
    bras.push(a);
  }
  if (pose === 'sit' && etat === 'en pause') {
    bras[1].rotation.x = -1.9; bras[0].rotation.x = -.45;
    cyl(bras[1], .055, .05, .13, 0, -.68, .02, '#ffffff', 8);
  }
  if (pose === 'sit' && etat === 'au travail') {
    const ph = R() * 6;
    for (const [i, a] of bras.entries()) { const b0 = a.rotation.x; animate(a, (t) => { a.rotation.x = b0 + Math.sin(t * 9 + ph + i * 2) * .07; }); }
  }
  box(g, .46, .44, .42, 0, 1.08, 0, skin);
  for (const sx of [-.1, .1]) box(g, .06, .08, .02, sx, 1.26, .21, '#1f2937');
  box(g, .1, .03, .02, 0, 1.16, .21, shade(skin, .25));
  const hc = s.hair;
  switch (s.style) {
    case 'long': box(g, .5, .14, .46, 0, 1.46, -.01, hc); box(g, .5, .62, .1, 0, .9, -.22, hc); for (const sx of [-.24, .24]) box(g, .06, .38, .3, sx, 1.1, -.04, hc); break;
    case 'bun': box(g, .5, .14, .46, 0, 1.46, -.01, hc); box(g, .5, .26, .08, 0, 1.22, -.21, hc); sph(g, .14, 0, 1.66, -.1, hc); break;
    case 'curly': for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) sph(g, .13, -.16 + i * .16, 1.5 + (j === 0 ? .02 : 0), -.17 + j * .15, hc, 0); box(g, .5, .3, .1, 0, 1.18, -.21, hc); break;
    default: box(g, .5, .14, .46, 0, 1.46, -.01, hc); box(g, .5, .26, .08, 0, 1.22, -.21, hc);
  }
  if (s.glasses) { box(g, .38, .03, .02, 0, 1.28, .225, '#111827'); for (const sx of [-.1, .1]) box(g, .13, .1, .015, sx, 1.22, .225, '#1f2937'); }
  if (s.phones) { box(g, .54, .06, .1, 0, 1.53, 0, '#111827'); for (const sx of [-.26, .26]) box(g, .08, .16, .17, sx, 1.16, 0, '#ef4444'); }
  if (s.tie) { box(g, .16, .3, .02, 0, .72, .155, '#f8fafc'); box(g, .07, .26, .025, 0, .72, .16, s.tie); }
  return g;
}

// Registre des agents posés dans le QG (pour fusionner leurs formes et retrouver leurs étiquettes).
export const agentsPoses = [];

/**
 * Le bureau d'un agent : table, écran (contenu métier), chaise, l'agent assis et son étiquette.
 * agent = fiche de donnees.js ; look = apparence (A(...)).
 */
export function poste(p, x, z, r, kind, agent, look, o = {}) {
  const g = grp(p, x, 0, z, r);
  const d = desk(g, 0, 0, 0, kind, o);
  // chaque bureau est un peu différent : objet métier + assortiment stable tiré de l'identifiant
  habillerBureau(d, agent ? agent.id : `libre-${x.toFixed(1)}-${z.toFixed(1)}-${kind}`, o.w || 1.4, !agent);
  if (!agent) { chair(g, 0, .8, Math.PI, o.chair); return g; }
  const tourne = agent.etat === 'en pause' ? .55 : 0;
  const pers = personnage(g, 0, .8, Math.PI + tourne, look, 'sit', agent.etat);
  enregistrerAgent(pers, agent);
  return g;
}
export function enregistrerAgent(groupe, agent) {
  const couleur = agent.pole ? POLES[agent.pole].couleur : '#b8860b';
  const lab = etiquetteAgent(agent, couleur, groupe);
  agentsPoses.push({ groupe, agent, etiquette: lab });
}

/* ---------- meubles ---------- */
export function plant(p, x, z, s = 1) {
  if (aModele('pottedPlant')) return poser(p, s < .8 ? pick(['plantSmall1', 'plantSmall2', 'plantSmall3']) : 'pottedPlant', x, z, R() * 6, { h: s < .8 ? .7 * s / .7 * .75 : 1.05 * s });
  const g = grp(p, x, 0, z);
  cyl(g, .22 * s, .17 * s, .36 * s, 0, 0, 0, '#c2683d', 10);
  sph(g, .32 * s, 0, .62 * s, 0, '#3f9d4a'); sph(g, .24 * s, .16 * s, .86 * s, .05 * s, '#358a40');
  return g;
}
export function tallPlant(p, x, z, s = 1) {
  if (aModele('pottedPlant')) return poser(p, 'pottedPlant', x, z, R() * 6, { h: 1.6 * s });
  const g = grp(p, x, 0, z);
  cyl(g, .25 * s, .2 * s, .45 * s, 0, 0, 0, '#f3f4f6', 10);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; sph(g, .22 * s, Math.cos(a) * .22 * s, (.9 + (i % 2) * .4) * s, Math.sin(a) * .22 * s, i % 2 ? '#2f8a3e' : '#46a556'); }
  return g;
}
export function shelf(p, x, z, r, w = 2.2, h = 2.1, seed = 1) {
  const g = grp(p, x, 0, z, r), rr = (() => { let s = seed * 9973; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  box(g, w, h, .06, 0, 0, -.18, DARKWOOD);
  for (const s of [-1, 1]) box(g, .08, h, .42, s * (w / 2 - .04), 0, 0, DARKWOOD);
  const rows = 4;
  for (let i = 0; i <= rows; i++) box(g, w, .05, .42, 0, i * (h - .05) / rows, 0, DARKWOOD);
  for (let i = 0; i < rows; i++) {
    let bx = -w / 2 + .1;
    while (bx < w / 2 - .18) {
      const bw = .06 + rr() * .07, bh = .26 + rr() * .14;
      if (rr() > .08) box(g, bw, bh, .3, bx + bw / 2, i * (h - .05) / rows + .05, .02, pick(['#b91c1c', '#1d4ed8', '#047857', '#a16207', '#7c3aed', '#be185d', '#0f766e', '#f8fafc', '#334155'], rr));
      bx += bw + .01;
    }
  }
  return g;
}
export function sofa(p, x, z, r, c, w = 1.8) {
  if (aModele('loungeSofa')) return poser(p, 'loungeSofa', x, z, r, { w, teinte: { carpet: c } });
  const g = grp(p, x, 0, z, r);
  box(g, w, .42, .8, 0, 0, 0, c); box(g, w, .5, .2, 0, .42, -.3, shade(c, .08));
  return g;
}
export function rug(p, x, z, w, d, c) { return box(p, w, .02, d, x, 0, z, c, false); }
export function board(p, x, z, r, w = 2) {
  const g = grp(p, x, 0, z, r);
  for (const s of [-1, 1]) box(g, .06, 1.6, .3, s * (w / 2 + .05), 0, 0, '#94a3b8');
  box(g, w + .1, 1.15, .05, 0, .5, 0, '#cbd5e1'); box(g, w, 1.05, .03, 0, .55, .02, '#ffffff');
  for (let i = 0; i < 12; i++) box(g, .16, .16, .01, -w / 2 + .2 + (i % 6) * (w - .3) / 5.5, .7 + Math.floor(i / 6) * .45 - ((i * 37) % 10) / 100, .04, ['#fde68a', '#fbcfe8', '#bbf7d0', '#bfdbfe'][i % 4], false);
  return g;
}
export function bigScreen(p, x, y, z, r, w, h, kind, stand = true) {
  const g = grp(p, x, 0, z, r);
  if (stand) { for (const s of (w > 2 ? [-w / 3, w / 3] : [0])) { box(g, .08, y, .08, s, 0, -.06, DARK); box(g, .1, .04, .6, s, 0, -.06, DARK); } }
  box(g, w + .12, h + .12, .08, 0, y - .06, 0, '#111827');
  plane(g, w, h, 0, y + h / 2, .045, screenMat(kind));
  return g;
}
export function stool(p, x, z) {
  if (aModele('stoolBar')) return poser(p, 'stoolBar', x, z, R() * 6, { h: .55 });
  const g = grp(p, x, 0, z); cyl(g, .05, .07, .5, 0, 0, 0, DARK, 6); cyl(g, .18, .18, .06, 0, .5, 0, DARKWOOD, 10); return g;
}
export function roundTable(p, x, z, rT = .45, h = .74, c = '#f8fafc') { const g = grp(p, x, 0, z); cyl(g, .22, .26, .04, 0, 0, 0, DARK, 10); cyl(g, .04, .04, h, 0, 0, 0, DARK, 6); cyl(g, rT, rT, .05, 0, h, 0, c, 16); return g; }
export function beanbag(p, x, z, c) { const b = sph(p, .4, x, .27, z, c); b.scale.y = .65; return b; }

/* ---------- mascottes ---------- */
export function octet(p, x, y, z, r = 0, etiquette) {
  const g = grp(p, x, y, z, r), fur = '#f59e0b';
  const body = sph(g, 1, 0, .12, 0, fur); body.scale.set(.3, .14, .22);
  sph(g, .12, .22, .14, .08, fur);
  for (const s of [-1, 1]) cyl(g, 0, .045, .08, .24, .22, .08 + s * .06, shade(fur, .1), 4);
  const tail = new THREE.Mesh(new THREE.TorusGeometry(.24, .035, 6, 14, Math.PI * 1.1), mat(shade(fur, .05)));
  tail.rotation.x = Math.PI / 2; tail.position.set(-.02, .06, 0); tail.rotation.z = .6; g.add(tail);
  wiggle(tail, 'z', 1.2, .25);
  if (etiquette) etiquette('Octet · zZz', '#f59e0b', 0, .75, 0, g, .7);
  return g;
}
export function archibald(p, x, z, r = 0, etiquette) {
  const g = grp(p, x, 0, z, r);
  cyl(g, .25, .3, .05, 0, 0, 0, DARKWOOD, 10); cyl(g, .04, .04, 1.55, 0, 0, 0, DARKWOOD, 6); box(g, .7, .06, .08, 0, 1.55, 0, DARKWOOD);
  const o = grp(g, 0, 1.61, 0);
  const body = sph(o, 1, 0, .24, 0, '#8b5e3c'); body.scale.set(.2, .26, .19);
  const belly = sph(o, 1, 0, .2, .08, '#e8d3b0'); belly.scale.set(.13, .17, .12);
  const head = grp(o, 0, .55, 0);
  const hd = sph(head, .17, 0, 0, 0, '#8b5e3c'); hd.scale.y = .9;
  for (const s of [-1, 1]) { sph(head, .06, s * .07, .02, .13, '#ffffff'); sph(head, .03, s * .07, .02, .18, '#111827'); cyl(head, 0, .04, .1, s * .1, .12, 0, '#6b4226', 4); }
  const beak = cyl(head, 0, .03, .07, 0, -.06, .17, '#f59e0b', 4); beak.rotation.x = Math.PI;
  wiggle(head, 'y', .5, .6);
  if (etiquette) etiquette('Archibald', '#8b5e3c', 0, 2.55, 0, g, .8);
  return g;
}

export { glassMat, glow };
