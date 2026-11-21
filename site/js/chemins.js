// Chemins dans le QG : une grille du sol (cases de 25 cm) et l'algorithme A*. Les chemins évitent murs et meubles,
// descendent l'escalier de la Forge et passent les portes (fermées ou non : elles s'ouvrent au passage, voir marche.js).
// Servent à la réunion, aux pauses des agents et aux promeneurs.

const C = .25;              // taille d'une case de la grille (m)
const RAYON = .24;          // encombrement d'une personne qui marche
const MARCHE = .3;          // plus grande différence de hauteur entre deux cases voisines (escalier oui, rebord non)

export function creerChemins({ zones, sol, collisions }) {
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
  // Un mur se reconnaît à sa hauteur : seuls murs, cloisons, verrières (et grandes étagères) dépassent 1,85 m.
  // Les bureaux, chaises et agents assis restent en dessous : on peut les enjamber pour se lever, pas un mur.
  function traverseMur(a, b) {
    const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / .05);
    for (let s = 0; s <= n; s++) {
      const x = a.x + (b.x - a.x) * s / n, z = a.z + (b.z - a.z) * s / n, pieds = sol(x, z);
      if (pieds === null || collisions.bloque(x, z, .04, pieds + 1.55, true)) return true;
    }
    return false;
  }
  /** La case libre la plus proche d'un point (bureau, chaise), atteignable sans passer à travers un mur ni changer d'étage. */
  function caseLibreProche(x, z) {
    const i0 = ci(x), j0 = cj(z), h0 = sol(x, z) ?? 0, candidats = [];
    for (let i = i0 - 12; i <= i0 + 12; i++) for (let j = j0 - 12; j <= j0 + 12; j++) candidats.push([i, j, (cx(i) - x) ** 2 + (cz(j) - z) ** 2]);
    candidats.sort((p, q) => p[2] - q[2]);
    for (const [i, j] of candidats) {
      if (!libre(i, j) || Math.abs(h(i, j) - h0) > MARCHE) continue;
      if (!traverseMur({ x, z }, { x: cx(i), z: cz(j) })) return [i, j];
    }
    return null;
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
  /** Chemin de (a) à (b), points du monde ; les extrémités (chaise, bureau) peuvent être dans un meuble.
   *  null s'il n'y en a pas : l'agent ne part pas plutôt que de traverser un mur. */
  function itineraire(a, b) {
    const ca = caseLibreProche(a.x, a.z), cb = caseLibreProche(b.x, b.z);
    if (!ca || !cb) return null;
    const pts = astar(ca, cb);
    if (!pts) return null;
    return [a, ...lisser(pts), b];
  }

  /** Vrai si une personne tient debout en (x, z) sans toucher un mur ni un meuble. */
  const libreEn = (x, z) => libre(ci(x), cj(z));
  return { itineraire, traverseMur, libre: libreEn };
}
