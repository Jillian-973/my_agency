// Construction du QG : l'île flottante, le bureau sans toit, les salles des pôles, les agents à leur poste,
// le Coffre sur son îlot et la nature autour (sapins, rochers et pierres du kit Kenney).
import * as THREE from 'three';
import {
  rng, R, pick, col, tint, shade, mat, glow, glassMat, grp, box, cyl, sph, plane, floorPlane, finish,
  canvasTex, tileTex, floorTex, screenMat, korpGold, korpWhite, spin, animate,
} from './outils.js';
import { poser, aModele } from './modeles.js';
import { etiquette } from './etiquettes.js';
import {
  WOOD, DARKWOOD, METAL, DARK, desk, laptop, chair, personnage, A, poste, enregistrerAgent, plant, tallPlant, shelf,
  sofa, rug, board, bigScreen, stool, roundTable, beanbag, octet, archibald,
} from './mobilier.js';
import { POLES, agentParId as ag } from './donnees.js';
import {
  tasse, pileLivres, livresDebout, lampeBureau, cadrePhoto, potCrayons, plantePetite, bouteille, carnet, postIts,
  etagereMurale, plantePendante, horloge, tableauBlanc, affiche, ecranMural, enseignePole,
} from './details.js';

// Phrase affichée sous le nom de chaque pôle, en grand sur son mur
const DEVISES = {
  cabinet: 'Mails, agenda, priorités : on garde le cap.',
  radar: 'On regarde dehors pour mieux décider dedans.',
  atelier: 'On cadre, on code, on livre.',
  forge: 'Chaque tâche répétée devient un outil.',
  studio: 'Le beau au service du clair.',
  montage: 'Des rushes au montage final, image par image.',
  phare: 'Être trouvé, être lu, être suivi.',
};
const enseigne = (p, x, y, z, r, pole, w) => enseignePole(p, x, y, z, r, POLES[pole].nom, DEVISES[pole], POLES[pole].couleur, w);

// Bâtiment : x de -20 à 20, z de -14 à 14. Le sol du bureau est à Y0.
export const BX = 20, BZ = 14, Y0 = 0.35, T = 0.2;
export const ISLET = { x: 29.5, y: 1.6, z: -5.25 };
const WALL = '#f6eddc';
const FORGE = { x: -7.5, z: -.25, w: 7, d: 7.5 };
const forgeHole = { x0: FORGE.x - FORGE.w / 2, x1: FORGE.x + FORGE.w / 2, z0: FORGE.z - FORGE.d / 2, z1: FORGE.z + FORGE.d / 2 };

