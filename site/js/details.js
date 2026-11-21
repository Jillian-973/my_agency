// Petits objets qui donnent vie aux pièces : tasses, livres, lampes, cadres, horloges, étagères murales,
// tableaux blancs, affiches… et le grand nom de chaque pôle sur son mur.
import * as THREE from 'three';
import { rng, pick, tint, shade, mat, glow, grp, box, cyl, sph, plane, canvasTex, screenMat } from './outils.js';
import { poser, aModele } from './modeles.js';

const DARK = '#334155';
const LIVRES = ['#b91c1c', '#1d4ed8', '#047857', '#a16207', '#7c3aed', '#be185d', '#0f766e', '#f8fafc', '#334155', '#ea580c'];
export const hasard = (texte) => rng([...texte].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 17));

/* ---------- objets de bureau (posés à la hauteur y) ---------- */
export function tasse(p, x, y, z, c = '#ffffff', r = 0) {
  const g = grp(p, x, y, z, r);
  cyl(g, .05, .045, .11, 0, 0, 0, c, 10);
  cyl(g, .042, .042, .005, 0, .1, 0, '#4a2c1a', 10);            // café
  const anse = new THREE.Mesh(new THREE.TorusGeometry(.028, .009, 5, 10, Math.PI), mat(c));
  anse.rotation.z = -Math.PI / 2; anse.position.set(.05, .055, 0); g.add(anse);
  return g;
}
export function pileLivres(p, x, y, z, n = 3, seed = 'livres', r = 0) {
  const g = grp(p, x, y, z, r), h = hasard(seed);
  let hy = 0;
  for (let i = 0; i < n; i++) { const e = .035 + h() * .03; const b = box(g, .24 + h() * .06, e, .17 + h() * .04, (h() - .5) * .03, hy, (h() - .5) * .03, pick(LIVRES, h)); b.rotation.y = (h() - .5) * .3; hy += e; }
  return g;
}
export function livresDebout(p, x, y, z, n = 6, seed = 'debout', r = 0) {
  const g = grp(p, x, y, z, r), h = hasard(seed);
  let bx = 0;
  for (let i = 0; i < n; i++) { const w = .03 + h() * .03, hh = .16 + h() * .08; box(g, w, hh, .14, bx + w / 2, 0, 0, pick(LIVRES, h)); bx += w + .005; }
  g.children.forEach(c => { c.position.x -= bx / 2; });
  return g;
}
export function lampeBureau(p, x, y, z, c = '#1f2937', r = 0) {
  const g = grp(p, x, y, z, r);
  cyl(g, .07, .08, .02, 0, 0, 0, c, 10);
  const bras = box(g, .018, .32, .018, 0, .02, 0, c); bras.rotation.z = .25;
  const tete = grp(g, -.07, .33, 0); tete.rotation.z = -.9;
  cyl(tete, .03, .07, .09, 0, -.05, 0, c, 10); cyl(tete, .05, .05, .005, 0, -.055, 0, glow('#fff6d0'), 10);
  return g;
}
export function cadrePhoto(p, x, y, z, seed, r = 0) {
  const g = grp(p, x, y, z, r), h = hasard(seed);
  const f = box(g, .16, .12, .015, 0, 0, 0, pick(['#1f2937', '#a16207', '#f8fafc', '#b8860b'], h)); f.rotation.x = -.2;
  const ph = box(g, .13, .09, .005, 0, .015, .01, pick(['#7dd3fc', '#fca5a5', '#86efac', '#fde68a', '#c4b5fd'], h)); ph.rotation.x = -.2;
  box(g, .03, .08, .03, 0, 0, -.03, '#1f2937');
  return g;
}
export function potCrayons(p, x, y, z, r = 0) {
  const g = grp(p, x, y, z, r);
  cyl(g, .04, .035, .1, 0, 0, 0, '#64748b', 8);
  ['#ef4444', '#3b82f6', '#22c55e', '#111827'].forEach((c, i) => { const s = cyl(g, .006, .006, .14, -.015 + (i % 2) * .03, .03, -.012 + Math.floor(i / 2) * .024, c, 4); s.rotation.z = (i - 1.5) * .12; });
  return g;
}
export function plantePetite(p, x, y, z, seed = 'plante') {
  const g = grp(p, x, y, z), h = hasard(seed);
  cyl(g, .06, .045, .08, 0, 0, 0, pick(['#c2683d', '#f8fafc', '#334155', '#fbbf24'], h), 8);
  if (h() < .5) { const c = cyl(g, .035, .04, .14, 0, .08, 0, '#3f8f3a', 8); c.scale.x = 1; sph(g, .012, 0, .23, 0, '#f472b6', 0); }   // cactus
  else for (let i = 0; i < 5; i++) { const a = i / 5 * 6.28; sph(g, .045, Math.cos(a) * .03, .11 + (i % 2) * .03, Math.sin(a) * .03, i % 2 ? '#3f9d4a' : '#58b85c', 0); }
  return g;
}
export function bouteille(p, x, y, z, c = '#38bdf8') { const g = grp(p, x, y, z); cyl(g, .035, .035, .2, 0, 0, 0, mat(c, { transparent: true, opacity: .75 }), 10); cyl(g, .02, .02, .03, 0, .2, 0, '#1f2937', 8); return g; }
export function carnet(p, x, y, z, c = '#1f2937', r = 0) { const g = grp(p, x, y, z, r); box(g, .16, .02, .22, 0, 0, 0, c); box(g, .15, .005, .21, .005, .02, 0, '#f8fafc'); return g; }
export function telephone(p, x, y, z, r = 0) { const g = grp(p, x, y, z, r); box(g, .07, .012, .14, 0, 0, 0, '#111827'); plane(g, .06, .12, 0, .0125, 0, screenMat('social')).rotation.x = -Math.PI / 2; return g; }
export function casqueAudio(p, x, y, z, c = '#111827', r = 0) {
  const g = grp(p, x, y, z, r);
  const arc = new THREE.Mesh(new THREE.TorusGeometry(.09, .012, 5, 12, Math.PI), mat(c)); arc.rotation.x = -Math.PI / 2; arc.rotation.z = Math.PI; arc.position.y = .03; g.add(arc);
  for (const s of [-1, 1]) cyl(g, .04, .04, .04, s * .09, 0, 0, c, 10);
  return g;
}
export function postIts(p, x, y, z, n = 3, seed = 'postit') {
  const h = hasard(seed);
  for (let i = 0; i < n; i++) box(p, .06, .06, .004, x + i * .07, y - h() * .02, z, pick(['#fde68a', '#fbcfe8', '#bbf7d0', '#bfdbfe'], h), false);
}

