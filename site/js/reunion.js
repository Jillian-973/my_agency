// Réunion : les agents cochés se lèvent et marchent jusqu'à la salle de réunion, s'assoient autour de la table
// (debout le long des murs quand les chaises sont prises), puis rentrent à leur bureau à la fin de la réunion.
// Les chemins sont calculés sur une grille du sol (A*) qui évite murs et meubles, descend l'escalier de la Forge
// et passe les portes : elles s'ouvrent devant les agents et se referment derrière eux.
import * as THREE from 'three';
import { anim } from './outils.js';
import { personnage, chair, majEtiquette } from './mobilier.js';

const C = .25;              // taille d'une case de la grille (m)
const RAYON = .24;          // encombrement d'un agent qui marche
const MARCHE = .3;          // plus grande différence de hauteur entre deux cases voisines (escalier oui, rebord non)
const VITESSE = 1.5;        // m/s

export function creerReunion({ scene, zones, agentsPoses, sol, collisions, portes, ombres = () => {}, quandChange = () => {} }) {
  const salle = zones.find(z => z.id === 'reunion');

  /* ---------- grille du sol ---------- */
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const z of zones) { x0 = Math.min(x0, z.x - z.w / 2); x1 = Math.max(x1, z.x + z.w / 2); z0 = Math.min(z0, z.z - z.d / 2); z1 = Math.max(z1, z.z + z.d / 2); }
  x0 -= 1.5; z0 -= 1.5; x1 += 1.5; z1 += 1.5;
  const NI = Math.ceil((x1 - x0) / C), NJ = Math.ceil((z1 - z0) / C), N = NI * NJ;
  const etat = new Uint8Array(N), haut = new Float32Array(N);          // etat : 0 inconnu, 1 libre, 2 bloqué
  const cx = (i) => x0 + (i + .5) * C, cz = (j) => z0 + (j + .5) * C;
  const ci = (x) => Math.floor((x - x0) / C), cj = (z) => Math.floor((z - z0) / C);
  function libre(i, j) {
    if (i < 0 || j < 0 || i >= NI || j >= NJ) return false;
    const k = i * NJ + j;
    if (!etat[k]) {
      const s = sol(cx(i), cz(j));
      haut[k] = s ?? 0;
      etat[k] = s !== null && !collisions.bloque(cx(i), cz(j), RAYON, s, true) ? 1 : 2;
    }
    return etat[k] === 1;
  }
  const h = (i, j) => haut[i * NJ + j];
  function caseLibreProche(x, z) {
    const i0 = ci(x), j0 = cj(z);
    let best = null, dmin = Infinity;
    for (let r = 0; r <= 12 && !best; r++)
      for (let i = i0 - r; i <= i0 + r; i++) for (let j = j0 - r; j <= j0 + r; j++) {
        if (Math.max(Math.abs(i - i0), Math.abs(j - j0)) !== r || !libre(i, j)) continue;
        const d = (cx(i) - x) ** 2 + (cz(j) - z) ** 2;
        if (d < dmin) { dmin = d; best = [i, j]; }
      }
    return best;
  }

  /* ---------- A* sur la grille (8 directions, pas de coin coupé, pas de marche trop haute) ---------- */
  const VOISINS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  function astar(a, b) {
    const g = new Float32Array(N).fill(Infinity), de = new Int32Array(N).fill(-1), ferme = new Uint8Array(N);
    const ka = a[0] * NJ + a[1], kb = b[0] * NJ + b[1];
    const est = (i, j) => { const dx = Math.abs(i - b[0]), dz = Math.abs(j - b[1]); return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz); };
    const tas = [];                                   // tas binaire de [f, k]
    const pousser = (f, k) => { tas.push([f, k]); let n = tas.length - 1; while (n > 0) { const p = (n - 1) >> 1; if (tas[p][0] <= tas[n][0]) break; [tas[p], tas[n]] = [tas[n], tas[p]]; n = p; } };
    const tirer = () => { const t = tas[0], d = tas.pop(); if (tas.length) { tas[0] = d; let n = 0; for (;;) { const l = 2 * n + 1, r = l + 1; let m = n; if (l < tas.length && tas[l][0] < tas[m][0]) m = l; if (r < tas.length && tas[r][0] < tas[m][0]) m = r; if (m === n) break; [tas[m], tas[n]] = [tas[n], tas[m]]; n = m; } } return t; };
    g[ka] = 0; pousser(est(a[0], a[1]), ka);
    while (tas.length) {
      const [, k] = tirer();
      if (k === kb) break;
      if (ferme[k]) continue;
      ferme[k] = 1;
      const i = Math.floor(k / NJ), j = k % NJ;
      for (const [di, dj, cout] of VOISINS) {
        const ni = i + di, nj = j + dj;
        if (!libre(ni, nj) || Math.abs(h(ni, nj) - h(i, j)) > MARCHE) continue;
        if (di && dj && (!libre(i + di, j) || !libre(i, j + dj))) continue;
        const nk = ni * NJ + nj, ng = g[k] + cout;
        if (ng < g[nk]) { g[nk] = ng; de[nk] = k; pousser(ng + est(ni, nj), nk); }
      }
    }
    if (de[kb] < 0 && ka !== kb) return null;
    const liste = [];
    for (let k = kb; k >= 0; k = k === ka ? -1 : de[k]) liste.push({ x: cx(Math.floor(k / NJ)), z: cz(k % NJ) });
    return liste.reverse();
  }
  // un segment se parcourt en ligne droite s'il ne traverse que des cases libres, sans marche trop haute
  function direct(p, q) {
    const n = Math.ceil(Math.hypot(q.x - p.x, q.z - p.z) / .1);
    let hp = null;
    for (let s = 0; s <= n; s++) {
      const x = p.x + (q.x - p.x) * s / n, z = p.z + (q.z - p.z) * s / n, i = ci(x), j = cj(z);
      if (!libre(i, j)) return false;
      if (hp !== null && Math.abs(h(i, j) - hp) > MARCHE) return false;
      hp = h(i, j);
    }
    return true;
  }
  function lisser(pts) {
    const out = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !direct(pts[i], pts[j])) j--;
      out.push(pts[j]); i = j;
    }
    return out;
  }
  /** Chemin de (a) à (b), points du monde ; les extrémités (chaise, bureau) peuvent être dans un meuble. */
  function itineraire(a, b) {
    const ca = caseLibreProche(a.x, a.z), cb = caseLibreProche(b.x, b.z);
    if (!ca || !cb) return [a, b];
    const pts = astar(ca, cb);
    if (!pts) return [a, b];
    return [a, ...lisser(pts), b];
  }

  /* ---------- places dans la salle de réunion : les 8 chaises, puis debout autour ---------- */
  const centre = { x: salle.x, z: salle.z + .3 };
  const places = [
    ...[-1.2, 0, 1.2].map(x => ({ x, z: -.62, r: 0 })), ...[-1.2, 0, 1.2].map(x => ({ x, z: 1.22, r: Math.PI })),
    { x: -2.25, z: .3, r: Math.PI / 2 }, { x: 2.25, z: .3, r: -Math.PI / 2 },
  ].map(p => ({ x: salle.x + p.x, z: salle.z + p.z, r: p.r, assise: true, prise: null }));
  const debout = [];
  for (const lz of [-1.75, 2.2]) for (let lx = -2.7; lx <= 2.71; lx += .6) {
    const x = salle.x + lx, z = salle.z + lz;
    if (libre(ci(x), cj(z))) debout.push({ x, z, r: Math.atan2(centre.x - x, centre.z - z), assise: false, prise: null });
  }
  debout.sort((a, b) => Math.hypot(a.x - centre.x, a.z - centre.z) - Math.hypot(b.x - centre.x, b.z - centre.z));
  places.push(...debout);
  const placeLibrePres = (x, z) => {
    const libres = places.filter(p => !p.prise), chaises = libres.filter(p => p.assise);
    const d = (p) => Math.hypot(p.x - x, p.z - z);
    return (chaises.length ? chaises : libres).reduce((best, p) => (!best || d(p) < d(best) ? p : best), null);   // les chaises d'abord
  };

  /* ---------- corps : debout pour marcher, assis à la table ---------- */
  const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), ech = new THREE.Vector3();
  function sansOmbre(o) { o.traverse(m => { if (m.isMesh) m.castShadow = false; }); return o; }
  function corpsDebout(pose, x, z, r) {
    const g = sansOmbre(personnage(scene, x, z, r, pose.groupe.userData.look, 'stand'));
    g.position.y = sol(x, z) ?? 0;
    g.userData.poseAgent = pose;
    return g;
  }
  function corpsAssis(pose, place) {
    const n = anim.length;
    const g = sansOmbre(personnage(scene, place.x, place.z, place.r, { ...pose.groupe.userData.look, siege: false }, 'sit', 'en attente'));
    anim.splice(n);                                  // pas d'animation de clavier ici (et rien qui s'accumule d'une réunion à l'autre)
    g.position.y = sol(place.x, place.z) ?? 0;
    g.userData.poseAgent = pose;
    return g;
  }
  function changerCorps(pose, nouveau) {
    const m = pose.reunion;
    if (m.corps) scene.remove(m.corps);
    m.corps = nouveau; pose.corps = nouveau;
    nouveau.add(pose.etiquette.sprite);              // l'étiquette suit l'agent
  }

  /* ---------- aller, rester, revenir ---------- */
  const enMarche = new Set();
  function partir(pose, depart, arrivee, quandArrive) {
    const m = pose.reunion;
    m.chemin = itineraire(depart, arrivee);
    m.longueurs = [0];
    for (let i = 1; i < m.chemin.length; i++) m.longueurs.push(m.longueurs[i - 1] + Math.hypot(m.chemin[i].x - m.chemin[i - 1].x, m.chemin[i].z - m.chemin[i - 1].z));
    m.d = 0; m.attente = Math.random() * .6; m.quandArrive = quandArrive;
    changerCorps(pose, corpsDebout(pose, depart.x, depart.z, m.corps ? m.corps.rotation.y : pose.groupe.rotation.y));
    enMarche.add(pose);
  }

  function inviter(liste) {
    let n = 0;
    for (const pose of liste) {
      if (pose.reunion && pose.reunion.etape !== 'retour') continue;
      if (!pose.reunion) {
        // l'agent se lève : son corps assis disparaît, sa chaise vide reste au bureau
        pose.groupe.updateMatrixWorld(true);
        pose.groupe.matrixWorld.decompose(pos, quat, ech);
        const vide = new THREE.Group(); vide.position.copy(pos); vide.quaternion.copy(quat);
        if (pose.groupe.userData.look.siege !== false) chair(vide, 0, -.02, 0, pose.groupe.userData.look.chair);
        scene.add(vide);
        pose.reunion = { bureau: { x: pos.x, z: pos.z, r: pose.groupe.rotation.y }, chaiseVide: vide, corps: null };
        pose.groupe.visible = false;
      }
      const m = pose.reunion, ici = m.corps ? { x: m.corps.position.x, z: m.corps.position.z } : m.bureau;
      if (m.place) m.place.prise = null;
      m.place = placeLibrePres(ici.x, ici.z);
      if (!m.place) continue;                           // plus aucune place (ne devrait pas arriver)
      m.place.prise = pose; m.etape = 'aller';
      pose.enReunion = true; majEtiquette(pose);
      partir(pose, ici, m.place, () => {
        m.etape = 'reunion';
        if (m.place.assise) changerCorps(pose, corpsAssis(pose, m.place));
        else m.corps.rotation.y = m.place.r;
      });
      n++;
    }
    if (n) { ombres(); quandChange(); }
    return n;
  }

  function terminer() {
    for (const pose of agentsPoses) {
      const m = pose.reunion;
      if (!m || m.etape === 'retour') continue;
      const ici = { x: m.corps.position.x, z: m.corps.position.z };
      if (m.place) { m.place.prise = null; m.place = null; }
      m.etape = 'retour';
      partir(pose, ici, m.bureau, () => {
        // de retour : l'agent se rassoit à son bureau, comme avant
        scene.remove(m.corps); scene.remove(m.chaiseVide);
        pose.groupe.visible = true; pose.groupe.add(pose.etiquette.sprite);
        pose.corps = null; pose.reunion = null; pose.enReunion = false; majEtiquette(pose);
        ombres();
      });
    }
    quandChange();
  }

  /* ---------- à chaque image : avancer, tourner, balancer jambes et bras, ouvrir les portes ---------- */
  const ouvertesParNous = new Set();
  let t = 0;
  function mettreAJour(dt) {
    if (!enMarche.size && !ouvertesParNous.size) return;
    t += dt;
    for (const pose of [...enMarche]) {
      const m = pose.reunion, g = m.corps;
      if (m.attente > 0) { m.attente -= dt; continue; }
      m.d = Math.min(m.d + VITESSE * dt, m.longueurs[m.longueurs.length - 1]);
      let i = 1; while (i < m.longueurs.length - 1 && m.longueurs[i] < m.d) i++;
      const a = m.chemin[i - 1], b = m.chemin[i], seg = (m.longueurs[i] - m.longueurs[i - 1]) || 1, k = (m.d - m.longueurs[i - 1]) / seg;
      const x = a.x + (b.x - a.x) * k, z = a.z + (b.z - a.z) * k;
      const s = sol(x, z) ?? g.position.y;
      g.position.set(x, s + Math.abs(Math.sin(t * 9 + i)) * .03, z);
      if (Math.hypot(b.x - a.x, b.z - a.z) > 1e-3) {
        const but = Math.atan2(b.x - a.x, b.z - a.z);
        let d = but - g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
        g.rotation.y += d * (1 - Math.exp(-dt * 10));
      }
      const pas = Math.sin(m.d * 5.5);
      g.userData.jambes.forEach((j, n) => { j.rotation.x = pas * .55 * (n ? -1 : 1); });
      g.userData.brasDebout.forEach((br, n) => { br.rotation.x = -pas * .45 * (n ? -1 : 1); });
      if (m.d >= m.longueurs[m.longueurs.length - 1]) {
        g.position.y = s;
        g.userData.jambes.forEach(j => { j.rotation.x = 0; }); g.userData.brasDebout.forEach(br => { br.rotation.x = 0; });
        enMarche.delete(pose);
        m.quandArrive();
        quandChange();
      }
    }
    // portes : ouvertes à l'approche d'un agent, refermées derrière lui (seulement celles qu'on a ouvertes)
    const marcheurs = [...enMarche].map(p => p.reunion.corps.position);
    for (const p of portes) {
      const pres = (r) => marcheurs.some(v => Math.hypot(v.x - p.centre.x, v.z - p.centre.z) < r && Math.abs(v.y + 1 - p.centre.y) < 1.5);
      if (!p.ouverte && pres(1.6)) { p.ouverte = true; ouvertesParNous.add(p); }
      else if (ouvertesParNous.has(p) && !pres(2.6)) { p.ouverte = false; ouvertesParNous.delete(p); }
    }
  }

  const etape = (pose) => (pose.reunion ? pose.reunion.etape : null);
  const presents = () => agentsPoses.filter(p => p.reunion && p.reunion.etape !== 'retour').length;
  return { inviter, terminer, mettreAJour, etape, presents, places: places.length, itineraire };
}