export function construireMonde(scene) {
  const world = grp(scene);
  const zones = [];            // salles cliquables
  const portes = [];           // portes qui s'ouvrent avec E
  const facade = {};
  for (const [k, nx, nz] of [['n', 0, -1], ['s', 0, 1], ['w', -1, 0], ['e', 1, 0]]) facade[k] = { tall: grp(world), low: grp(world), nx, nz };

  /* ================= L'île ================= */
  const RX = 22.4, RZ = 16.3, N = 160;
  function edgeR(th) {
    const c = Math.abs(Math.cos(th)), s = Math.abs(Math.sin(th)), n = 8;
    const e = Math.pow(Math.pow(c / RX, n) + Math.pow(s / RZ, n), -1 / n);
    return e * (1 + 0.006 * Math.sin(5 * th + 1.3) + 0.004 * Math.sin(11 * th + 0.4));
  }
  function rectPath(target, q) { target.moveTo(q.x0, -q.z0); target.lineTo(q.x1, -q.z0); target.lineTo(q.x1, -q.z1); target.lineTo(q.x0, -q.z1); target.closePath(); }
  function floatingRock(parent, edge, depth, height, n, holes, seed, tip = [0, 0]) {
    const r = rng(seed);
    const shape = new THREE.Shape();
    for (let i = 0; i < n; i++) { const th = i / n * Math.PI * 2, e = edge(th); const x = e * Math.cos(th), z = e * Math.sin(th); i ? shape.lineTo(x, -z) : shape.moveTo(x, -z); }
    shape.closePath();
    for (const hr of holes) { const h = new THREE.Path(); rectPath(h, hr); shape.holes.push(h); }
    const top = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 }),
      [new THREE.MeshStandardMaterial({ color: '#7dc35b', roughness: .95 }), mat('#8a5a33')]);
    top.rotation.x = -Math.PI / 2; top.position.y = -depth; finish(top, parent); top.userData.noCollide = true;
    const K = 8, rings = [];
    for (let k = 0; k < K; k++) {
      const ring = [];
      for (let i = 0; i < n; i++) {
        const th = i / n * Math.PI * 2, e = edge(th);
        const f = k === 0 ? 1 : (1 - k / K) ** 0.75 * (0.86 + 0.2 * r());
        const y = -depth - (k / K) ** 1.15 * height + (k ? (r() - .5) * 1.0 : 0);
        ring.push(new THREE.Vector3(e * f * Math.cos(th) + tip[0] * k / K, y, e * f * Math.sin(th) + tip[1] * k / K));
      }
      rings.push(ring);
    }
    const tipV = new THREE.Vector3(tip[0], -depth - height * 1.05, tip[1]);
    const pos = [], cols = [];
    const cTop = col('#8a5a33'), cMid = col('#7a6e62'), cLow = col('#4f4943');
    const colorAt = (y) => { const t = Math.min(1, (-y - depth) / height); const c = t < .35 ? cTop.clone().lerp(cMid, t / .35) : cMid.clone().lerp(cLow, (t - .35) / .65); return c.multiplyScalar(0.9 + r() * 0.2); };
    const tri = (a, b, c) => { const cc = colorAt((a.y + b.y + c.y) / 3); for (const v of [a, b, c]) { pos.push(v.x, v.y, v.z); cols.push(cc.r, cc.g, cc.b); } };
    for (let k = 0; k < K; k++) for (let i = 0; i < n; i++) {
      const a = rings[k][i], b = rings[k][(i + 1) % n];
      if (k < K - 1) { const c = rings[k + 1][i], d = rings[k + 1][(i + 1) % n]; tri(a, c, b); tri(b, c, d); }
      else tri(a, tipV, b);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    finish(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .95, side: THREE.DoubleSide })), parent).userData.noCollide = true;
  }
  floatingRock(world, edgeR, .65, 12.5, N, [forgeHole], 11, [1.2, -.6]);

  // dalle du bureau (avec le trou de la Forge) : son dessus sert de sol aux couloirs
  {
    const s = new THREE.Shape(); rectPath(s, { x0: -BX - .1, x1: BX + .1, z0: -BZ - .1, z1: BZ + .1 });
    const h = new THREE.Path(); rectPath(h, forgeHole); s.holes.push(h);
    const tex = tileTex('#efe7da', '#e6dccb'); tex.repeat.set(.5, .5);
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: Y0, bevelEnabled: false }), [new THREE.MeshStandardMaterial({ map: tex, roughness: .8 }), mat('#cbbfae')]);
    m.rotation.x = -Math.PI / 2; finish(m, world); m.userData.noCollide = true;
  }

  /* ================= Murs et salles ================= */
  // Types : 'f' façade (haute, s'abaisse quand elle est du côté de la caméra), 'part' cloison vitrée,
  // 'glassTall' verrière, 'rail' garde-corps vitré, 'low' muret, 'mid' mur de coffre
  const OUTER_H = 2.8, PART_H = 2.2, WAIN = .8;
  function wallPiece(g, axis, u, v, fixed, type, o) {
    const L = v - u, c = (u + v) / 2;
    const P = (len, h, y, m, th = T) => axis === 'x' ? box(g, len, h, th, c, y, fixed, m) : box(g, th, h, len, fixed, y, c, m);
    const at = (s, w, h, y, m, th = T) => axis === 'x' ? box(g, w, h, th, s, y, fixed, m) : box(g, th, h, w, fixed, y, s, m);
    const wain = o.wain || tint(o.accent, .45), cap = o.cap || shade(o.accent, .12);
    if (type === 'outer') {
      P(L, WAIN, 0, wain); P(L, OUTER_H - WAIN, WAIN, o.wall || WALL); P(L, .1, OUTER_H, cap, T + .06);
    } else if (type === 'part' || type === 'glassTall') {
      const H = type === 'glassTall' ? OUTER_H : PART_H, wh = type === 'glassTall' ? .25 : WAIN;
      P(L, wh, 0, wain); P(L, H - wh, wh, glassMat, .05); P(L, .08, H, cap, T);
      const n = Math.max(1, Math.round(L / 1.5));
      for (let i = 1; i < n; i++) at(u + i * L / n, .06, H - wh, wh, DARK, .1);
      at(u + .03, .06, H - wh, wh, DARK, .1); at(v - .03, .06, H - wh, wh, DARK, .1);
    } else if (type === 'rail') {
      P(L, 1.0, 0, glassMat, .05); P(L, .06, 1.0, cap, .12);
      const n = Math.max(1, Math.round(L / 1.5));
      for (let i = 0; i <= n; i++) at(u + i * L / n, .06, 1.0, 0, DARK, .08);
    } else if (type === 'low') {
      P(L, WAIN, 0, wain); P(L, .08, WAIN, cap, T + .06);
    } else if (type === 'mid') {
      P(L, 1.5, 0, wain, .3); P(L, .1, 1.5, cap, .36);
    }
  }
  function wallRun(g, axis, s0, s1, fixed, type, o, doors = []) {
    let segs = [[s0, s1]];
    for (const dr of doors) {
      const a = dr.off - (dr.w || 1.6) / 2, b = dr.off + (dr.w || 1.6) / 2;
      segs = segs.flatMap(([u, v]) => (b <= u || a >= v) ? [[u, v]] : [[u, a], [b, v]].filter(([p, q]) => q - p > .05));
    }
    for (const [u, v] of segs) wallPiece(g, axis, u, v, fixed, type, o);
  }
  function windowsOn(g, axis, list, fixed, inward) {
    const pm = mat('#bfe6ff', { emissive: '#8fd3ff', emissiveIntensity: .45, roughness: .2 });
    for (const p of list) {
      const off = fixed + inward * (T / 2 + .02), o2 = off + inward * .02;
      if (axis === 'x') { box(g, 1.4, 1.2, .04, p, 1.0, off, '#ffffff'); box(g, 1.2, 1.0, .04, p, 1.1, o2, pm, false); }
      else { box(g, .04, 1.2, 1.4, off, 1.0, p, '#ffffff'); box(g, .04, 1.0, 1.2, o2, 1.1, p, pm, false); }
    }
  }
  const INWARD = { n: 1, s: -1, w: 1, e: -1 };
  function room(o) {
    const { w, d } = o, s = o.sides || {}, y = o.y ?? Y0;
    const g = grp(o.parent || world, o.x, y, o.z);
    if (o.floor) floorPlane(g, w, d, 0, .006, 0, floorTex(o.floor, w, d));
    const runs = { n: ['x', -w / 2 - T / 2, w / 2 + T / 2, -d / 2], s: ['x', -w / 2 - T / 2, w / 2 + T / 2, d / 2], w: ['z', -d / 2 + T / 2, d / 2 - T / 2, -w / 2], e: ['z', -d / 2 + T / 2, d / 2 - T / 2, w / 2] };
    for (const k in runs) {
      const type = s[k]; if (!type) continue;
      const [axis, s0, s1, fixed] = runs[k], doors = (o.doors || []).filter(x => x.side === k);
      if (type === 'f') {
        const gt = grp(facade[k].tall, o.x, y, o.z), gl = grp(facade[k].low, o.x, y, o.z);
        wallRun(gt, axis, s0, s1, fixed, 'outer', o, doors); wallRun(gl, axis, s0, s1, fixed, 'low', o, doors);
        if (o.windows?.[k]) windowsOn(gt, axis, o.windows[k], fixed, INWARD[k]);
        // décor accroché à cette façade (enseigne, étagères, horloge…) : il s'efface avec elle
        if (o.murs?.[k]) o.murs[k](gt);
      } else wallRun(g, axis, s0, s1, fixed, type, o, doors);
    }
    // portes qui s'ouvrent (touche E en visite) dans les cloisons vitrées et les murs du Coffre
    for (const dr of (o.doors || [])) {
      const type = s[dr.side];
      if (!['part', 'glassTall', 'mid'].includes(type)) continue;   // muret et garde-corps : simple passage
      const [axis, , , fixed] = runs[dr.side], gw = dr.w || 1.6, a = dr.off - gw / 2;
      const h = type === 'mid' ? 1.42 : 2.1, L = gw - .04;
      const pivot = axis === 'x' ? grp(g, a, 0, fixed) : grp(g, fixed, 0, a);
      const Q = (pos, larg, hh, yy, m, ep) => axis === 'x' ? box(pivot, larg, hh, ep, pos, yy, 0, m) : box(pivot, ep, hh, larg, 0, yy, pos, m);
      const cadre = o.cap || shade(o.accent, .12);
      if (type === 'mid') {
        Q(.02 + L / 2, L, h, 0, '#6b7280', .1); Q(.02 + L / 2, L * .7, .06, h * .6, '#eab308', .12);
      } else {
        Q(.02 + L / 2, L, .1, 0, cadre, .06); Q(.02 + L / 2, L, .08, h - .08, cadre, .06); Q(.02 + L / 2, L, h - .18, .1, glassMat, .03);
        Q(.05, .06, h, 0, DARK, .07); Q(L - .01, .06, h, 0, DARK, .07);
        Q(L - .2, .04, .25, 1.0, '#e5e7eb', .12);   // poignée
      }
      pivot.traverse(c => { c.userData.keep = true; c.castShadow = false; });
      pivot.userData.noCollide = true;
      const sens = { n: 1, s: -1, w: -1, e: 1 }[dr.side];          // la porte s'ouvre vers le couloir
      portes.push({ pivot, axe: 'y', ouvert: sens * Math.PI / 2, angle: 0, ouverte: false, axis, largeur: L, hauteur: h, yBas: 0, zone: o.id, side: dr.side });
    }
    if (o.fill) o.fill(grp(g));
    if (o.label) etiquette(o.label, o.accent, o.x + (o.labelDx || 0), y + (o.labelY || 3.6), o.z + (o.labelDz || 0), o.parent || world);
    if (o.id) {
      const base = o.parent ? o.parent.position : new THREE.Vector3();
      zones.push({ id: o.id, nom: o.label, couleur: o.accent, pole: o.pole || null, x: base.x + o.x, y: base.y + y, z: base.z + o.z, w, d, bas: o.bas ?? 0, sides: s, doors: o.doors || [] });
    }
    return g;
  }

  /* ======================================================================
     Plan du bureau (40 × 28)
     Rangée nord (z -14 → -6.5) : Bibliothèque | Cabinet | Quartier Général | Radar | Studio
     Couloir nord (z -6.5 → -4) : à l'est, le pont vers le Coffre
     Rangée centre (z -4 → 3.5) : Projection | Forge (en contrebas) | Hall | Réunion | Café
     Couloir sud (z 3.5 → 6)
     Rangée sud (z 6 → 14)      : Atelier | Phare | Terrasse | Arcade | Sport
     ====================================================================== */
  const P = POLES;

  /* ---- Bibliothèque ---- */
  room({
    id: 'bibliotheque', x: -16, z: -10.25, w: 8, d: 7.5, accent: '#b45309', label: 'La Bibliothèque',
    sides: { n: 'f', w: 'f', s: 'part' }, doors: [{ side: 's', off: 2 }], windows: { w: [1.6] },
    floor: { type: 'wood', c: '#b98552' },
    murs: { w: (m) => { horloge(m, -3.87, 2.45, 1.6, Math.PI / 2, '#7a4f2e'); affiche(m, -3.87, 1.2, -2.6, Math.PI / 2, 'carte', .5); } },
    fill(g) {
      // en hauteur, sur les bibliothèques : plantes retombantes, piles de livres, globe
      plantePendante(g, -2.55, 2.2, -3.44, 'b1'); pileLivres(g, 0, 2.2, -3.44, 4, 'b2'); plantePendante(g, 2.55, 2.2, -3.44, 'b3');
      plantePendante(g, -3.69, 2.0, -.9, 'b4');
      // échelle appuyée contre les rayonnages
      // posée devant la bibliothèque du milieu : pied à 0,7 du rayonnage, sommet appuyé sur sa face avant (z -3,23)
      const ech = grp(g, .45, 0, -2.52); ech.rotation.x = -.3;
      for (const s of [-1, 1]) box(ech, .05, 2.3, .05, s * .2, 0, 0, '#a16207');
      for (let i = 0; i < 7; i++) box(ech, .4, .04, .04, 0, .25 + i * .3, 0, '#a16207');
      // coin lecture : guéridon, livres, tasse de thé
      const gd = grp(g, -2.6, 0, 2.2); cyl(gd, .2, .22, .02, 0, 0, 0, DARKWOOD, 10); cyl(gd, .03, .03, .55, 0, 0, 0, DARKWOOD, 6); cyl(gd, .26, .26, .04, 0, .55, 0, DARKWOOD, 14);
      pileLivres(gd, -.05, .59, 0, 3, 'gd'); tasse(gd, .14, .59, .08, '#fef3c7');
      pileLivres(g, -1.9, 0, 3.2, 5, 'sol1'); pileLivres(g, 3.3, 0, 1.3, 4, 'sol2');
      [-2.55, 0, 2.55].forEach((sx, i) => shelf(g, sx, -3.44, 0, 2.4, 2.2, 10 + i));
      shelf(g, -3.69, -.9, Math.PI / 2, 2.0, 2.0, 20);
      rug(g, .6, .6, 4.2, 2.8, '#7f1d1d');
      poste(g, .6, .1, Math.PI, 'notion', ag.hugo, A('#3b82f6', 1, '#a0522d', 'short', { glasses: true, chair: '#7f1d1d' }));
      archibald(g, -2.6, -2.2, Math.PI / 4);
      if (aModele('loungeChair')) { poser(g, 'loungeChair', -3.3, 1.6, Math.PI / 2, { teinte: { carpet: '#991b1b' } }); poser(g, 'loungeChair', -3.3, 2.8, Math.PI / 2, { teinte: { carpet: '#991b1b' } }); }
      else sofa(g, -3.3, 2.3, Math.PI / 2, '#991b1b', 1.4);
      const gl = grp(g, 3.3, 0, 2.8); cyl(gl, .2, .25, .05, 0, 0, 0, DARKWOOD, 8); cyl(gl, .03, .03, .8, 0, 0, 0, DARKWOOD, 6); sph(gl, .3, 0, 1.05, 0, '#3b82f6', 2);
      if (aModele('lampRoundFloor')) poser(g, 'lampRoundFloor', 3.4, -2.6, 0);
      plant(g, 3.45, .3, .85);   // contre la cloison est, hors du passage de la porte (x 1,2 → 2,8)
    },
  });

  /* ---- Cabinet ---- */
  room({
    id: 'cabinet', pole: 'cabinet', x: -8, z: -10.25, w: 8, d: 7.5, accent: P.cabinet.couleur, label: 'Cabinet · Tour de Contrôle',
    sides: { n: 'f', w: 'part', s: 'part' }, doors: [{ side: 's', off: 0 }], windows: { n: [2.6] },
    floor: { type: 'tile', c1: tint(P.cabinet.couleur, .8), c2: tint(P.cabinet.couleur, .9) },
    murs: { n: (m) => { enseigne(m, -.6, 2.06, -3.62, 0, 'cabinet', 2.8); horloge(m, -3.2, 1.75, -3.6, 0); } },
    fill(g) {
      bigScreen(g, -1.2, .9, -3.3, 0, 2.8, 1.15, 'calendar');
      // en hauteur sur l'armoire : classeurs et plante ; table basse : tasses et magazines
      livresDebout(g, -3.55, 1.53, 1.25, 7, 'classeurs', Math.PI / 2); plantePendante(g, -3.55, 1.53, 2.15, 'cab');
      tasse(g, 2.0, .35, 1.55, '#ffffff', 1); tasse(g, 2.35, .35, 2.05, '#93c5fd', 2); carnet(g, 2.25, .35, 1.75, '#1d4ed8', .4);
      // imprimante et parapheur près de la porte
      const imp = grp(g, -1.4, 0, 3.15); box(imp, .5, .7, .45, 0, 0, 0, '#cbd5e1'); box(imp, .55, .28, .5, 0, .7, 0, '#e5e7eb'); box(imp, .3, .02, .25, 0, .98, .05, '#f8fafc'); box(imp, .06, .03, .01, .18, .9, .25, glow('#22c55e'), false);
      tableauBlanc(g, 3.85, .9, -1.4, -Math.PI / 2, 1.3, 'agenda');
      rug(g, -.3, -1.4, 4.8, 2.2, tint(P.cabinet.couleur, .55));
      poste(g, -2.0, -1.3, Math.PI, 'mail', ag.lea, A(P.cabinet.couleur, 0, '#3b2416', 'long'));
      poste(g, 1.4, -1.3, Math.PI, 'sheet', ag.maya, A(P.cabinet.couleur, 2, '#111111', 'bun', { pants: '#1e3a8a' }));
      sofa(g, 3.25, 1.8, -Math.PI / 2, '#93c5fd', 1.7);
      if (aModele('tableCoffee')) poser(g, 'tableCoffee', 2.2, 1.8, Math.PI / 2, { s: 1.5 }); else roundTable(g, 2.3, 1.8, .36, .42);
      if (aModele('bookcaseClosedWide')) poser(g, 'bookcaseClosedWide', -3.55, 1.6, Math.PI / 2);
      const mb = grp(g, 1.3, 0, 3.1); box(mb, .12, .9, .12, 0, 0, 0, DARK); box(mb, .45, .4, .6, 0, .9, 0, P.cabinet.couleur); box(mb, .05, .3, .06, .25, 1.1, .2, '#ef4444');
      plant(g, 3.4, -3.1, 1); plant(g, -3.4, -3.1, .85);
    },
  });

  /* ---- Quartier Général : le bureau du CEO de JILL KORP ---- */
  room({
    id: 'qg', x: 0, z: -10.25, w: 8, d: 7.5, accent: '#b8860b', label: 'Quartier Général · CEO', labelY: 4.0,
    sides: { n: 'f', w: 'part', s: 'part' }, doors: [{ side: 's', off: 0 }],
    floor: { type: 'wood', c: '#8a5a3a' }, wain: '#1f2937', cap: '#b8860b', wall: '#f3ead8',
    fill(g) {
      box(g, 7.2, 2.6, .14, 0, 0, -3.42, '#111827');
      const kinds = ['mail', 'radar', 'code', 'term', 'design', 'video', 'seo'];
      Object.values(P).forEach((p, i) => {
        const x = -2.85 + i * .95;
        box(g, .88, .62, .03, x, .95, -3.33, p.couleur, false);
        plane(g, .78, .52, x, 1.26, -3.31, screenMat(kinds[i]));
      });
      plane(g, 3.6, .9, 0, 2.12, -3.33, korpGold);
      box(g, 3.4, .03, .03, 0, 1.68, -3.33, glow('#facc15'), false);
      const dk = grp(g, 0, 0, -1.6, Math.PI);
      box(dk, 2.4, .08, .95, 0, .72, 0, '#3f2a1c'); box(dk, 2.3, .7, .08, 0, 0, -.42, '#5b3a26');
      plane(dk, 1.7, .42, 0, .36, -.465, korpGold, Math.PI);
      for (const s of [-1, 1]) box(dk, .1, .72, .9, s * 1.12, 0, 0, '#5b3a26');
      for (const sx of [-.5, .5]) { const m = grp(dk, sx, 0, -.18, -sx * .4); box(m, .08, .22, .08, 0, .8, -.04, DARK); box(m, .64, .4, .04, 0, .98, -.06, '#1f2937'); plane(m, .58, .34, 0, 1.18, -.035, screenMat(sx < 0 ? 'chart' : 'slides')); }
      cyl(dk, .05, .045, .12, .95, .8, .2, '#facc15', 8);
      const ceo = personnage(g, 0, -2.4, 0, A('#1f2937', 1, '#2a1a10', 'curly', { skin: '#b07a52', pants: '#111827', tie: '#b8860b', chair: '#111827' }), 'sit', ag.ceo.etat);
      enregistrerAgent(ceo, ag.ceo);
      chair(g, -.6, -.55, Math.PI, '#b8860b'); chair(g, .6, -.55, Math.PI, '#b8860b');
      cyl(g, 1.7, 1.7, .02, -1.6, 0, 1.7, '#b8860b', 40); cyl(g, 1.55, 1.55, .025, -1.6, 0, 1.7, '#1e293b', 40);
      roundTable(g, -1.6, 1.7, .6, .74, '#3f2a1c');
      for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.PI / 4; chair(g, -1.6 + Math.cos(a) * 1.05, 1.7 + Math.sin(a) * 1.05, -a - Math.PI / 2, '#1f2937'); }
      sofa(g, 3.0, 1.6, -Math.PI / 2, '#334155', 1.8);
      const tr = grp(g, 3.5, 0, -2.6); box(tr, .4, 1.3, .9, 0, 0, 0, '#3f2a1c'); cyl(tr, .08, .12, .3, 0, 1.3, -.2, '#facc15', 8); sph(tr, .1, 0, 1.68, -.2, '#facc15'); box(tr, .2, .25, .2, 0, 1.3, .25, '#f8fafc');
      tallPlant(g, -3.5, -2.6, .9); plant(g, 3.5, 3.2, .85);
      // petits détails : dossiers et stylo sur le bureau, tasses sur la table de réunion, trophée et livres en hauteur
      carnet(dk, -.75, .76, .15, '#111827', .3); potCrayons(dk, .7, .76, -.25);
      tasse(g, -1.35, .79, 1.45, '#f8fafc', 1); tasse(g, -1.85, .79, 1.95, '#1f2937', 4); carnet(g, -1.6, .79, 1.9, '#b8860b', -.4); bouteille(g, -1.95, .79, 1.4, '#7dd3fc');
      horloge(g, -3.85, 1.75, 1.7, Math.PI / 2, '#b8860b');
      if (aModele('lampRoundFloor')) poser(g, 'lampRoundFloor', 3.55, .3, 0);
    },
  });

  /* ---- Radar ---- */
  room({
    id: 'radar', pole: 'radar', x: 8, z: -10.25, w: 8, d: 7.5, accent: P.radar.couleur, label: 'Le Radar · veille',
    sides: { n: 'f', w: 'part', s: 'part' }, doors: [{ side: 's', off: 0 }],
    floor: { type: 'tile', c1: '#3b2f63', c2: '#4a3b7a' }, wain: '#5b4a96', wall: '#ede9fe',
    fill(g) {
      box(g, 7.6, 3.05, .15, 0, 0, -3.45, '#1f1b3a');
      enseigne(g, 0, 2.24, -3.365, 0, 'radar', 2.9);
      // en hauteur sur le mur d'écrans : plantes retombantes et horloges des fuseaux
      plantePendante(g, -3.55, 3.05, -3.45, 'r1'); plantePendante(g, 3.55, 3.05, -3.45, 'r2');
      tableauBlanc(g, -3.85, .85, -.4, Math.PI / 2, 1.4, 'concurrents');
      affiche(g, -3.87, 1.0, 1.6, Math.PI / 2, 'carte', .5);
      tasse(g, -1.55, .74, 2.35, '#c4b5fd', 1); carnet(g, -1.9, .74, 1.9, '#4c1d95', .5);
      bouteille(g, 2.75, .45, 2.5, '#a78bfa'); plant(g, 3.4, .2, .8);
      const kinds = ['radar', 'web', 'chart', 'seo', 'web', 'radar'];
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) bigScreen(g, -2.45 + i * 2.45, .25 + j * 1.0, -3.33, 0, 2.3, .88, kinds[i + j * 3], false);
      poste(g, -2.5, -1.6, 0, 'web', ag.sacha, A(P.radar.couleur, 5, '#e5c07b', 'short'));
      poste(g, 0, -1.8, 0, 'chart', ag.iris, A(P.radar.couleur, 3, '#1a1a1a', 'curly'));
      poste(g, 2.5, -1.6, 0, 'term', ag.nour, A(P.radar.couleur, 2, '#222222', 'long', { pants: '#1f2937' }));
      const ht = grp(g, -1.7, 0, 2.1); cyl(ht, .5, .6, .7, 0, 0, 0, '#312e81', 16); cyl(ht, .52, .52, .04, 0, .7, 0, glow('#a78bfa'), 24);
      const holo = new THREE.Mesh(new THREE.IcosahedronGeometry(.42, 1), new THREE.MeshBasicMaterial({ color: '#c4b5fd', wireframe: true, toneMapped: false }));
      holo.position.y = 1.28; ht.add(holo); spin(holo, 'y', .6);
      sph(ht, .25, 0, 1.28, 0, new THREE.MeshBasicMaterial({ color: '#8b5cf6', transparent: true, opacity: .35, toneMapped: false })).castShadow = false;
      sofa(g, 3.2, 1.9, -Math.PI / 2, '#7c3aed', 1.6);
      const mast = grp(g, -3.4, 0, 3.2); cyl(mast, .08, .1, 3.0, 0, 0, 0, '#e2e8f0', 8);
      const dish = grp(mast, 0, 3.1, 0);
      const dm = new THREE.Mesh(new THREE.SphereGeometry(.65, 16, 8, 0, Math.PI * 2, 0, .9), mat('#f8fafc', { side: THREE.DoubleSide }));
      dm.rotation.x = -1.1; dish.add(dm); spin(dish, 'y', .9);
    },
  });

  /* ---- Studio (verrière) ---- */
  room({
    id: 'studio', pole: 'studio', x: 16, z: -10.25, w: 8, d: 7.5, accent: P.studio.couleur, label: 'Le Studio · design',
    sides: { n: 'glassTall', w: 'part', s: 'part', e: 'glassTall' }, doors: [{ side: 's', off: -2 }],
    floor: { type: 'tile', c1: '#fff7fb', c2: tint(P.studio.couleur, .84) },
    fill(g) {
      poste(g, -2.55, -2.6, 0, 'design', ag.lila, A(P.studio.couleur, 0, '#f9a8d4', 'long'));
      poste(g, 0, -2.6, 0, 'brand', ag.noe, A(P.studio.couleur, 3, '#111111', 'short', { pants: '#3b5b8a' }));
      poste(g, 2.55, -2.6, 0, 'blender', ag.blaise, A(P.studio.couleur, 5, '#d4a373', 'curly', { chair: '#f97316' }));
      const e = grp(g, -3.2, 0, .7, Math.PI / 3);
      for (const s of [-1, 1]) { const l = box(e, .05, 1.7, .05, s * .3, 0, 0, '#a16207'); l.rotation.z = -s * .12; }
      box(e, .9, .7, .04, 0, .85, .05, '#ffffff'); box(e, .7, .4, .045, 0, 1.0, .06, '#fb7185'); box(e, .3, .2, .05, .15, .9, .065, '#fde047');
      const ped = grp(g, -.9, 0, .7); box(ped, .55, .9, .55, 0, 0, 0, '#ffffff');
      const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(.22, .075, 80, 10), new THREE.MeshStandardMaterial({ color: P.studio.couleur, roughness: .25, metalness: .5 }));
      knot.position.y = 1.28; ped.add(knot); spin(knot, 'y', .5);
      // Inès (présentations et dossiers) au coin sud-est ; le mood board passe contre la verrière, à côté d'elle
      poste(g, 2.45, .85, 0, 'slides', ag.ines, A(P.studio.couleur, 2, '#3b1f14', 'bun', { pants: '#4c1d95' }));
      const mb = grp(g, 3.62, 0, 1.55, -Math.PI / 2); box(mb, 1.4, 1.15, .06, 0, .4, 0, '#ffffff');
      ['#f9a8d4', '#a78bfa', '#fde68a', '#5eead4', '#fb923c', '#38bdf8'].forEach((c, i) => box(mb, .4, .32, .02, -.5 + (i % 3) * .5, .55 + Math.floor(i / 3) * .44, .04, c, false));
      if (aModele('loungeDesignSofa')) poser(g, 'loungeDesignSofa', .3, 2.95, Math.PI, { w: 1.9, teinte: { carpetBlue: '#f9a8d4' } }); else sofa(g, .3, 2.95, Math.PI, '#f9a8d4', 1.8);
      plant(g, -3.5, 3.1, .9); tallPlant(g, 3.5, 3.1, .9); plant(g, 3.5, -.8, .75);
      // grand nom du pôle sur la verrière, étagère d'objets inspirants, affiches et nuancier mural
      enseigne(g, 0, 1.95, -3.6, 0, 'studio', 3.2);
      etagereMurale(g, -3.82, 1.65, -1.2, Math.PI / 2, 1.4, ['plante', 'boite', 'livres'], 'studio');
      affiche(g, -3.86, .7, -1.2, Math.PI / 2, 'abstrait', .45);
      affiche(g, 3.86, 1.05, 1.0, -Math.PI / 2, 'montagne', .5);
      plantePendante(g, -3.82, 1.65, 1.8, 'st2');
      const tabouret = grp(g, -2.55, 0, .7); cyl(tabouret, .18, .2, .5, 0, 0, 0, '#f9a8d4', 12);
      pileLivres(g, 1.0, .42, 2.95, 2, 'sofa-st'); tasse(g, -.75, .9, .95, '#ec4899');
    },
  });

  /* ---- Salle de Projection (montage) ---- */
  room({
    id: 'projection', pole: 'montage', x: -15.5, z: -.25, w: 9, d: 7.5, accent: P.montage.couleur, label: 'Salle de Projection · montage',
    sides: { n: 'part', w: 'f', s: 'part', e: 'part' }, doors: [{ side: 'n', off: .5 }],
    floor: { type: 'carpet', c: '#5b1a1a', dots: ['#7f1d1d', '#991b1b'] }, wain: '#7f1d1d', wall: '#fde2e2',
    fill(g) {
      box(g, .12, 3.0, 5.2, -4.2, 0, -.4, '#111827');
      plane(g, 4.8, 1.75, -4.13, 1.35, -.4, screenMat('film'), Math.PI / 2);
      enseigne(g, -4.13, 2.28, -.4, Math.PI / 2, 'montage', 2.8);
      // affiches de films, étagère de bobines, seaux de pop-corn sur les sièges
      affiche(g, -2.9, .95, -3.6, 0, 'film', .5); affiche(g, -1.9, .95, -3.6, 0, 'montagne', .5);
      etagereMurale(g, 2.3, 1.7, -3.6, 0, 1.2, ['bobines', 'boite'], 'proj');
      for (const [sx, sz, sy] of [[-1.6, -1.05, .42], [-.3, -.3, .62]]) { const s = grp(g, sx, sy, sz); cyl(s, .06, .045, .12, 0, 0, 0, '#dc2626', 8); sph(s, .05, 0, .13, 0, '#fef3c7', 0); }
      bouteille(g, -1.6, .42, -1.8, '#ef4444');
      const seat = (sx, sz, sy = 0) => { const s = grp(g, sx, sy, sz, -Math.PI / 2); box(s, .6, .4, .55, 0, 0, 0, '#991b1b'); box(s, .6, .65, .12, 0, .3, -.24, '#b91c1c'); for (const a of [-1, 1]) box(s, .06, .6, .55, a * .32, 0, 0, '#450a0a'); };
      box(g, 1.1, .2, 2.6, -.3, 0, -1.05, '#450a0a');
      for (let i = 0; i < 3; i++) { seat(-1.6, -1.8 + i * .75); seat(-.3, -1.8 + i * .75, .2); }
      // projecteur dans l'axe de l'écran, faisceau rectangulaire de l'objectif jusqu'à l'écran
      const pj = grp(g, 1.1, 0, -.4); box(pj, .1, 1.3, .1, 0, 0, 0, DARK); box(pj, .55, .28, .45, 0, 1.3, 0, '#1f2937');
      const lens = cyl(pj, .09, .09, .08, 0, 0, 0, glow('#fff7d6'), 12); lens.rotation.z = Math.PI / 2; lens.position.set(-.31, 1.44, 0);
      const len = 5.2 - .35, beamW = grp(pj, -.35 - len / 2, 1.4, 0);
      beamW.rotation.z = -Math.PI / 2; beamW.scale.set(1.75 * .98, 1, 4.8 * .98);
      const bm = new THREE.Mesh(new THREE.CylinderGeometry(.04, Math.SQRT1_2, len, 4, 1, true),
        new THREE.MeshBasicMaterial({ color: '#fff5d6', transparent: true, opacity: .08, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide }));
      bm.rotation.y = Math.PI / 4; bm.castShadow = false; beamW.add(bm); beamW.userData.noCollide = true;
      poste(g, 3.5, -2.6, -Math.PI / 2, 'thumbs', ag.joss, A(P.montage.couleur, 0, '#f59e0b', 'short'));
      poste(g, 3.5, -.4, -Math.PI / 2, 'video', ag.clara, A(P.montage.couleur, 4, '#111111', 'long'), { triple: true, w: 1.9 });
      poste(g, 3.5, 1.9, -Math.PI / 2, 'wave', ag.milo, A(P.montage.couleur, 1, '#222222', 'short', { phones: true }));
      const pc = grp(g, -3.8, 0, 3.1); box(pc, .55, .75, .55, 0, 0, 0, '#dc2626'); box(pc, .55, .55, .55, 0, .75, 0, glassMat); box(pc, .57, .14, .57, 0, 1.3, 0, '#dc2626');
      for (let i = 0; i < 8; i++) sph(pc, .055, (R() - .5) * .36, .85 + R() * .2, (R() - .5) * .36, '#fef3c7', 0);
      plant(g, 1.2, 3.1, .9);
    },
  });

  /* ---- Forge (en contrebas, la cave aux outils) ---- */
  room({
    id: 'forge', pole: 'forge', x: FORGE.x, z: FORGE.z, w: FORGE.w, d: FORGE.d, accent: P.forge.couleur, label: 'La Forge · outils', labelY: 2.8, bas: -2,
    sides: { n: 'rail', s: 'rail', e: 'rail' }, doors: [{ side: 'n', off: 2.7, w: 1.2 }],
    fill(g) {
      const D = 2.0, { w, d } = FORGE;
      box(g, w, .2, d, 0, -D - .2, 0, '#4b4540');
      floorPlane(g, w, d, 0, -D + .006, 0, floorTex({ c1: '#57534e', c2: '#625d57' }, w, d));
      const st = '#8a8178';
      box(g, w, D, .25, 0, -D, -d / 2 + .125, st); box(g, w, D, .25, 0, -D, d / 2 - .125, st);
      box(g, .25, D, d - .5, -w / 2 + .125, -D, 0, st); box(g, .25, D, d - .5, w / 2 - .125, -D, 0, st);
      // escalier : pas d'obstacle, c'est la hauteur du sol (fonction sol) qui le fait monter et descendre
      for (let i = 0; i < 10; i++) box(g, 1.1, D - (i + 1) * .2, .38, 2.7, -D, -d / 2 + .44 + i * .38, '#a09588').userData.noCollide = true;
      const p = grp(g, 0, -D, 0);
      const f = grp(p, -2.4, 0, -2.75); box(f, 1.3, 1.2, 1.1, 0, 0, 0, '#57534e'); box(f, .75, .5, .05, 0, .25, .56, glow('#fb923c'));
      box(f, .45, 3.8, .45, 0, 1.2, -.2, '#6b625a');
      const halo = canvasTex(64, 64, (c) => { const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,170,70,.85)'); gr.addColorStop(1, 'rgba(255,120,40,0)'); c.fillStyle = gr; c.fillRect(0, 0, 64, 64); });
      const hs = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
      hs.scale.set(3.2, 2.4, 1); hs.position.set(0, .5, 1.0); f.add(hs);
      const an = grp(p, -.6, 0, -.1, .3); box(an, .5, .45, .4, 0, 0, 0, '#78716c'); box(an, .3, .2, .25, 0, .45, 0, '#3f3f46'); box(an, .9, .22, .34, .1, .65, 0, '#3f3f46');
      const hm = grp(an, -.1, .88, .05, .4); box(hm, .45, .04, .04, 0, 0, 0, '#a16207'); box(hm, .1, .1, .14, .22, -.03, 0, DARK);
      // poste d'Ada contre le mur ouest, sous son panneau à outils
      poste(p, -2.55, 1.6, Math.PI / 2, 'term', ag.ada, A(P.forge.couleur, 1, '#6b21a8', 'short'));
      const pb = grp(p, -3.22, 0, 1.6, Math.PI / 2); box(pb, 2.0, .7, .05, 0, 1.1, -.03, '#c8a27a');
      for (let i = 0; i < 6; i++) box(pb, .08, .35, .03, -.8 + i * .32, 1.25, .0, pick(['#475569', '#f97316', '#ef4444', '#64748b']));
      // tableau de connexions de Basile, et son poste juste devant
      const sw = grp(p, -.3, 0, -3.55); box(sw, 2.2, 1.2, .1, 0, .2, 0, '#1f2937');
      const sockets = []; for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) { const sx = -.84 + i * .42, sy = .5 + j * .33; box(sw, .1, .1, .03, sx, sy - .05, .06, glow(pick(['#22c55e', '#f97316', '#38bdf8']))); sockets.push([sx, sy]); }
      const rr = rng(5);
      for (let k = 0; k < 7; k++) {
        const a = sockets[Math.floor(rr() * sockets.length)], b = sockets[Math.floor(rr() * sockets.length)];
        const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(a[0], a[1], .1), new THREE.Vector3((a[0] + b[0]) / 2, Math.min(a[1], b[1]) - .35, .22), new THREE.Vector3(b[0], b[1], .1)]);
        finish(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, .022, 5), mat(pick(['#ef4444', '#facc15', '#3b82f6', '#22c55e', '#e879f9'], rr))), sw, false);
      }
      poste(p, -.3, -2.5, 0, 'term', ag.basile, A(P.forge.couleur, 2, '#3b2416', 'curly'));
      const gear = grp(p, 1.45, 1.25, -3.62);
      const gb = cyl(gear, .4, .4, .1, 0, 0, 0, '#f97316', 16); gb.rotation.x = Math.PI / 2;
      for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; const t = box(gear, .13, .15, .1, Math.cos(a) * .45, Math.sin(a) * .45 - .075, 0, '#f97316'); t.rotation.z = a; }
      spin(gear, 'z', .4);
      if (aModele('cardboardBoxClosed')) { poser(p, 'cardboardBoxClosed', 1.0, 3.1, .2, { s: 2.4 }); poser(p, 'cardboardBoxClosed', 1.6, 2.95, -.3, { s: 2.4 }); poser(p, 'cardboardBoxClosed', 1.3, 3.05, .5, { s: 2.2, y: .62 }); }
      cyl(p, .28, .28, .8, -.6, 0, 3.15, '#92400e', 10);
      // grand nom du pôle sur le mur de pierre, appliques, étagère à bocaux, caisse à outils, plans
      enseigne(p, -3.22, 1.05, -.9, Math.PI / 2, 'forge', 2.8);
      for (const z of [-2.0, .55]) { const ap = grp(p, -3.18, 1.85, z); box(ap, .06, .2, .1, 0, 0, 0, '#3f3f46'); sph(ap, .07, .05, .25, 0, glow('#fdba74'), 0); }
      etagereMurale(p, 1.45, 1.8, -3.12, 0, 1.0, ['bocaux'], 'forge');
      const caisse = grp(p, .7, 0, 1.6, .3); box(caisse, .5, .25, .3, 0, 0, 0, '#ef4444'); box(caisse, .3, .04, .04, 0, .27, 0, '#1f2937');
      box(p, .9, .01, .6, .5, 0, .5, '#bfdbfe', false);   // plan déroulé au sol
      tasse(p, -.6, .8, 3.15, '#78716c', 1);
    },
  });

  /* ---- Le Hall d'accueil (au centre, ouvert) ---- */
  {
    const g = grp(world, 0, Y0, -.25);
    const wheel = canvasTex(512, 512, (c) => {
      Object.values(P).forEach((p, i) => { c.fillStyle = p.couleur; c.beginPath(); c.moveTo(256, 256); c.arc(256, 256, 250, i / 7 * Math.PI * 2, (i + 1) / 7 * Math.PI * 2); c.fill(); });
      c.fillStyle = '#f8fafc'; c.beginPath(); c.arc(256, 256, 150, 0, 7); c.fill();
    });
    const rugM = new THREE.Mesh(new THREE.CircleGeometry(2.6, 48), new THREE.MeshStandardMaterial({ map: wheel, roughness: .9 }));
    rugM.rotation.x = -Math.PI / 2; rugM.position.y = .01; rugM.receiveShadow = true; g.add(rugM);
    cyl(g, 1.2, 1.3, .45, 0, 0, 0, '#e7dccb', 10); cyl(g, 1.02, 1.02, .47, 0, 0, 0, '#5b3a1e', 10);
    cyl(g, .18, .26, 2.0, 0, .45, 0, '#7a4f2e', 8);
    sph(g, 1.25, 0, 2.8, 0, '#4caf50'); sph(g, .85, .7, 2.4, .4, '#43a047'); sph(g, .95, -.6, 2.55, -.3, '#5cbf60'); sph(g, .7, .15, 3.7, .1, '#66bb6a');
    const rc = grp(g, -2.4, 0, 2.9); box(rc, 2.2, 1.05, .6, 0, 0, 0, P.cabinet.couleur); box(rc, 2.3, .06, .7, 0, 1.05, 0, '#f8fafc');
    plane(rc, 1.9, .48, 0, .55, .305, korpWhite);
    laptop(rc, .4, 1.11, 0, Math.PI, 'mail');
    sofa(g, 3.3, 1.8, -Math.PI / 2, '#fbbf24', 1.6); sofa(g, 3.3, -1.9, -Math.PI / 2, '#fbbf24', 1.6);
    tallPlant(g, -3.5, -3.2, .9); plant(g, -3.5, 1.2, .9);
    // accueil : sonnette, plante, registre ; écran de bienvenue ; magazines sur la table basse
    plantePetite(rc, -.8, 1.11, 0, 'accueil'); carnet(rc, -.3, 1.11, .05, '#b8860b', .2); tasse(rc, .95, 1.11, .1, '#ffffff', 2);
    bigScreen(g, -2.4, 1.0, -3.2, 0, 1.8, 1.0, 'slides');
    if (aModele('tableCoffee')) { poser(g, 'tableCoffee', 2.4, -.05, Math.PI / 2, { s: 1.5 }); pileLivres(g, 2.4, .35, -.2, 3, 'magazines'); tasse(g, 2.45, .35, .3, '#fbbf24'); }
    etiquette('Le Hall', '#64748b', 0, Y0 + 4.6, -.25, world);
    zones.push({ id: 'hall', nom: 'Le Hall', couleur: '#64748b', pole: null, x: 0, y: Y0, z: -.25, w: 8, d: 7.5, bas: 0 });
  }

  /* ---- Salle de réunion ---- */
  room({
    id: 'reunion', x: 7.5, z: -.25, w: 7, d: 7.5, accent: '#64748b', label: 'Salle de réunion',
    sides: { n: 'part', w: 'part', s: 'part' }, doors: [{ side: 'n', off: -2 }],
    floor: { type: 'carpet', c: '#cbd5e1' },
    fill(g) {
      box(g, 3.6, .07, 1.4, 0, .72, .3, '#f8fafc'); for (const sx of [-1.5, 1.5]) box(g, .1, .72, 1, sx, 0, .3, DARK);
      for (let i = 0; i < 3; i++) { chair(g, -1.2 + i * 1.2, -.62, 0, '#475569'); chair(g, -1.2 + i * 1.2, 1.22, Math.PI, '#475569'); }
      chair(g, -2.25, .3, Math.PI / 2, '#475569'); chair(g, 2.25, .3, -Math.PI / 2, '#475569');
      bigScreen(g, 0, .9, -3.3, 0, 2.4, 1.2, 'slides');
      board(g, -3.1, 2.6, Math.PI / 2, 1.5);
      plant(g, 3.0, -3.2, 1); plant(g, 3.0, 3.2, .9);
      // une place préparée par chaise : carnet, tasse ou bouteille d'eau ; horloge et tableau blanc
      const pl = [[-1.2, -.05], [0, -.05], [1.2, -.05], [-1.2, .65], [0, .65], [1.2, .65]];
      pl.forEach(([x, z], i) => { carnet(g, x - .12, .79, z, ['#1f2937', '#1d4ed8', '#b91c1c'][i % 3], (i - 2) * .1); (i % 2 ? tasse : bouteille)(g, x + .18, .79, z, ['#ffffff', '#7dd3fc', '#ffffff', '#86efac', '#ffffff', '#7dd3fc'][i]); });
      cyl(g, .12, .12, .05, 0, .79, .3, '#1f2937', 12);   // pieuvre de visioconférence
      horloge(g, 3.38, 1.75, -1.4, -Math.PI / 2);
      tableauBlanc(g, -3.35, .9, -1.4, Math.PI / 2, 1.3, 'reunion');
    },
  });

  /* ---- Café ---- */
  room({
    id: 'cafe', x: 15.5, z: -.25, w: 9, d: 7.5, accent: '#a16207', label: 'Le Café',
    sides: { n: 'part', w: 'part', s: 'part', e: 'f' }, doors: [{ side: 'n', off: 2 }, { side: 's', off: -2 }], windows: { e: [-1.6, 1.6] },
    floor: { type: 'wood', c: '#c99a6a' },
    fill(g) {
      const ct = grp(g, -3.8, 0, -.4, Math.PI / 2); box(ct, 3.6, 1.0, .65, 0, 0, 0, '#7c4a24'); box(ct, 3.7, .06, .75, 0, 1.0, 0, '#f5f5f4');
      if (aModele('kitchenCoffeeMachine')) poser(ct, 'kitchenCoffeeMachine', -1.0, -.05, 0, { s: 1.3, y: 1.06 });
      const pd = grp(ct, .7, 1.06, 0); box(pd, .9, .38, .45, 0, 0, 0, glassMat); for (let i = 0; i < 6; i++) sph(pd, .065, -.3 + (i % 3) * .3, .1 + Math.floor(i / 3) * .17, 0, pick(['#f59e0b', '#ec4899', '#a16207', '#fde68a']), 0);
      for (let i = 0; i < 4; i++) cyl(ct, .04, .035, .1, 1.5 + (i % 2) * .12, 1.06, -.15 + Math.floor(i / 2) * .15, '#ffffff', 8);
      bigScreen(g, -4.3, 1.3, -.4, Math.PI / 2, 1.6, .8, 'menu');
      for (const [tx, tz] of [[-1.3, -2.0], [1.4, -1.8], [-.9, 1.1], [3.2, -.2], [.9, 2.9], [1.0, 1.1]]) { roundTable(g, tx, tz, .4); stool(g, tx - .58, tz + .1); stool(g, tx + .58, tz - .1); cyl(g, .04, .035, .1, tx, .79, tz, '#ffffff', 8); }
      if (aModele('kitchenFridge')) poser(g, 'kitchenFridge', -3.95, 2.15, Math.PI / 2);
      plant(g, 4.0, -3.2, 1); tallPlant(g, 4.0, 3.1, .9); plant(g, -3.9, 3.25, .8);
      // en hauteur au-dessus du comptoir : étagères à tasses et à bocaux ; plante sur le frigo ; gâteau sous cloche
      etagereMurale(g, -4.3, 1.75, 1.35, Math.PI / 2, 1.0, ['tasses'], 'cafe1');
      etagereMurale(g, -4.3, 1.75, -1.75, Math.PI / 2, 1.0, ['bocaux'], 'cafe2');
      plantePendante(g, -3.95, 1.78, 2.15, 'frigo');
      const cl = grp(ct, -.15, 1.06, .05); cyl(cl, .16, .18, .03, 0, 0, 0, '#f8fafc', 14); cyl(cl, .12, .12, .1, 0, .03, 0, '#a16207', 14); cyl(cl, .12, .12, .02, 0, .13, 0, '#fde68a', 14); sph(cl, .17, 0, .1, 0, mat('#e0f2fe', { transparent: true, opacity: .3 }), 1);
      tasse(g, -1.15, .79, -1.85, '#fde68a', 1); tasse(g, 1.6, .79, -1.65, '#93c5fd', 3); pileLivres(g, -.75, .79, 1.25, 1, 'journal'); tasse(g, 1.15, .79, 1.25, '#ffffff', 5);
    },
  });

  /* ---- Atelier ---- */
  room({
    id: 'atelier', pole: 'atelier', x: -13.5, z: 10, w: 13, d: 8, accent: P.atelier.couleur, label: "L'Atelier · code",
    sides: { n: 'part', w: 'f', s: 'f' }, doors: [{ side: 'n', off: 4.5 }], windows: { w: [-1.8, 2.2], s: [-3, 1.5] },
    floor: { type: 'tile', c1: tint(P.atelier.couleur, .82), c2: tint(P.atelier.couleur, .9) },
    murs: {
      w: (m) => {
        enseigne(m, -6.37, 1.2, .2, Math.PI / 2, 'atelier', 2.4);
        horloge(m, -6.37, 1.95, 3.35, Math.PI / 2);
        etagereMurale(m, -6.27, 2.3, -1.8, Math.PI / 2, 1.3, ['livres', 'plante'], 'at-w');
      },
    },
    fill(g) {
      // en hauteur sur les serveurs : plante et carton ; affiches ; canards en plastique ; raquettes de ping-pong
      plantePendante(g, -5.9, 2.0, -3.35, 'rack'); box(g, .45, .3, .4, -5.0, 2.0, -3.25, '#b7894f');
      tableauBlanc(g, -1.5, .9, -3.85, 0, 1.6, 'archi');
      affiche(g, 2.0, .95, -3.85, 0, 'pixel', .5); affiche(g, 3.0, .95, -3.85, 0, 'abstrait', .5);
      for (const [x, z] of [[4.85, 2.0], [4.4, 3.1]]) { const r = grp(g, x, .79, z, .6); cyl(r, .08, .08, .015, 0, 0, 0, '#dc2626', 12); box(r, .03, .015, .12, 0, 0, .12, '#7a4f2e'); }
      sph(g, .03, 4.6, .82, 2.5, '#f8fafc', 0);
      bouteille(g, 6.0, .45, -3.3, '#4ade80'); tasse(g, 5.9, .45, -2.25, '#22c55e', 1);
      poste(g, -2.2, -1.8, Math.PI, 'code', ag.jade, A(P.atelier.couleur, 0, '#2d6a4f', 'long'));
      poste(g, -2.2, -1.1, 0, 'code', ag.max, A(P.atelier.couleur, 4, '#111111', 'short', { pants: '#1f2937' }));
      poste(g, 1.2, -1.8, Math.PI, 'deploy', ag.zoe, A(P.atelier.couleur, 5, '#c0392b', 'bun'));
      poste(g, 1.2, -1.1, 0, 'term', ag.theo, A(P.atelier.couleur, 1, '#5b3a1e', 'short', { glasses: true, pants: '#3b5b8a' }));
      poste(g, 4.4, -1.8, Math.PI, 'web', null); poste(g, 4.4, -1.1, 0, 'code', null);
      poste(g, -2.2, 1.7, Math.PI, 'code', null); poste(g, -2.2, 2.4, 0, 'web', null);
      poste(g, 1.2, 1.7, Math.PI, 'term', null); plant(g, 1.2, 2.6, .7);
      board(g, -4.4, 3.5, 0, 2.0);   // kanban de Théo, devant le mur sud
      for (const sx of [-5.9, -5.0]) {
        const rk = grp(g, sx, 0, -3.35); box(rk, .8, 2.0, .8, 0, 0, 0, '#1f2937');
        for (let i = 0; i < 8; i++) { box(rk, .66, .18, .02, 0, .15 + i * .22, .41, '#374151', false); box(rk, .05, .05, .02, .26, .22 + i * .22, .42, glow(i % 3 ? '#22c55e' : '#38bdf8'), false); }
      }
      octet(g, -5.45, 2.0, -3.35, .4);
      bigScreen(g, -3.4, .9, -3.4, 0, 1.5, .8, 'deploy');
      const pp = grp(g, 4.6, 0, 2.5, Math.PI / 2); box(pp, 1.4, .06, 2.5, 0, .72, 0, '#15803d'); box(pp, 1.4, .15, .02, 0, .78, 0, '#f8fafc');
      for (const sx of [-.55, .55]) for (const sz of [-1.05, 1.05]) box(pp, .06, .72, .06, sx, 0, sz, DARK);
      beanbag(g, 6.0, -3.3, '#16a34a'); beanbag(g, 6.0, -2.3, '#4ade80');
      plant(g, -6.0, 3.5, .9); tallPlant(g, 6.1, .4, .8);
    },
  });

  /* ---- Phare (SEO & marketing) ---- */
  room({
    id: 'phare', pole: 'phare', x: -2.5, z: 10, w: 9, d: 8, accent: P.phare.couleur, label: 'Le Phare · SEO & marketing',
    sides: { n: 'part', w: 'part', s: 'f' }, doors: [{ side: 'n', off: 0 }], windows: { s: [-2.4, 2.4] },
    floor: { type: 'tile', c1: tint(P.phare.couleur, .66), c2: tint(P.phare.couleur, .8) }, wain: '#fcd34d', cap: '#ca8a04',
    fill(g) {
      bigScreen(g, 2.5, 1.0, -3.4, 0, 2.6, 1.2, 'seo');       // contre la cloison, à droite de la porte (qui reste dégagée)
      poste(g, -2.0, -1.6, Math.PI, 'seo', ag.sam, A(P.phare.couleur, 2, '#1a1a1a', 'short', { glasses: true }));
      poste(g, 1.4, -1.6, Math.PI, 'social', ag.emma, A(P.phare.couleur, 5, '#e5c07b', 'long'));
      poste(g, 2.4, 1.0, Math.PI, 'chart', ag.ravi, A(P.phare.couleur, 3, '#111111', 'short', { pants: '#1f2937' }));
      board(g, 3.95, -1.2, -Math.PI / 2, 1.6);
      rug(g, -1.6, 2.4, 3.2, 2, '#fde68a');
      sofa(g, -1.6, 3.35, Math.PI, '#f59e0b', 1.9); roundTable(g, -1.6, 2.3, .4, .42);
      beanbag(g, -3.8, 1.2, '#facc15'); beanbag(g, -3.9, 2.4, '#fb923c');
      tallPlant(g, -4.0, -3.4, .9); plant(g, 4.0, 3.4, .9);
      // grand nom du pôle sur la cloison, trophées en hauteur, mégaphone, magazines et tasses
      enseigne(g, -4.42, 1.25, -1.6, Math.PI / 2, 'phare', 2.8);
      etagereMurale(g, -2.4, 1.7, -3.85, 0, 1.6, ['trophee', 'plante', 'trophee', 'livres'], 'phare');
      const mega = grp(g, -1.4, .47, 2.25, .8); const cn = cyl(mega, .03, .1, .22, 0, 0, 0, '#facc15', 10); cn.rotation.z = Math.PI / 2; cn.position.set(0, .08, 0); box(mega, .04, .08, .04, -.08, 0, 0, '#1f2937');
      pileLivres(g, -1.8, .47, 2.45, 2, 'mag-phare'); tasse(g, -1.75, .47, 2.05, '#fde68a');
      horloge(g, -4.42, 1.95, 1.6, Math.PI / 2, '#ca8a04');
    },
  });

  /* ---- Terrasse (brainstorms et bilans du vendredi) ---- */
  room({
    id: 'terrasse', x: 5.5, z: 10, w: 7, d: 8, accent: '#f59e0b', label: 'Terrasse · brainstorms', wain: '#c08a55', cap: '#7a4f2e',
    sides: { n: 'low', w: 'part', s: 'low' }, doors: [{ side: 'n', off: 1 }],
    floor: { type: 'wood', c: '#c08a55' },
    fill(g) {
      for (const [px, pz, c] of [[-1.4, -1.6, '#fb7185'], [1.5, .6, '#2dd4bf']]) {
        const pa = grp(g, px, 0, pz); cyl(pa, .28, .28, .08, 0, 0, 0, DARK, 8); cyl(pa, .04, .04, 2.2, 0, 0, 0, '#f8fafc', 6); cyl(pa, .05, 1.3, .45, 0, 2.0, 0, c, 8);
        roundTable(pa, 0, 0, .5, .72, '#ffffff'); stool(pa, -.8, .15); stool(pa, .8, -.1); stool(pa, 0, .85); stool(pa, 0, -.8);
      }
      for (let i = 0; i < 3; i++) { const lc = grp(g, -1.7 + i * 1.05, 0, 3.0, Math.PI); box(lc, .6, .3, 1.4, 0, 0, 0, '#ffffff'); const bk = box(lc, .6, .1, .55, 0, .35, -.55, '#fde68a'); bk.rotation.x = -.6; }
      beanbag(g, 2.5, 2.4, '#f97316');
      board(g, -3.0, 1.1, Math.PI / 2, 1.3);
      const corners = [[-3.25, -3.75], [3.25, -3.75], [3.25, 3.75], [-3.25, 3.75]];
      corners.forEach(([px, pz]) => box(g, .07, 2.4, .07, px, 0, pz, DARK));
      for (let k = 0; k < 4; k++) {
        const [ax, az] = corners[k], [bx, bz] = corners[(k + 1) % 4];
        for (let i = 1; i < 9; i++) { const t = i / 9; sph(g, .055, ax + (bx - ax) * t, 2.4 - Math.sin(Math.PI * t) * .35, az + (bz - az) * t, glow(i % 2 ? '#fde68a' : '#fdba74'), 0).castShadow = false; }
      }
      for (const [px, pz] of [[2.8, -3.3], [2.9, 3.3]]) { box(g, .7, .45, .7, px, 0, pz, '#a16207'); sph(g, .45, px, .85, pz, '#4caf50'); }
      // tasses et carafe sur les tables, coussins sur les transats, lanternes au sol
      tasse(g, -1.25, .77, -1.45, '#fb7185', 1); tasse(g, -1.6, .77, -1.75, '#ffffff', 3); bouteille(g, -1.2, .77, -1.85, '#fde68a');
      tasse(g, 1.7, .77, .45, '#2dd4bf', 2); carnet(g, 1.3, .77, .75, '#f97316', .4);
      for (let i = 0; i < 3; i++) box(g, .4, .1, .25, -1.7 + i * 1.05, .3, 3.45, ['#fb7185', '#2dd4bf', '#facc15'][i]);
      for (const [x, z] of [[-2.9, -3.3], [-2.9, 3.3], [-.6, -3.4]]) { const l = grp(g, x, 0, z); box(l, .22, .3, .22, 0, 0, 0, '#1f2937'); box(l, .16, .2, .16, 0, .05, 0, glow('#fde68a')); }
    },
  });

  /* ---- Salle d'arcade ---- */
  room({
    id: 'arcade', x: 11.75, z: 10, w: 5.5, d: 8, accent: '#06b6d4', label: 'Arcade',
    sides: { n: 'part', w: 'part', s: 'f' }, doors: [{ side: 'n', off: 1.6 }],
    floor: { type: 'carpet', c: '#1e1b4b', dots: ['#22d3ee', '#f472b6', '#facc15', '#a3e635'] }, wain: '#312e81',
    fill(g) {
      // bornes, machine à pinces, flipper, distributeur et borne à tickets du kit Kenney « Mini Arcade »
      for (const x of [-2.1, -1.1, -.1]) poser(g, 'arcade-machine', x, -3.25, 0);           // rangée le long du mur nord
      for (const z of [-1.6, -.55]) poser(g, 'arcade-machine', -2.1, z, Math.PI / 2);      // deux bornes contre la cloison ouest
      poser(g, 'claw-machine', 1.85, -.9, -Math.PI / 2);
      poser(g, 'pinball', 1.6, 1.45, -Math.PI / 2);
      poser(g, 'vending-machine', 2.25, 3.1, -Math.PI / 2);
      poser(g, 'ticket-machine', .45, 3.45, Math.PI);
      sofa(g, -1, 3.3, Math.PI, '#7c3aed', 1.8);
      if (aModele('speaker')) { poser(g, 'speaker', 2.4, .4, -Math.PI / 2); poser(g, 'speaker', -2.35, 2.2, Math.PI / 2); }
      // affiches rétro, canettes sur le canapé
      affiche(g, -2.6, 1.95, .9, Math.PI / 2, 'pixel', .45); affiche(g, -2.6, 1.95, 2.1, Math.PI / 2, 'abstrait', .45);
      for (const [x, c] of [[-1.5, '#ef4444'], [-1.25, '#22c55e']]) cyl(g, .035, .035, .11, x, .43, 3.3, c, 8);
      const sign = canvasTex(256, 64, (c) => { c.font = '40px "Kenney Future", sans-serif'; c.shadowColor = '#f0abfc'; c.shadowBlur = 12; c.fillStyle = '#f5d0fe'; c.fillText('ARCADE', 38, 48); });
      plane(g, 2.2, .55, -1.15, 2.5, -3.82, new THREE.MeshBasicMaterial({ map: sign, transparent: true, toneMapped: false }));
    },
  });

  /* ---- Salle de sport ---- */
  room({
    id: 'sport', x: 17.25, z: 10, w: 5.5, d: 8, accent: '#14b8a6', label: 'Sport',
    // étagère sur le mur est, à côté de la grande vitre (et plus au-dessus de la porte)
    murs: { e: (m) => etagereMurale(m, 2.52, 1.7, -2.3, -Math.PI / 2, 1.0, ['plante', 'boite'], 'sport') },
    sides: { n: 'part', w: 'part', s: 'f', e: 'f' }, doors: [{ side: 'n', off: 1.4 }], windows: { e: [0] },
    floor: { type: 'tile', c1: '#cbd5e1', c2: '#d6dee8' },
    fill(g) {
      for (const tx of [-1.8, -.6]) {
        const t = grp(g, tx, 0, -3.0); box(t, .7, .18, 1.6, 0, 0, 0, '#1f2937'); box(t, .56, .02, 1.4, 0, .18, .05, '#4b5563');
        for (const s of [-1, 1]) box(t, .06, 1.1, .06, s * .31, .18, -.75, DARK); box(t, .7, .3, .12, 0, 1.2, -.75, '#111827'); plane(t, .48, .18, 0, 1.38, -.68, screenMat('deploy'));
      }
      const bp = grp(g, .9, 0, -.4); box(bp, .35, .45, 1.3, 0, 0, 0, '#0f766e'); for (const s of [-1, 1]) box(bp, .08, 1.3, .08, s * .55, 0, -.6, DARK);
      const bar = cyl(bp, .03, .03, 1.7, 0, 0, 0, METAL, 6); bar.rotation.z = Math.PI / 2; bar.position.set(0, 1.15, -.6);
      for (const s of [-1, 1]) { const pl = cyl(bp, .22, .22, .06, 0, 0, 0, '#111827', 12); pl.rotation.z = Math.PI / 2; pl.position.set(s * .72, 1.15, -.6); }
      const dr = grp(g, 2.3, 0, 1.6, -Math.PI / 2); box(dr, 1.6, .5, .4, 0, 0, 0, DARK);
      for (let i = 0; i < 5; i++) { const db = cyl(dr, .07, .07, .3, 0, 0, 0, '#14b8a6', 8); db.rotation.z = Math.PI / 2; db.position.set(-.64 + i * .32, .58, 0); }
      for (const [mx, c] of [[-1.9, '#f472b6'], [-1.0, '#a78bfa']]) rug(g, mx, 2.3, .65, 1.8, c);
      const pb = grp(g, 1.2, 0, 3.3); box(pb, .08, 2.2, .08, 0, 0, 0, DARK); box(pb, .7, .06, .06, -.3, 2.15, 0, DARK); cyl(pb, .2, .2, .9, -.6, 1.0, 0, '#dc2626', 10);
      // gourdes sur les tapis de course, serviettes pliées, horloge et affiche de motivation
      for (const tx of [-1.8, -.6]) bouteille(g, tx + .22, 1.5, -3.72, pick(['#38bdf8', '#a3e635']));
      for (let i = 0; i < 3; i++) box(g, .4, .06, .3, .9, .45 + i * .06, .35 - i * .02, ['#f8fafc', '#5eead4', '#f8fafc'][i]);
      horloge(g, -2.62, 1.8, 1.0, Math.PI / 2, '#0f766e'); affiche(g, -2.62, .8, -.4, Math.PI / 2, 'sport', .5);
      plant(g, -2.3, .4, .9);
    },
  });

  /* ---- Bouts de couloirs : façade à l'ouest, entrée et pont à l'est ---- */
  {
    const o = { accent: '#94a3b8' };
    for (const [z0, z1] of [[-6.5, -4], [3.5, 6]]) {
      wallPiece(grp(facade.w.tall, 0, Y0, 0), 'z', z0, z1, -BX, 'outer', o);
      wallPiece(grp(facade.w.low, 0, Y0, 0), 'z', z0, z1, -BX, 'low', o);
    }
    const gw = grp(world, 0, Y0, 0);
    box(gw, .8, .02, 2, BX - .5, 0, 4.75, '#475569', false);
    plant(gw, BX - .5, 3.85, .7); plant(gw, BX - .5, 5.65, .7);
    // plantes de couloir, toujours entre deux portes (jamais devant l'une d'elles)
    for (const [x, z] of [[-12, -6.1], [2.5, -6.1], [11, -6.1], [-16.5, 5.6], [3, 5.6], [10.4, 5.6]]) plant(gw, x, z, .65);
    if (aModele('trashcan')) { poser(gw, 'trashcan', -4.4, -6.15, 0, { h: .55 }); poser(gw, 'trashcan', 8.6, 5.65, 0, { h: .55 }); }
  }

  /* ================= Le Coffre, sur son îlot, relié par un pont ================= */
  const islet = grp(scene, ISLET.x, ISLET.y, ISLET.z);
  floatingRock(islet, (th) => 4.4 * (1 + .07 * Math.sin(5 * th + 1) + .04 * Math.sin(9 * th)), .5, 5.5, 48, [], 3, [.3, .2]);
  for (const [sx, sz, nom, r] of [[-3.2, 2.6, 'rock_largeA', .4], [2.8, -3.0, 'stone_largeB', 1.2], [3.4, 2.4, 'rock_smallA', 0]]) poser(islet, nom, sx, sz, r, { s: 1.4 });
  room({
    id: 'coffre', parent: islet, x: 0, y: .05, z: 0, w: 5, d: 5, accent: '#475569', label: 'Le Coffre', labelY: 3.4,
    sides: { n: 'mid', w: 'mid', s: 'mid', e: 'mid' }, doors: [{ side: 'w', off: 0, w: 1.3 }],
    floor: { type: 'tile', c1: '#475569', c2: '#526075' }, wain: '#64748b', cap: '#eab308',
    fill(g) {
      const vb = grp(g, .4, 0, -1.9); box(vb, 2.2, 2.3, .5, 0, 0, 0, '#6b7280');
      const vd = grp(vb, 0, 1.2, .3);
      const door = cyl(vd, .85, .85, .25, 0, 0, 0, mat('#9ca3af', { metalness: .7, roughness: .3 }), 24); door.rotation.x = Math.PI / 2; door.position.y = 0;
      const wheel = grp(vd, 0, 0, .18); for (let i = 0; i < 3; i++) { const sp = box(wheel, .8, .06, .06, 0, -.03, 0, '#eab308'); sp.rotation.z = i * Math.PI / 3; }
      spin(wheel, 'z', .25);
      const dep = grp(g, 1.9, 0, .5, -Math.PI / 2); box(dep, 1.6, 1.3, .4, 0, 0, 0, '#9ca3af');
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) box(dep, .32, .3, .02, -.54 + i * .36, .18 + j * .36, .21, '#d4d4d8', false);
      const pd = grp(g, -.3, 0, .6); box(pd, .45, .9, .45, 0, 0, 0, '#1f2937');
      const key = grp(pd, 0, 1.3, 0); key.add(new THREE.Mesh(new THREE.TorusGeometry(.12, .035, 6, 14), glow('#facc15'))); box(key, .05, .32, .04, 0, -.42, 0, glow('#facc15')); box(key, .12, .05, .04, .06, -.52, 0, glow('#facc15'));
      spin(key, 'y', 1);
      for (let i = 0; i < 3; i++) box(g, .5, .12, .25, 1.2, i * .12, 1.9, mat('#eab308', { metalness: .6, roughness: .3 }));
    },
  });
  const beacon = sph(islet, .16, 2.3, 1.85, 2.3, new THREE.MeshBasicMaterial({ color: '#ef4444', toneMapped: false }));
  animate(beacon, (t) => beacon.material.color.setHSL(0, 1, Math.sin(t * 4) > 0 ? .5 : .18));
  {
    const x0 = BX + .1, x1 = ISLET.x - 2.45, y0 = Y0, y1 = ISLET.y + .05, zc = ISLET.z;
    const len = Math.hypot(x1 - x0, y1 - y0);
    const br = grp(world, (x0 + x1) / 2, (y0 + y1) / 2, zc); br.rotation.z = Math.atan2(y1 - y0, x1 - x0);
    for (let i = 0, x = -len / 2; x < len / 2 - .1; x += .42, i++) box(br, .36, .09, 1.5, x + .18, -.09, 0, i % 2 ? '#a87645' : '#b98552');
    for (const s of [-1, 1]) {
      box(br, len, .05, .05, 0, .8, s * .75, '#7a4f2e');
      for (let x = -len / 2; x <= len / 2 + .01; x += len / 7) box(br, .07, .85, .07, x, -.05, s * .75, '#7a4f2e');
    }
    const gate = grp(world, BX + .55, Y0, zc);   // barrière : aucun agent n'entre sans validation (E la lève en visite)
    for (const s of [-1, 1]) box(gate, .12, 1.2, .12, 0, 0, s * .85, '#eab308');
    const barre = grp(gate, 0, .91, -.8);
    box(barre, .07, .12, 1.6, 0, -.06, .8, glow('#ef4444'));
    barre.traverse(c => { c.userData.keep = true; c.castShadow = false; });
    barre.userData.noCollide = true;
    portes.push({ pivot: barre, axe: 'x', ouvert: -1.35, angle: 0, ouverte: false, axis: 'z', largeur: 1.6, hauteur: .12, yBas: -.06, zone: 'coffre', barriere: true });
  }

  /* ================= Bordure de l'île : sapins, rochers, pierres, buissons et fleurs (kit Kenney) ================= */
  {
    const r = rng(99);
    const inside = (x, z, m) => Math.abs(x) < BX + m && Math.abs(z) < BZ + m;
    const onBridge = (x, z) => x > BX && Math.abs(z - ISLET.z) < 1.4;
    const blocked = (x, z) => onBridge(x, z) || (x > BX && Math.abs(z - 4.75) < 1.5);
    const fits = (x, z, rad) => Math.hypot(x, z) + rad < edgeR(Math.atan2(z, x)) - .1;
    const sapins = ['tree_pineTallA', 'tree_pineDefaultA', 'tree_pineRoundB', 'tree_pineSmallA'];
    const pts = [];
    const ox = BX + 1.15, oz = BZ + 1.12;
    for (let x = -BX + .6; x <= BX - .6; x += 2.3) { pts.push([x, -oz]); pts.push([x, oz]); }
    for (let z = -BZ + .6; z <= BZ - .6; z += 2.3) { pts.push([-ox, z]); pts.push([ox, z]); }
    for (const [cx, cz] of [[ox, oz], [-ox, oz], [ox, -oz], [-ox, -oz]]) pts.push([cx - Math.sign(cx) * .3, cz - Math.sign(cz) * .3]);
    pts.forEach(([px, pz], i) => {
      const x = px + (r() - .5) * .5, z = pz + (r() - .5) * .4;
      if (blocked(x, z)) return;
      const u = (i * 7 + Math.floor(r() * 3)) % 6;
      if (u < 3) { const s = 1.25 + r() * .55; if (fits(x, z, .4 * s)) poser(world, pick(sapins, r), x, z, r() * 6, { s }); }
      else if (u === 3) { const s = 1.0 + r() * .5; if (fits(x, z, .55 * s)) poser(world, pick(['rock_largeA', 'rock_largeC'], r), x, z, r() * 6, { s }); }
      else if (u === 4) { const s = .9 + r() * .5; if (fits(x, z, .5 * s)) poser(world, pick(['stone_tallA', 'stone_tallC', 'stone_largeB'], r), x, z, r() * 6, { s }); }
    });
    for (let n = 0, b = 0; n < 4000 && b < 90; n++) {
      const th = r() * Math.PI * 2, e = edgeR(th) * (.86 + r() * .12), x = e * Math.cos(th), z = e * Math.sin(th);
      if (inside(x, z, .45) || blocked(x, z) || Math.hypot(x, z) > edgeR(th) - .35) continue;
      const nom = pick(['plant_bush', 'plant_bushSmall', 'grass', 'flower_redA', 'flower_yellowA', 'flower_purpleA'], r);
      poser(world, nom, x, z, r() * 6, { s: 1.3 + r() * .5, ombre: false });
      b++;
    }
  }

  /* ================= Nuages sous l'île (ils dérivent, l'île reste immobile) ================= */
  const clouds = grp(scene);
  {
    const r = rng(321), cm = mat('#ffffff', { roughness: 1 });
    const cloud = (x, y, z, s) => { const g = grp(clouds, x, y, z); for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), cm); m.scale.setScalar(s * (.6 + r() * .6)); m.position.set((i - 2.5) * s * .8, r() * s * .4, (r() - .5) * s); g.add(m); } };
    for (let i = 0; i < 18; i++) { const a = r() * Math.PI * 2, d = 28 + r() * 32; cloud(Math.cos(a) * d, -6 - r() * 10, Math.sin(a) * d, 1.8 + r() * 2.2); }
  }
  animate(clouds, (t, dt) => { clouds.rotation.y += dt * .012; clouds.position.y = Math.sin(t * .4) * .6; });

  /* ================= Hauteur du sol à un endroit (pour marcher en visite) =================
     Renvoie la hauteur du sol en (x, z), ou null s'il n'y a rien (le vide autour de l'île). */
  const x1Pont = ISLET.x - 2.45;
  function sol(x, z) {
    if (Math.hypot(x - ISLET.x, z - ISLET.z) < 4.1) return ISLET.y + .05;            // îlot du Coffre
    if (Math.abs(x) <= BX + .1 && Math.abs(z) <= BZ + .1) {
      const lx = x - FORGE.x, lz = z - FORGE.z;
      if (Math.abs(lx) < FORGE.w / 2 && Math.abs(lz) < FORGE.d / 2) {                  // la Forge, en contrebas
        if (lx > 2.1 && lx < 3.3) return Y0 - 2 * THREE.MathUtils.clamp((lz + 3.5) / 3.8, 0, 1);   // son escalier
        return Y0 - 2;
      }
      return Y0;                                                                          // le bureau
    }
    if (x > BX && x < x1Pont + .3 && Math.abs(z - ISLET.z) < .7) return THREE.MathUtils.lerp(Y0, ISLET.y + .05, (x - BX) / (x1Pont - BX));   // le pont
    if (Math.hypot(x, z) < edgeR(Math.atan2(z, x)) - .35) return 0;                        // l'herbe autour du bureau
    return null;
  }

  return { world, facade, zones, islet, portes, sol };
}