/* ---------- objets métier, un par agent ---------- */
const METIER = {
  agenda: (g) => { carnet(g, 0, 0, 0, '#2563eb', .2); box(g, .02, .03, .18, -.07, .02, 0, '#facc15'); },
  livres: (g) => pileLivres(g, 0, 0, 0, 4, 'hugo'),
  calculatrice: (g) => { const c = grp(g, 0, 0, 0, .2); box(c, .1, .02, .15, 0, 0, 0, '#334155'); box(c, .08, .003, .03, 0, .02, -.05, glow('#a3e635')); for (let i = 0; i < 9; i++) box(c, .018, .006, .018, -.025 + (i % 3) * .025, .02, -.005 + Math.floor(i / 3) * .025, '#e2e8f0', false); },
  jumelles: (g) => { for (const s of [-1, 1]) { const t = cyl(g, .028, .03, .11, s * .035, .03, 0, '#1f2937', 8); t.rotation.x = Math.PI / 2; t.position.y = .03; } },
  classeur: (g) => { const c = grp(g, 0, 0, 0, -.15); box(c, .2, .015, .27, 0, 0, 0, '#a16207'); box(c, .18, .006, .24, 0, .015, .01, '#f8fafc'); box(c, .06, .015, .02, 0, .02, -.12, '#94a3b8'); },
  tablette: (g) => { const t = grp(g, 0, 0, 0, .3); box(t, .2, .012, .27, 0, 0, 0, '#111827'); plane(t, .18, .25, 0, .013, 0, screenMat('web')).rotation.x = -Math.PI / 2; },
  canard: (g) => { sph(g, .05, 0, .05, 0, '#facc15'); sph(g, .032, .03, .1, 0, '#facc15'); const b = box(g, .03, .012, .025, .065, .095, 0, '#f97316'); },
  stickers: (g) => { const l = grp(g, 0, 0, 0, -.2); box(l, .3, .015, .21, 0, 0, 0, '#cbd5e1'); for (const [sx, sz, c] of [[-.08, -.04, '#42b883'], [.06, .03, '#61dafb'], [-.02, .06, '#3178c6']]) cyl(l, .025, .025, .004, sx, .015, sz, c, 10); },
  serveur: (g) => { box(g, .14, .2, .2, 0, 0, 0, '#1f2937'); for (let i = 0; i < 3; i++) box(g, .01, .01, .005, .05, .05 + i * .05, .1, glow(i ? '#22c55e' : '#38bdf8'), false); },
  bouclier: (g) => { const b = cyl(g, .07, .07, .015, 0, .07, 0, '#22c55e', 6); b.rotation.x = Math.PI / 2; b.position.set(0, .08, 0); box(g, .03, .02, .03, 0, 0, 0, '#1f2937'); box(g, .015, .06, .006, 0, .055, .01, '#f8fafc', false); },
  boiteOutils: (g) => { box(g, .26, .1, .13, 0, 0, 0, '#ef4444'); box(g, .14, .03, .02, 0, .1, 0, '#1f2937'); },
  bobine: (g) => { const b = cyl(g, .07, .07, .08, 0, 0, 0, '#a16207', 12); cyl(g, .055, .055, .082, 0, 0, 0, '#22c55e', 12); },
  tabletteDessin: (g) => { const t = grp(g, 0, 0, 0, .1); box(t, .3, .012, .2, 0, 0, 0, '#111827'); box(t, .22, .003, .14, 0, .012, 0, '#334155'); const s = cyl(t, .006, .006, .15, .12, .03, .02, '#f8fafc', 5); s.rotation.z = 1.2; },
  nuancier: (g) => { const n = grp(g, 0, 0, 0, .4); ['#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#a855f7'].forEach((c, i) => { const f = box(n, .05, .004, .2, 0, i * .004, 0, c, false); f.rotation.y = (i - 2.5) * .18; }); },
  figurine: (g) => { cyl(g, .05, .05, .02, 0, 0, 0, '#1f2937', 10); const k = new THREE.Mesh(new THREE.TorusKnotGeometry(.035, .012, 40, 6), mat('#f97316')); k.position.y = .08; g.add(k); },
  disque: (g) => { box(g, .1, .025, .14, 0, 0, 0, '#111827'); box(g, .01, .003, .01, .03, .025, .05, glow('#22c55e'), false); },
  clap: (g) => { const c = grp(g, 0, 0, 0, .3); box(c, .2, .13, .015, 0, 0, 0, '#111827'); const top = box(c, .2, .03, .016, 0, .14, 0, '#f8fafc'); top.rotation.z = .25; box(c, .16, .01, .017, 0, .06, 0, '#f8fafc', false); },
  miniatures: (g) => { for (let i = 0; i < 3; i++) { const f = box(g, .14, .004, .08, (i - 1) * .04, i * .004, (i - 1) * .03, ['#f43f5e', '#06b6d4', '#f59e0b'][i], false); f.rotation.y = (i - 1) * .3; } },
  loupe: (g) => { const r = new THREE.Mesh(new THREE.TorusGeometry(.05, .01, 6, 16), mat('#1f2937')); r.rotation.x = -Math.PI / 2; r.position.y = .012; g.add(r); const m = box(g, .12, .015, .02, .1, .005, .05, '#a16207'); m.rotation.y = -.6; },
  telephone: (g) => telephone(g, 0, 0, 0, .3),
  graphique: (g) => { const f = grp(g, 0, 0, 0, -.2); box(f, .21, .004, .29, 0, 0, 0, '#f8fafc'); [.04, .07, .05, .1].forEach((h, i) => box(f, .03, .004, h, -.06 + i * .04, .004, .1 - h / 2, ['#3b82f6', '#22c55e', '#f97316', '#facc15'][i], false)); },
};
const METIER_PAR_AGENT = {
  lea: 'agenda', hugo: 'livres', maya: 'calculatrice', sacha: 'jumelles', iris: 'classeur', nour: 'tablette',
  theo: 'canard', jade: 'stickers', max: 'serveur', zoe: 'bouclier', ada: 'boiteOutils', basile: 'bobine',
  lila: 'tabletteDessin', noe: 'nuancier', blaise: 'figurine', milo: 'disque', clara: 'clap', joss: 'miniatures',
  sam: 'loupe', emma: 'telephone', ravi: 'graphique',
};

