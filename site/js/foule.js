// La foule : ce qui rend le QG vivant.
// - Des promeneurs sans étiquette vont et viennent entre le café, l'arcade, la terrasse et le hall ; ils boivent un café,
//   jouent, et discutent quand ils se retrouvent à plusieurs (bulles au-dessus de la tête).
// - De temps en temps, un agent en pause se lève, va au café ou à l'arcade, puis revient à son bureau (reunion.js).
import * as THREE from 'three';
import { cyl } from './outils.js';
import { personnage, lookFigurant } from './mobilier.js';

const NB_PROMENEURS = 6;
const SYMBOLES = ['…', '!', '?', '♪', '♥', 'ha', '☕', '👍'];

export function creerFoule({ scene, zones, sol, chemins, marche, reunion, agentsPoses, compacter = () => {} }) {
  const Z = (id) => zones.find(z => z.id === id);
  const hasard = (a, b) => a + Math.random() * (b - a);
  const choisir = (l) => l[Math.floor(Math.random() * l.length)];

  /* ---------- les endroits où l'on s'arrête : { x, z, r (regard), activite, rencontre, zone } ---------- */
  const endroits = [];
  function ajouter(zoneId, lx, lz, r, activite, rencontre) {
    const z = Z(zoneId); if (!z) return;
    const x = z.x + lx, zz = z.z + lz;
    if (chemins.libre(x, zz)) endroits.push({ x, z: zz, r, activite, rencontre, zone: zoneId, occupant: null });
  }
  const autour = (zoneId, cx, cz, rayon, angles, activite, rencontre) => {
    for (const a of angles) { const lx = cx + Math.sin(a) * rayon, lz = cz + Math.cos(a) * rayon; ajouter(zoneId, lx, lz, Math.atan2(cx - lx, cz - lz), activite, rencontre); }
  };
  // café : au comptoir, puis debout autour des tables hautes
  for (const lz of [-1.6, -.6, .4]) ajouter('cafe', -3.0, lz, -Math.PI / 2, 'cafe', 'comptoir');
  [[-1.3, -2.0], [1.4, -1.8], [-.9, 1.1], [3.2, -.2], [.9, 2.9], [1.0, 1.1]].forEach(([tx, tz], i) => autour('cafe', tx, tz, .78, [0, Math.PI], 'cafe', 'table' + i));
  // arcade : devant les bornes, la machine à pinces et le flipper
  for (const x of [-2.1, -1.1, -.1]) ajouter('arcade', x, -2.5, Math.PI, 'jeu', 'arcade');
  for (const z of [-1.6, -.55]) ajouter('arcade', -1.35, z, -Math.PI / 2, 'jeu', 'arcade');
  ajouter('arcade', 1.1, -.9, Math.PI / 2, 'jeu', 'arcade'); ajouter('arcade', .85, 1.45, Math.PI / 2, 'jeu', 'arcade');
  // terrasse : autour des deux tables à parasol ; hall : autour de l'arbre
  autour('terrasse', -1.4, -1.6, 1.15, [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4], 'discussion', 'parasol1');
  autour('terrasse', 1.5, .6, 1.15, [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4], 'discussion', 'parasol2');
  autour('hall', 0, 0, 2.5, [.5, 1.2, 2.4, 3.6, 4.6, 5.6], 'flane', 'hall');
  const libres = (filtre = () => true) => endroits.filter(e => !e.occupant && filtre(e));
  const presentsA = (rencontre) => occupants.filter(o => o.endroit && o.endroit.rencontre === rencontre && o.surPlace);

  /* ---------- occupants : promeneurs et agents en pause, sur place ou en chemin ---------- */
  const occupants = [];
  const bulles = new Map();                                   // symbole → texture
  function textureBulle(s) {
    if (bulles.has(s)) return bulles.get(s);
    const c = document.createElement('canvas'); c.width = 112; c.height = 84;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(255,255,255,.96)'; g.strokeStyle = 'rgba(30,41,59,.35)'; g.lineWidth = 3;
    g.beginPath(); g.roundRect(4, 4, 104, 58, 24); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(26, 60); g.lineTo(20, 80); g.lineTo(44, 60); g.fill();
    g.fillStyle = '#1f2937'; g.font = '700 38px Inter, "Segoe UI Emoji", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(s, 56, 35);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    bulles.set(s, t);
    return t;
  }
  function equiper(o) {
    const b = new THREE.Sprite(new THREE.SpriteMaterial({ map: textureBulle('…'), transparent: true }));
    b.scale.set(.46, .34, 1); b.position.set(.38, 1.78, 0); b.center.set(.2, 0); b.visible = false; b.renderOrder = 9;
    o.corps.add(b); o.bulle = b;
  }
  function poserTasse(o) {
    if (o.tasse || !o.corps.userData.brasDebout) return;
    o.tasse = cyl(o.corps.userData.brasDebout[1], .05, .045, .11, 0, -.66, .05, '#ffffff', 8);
  }
  function quitterEndroit(o) {
    if (o.endroit) { o.endroit.occupant = null; o.endroit = null; }
    o.surPlace = false;
    if (o.bulle) o.bulle.visible = false;
    if (o.tasse) { o.tasse.parent.remove(o.tasse); o.tasse = null; }
    if (o.corps && o.corps.userData.brasDebout) o.corps.userData.brasDebout.forEach(b => { b.rotation.x = 0; });
  }
  function arriver(o) {
    o.surPlace = true;
    if (o.promeneur) o.jusqua = performance.now() + hasard(12000, 35000);   // le temps d'un café, d'une partie, d'une discussion
    o.corps.rotation.y = o.endroit.r;
    if (o.endroit.activite === 'cafe') poserTasse(o);
  }

  /* ---------- promeneurs ---------- */
  function choisirEndroit(o) {
    const pres = (e) => !o.endroit || e.rencontre !== o.endroit.rencontre;
    // plutôt rejoindre quelqu'un (pour discuter), sinon un endroit libre ailleurs
    const avecMonde = libres(e => pres(e) && presentsA(e.rencontre).length > 0);
    return (avecMonde.length && Math.random() < .6 ? choisir(avecMonde) : null) || choisir(libres(pres)) || null;
  }
  function repartir(o) {
    const cible = choisirEndroit(o);
    if (!cible) { o.jusqua = performance.now() + 5000; return; }
    const depart = { x: o.corps.position.x, z: o.corps.position.z }, chemin = chemins.itineraire(depart, cible);
    if (!chemin) { o.jusqua = performance.now() + 5000; return; }
    quitterEndroit(o);
    o.endroit = cible; cible.occupant = o;
    marche.marcher(o.corps, chemin, () => arriver(o), { attente: 0 });
  }
  const depart = [...endroits].sort(() => Math.random() - .5);
  for (let i = 0; i < NB_PROMENEURS && i < depart.length; i++) {
    const e = depart[i];
    const corps = personnage(scene, e.x, e.z, e.r, lookFigurant(Math.random), 'stand');
    corps.position.y = sol(e.x, e.z) ?? 0;
    compacter(corps);
    const o = { corps, promeneur: true, endroit: e };
    e.occupant = o; occupants.push(o); equiper(o); arriver(o);
    o.jusqua = performance.now() + hasard(4000, 25000);     // au début, chacun repart à un moment différent
  }

  /* ---------- agents en pause : un café ou une partie, puis retour au bureau ---------- */
  let prochainePause = performance.now() + hasard(15000, 30000);
  function lancerPause() {
    const enCours = occupants.filter(o => o.pose).length;
    if (enCours >= 2) return;
    const candidats = agentsPoses.filter(p => !p.sortie && !p.enTache && p.groupe.visible && (p.agent.etat === 'en pause' || (p.agent.etat === 'en attente' && Math.random() < .3)));
    const pose = candidats.length && choisir(candidats);
    const cible = pose && choisir(libres(e => e.activite === 'cafe' || e.activite === 'jeu' || e.activite === 'discussion'));
    if (!cible) return;
    const o = { pose, endroit: cible, surPlace: false };
    cible.occupant = o;
    const part = reunion.pause(pose, cible, (corps) => {
      o.corps = corps; equiper(o); arriver(o);
      o.jusqua = performance.now() + hasard(25000, 45000);
    }, () => { quitterEndroit(o); const i = occupants.indexOf(o); if (i >= 0) occupants.splice(i, 1); });
    if (!part) { cible.occupant = null; return; }
    occupants.push(o);
  }

  /* ---------- à chaque image ---------- */
  const tours = new Map();                                    // rencontre → { qui, jusqua }
  let t = 0;
  function mettreAJour(dt) {
    t += dt;
    const maintenant = performance.now();
    if (maintenant > prochainePause) { lancerPause(); prochainePause = maintenant + hasard(35000, 70000); }

    for (const o of [...occupants]) {
      if (o.pose) {
        // l'agent a été appelé en réunion, a reçu une tâche, ou son corps a changé : on le laisse
        if (!o.pose.sortie || o.pose.sortie.motif !== 'pause') { const i = occupants.indexOf(o); if (i >= 0) occupants.splice(i, 1); continue; }
        if (o.surPlace && (maintenant > o.jusqua || o.pose.enTache)) { reunion.rentrer(o.pose); continue; }
      } else if (o.surPlace && maintenant > o.jusqua) {
        repartir(o); if (!o.surPlace) continue;              // il part ; sinon il réessaiera dans 5 s
      }
      if (!o.surPlace || !o.corps) continue;
      const g = o.corps, e = o.endroit, bras = g.userData.brasDebout;
      // regard : vers les autres s'ils sont là, sinon vers l'endroit (comptoir, borne, table)
      const autres = presentsA(e.rencontre).filter(x => x !== o);
      let but = e.r;
      if (autres.length && e.activite !== 'jeu') {
        const mx = autres.reduce((s, x) => s + x.corps.position.x, 0) / autres.length, mz = autres.reduce((s, x) => s + x.corps.position.z, 0) / autres.length;
        but = Math.atan2(mx - g.position.x, mz - g.position.z);
      }
      let d = but - g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); g.rotation.y += d * (1 - Math.exp(-dt * 4));
      // gestes selon l'activité
      if (bras) {
        const ph = (g.id % 7) * .9;
        if (e.activite === 'jeu') { bras[0].rotation.x = -1.2 + Math.sin(t * 17 + ph) * .1; bras[1].rotation.x = -1.2 + Math.sin(t * 13 + ph) * .1; }
        else if (e.activite === 'cafe') { const gorgee = (t + ph) % 6 < 1.2; bras[1].rotation.x += ((gorgee ? -2.1 : -.55) - bras[1].rotation.x) * (1 - Math.exp(-dt * 6)); bras[0].rotation.x *= .9; }
        else { bras[0].rotation.x *= .9; bras[1].rotation.x *= .9; }
      }
      g.position.y = (sol(g.position.x, g.position.z) ?? g.position.y) + Math.sin(t * 1.6 + g.id) * .006;
    }

    // la parole tourne dans chaque groupe : celui qui parle a une bulle et fait un geste
    const groupes = new Map();
    for (const o of occupants) if (o.surPlace && o.bulle) { const r = o.endroit.rencontre; if (!groupes.has(r)) groupes.set(r, []); groupes.get(r).push(o); }
    for (const [r, membres] of groupes) {
      let tour = tours.get(r);
      const seul = membres.length < 2;
      if (!tour || maintenant > tour.jusqua || !membres.includes(tour.qui)) {
        const qui = seul ? (membres[0].endroit.activite === 'jeu' && Math.random() < .35 ? membres[0] : null) : choisir(membres.filter(m => !tour || m !== tour.qui));
        tour = { qui, jusqua: maintenant + hasard(1800, 3400) };
        tours.set(r, tour);
        for (const m of membres) m.bulle.visible = false;
        if (qui) { qui.bulle.material.map = textureBulle(seul ? choisir(['!', '♪', '!']) : choisir(SYMBOLES)); qui.bulle.visible = true; }
      }
      const qui = tour.qui;
      if (qui && qui.corps.userData.brasDebout && qui.endroit.activite !== 'jeu') qui.corps.userData.brasDebout[0].rotation.x = -.5 + Math.sin(t * 6) * .35;
    }
    for (const [r] of tours) if (!groupes.has(r)) tours.delete(r);
  }

  return { mettreAJour, endroits: endroits.length, occupants };
}
