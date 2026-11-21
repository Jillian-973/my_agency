// Collisions pour la visite à la première personne.
// Avant la fusion des objets, on relève la boîte de chaque mur et de chaque meuble ; on les range dans une
// grille pour ne tester que les obstacles proches. Le visiteur est un cylindre (rayon r, de 0,3 à 1,7 au-dessus de ses pieds).
import * as THREE from 'three';

const CASE = 1;                              // taille d'une case de la grille
const cle = (i, j) => i * 100003 + j;

export function construireCollisions(racines, portes) {
  const boites = [];
  const b = new THREE.Box3();
  for (const r of racines) r.updateMatrixWorld(true);
  for (const r of racines) r.traverse((o) => {
    if (!o.isMesh) return;
    for (let p = o; p; p = p.parent) if (p.userData.noCollide) return;   // sols, escalier, portes (gérées à part)…
    b.setFromObject(o);
    if (b.isEmpty()) return;
    if (b.max.y - b.min.y < .06) return;                                  // tapis, plans au sol
    if (b.max.x - b.min.x > 30 || b.max.z - b.min.z > 30) return;
    boites.push({ x0: b.min.x, x1: b.max.x, z0: b.min.z, z1: b.max.z, y0: b.min.y, y1: b.max.y });
  });
  const grille = new Map();
  boites.forEach((q, n) => {
    for (let i = Math.floor(q.x0 / CASE); i <= Math.floor(q.x1 / CASE); i++)
      for (let j = Math.floor(q.z0 / CASE); j <= Math.floor(q.z1 / CASE); j++) {
        const k = cle(i, j); if (!grille.has(k)) grille.set(k, []); grille.get(k).push(n);
      }
  });

  // boîte d'une porte fermée, en coordonnées du monde (calculée une fois)
  const pos = new THREE.Vector3();
  for (const p of portes) {
    p.pivot.getWorldPosition(pos);
    const e = .09;
    p.boite = p.axis === 'x'
      ? { x0: pos.x, x1: pos.x + p.largeur, z0: pos.z - e, z1: pos.z + e }
      : { x0: pos.x - e, x1: pos.x + e, z0: pos.z, z1: pos.z + p.largeur };
    p.boite.y0 = pos.y + p.yBas; p.boite.y1 = pos.y + p.yBas + p.hauteur;
    p.centre = new THREE.Vector3((p.boite.x0 + p.boite.x1) / 2, pos.y + 1, (p.boite.z0 + p.boite.z1) / 2);
  }

  const touche = (q, x, z, r) => {
    const cx = Math.max(q.x0, Math.min(x, q.x1)), cz = Math.max(q.z0, Math.min(z, q.z1));
    return (x - cx) ** 2 + (z - cz) ** 2 < r * r;
  };

  /** Vrai si un visiteur de rayon r, pieds à la hauteur `pieds`, heurte un mur, un meuble ou une porte fermée en (x, z). */
  function bloque(x, z, r, pieds) {
    const y0 = pieds + .3, y1 = pieds + 1.7;
    for (let i = Math.floor((x - r) / CASE); i <= Math.floor((x + r) / CASE); i++)
      for (let j = Math.floor((z - r) / CASE); j <= Math.floor((z + r) / CASE); j++) {
        const liste = grille.get(cle(i, j)); if (!liste) continue;
        for (const n of liste) { const q = boites[n]; if (q.y1 < y0 || q.y0 > y1) continue; if (touche(q, x, z, r)) return true; }
      }
    for (const p of portes) {
      if (Math.abs(p.angle) > .35) continue;                              // porte (assez) ouverte : on passe
      const q = p.boite; if (q.y1 < y0 || q.y0 > y1) continue;
      if (touche(q, x, z, r)) return true;
    }
    return false;
  }
  return { bloque, nombre: boites.length };
}
