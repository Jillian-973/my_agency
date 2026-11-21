// Marche : fait avancer des personnages debout le long d'un chemin (jambes et bras qui balancent, petit rebond,
// demi-tour en douceur) et ouvre les portes devant eux, puis les referme derrière eux.
// Un « corps » est un personnage debout de mobilier.js (userData.jambes et userData.brasDebout).

const VITESSE = 1.5;        // m/s, une marche tranquille

export function creerMarche({ sol, portes }) {
  const enMarche = new Map();                     // corps → { chemin, longueurs, d, attente, vitesse, quandArrive }
  const ouvertesParNous = new Set();
  let t = 0;

  /** Lance un corps sur un chemin (liste de points { x, z }) ; quandArrive est appelé à la fin. */
  function marcher(corps, chemin, quandArrive = () => {}, { attente = Math.random() * .6, vitesse = VITESSE } = {}) {
    const longueurs = [0];
    for (let i = 1; i < chemin.length; i++) longueurs.push(longueurs[i - 1] + Math.hypot(chemin[i].x - chemin[i - 1].x, chemin[i].z - chemin[i - 1].z));
    enMarche.set(corps, { chemin, longueurs, d: 0, attente, vitesse, quandArrive });
  }
  const arreter = (corps) => enMarche.delete(corps);
  const marche = (corps) => enMarche.has(corps);

  function mettreAJour(dt) {
    if (!enMarche.size && !ouvertesParNous.size) return;
    t += dt;
    for (const [g, m] of [...enMarche]) {
      if (m.attente > 0) { m.attente -= dt; continue; }
      const total = m.longueurs[m.longueurs.length - 1];
      m.d = Math.min(m.d + m.vitesse * dt, total);
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
      if (m.d >= total) {
        g.position.y = s;
        g.userData.jambes.forEach(j => { j.rotation.x = 0; }); g.userData.brasDebout.forEach(br => { br.rotation.x = 0; });
        enMarche.delete(g);
        m.quandArrive();
      }
    }
    // portes : ouvertes à l'approche de quelqu'un, refermées derrière lui (seulement celles qu'on a ouvertes)
    const marcheurs = [...enMarche.keys()].map(g => g.position);
    for (const p of portes) {
      const pres = (r) => marcheurs.some(v => Math.hypot(v.x - p.centre.x, v.z - p.centre.z) < r && Math.abs(v.y + 1 - p.centre.y) < 1.5);
      if (!p.ouverte && pres(1.6)) { p.ouverte = true; ouvertesParNous.add(p); }
      else if (ouvertesParNous.has(p) && !pres(2.6)) { p.ouverte = false; ouvertesParNous.delete(p); }
    }
  }

  return { marcher, arreter, marche, mettreAJour, nombre: () => enMarche.size };
}
