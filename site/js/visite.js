// Visite à la première personne : marcher (Z Q S D ou flèches, Maj pour courir), regarder avec la souris,
// ouvrir les portes avec E. Échap rend la souris ; un clic dans la vue la reprend.
import * as THREE from 'three';

const RAYON = .28, YEUX = 1.5, MARCHE = 3.2, COURSE = 6, MARCHE_MAX = .45, SENSI = .0022;
const TOUCHES = {
  avant: ['KeyW', 'ArrowUp'], arriere: ['KeyS', 'ArrowDown'],       // KeyW = Z sur un clavier AZERTY
  gauche: ['KeyA', 'ArrowLeft'], droite: ['KeyD', 'ArrowRight'],    // KeyA = Q sur un clavier AZERTY
};

export function creerVisite({ canvas, collisions, sol, portes, interface: ui }) {
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, .05, 300);
  camera.rotation.order = 'YXZ';
  const etat = { actif: false, x: 0, z: 0, pieds: 0, lacet: 0, tangage: 0, balancement: 0 };
  const appuis = new Set();

  /* ---------- souris ---------- */
  const verrouillee = () => document.pointerLockElement === canvas;
  // Si le navigateur refuse de capturer la souris (certains volets intégrés le font), on passe en mode
  // « glisser » : on regarde autour de soi en maintenant le clic gauche et en déplaçant la souris.
  let glisser = false;
  function passerEnGlisser() { glisser = true; ui.reprendre.hidden = true; ui.hud.classList.add('glisser'); }
  function verrouiller() {
    if (!etat.actif || verrouillee() || glisser) return;
    const r = canvas.requestPointerLock?.();
    if (!r) { if (!canvas.requestPointerLock) passerEnGlisser(); return; }
    if (r.catch) r.catch(() => { if (etat.actif) passerEnGlisser(); });
  }
  let etaitVerrouillee = false;
  document.addEventListener('pointerlockchange', () => {
    if (!etat.actif) return;
    if (verrouillee()) { etaitVerrouillee = true; ui.reprendre.hidden = true; return; }
    appuis.clear();
    if (etaitVerrouillee) ui.reprendre.hidden = false;      // Échap : la souris est rendue, visite en pause
  });
  document.addEventListener('pointerlockerror', () => { if (etat.actif) passerEnGlisser(); });
  const regarder = (dx, dy) => {
    etat.lacet -= dx * SENSI;
    etat.tangage = THREE.MathUtils.clamp(etat.tangage - dy * SENSI, -1.45, 1.45);
  };
  document.addEventListener('mousemove', (e) => { if (etat.actif && verrouillee()) regarder(e.movementX, e.movementY); });
  let tire = null;
  canvas.addEventListener('pointerdown', (e) => { if (etat.actif && glisser && e.button === 0) { tire = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture?.(e.pointerId); } });
  canvas.addEventListener('pointermove', (e) => {
    if (!tire) return;
    regarder((e.clientX - tire.x) * 1.4, (e.clientY - tire.y) * 1.4); tire = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('pointerup', () => { tire = null; });
  ui.reprendre.addEventListener('click', (e) => {
    if (e.target === ui.reprendre || e.target.dataset.reprendre !== undefined) { ui.reprendre.hidden = true; verrouiller(); }
  });
  canvas.addEventListener('click', () => { if (etat.actif && !verrouillee()) verrouiller(); });

  /* ---------- clavier ---------- */
  addEventListener('keydown', (e) => {
    if (!etat.actif) return;
    if (e.code === 'KeyE' && !e.repeat) { basculerPorte(); e.preventDefault(); return; }
    if (Object.values(TOUCHES).flat().includes(e.code) || e.code.startsWith('Shift')) { appuis.add(e.code); e.preventDefault(); }
  });
  addEventListener('keyup', (e) => appuis.delete(e.code));
  addEventListener('blur', () => appuis.clear());
  const presse = (nom) => TOUCHES[nom].some(c => appuis.has(c));

  /* ---------- portes ---------- */
  function porteProche() {
    let meilleure = null, dmin = 2.2;
    const vx = -Math.sin(etat.lacet), vz = -Math.cos(etat.lacet);
    for (const p of portes) {
      const dx = p.centre.x - etat.x, dz = p.centre.z - etat.z, d = Math.hypot(dx, dz);
      if (Math.abs(p.centre.y - 1 - etat.pieds) > 1.2) continue;
      const devant = d < .9 || (dx * vx + dz * vz) / (d || 1) > .2;      // à portée et plutôt devant soi
      if (d < dmin && devant) { dmin = d; meilleure = p; }
    }
    return meilleure;
  }
  function basculerPorte() {
    const p = porteProche(); if (!p) return;
    p.ouverte = !p.ouverte;
  }

  /* ---------- déplacement avec collisions ---------- */
  function essayer(nx, nz) {
    const s = sol(nx, nz);
    if (s === null) return false;                                 // le vide : on ne tombe pas de l'île
    if (s - etat.pieds > MARCHE_MAX) return false;                // marche trop haute
    if (collisions.bloque(nx, nz, RAYON, Math.max(s, etat.pieds))) return false;
    etat.x = nx; etat.z = nz; return true;
  }
  function deplacer(dx, dz) {
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .08));   // petits pas : on ne traverse pas une vitre fine
    for (let i = 0; i < n; i++) {
      const okx = essayer(etat.x + dx / n, etat.z);
      const okz = essayer(etat.x, etat.z + dz / n);                // glisse le long des murs
      if (!okx && !okz) break;
    }
  }

  /* ---------- API ---------- */
  function entrer(x, z, lacet = 0) {
    etat.actif = true; etat.x = x; etat.z = z; etat.lacet = lacet; etat.tangage = -.05;
    etat.pieds = sol(x, z) ?? 0;
    appuis.clear();
    ui.hud.hidden = false; ui.reprendre.hidden = true;
    verrouiller();
  }
  function sortir() {
    etat.actif = false; appuis.clear(); tire = null; etaitVerrouillee = false;
    if (verrouillee()) document.exitPointerLock();
    ui.hud.hidden = true; ui.reprendre.hidden = true;
  }
  function mettreAJour(dt) {
    // portes : elles pivotent doucement vers leur position voulue
    for (const p of portes) {
      const but = p.ouverte ? p.ouvert : 0;
      if (p.angle !== but) { p.angle += (but - p.angle) * (1 - Math.exp(-dt * 7)); if (Math.abs(but - p.angle) < .002) p.angle = but; p.pivot.rotation[p.axe] = p.angle; }
    }
    if (!etat.actif) return;
    const avance = (presse('avant') ? 1 : 0) - (presse('arriere') ? 1 : 0);
    const cote = (presse('droite') ? 1 : 0) - (presse('gauche') ? 1 : 0);
    let bouge = false;
    if (avance || cote) {
      const v = (appuis.has('ShiftLeft') || appuis.has('ShiftRight') ? COURSE : MARCHE) * dt / Math.hypot(avance, cote);
      const s = Math.sin(etat.lacet), c = Math.cos(etat.lacet);
      deplacer((-s * avance + c * cote) * v, (-c * avance - s * cote) * v);
      bouge = true;
    }
    const s = sol(etat.x, etat.z);
    if (s !== null) etat.pieds += (s - etat.pieds) * (1 - Math.exp(-dt * 14));   // escaliers, pont, marches
    etat.balancement = bouge ? etat.balancement + dt * 9 : etat.balancement * .9;
    camera.position.set(etat.x, etat.pieds + YEUX + Math.sin(etat.balancement) * .025, etat.z);
    camera.rotation.set(etat.tangage, etat.lacet, 0);
    // invite « E : ouvrir la porte »
    const p = porteProche();
    ui.invite.hidden = !p;
    if (p) ui.invite.textContent = p.barriere ? (p.ouverte ? 'E : baisser la barrière' : 'E : lever la barrière') : (p.ouverte ? 'E : fermer la porte' : 'E : ouvrir la porte');
  }
  function redimensionner() { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
  addEventListener('resize', redimensionner);

  return { camera, entrer, sortir, mettreAJour, actif: () => etat.actif, position: () => new THREE.Vector3(etat.x, etat.pieds, etat.z) };
}