/**
 * Habille un bureau (repère du bureau : écran vers +z, côté agent en +z, plateau à y = 0.73).
 * Chaque bureau reçoit son objet métier et un assortiment tiré au sort de façon stable à partir de l'identifiant.
 */
export function habillerBureau(g, id, w = 1.4, libre = false) {
  const h = hasard(id || 'libre');
  const Y = .73, xs = w / 2 - .2;
  // sur un bureau à trois écrans, l'arrière est occupé : on ne garde que l'avant
  const places = (w > 1.6 ? [[-xs, .2], [xs, .2]] : [[-xs, .2], [xs, .2], [-xs, -.22], [xs, -.24]]).sort(() => h() - .5);
  const metier = METIER[METIER_PAR_AGENT[id]];
  if (metier) { const [x, z] = places.shift(); metier(grp(g, x, Y, z, (h() - .5) * .6)); }
  const choix = [
    (x, z) => tasse(g, x, Y, z, pick(['#ffffff', '#ef4444', '#3b82f6', '#facc15', '#22c55e', '#1f2937', '#ec4899'], h), h() * 6),
    (x, z) => plantePetite(g, x, Y, z, id + 'p'),
    (x, z) => cadrePhoto(g, x, Y, z, id + 'c', (h() - .5) * .8 + (x > 0 ? -.4 : .4)),
    // la tête de la lampe éclaire vers -x dans son repère : on la tourne pour qu'elle vise le clavier (0 ; 0,15)
    (x, z) => lampeBureau(g, x, Y, z, pick(['#1f2937', '#f8fafc', '#b8860b', '#ef4444'], h), Math.atan2(.15 - z, x)),
    (x, z) => pileLivres(g, x, Y, z, 2 + Math.floor(h() * 3), id + 'l', h() * 2),
    (x, z) => potCrayons(g, x, Y, z),
    (x, z) => bouteille(g, x, Y, z, pick(['#38bdf8', '#a3e635', '#f472b6'], h)),
    (x, z) => carnet(g, x, Y, z, pick(['#1f2937', '#b91c1c', '#0f766e', '#7c3aed'], h), (h() - .5)),
  ].sort(() => h() - .5);
  const n = libre ? 1 + Math.floor(h() * 2) : 2 + Math.floor(h() * 2);
  for (let i = 0; i < n && places.length; i++) { const [x, z] = places.shift(); choix[i](x, z); }
  if (h() < .7) postIts(g, -.27, 1.31, -.155, 1 + Math.floor(h() * 3), id + 'pi');   // notes collées sur l'écran
}

