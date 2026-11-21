// Minimap de la visite (en haut à droite), dans le style du « Minimap Pack » de Kenney (CC0, style D) :
// fond bleu marine, murs en tuyaux bleu clair, joueur jaune, agents orange, icônes « X » et « S » du pack.
// Le plan est dessiné une seule fois ; à chaque image on n'en recopie que la partie autour du visiteur (nord en haut).

const PX = 8;                                         // 8 pixels par mètre : une tuile du pack = 1 m
const B = { x0: -25, x1: 36, z0: -21, z1: 20 };       // portion du monde couverte par le plan
const C = { vide: '#262a48', ile: '#363b64', sol: '#494e78', bord: '#aac3e7', mur: '#e7f2fa', joueur: '#ffc600', agent: '#dd674c' };
const TUILE = { jaune: 15, orange: 20, sortie: 23, coffre: 24, point: 13 };

export function creerMinimap({ zones, agents, ui, ilot, pont, sortie, tuiles }) {
  const W = (B.x1 - B.x0) * PX, H = (B.z1 - B.z0) * PX;
  const plan = document.createElement('canvas'); plan.width = W; plan.height = H;
  const p = plan.getContext('2d'); p.imageSmoothingEnabled = false;
  const X = (x) => Math.round((x - B.x0) * PX), Z = (z) => Math.round((z - B.z0) * PX);

  // un mur « tuyau » de 4 px (bordure, cœur clair sur 2 px, bordure), centré sur la ligne, comme dans les tuiles du pack
  function mur(x0, z0, x1, z1) {
    if (z0 === z1) { const y = Z(z0), a = X(Math.min(x0, x1)) - 2, b = X(Math.max(x0, x1)) + 2; p.fillStyle = C.bord; p.fillRect(a, y - 2, b - a, 4); p.fillStyle = C.mur; p.fillRect(a + 1, y - 1, b - a - 2, 2); }
    else { const x = X(x0), a = Z(Math.min(z0, z1)) - 2, b = Z(Math.max(z0, z1)) + 2; p.fillStyle = C.bord; p.fillRect(x - 2, a, 4, b - a); p.fillStyle = C.mur; p.fillRect(x - 1, a + 1, 2, b - a - 2); }
  }
  // une suite de murs avec des trous à l'emplacement des portes
  function cote(x0, z0, x1, z1, portes) {
    const horiz = z0 === z1, s0 = horiz ? x0 : z0, s1 = horiz ? x1 : z1, centre = (s0 + s1) / 2;
    let segs = [[s0, s1]];
    for (const d of portes) {
      const a = centre + d.off - (d.w || 1.6) / 2, b = centre + d.off + (d.w || 1.6) / 2;
      segs = segs.flatMap(([u, v]) => (b <= u || a >= v) ? [[u, v]] : [[u, a], [b, v]].filter(([q, r]) => r - q > .2));
    }
    for (const [u, v] of segs) horiz ? mur(u, z0, v, z0) : mur(x0, u, x0, v);
  }

  p.fillStyle = C.vide; p.fillRect(0, 0, W, H);
  p.fillStyle = C.ile; p.beginPath(); p.roundRect(X(-22.4), Z(-16.3), 44.8 * PX, 32.6 * PX, 5 * PX); p.fill();   // l'île
  p.beginPath(); p.arc(X(ilot.x), Z(ilot.z), ilot.r * PX, 0, 7); p.fill();                                         // l'îlot du Coffre
  p.fillRect(X(pont.x0), Z(pont.z - .75), (pont.x1 - pont.x0) * PX, 1.5 * PX);                                     // le pont
  p.fillStyle = C.sol; p.fillRect(X(-20), Z(-14), 40 * PX, 28 * PX);                                               // le bureau
  for (const z of zones) {
    p.fillStyle = z.couleur + '40';                                                                                // salle teintée à la couleur du pôle
    p.fillRect(X(z.x - z.w / 2), Z(z.z - z.d / 2), z.w * PX, z.d * PX);
  }
  for (const z of zones) {
    const s = z.sides || {}, d = z.doors || [], x0 = z.x - z.w / 2, x1 = z.x + z.w / 2, z0 = z.z - z.d / 2, z1 = z.z + z.d / 2;
    if (s.n) cote(x0, z0, x1, z0, d.filter(q => q.side === 'n'));
    if (s.s) cote(x0, z1, x1, z1, d.filter(q => q.side === 's'));
    if (s.w) cote(x0, z0, x0, z1, d.filter(q => q.side === 'w'));
    if (s.e) cote(x1, z0, x1, z1, d.filter(q => q.side === 'e'));
  }
  mur(-20, -6.5, -20, -4); mur(-20, 3.5, -20, 6);                                                                   // façade ouest des couloirs

  // icônes du pack : X sur le Coffre, S à l'entrée
  const img = new Image(); img.src = tuiles;
  const tuile = (ctx, n, x, y, t = 8) => ctx.drawImage(img, (n % 5) * 8, Math.floor(n / 5) * 8, 8, 8, Math.round(x - t / 2), Math.round(y - t / 2), t, t);
  img.onload = () => { tuile(p, TUILE.coffre, X(ilot.x), Z(ilot.z), 16); tuile(p, TUILE.sortie, X(sortie.x), Z(sortie.z), 16); };

  // affichage
  const ecran = ui.canvas, e = ecran.getContext('2d');
  const T = ecran.width;                                      // carré : 26 m de côté à l'écran
  function lieuA(x, z) { const q = zones.find(q => Math.abs(x - q.x) <= q.w / 2 && Math.abs(z - q.z) <= q.d / 2); return q ? q.nom : (Math.abs(x) <= 20 && Math.abs(z) <= 14 ? 'Couloirs' : 'Dehors'); }
  let dernierLieu = '';
  function dessiner(pos, lacet) {
    e.imageSmoothingEnabled = false;
    e.fillStyle = C.vide; e.fillRect(0, 0, T, T);
    e.drawImage(plan, X(pos.x) - T / 2, Z(pos.z) - T / 2, T, T, 0, 0, T, T);
    // agents : petites tuiles orange du pack
    for (const a of agents) {
      const ax = X(a.x) - X(pos.x) + T / 2, ay = Z(a.z) - Z(pos.z) + T / 2;
      if (ax > -6 && ay > -6 && ax < T + 6 && ay < T + 6 && img.complete) tuile(e, TUILE.orange, ax, ay, 6);
    }
    // le visiteur : tuile jaune et flèche de direction
    const c = T / 2, dx = -Math.sin(lacet), dz = -Math.cos(lacet);
    e.fillStyle = C.joueur; e.strokeStyle = C.vide; e.lineWidth = 2;
    e.beginPath(); e.moveTo(c + dx * 13, c + dz * 13); e.lineTo(c - dz * 6 - dx * 2, c + dx * 6 - dz * 2); e.lineTo(c + dz * 6 - dx * 2, c - dx * 6 - dz * 2); e.closePath(); e.stroke(); e.fill();
    if (img.complete) tuile(e, TUILE.jaune, c, c, 8);
    const lieu = lieuA(pos.x, pos.z);
    if (lieu !== dernierLieu) { dernierLieu = lieu; ui.lieu.textContent = lieu; }
  }
  return { dessiner };
}