/* ---------- objets en hauteur et décor mural ---------- */
/** Étagère murale flottante. Repère : face avant vers +z, posée à la hauteur y. contenu : liste d'objets. */
export function etagereMurale(p, x, y, z, r, w = 1.4, contenu = ['livres', 'plante', 'trophee'], seed = 'etagere') {
  const g = grp(p, x, y, z, r), h = hasard(seed);
  box(g, w, .04, .26, 0, 0, 0, '#7a4f2e');
  for (const s of [-1, 1]) box(g, .03, .12, .2, s * (w / 2 - .15), -.12, -.02, DARK);
  const pas = w / contenu.length;
  contenu.forEach((c, i) => {
    const cx = -w / 2 + pas * (i + .5);
    if (c === 'livres') livresDebout(g, cx, .04, 0, 4 + Math.floor(h() * 4), seed + i);
    else if (c === 'pile') pileLivres(g, cx, .04, 0, 3, seed + i);
    else if (c === 'plante') plantePendante(g, cx, .04, .02, seed + i);
    else if (c === 'trophee') { cyl(g, .04, .05, .03, cx, .04, 0, '#1f2937', 8); cyl(g, .05, .025, .12, cx, .07, 0, '#facc15', 8); }
    else if (c === 'boite') box(g, .22, .14, .18, cx, .04, 0, pick(['#f8fafc', '#cbd5e1', '#b7894f'], h));
    else if (c === 'tasses') for (let k = 0; k < 3; k++) tasse(g, cx - .12 + k * .12, .04, 0, pick(['#ffffff', '#fde68a', '#93c5fd', '#fca5a5'], h), 2.5);
    else if (c === 'bocaux') for (let k = 0; k < 3; k++) cyl(g, .05, .05, .14, cx - .12 + k * .12, .04, 0, mat(pick(['#fde68a', '#a16207', '#f8fafc'], h), { transparent: true, opacity: .85 }), 10);
    else if (c === 'globe') { cyl(g, .04, .05, .03, cx, .04, 0, '#a16207', 8); sph(g, .08, cx, .15, 0, '#3b82f6', 1); }
    else if (c === 'bobines') for (let k = 0; k < 2; k++) { const b = cyl(g, .1, .1, .03, cx - .1 + k * .2, .14, 0, '#111827', 16); b.rotation.x = Math.PI / 2; b.position.y = .14; }
  });
  return g;
}
export function plantePendante(p, x, y, z, seed = 'pendante') {
  const g = grp(p, x, y, z), h = hasard(seed);
  cyl(g, .07, .055, .1, 0, 0, 0, pick(['#f8fafc', '#c2683d', '#1f2937'], h), 8);
  for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28, l = .12 + h() * .22; const t = box(g, .03, l, .03, Math.cos(a) * .06, .1 - l + .04, Math.sin(a) * .06 + .02, i % 2 ? '#3f9d4a' : '#58b85c'); }
  sph(g, .08, 0, .13, 0, '#4caf50', 0);
  return g;
}
/** Horloge murale (face vers +z). */
export function horloge(p, x, y, z, r = 0, c = '#1f2937') {
  const g = grp(p, x, y, z, r);
  const f = cyl(g, .22, .22, .04, 0, 0, 0, c, 20); f.rotation.x = Math.PI / 2; f.position.set(0, 0, 0);
  const d = cyl(g, .19, .19, .045, 0, 0, 0, '#f8fafc', 20); d.rotation.x = Math.PI / 2; d.position.set(0, 0, .002);
  const a = box(g, .015, .12, .01, 0, 0, .03, '#111827', false); a.rotation.z = -.8; a.position.set(.04, .04, .03);
  const b = box(g, .012, .16, .01, 0, 0, .035, '#ef4444', false); b.rotation.z = 2.2; b.position.set(.06, -.03, .035);
  return g;
}
/** Tableau blanc mural avec des schémas au feutre (face vers +z). */
const tbTex = {};
function texTableau(genre) {
  return tbTex[genre] ||= canvasTex(256, 160, (c) => {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, 256, 160);
    c.lineWidth = 3; c.lineCap = 'round';
    const h = hasard(genre), coul = ['#1d4ed8', '#dc2626', '#16a34a', '#111827'];
    for (let i = 0; i < 4; i++) { c.strokeStyle = coul[i % 4]; c.strokeRect(14 + i * 60, 20 + (i % 2) * 50, 44, 30); }
    c.strokeStyle = '#111827'; c.beginPath(); for (let i = 0; i < 3; i++) { c.moveTo(58 + i * 60, 35 + (i % 2) * 50); c.lineTo(74 + i * 60, 60 - (i % 2) * 25); } c.stroke();
    c.strokeStyle = '#dc2626'; c.beginPath(); c.moveTo(16, 140); for (let i = 0; i < 10; i++) c.lineTo(16 + i * 24, 140 - h() * 30 - i * 3); c.stroke();
    c.fillStyle = '#1d4ed8'; for (let i = 0; i < 4; i++) c.fillRect(150, 110 + i * 10, 40 + h() * 50, 3);
  });
}
export function tableauBlanc(p, x, y, z, r = 0, w = 1.6, genre = 'schema') {
  const g = grp(p, x, y, z, r);
  box(g, w + .08, w * .62 + .08, .03, 0, 0, 0, '#cbd5e1');
  plane(g, w, w * .62, 0, .04 + w * .31, .02, new THREE.MeshBasicMaterial({ map: texTableau(genre), toneMapped: false }));
  box(g, w * .7, .03, .06, 0, -.02, .04, '#94a3b8');
  ['#1d4ed8', '#dc2626', '#16a34a'].forEach((c, i) => { const m = cyl(g, .01, .01, .1, -.15 + i * .08, .03, .05, c, 5); m.rotation.z = Math.PI / 2; m.position.set(-.15 + i * .08, .02, .05); });
  return g;
}
/** Affiche encadrée (face vers +z). genre : 'abstrait', 'film', 'montagne', 'pixel', 'sport', 'carte'. */
const afTex = {};
function texAffiche(genre) {
  return afTex[genre] ||= canvasTex(128, 176, (c) => {
    const h = hasard(genre);
    if (genre === 'film') { const g = c.createLinearGradient(0, 0, 0, 176); g.addColorStop(0, '#7f1d1d'); g.addColorStop(1, '#111827'); c.fillStyle = g; c.fillRect(0, 0, 128, 176); c.fillStyle = '#fde68a'; c.beginPath(); c.arc(64, 70, 30, 0, 7); c.fill(); c.fillStyle = '#f8fafc'; c.fillRect(20, 130, 88, 8); c.fillRect(34, 146, 60, 5); }
    else if (genre === 'montagne') { c.fillStyle = '#7dd3fc'; c.fillRect(0, 0, 128, 176); c.fillStyle = '#f8fafc'; c.beginPath(); c.arc(96, 40, 16, 0, 7); c.fill(); c.fillStyle = '#334155'; c.beginPath(); c.moveTo(0, 176); c.lineTo(45, 70); c.lineTo(80, 120); c.lineTo(105, 90); c.lineTo(128, 176); c.fill(); }
    else if (genre === 'pixel') { c.fillStyle = '#0b0420'; c.fillRect(0, 0, 128, 176); for (let i = 0; i < 40; i++) { c.fillStyle = pick(['#f43f5e', '#22d3ee', '#a3e635', '#facc15'], h); c.fillRect(Math.floor(h() * 16) * 8, Math.floor(h() * 22) * 8, 8, 8); } }
    else if (genre === 'sport') { c.fillStyle = '#14b8a6'; c.fillRect(0, 0, 128, 176); c.fillStyle = '#f8fafc'; c.font = '24px "Kenney Future", sans-serif'; c.fillText('GO!', 36, 100); }
    else if (genre === 'carte') { c.fillStyle = '#e7d7b6'; c.fillRect(0, 0, 128, 176); c.fillStyle = '#86efac'; for (let i = 0; i < 6; i++) { c.beginPath(); c.arc(h() * 128, h() * 176, 12 + h() * 20, 0, 7); c.fill(); } c.strokeStyle = '#b91c1c'; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(10, 160); c.bezierCurveTo(40, 40, 90, 140, 118, 20); c.stroke(); }
    else { for (let i = 0; i < 6; i++) { c.fillStyle = pick(['#f472b6', '#a78bfa', '#fb923c', '#38bdf8', '#facc15', '#34d399'], h); c.fillRect(h() * 100, h() * 150, 30 + h() * 50, 30 + h() * 60); } }
  });
}
export function affiche(p, x, y, z, r = 0, genre = 'abstrait', w = .55) {
  const g = grp(p, x, y, z, r);
  box(g, w + .06, w * 1.375 + .06, .03, 0, 0, 0, '#1f2937');
  plane(g, w, w * 1.375, 0, .03 + w * .6875, .02, new THREE.MeshBasicMaterial({ map: texAffiche(genre), toneMapped: false }));
  return g;
}
/** Écran mural allumé (face vers +z). */
export function ecranMural(p, x, y, z, r, w, h, kind) {
  const g = grp(p, x, y, z, r);
  box(g, w + .08, h + .08, .05, 0, 0, 0, '#111827');
  plane(g, w, h, 0, .04 + h / 2, .03, screenMat(kind));
  return g;
}

/* ---------- le grand nom du pôle, avec sa petite phrase ---------- */
const enseignes = {};
export function enseignePole(p, x, y, z, r, nom, phrase, couleur, w = 3.6) {
  const tex = enseignes[nom] ||= canvasTex(1024, 256, (c) => {
    c.fillStyle = couleur; c.beginPath(); c.roundRect(4, 4, 1016, 248, 36); c.fill();
    c.fillStyle = 'rgba(255,255,255,.18)'; c.beginPath(); c.roundRect(4, 4, 1016, 110, [36, 36, 0, 0]); c.fill();
    const fonce = ['#facc15'].includes(couleur);
    c.fillStyle = fonce ? '#1f2937' : '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = '104px "Kenney Future", system-ui, "Segoe UI", sans-serif';
    try { c.letterSpacing = '14px'; } catch (e) { /* sans letterSpacing */ }
    c.fillText(nom.toUpperCase(), 512, 100, 960);    // largeur bornée : la police sci-fi est large
    try { c.letterSpacing = '0px'; } catch (e) { /* idem */ }
    c.font = '500 44px Inter, system-ui, "Segoe UI", sans-serif';   // phrase en Inter, nom du pôle en sci-fi
    c.fillStyle = fonce ? 'rgba(31,41,55,.85)' : 'rgba(255,255,255,.92)';
    c.fillText(phrase, 512, 200, 960);
  });
  const g = grp(p, x, y, z, r), h = w / 4;
  box(g, w + .06, h + .06, .04, 0, 0, 0, shade(couleur, .25));
  plane(g, w, h, 0, .03 + h / 2, .025, new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  return g;
}

export { aModele, poser };
