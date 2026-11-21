// Le QG JILL KORP — point d'entrée : moteur, caméra, interactions, optimisation et boucle d'affichage.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { anim } from './outils.js';
import { chargerModeles } from './modeles.js';
import { construireMonde, BX, BZ, Y0, ISLET } from './monde.js';
import { agentsPoses } from './mobilier.js';
import { ajusterEtiquettes, ajusterEtiquettesVisite, quitterEtiquettesVisite } from './etiquettes.js';
import { construireCollisions } from './collisions.js';
import { creerVisite } from './visite.js';
import { creerCiel, nomPhase, eclairage } from './planetes.js';
import { creerMinimap } from './minimap.js';
import { creerFenetreAgent } from './fenetre-agent.js';
import { creerOnglets } from './onglets.js';
import { creerReunion } from './reunion.js';
import { POLES, ETATS } from './donnees.js';

const $ = (s) => document.querySelector(s);

/* ================= Moteur ================= */
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
const PR_MAX = Math.min(devicePixelRatio, 1.5), PR_MIN = Math.min(.6, PR_MAX);
let pr = PR_MAX;
renderer.setPixelRatio(pr);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;          // ombres recalculées seulement quand une façade change
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xd6ecff, 0x9a7b55, 1.15));
const sun = new THREE.DirectionalLight(0xfff0d6, 2.5);
sun.position.set(26, 50, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 160 });
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

/* ================= Caméra ================= */
const VIEW = 46;
const VUE_ENSEMBLE = new THREE.Vector3(1, -1.5, -1);
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -500, 1000);
camera.position.copy(VUE_ENSEMBLE).addScaledVector(new THREE.Vector3(1, 1.45, 1).normalize(), 200);
camera.lookAt(VUE_ENSEMBLE);

const controls = new OrbitControls(camera, canvas);
controls.target.copy(VUE_ENSEMBLE);
controls.enableDamping = true; controls.dampingFactor = .08;
controls.enableZoom = false;                       // zoom progressif géré plus bas
controls.screenSpacePanning = false;               // déplacement à plat, sur x et z
controls.panSpeed = 1.2;
controls.minPolarAngle = .3; controls.maxPolarAngle = 1.15;
controls.autoRotate = true; controls.autoRotateSpeed = .45;   // un tour complet en un peu plus de deux minutes
controls.update();

function resize() {
  const a = innerWidth / innerHeight;
  const vh = a >= 1.3 ? VIEW : VIEW * 1.3 / a;
  camera.left = -vh * a / 2; camera.right = vh * a / 2; camera.top = vh / 2; camera.bottom = -vh / 2;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
addEventListener('resize', resize); resize();

/* ================= Rotation automatique : pause dès qu'on touche à la vue ================= */
let repriseA = 0;
const horloge = () => performance.now() / 1000;
function pauseRotation(sec = 7) { controls.autoRotate = false; repriseA = horloge() + sec; }
controls.addEventListener('start', () => pauseRotation(1e9));
controls.addEventListener('end', () => pauseRotation(7));

/* ================= Fusion des objets fixes (performances) =================
   Des milliers de petits objets deviennent quelques dizaines de maillages, et les matériaux
   « physiques » deviennent des matériaux Lambert, bien plus légers à calculer pour chaque pixel. */
const lambertCache = new Map();
function toLambert(m) {
  if (!m.isMeshStandardMaterial) return m;
  if (!lambertCache.has(m.uuid)) lambertCache.set(m.uuid, new THREE.MeshLambertMaterial({
    color: m.color, map: m.map, emissive: m.emissive, emissiveIntensity: m.emissiveIntensity, vertexColors: m.vertexColors,
    transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite, side: m.side, flatShading: m.flatShading,
  }));
  return lambertCache.get(m.uuid);
}
const partages = new Map();
function fusionner(racine, dest, garder = false) {
  racine.updateMatrixWorld(true); dest.updateMatrixWorld(true);
  const inverse = new THREE.Matrix4().copy(dest.matrixWorld).invert();
  const paquets = new Map(), faits = [];
  racine.traverse((o) => {
    if (!o.isMesh || o.userData.keep || Array.isArray(o.material)) return;
    const m = o.material;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(o.matrixWorld).applyMatrix4(inverse);
    const uniStd = m.isMeshStandardMaterial && !m.map && !m.transparent && !m.vertexColors && m.side === THREE.FrontSide && m.emissive.getHex() === 0;
    const uniBasic = m.isMeshBasicMaterial && !m.map && !m.transparent && !m.wireframe;
    let cle, mat = m;
    if (uniStd || uniBasic) {
      const mk = uniStd ? `L${m.flatShading}` : 'B';
      cle = mk + (o.castShadow ? 's' : 'n');
      if (!partages.has(mk)) partages.set(mk, uniStd ? new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: m.flatShading }) : new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
      mat = partages.get(mk);
      const n = g.attributes.position.count, c = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { c[i * 3] = m.color.r; c[i * 3 + 1] = m.color.g; c[i * 3 + 2] = m.color.b; }
      g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    } else { mat = toLambert(m); cle = mat.uuid + (o.castShadow ? 's' : 'n'); }
    for (const nom of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(nom) && !(mat.vertexColors && nom === 'color')) g.deleteAttribute(nom);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    g.morphAttributes = {}; g.clearGroups();
    if (!paquets.has(cle)) paquets.set(cle, { mat, ombre: o.castShadow, liste: [] });
    paquets.get(cle).liste.push(g);
    faits.push(o);
  });
  for (const o of faits) o.parent.remove(o);
  for (const { mat, ombre, liste } of paquets.values()) {
    const mesh = new THREE.Mesh(mergeGeometries(liste, false), mat);
    mesh.castShadow = ombre && !mat.transparent; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
    if (garder) mesh.userData.keep = true;
    dest.add(mesh);
  }
  return [faits.length, paquets.size];
}

/* ================= Construction ================= */
const barre = $('#chargement .barre i');
// polices (Kenney Future pour les titres, Inter pour le reste) : chargées avant de dessiner étiquettes et enseignes
await Promise.all(['46px "Kenney Future"', '46px "Kenney Future Narrow"', '500 30px Inter', '600 30px Inter'].map(f => document.fonts.load(f).catch(() => {})));
await chargerModeles((k) => { barre.style.width = Math.round(k * 100) + '%'; });
const { facade, zones, world, islet, portes, sol: hauteurSol } = construireMonde(scene);
// les collisions sont relevées avant la fusion, tant que chaque mur et chaque meuble est encore un objet à part
const collisions = construireCollisions([world, islet], portes);

let avant = 0, apres = 0;
const compte = ([a, b]) => { avant += a; apres += b; };
for (const k in facade) for (const part of ['tall', 'low']) compte(fusionner(facade[k][part], facade[k][part], true));
// les bras de chaque agent assis restent à part (ils tapent au clavier pendant une tâche) : 1 maillage par bras
for (const a of agentsPoses) for (const b of a.groupe.userData.bras || []) {
  b.traverse((o) => { if (o.isMesh && o !== a.groupe.userData.tasse) o.userData.keep = false; });
  compte(fusionner(b, b, true));
}
for (const a of agentsPoses) compte(fusionner(a.groupe, a.groupe, true));     // chaque agent = 1 maillage (+ ses 2 bras)
compte(fusionner(scene, scene));
scene.traverse((o) => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(toLambert) : toLambert(o.material); });
console.log(`Fusion : ${avant} objets → ${apres} maillages`);
// le ciel : planètes en orbite et Lune à sa vraie phase (ajoutés après la fusion, ils bougent)
const ciel = creerCiel(scene);
function afficherLune() {
  const f = ciel.phase();
  $('#lune').textContent = `Lune : ${nomPhase(f)} · ${Math.round(eclairage(f) * 100)} % éclairée`;
}
afficherLune(); setInterval(afficherLune, 60000);
renderer.shadowMap.needsUpdate = true;
$('#chargement').classList.add('fini');

/* ================= Zones cliquables (une boîte invisible par salle) ================= */
const zonesGroupe = new THREE.Group();
const invisible = new THREE.MeshBasicMaterial({ visible: false });
for (const z of zones) {
  const h = 3 - z.bas;
  const m = new THREE.Mesh(new THREE.BoxGeometry(z.w, h, z.d), invisible);
  m.position.set(z.x, z.y + z.bas + h / 2, z.z); m.userData.zone = z;
  zonesGroupe.add(m);
}
zonesGroupe.updateMatrixWorld(true);
// Chaque agent est rattaché à la salle où il est vraiment assis (Hugo, du Cabinet, travaille à la Bibliothèque).
const posA = new THREE.Vector3();
for (const a of agentsPoses) {
  a.groupe.getWorldPosition(posA);
  const z = zones.find(z => Math.abs(posA.x - z.x) <= z.w / 2 + .01 && Math.abs(posA.z - z.z) <= z.d / 2 + .01);
  a.zone = z ? z.id : null;
  a.groupe.userData.poseAgent = a;
}
// réunion : les agents cochés dans l'onglet « Équipe » marchent jusqu'à la salle de réunion
const reunion = creerReunion({
  scene, zones, agentsPoses, sol: hauteurSol, collisions, portes,
  ombres: () => { renderer.shadowMap.needsUpdate = true; },
  quandChange: () => { onglets.redessiner(); if (zoneActive && !$('#fiche').hidden) afficherFiche(zoneActive); },
});
const lieuDe = (a) => (a.enReunion ? 'reunion' : a.zone);     // en réunion (ou en route), l'agent compte dans la salle de réunion

const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function zoneSous(x, y) {
  ndc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1);
  camera.updateMatrixWorld(); ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(zonesGroupe.children, false)[0];
  return hit ? hit.object.userData.zone : null;
}
// Un agent sous le pointeur (son personnage ou son étiquette visible) : on peut cliquer dessus pour lui parler.
const visible = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return !o.isSprite || o.material.opacity > .25; };
function agentSous(v, cam = camera, loin = Infinity) {
  cam.updateMatrixWorld(); ray.setFromCamera(v, cam); ray.far = loin;
  const hits = ray.intersectObjects(agentsPoses.map(a => a.corps || a.groupe), true);   // corps : l'agent debout ou assis en réunion
  ray.far = Infinity;
  for (const h of hits) {
    if (!visible(h.object)) continue;
    for (let p = h.object; p; p = p.parent) if (p.userData.poseAgent) return p.userData.poseAgent;
  }
  return null;
}
const ndcDe = (x, y) => new THREE.Vector2(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1);

/* ================= Vol de la caméra vers une salle ================= */
let vol = null;
const ease = (t) => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
function decaler(d) { camera.position.add(d); controls.target.add(d); }
function voler(cible, zoom, duree = 1.4) {
  vol = { t: 0, duree, de: controls.target.clone(), vers: cible.clone(), z0: camera.zoom, z1: zoom };
  pauseRotation(1e9);
}
function zoomPour(z) {
  const vue = (camera.top - camera.bottom), large = (camera.right - camera.left);
  return THREE.MathUtils.clamp(Math.min(vue / (Math.max(z.w, z.d) * 1.9), large / (Math.max(z.w, z.d) * 2.2)), 1.7, 3.4);
}
let zoneActive = null;
function allerVers(z) {
  zoneActive = z;
  voler(new THREE.Vector3(z.x, z.y + z.bas * .5, z.z), zoomPour(z));
  afficherFiche(z);
  onglets.suivreZone();
}
function vueEnsemble() {
  zoneActive = null;
  voler(VUE_ENSEMBLE, 1);
  $('#fiche').hidden = true;
}

/* ================= Fiche de la salle visitée ================= */
function afficherFiche(z) {
  const f = $('#fiche');
  const pole = z.pole ? POLES[z.pole] : null;
  const gens = agentsPoses.filter(a => lieuDe(a) === z.id);
  f.querySelector('.titre').textContent = z.nom;
  // couleurs du pôle de la salle (en-tête, bouton, liseré des agents) ; bleu d'origine pour les salles communes
  const cle = z.pole || (z.id === 'qg' ? 'qg' : '');
  if (cle) f.dataset.pole = cle; else delete f.dataset.pole;
  f.querySelector('.pole').textContent = pole ? `Pôle ${pole.nom}` : '';
  const ul = f.querySelector('ul'); ul.replaceChildren();
  for (const pose of gens) {
    const a = pose.agent, li = document.createElement('li');
    li.tabIndex = 0; li.setAttribute('role', 'button'); li.title = `Parler à ${a.prenomEquipe || a.prenom}`;
    li.addEventListener('click', () => parlerA(pose));
    li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); parlerA(pose); } });
    const etatVu = pose.enTache ? 'au travail' : pose.enReunion ? 'en réunion' : a.etat;   // comme sur son étiquette
    const dot = document.createElement('i'); dot.style.background = (ETATS[etatVu] || ETATS['en attente']).couleur;
    const nom = document.createElement('b'); nom.textContent = a.prenom;
    const poste = document.createElement('span'); poste.textContent = a.poste;
    const etat = document.createElement('em'); etat.textContent = etatVu;
    li.append(dot, nom, poste, etat); ul.append(li);
  }
  f.querySelector('.vide').hidden = gens.length > 0;
  f.hidden = false;
}
$('#fiche .fermer').addEventListener('click', vueEnsemble);

/* ================= Visite à la première personne ================= */
const posAg = new THREE.Vector3();
const visite = creerVisite({
  canvas, collisions, sol: hauteurSol, portes,
  agents: agentsPoses.map(pose => { pose.groupe.getWorldPosition(posAg); return { x: posAg.x, y: posAg.y, z: posAg.z, pose }; }),
  parler: (pose) => parlerA(pose),
  bloquee: () => fenetre.ouverte(),
  interface: { hud: $('#visite'), reprendre: $('#reprendre'), invite: $('#invite') },
});
/* ================= Fenêtre d'un agent : discuter ou lui confier une tâche ================= */
const fenetre = creerFenetreAgent({
  agentsPoses,
  quandFermee: () => { if (visite.actif()) visite.reprendre(); },   // on reprend la marche là où on était
});
function parlerA(pose) {
  if (!pose) return;
  if (visite.actif()) visite.liberer();
  survol.hidden = true;
  fenetre.ouvrir(pose.agent);
}
/* ================= Onglets du bas : « Pôles » (lieux un par un) et « Équipe » (ce que fait chacun) ================= */
const onglets = creerOnglets({
  zones, agentsPoses, allerVers, zoneActive: () => zoneActive, reunion,
  parler: (pose) => parlerA(pose),
  apresSifflet: () => vueEnsemble(),
  desactive: () => fenetre.ouverte() || visite.actif(),
});
// minimap de la visite (en haut à droite) : plan du bureau, agents et visiteur
const posAgent = new THREE.Vector3();
const minimap = creerMinimap({
  zones, ui: { canvas: $('#minimap canvas'), lieu: $('#minimap .lieu') },
  agents: agentsPoses.map(a => { a.groupe.getWorldPosition(posAgent); return { x: posAgent.x, z: posAgent.z }; }),
  ilot: { x: ISLET.x, z: ISLET.z, r: 4.4 }, pont: { x0: BX, x1: ISLET.x - 2.45, z: ISLET.z }, sortie: { x: BX - .5, z: 4.75 },
  tuiles: 'ui/kenney/minimap-pack/tuiles-style-d.png',
});
const libre = (x, z) => { const s = hauteurSol(x, z); return s !== null && !collisions.bloque(x, z, .32, s); };
function pointLibre(x, z) {                       // l'endroit libre le plus proche (pour ne pas apparaître dans un meuble)
  if (libre(x, z)) return [x, z];
  for (let r = .25; r < 5; r += .25) for (let k = 0; k < 24; k++) {
    const a = k / 24 * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    if (libre(px, pz)) return [px, pz];
  }
  return [x, z];
}
const lacetVers = (dx, dz) => Math.atan2(-dx, -dz);
const VERS_INTERIEUR = { n: [0, 1], s: [0, -1], w: [1, 0], e: [-1, 0] };
function passerEnVisite(x, z, lacet) {
  vol = null; controls.enabled = false; controls.autoRotate = false;
  $('#fiche').hidden = true; survol.hidden = true; document.body.classList.add('en-visite'); onglets.fermer();
  for (const k in facade) { facade[k].tall.visible = true; facade[k].low.visible = false; }   // tous les murs debout
  cleFacades = ''; renderer.shadowMap.needsUpdate = true;
  visite.entrer(x, z, lacet);
}
/** Entrer directement dans une salle : juste derrière sa porte, le regard tourné vers le centre de la pièce. */
function entrerDans(z) {
  if (!z) return;
  const porte = portes.find(p => p.zone === z.id && !p.barriere);
  let x = z.x, zz = z.z;
  if (porte) { const [nx, nz] = VERS_INTERIEUR[porte.side]; x = porte.centre.x + nx; zz = porte.centre.z + nz; }
  else if (z.id === 'forge') { x = z.x + 2.7; zz = z.z - 3.0; }        // en haut de l'escalier de la Forge
  const [px, pz] = pointLibre(x, zz);
  passerEnVisite(px, pz, lacetVers(z.x - px, z.z - pz));
}
/** « J'entre » : on arrive par l'entrée est du couloir sud, face au bâtiment. */
function entrerParLaPorte() { const [px, pz] = pointLibre(BX - .8, 4.75); passerEnVisite(px, pz, lacetVers(-1, 0)); }
function vueDuHaut() {
  visite.sortir(); controls.enabled = true; document.body.classList.remove('en-visite');
  quitterEtiquettesVisite(); cleFacades = '';
  zoneActive = null; voler(VUE_ENSEMBLE, 1);
}
$('#entrer').addEventListener('click', entrerParLaPorte);
$('#fiche .entrer').addEventListener('click', () => entrerDans(zoneActive));
for (const b of document.querySelectorAll('[data-haut]')) b.addEventListener('click', vueDuHaut);
$('#ensemble').addEventListener('click', () => (visite.actif() ? vueDuHaut() : vueEnsemble()));

// légende : un bouton par pôle (+ le Quartier Général) qui fait voler la caméra jusqu'à sa salle
const legende = $('#legende');
for (const [cle, p] of Object.entries(POLES)) {
  const z = zones.find(z => z.id === p.salle);
  const b = document.createElement('button'); b.type = 'button';
  b.innerHTML = `<i style="background:${p.couleur}"></i>`; b.append(p.nom); b.style.setProperty('--c', p.couleur);
  b.addEventListener('click', () => (visite.actif() ? entrerDans(z) : allerVers(z)));
  legende.append(b);
}
{
  const z = zones.find(z => z.id === 'qg');
  const b = document.createElement('button'); b.type = 'button'; b.className = 'qg';
  b.innerHTML = '<i style="background:#b8860b"></i>'; b.append('Quartier Général'); b.style.setProperty('--c', '#c9971c');
  b.addEventListener('click', () => (visite.actif() ? entrerDans(z) : allerVers(z)));
  legende.append(b);
}

/* ================= Souris : survol, clic sur une salle ================= */
const survol = $('#survol');
let appui = null;
canvas.addEventListener('pointerdown', (e) => { if (visite.actif()) return; appui = { x: e.clientX, y: e.clientY, t: performance.now() }; });
canvas.addEventListener('pointerup', (e) => {
  if (!appui) return;
  const bouge = Math.hypot(e.clientX - appui.x, e.clientY - appui.y), duree = performance.now() - appui.t;
  appui = null;
  if (e.button !== 0 || bouge > 6 || duree > 600) return;
  const pose = agentSous(ndcDe(e.clientX, e.clientY));      // un clic sur un agent : sa fenêtre
  if (pose) { parlerA(pose); return; }
  const z = zoneSous(e.clientX, e.clientY);
  if (z) allerVers(z);
});
// en visite : clic au viseur (souris capturée) ou sous le pointeur (mode « glisser ») sur un agent, à moins de 4 m
let appuiVisite = null;
canvas.addEventListener('pointerdown', (e) => { if (visite.actif()) appuiVisite = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('click', (e) => {
  if (!visite.actif() || fenetre.ouverte()) return;
  let v = null;
  if (visite.verrouillee()) v = new THREE.Vector2(0, 0);
  else if (visite.glisser() && appuiVisite && Math.hypot(e.clientX - appuiVisite.x, e.clientY - appuiVisite.y) < 6) v = ndcDe(e.clientX, e.clientY);
  if (v) parlerA(agentSous(v, visite.camera, 4));
});
// double-clic sur une salle : on y entre directement, à la première personne
canvas.addEventListener('dblclick', (e) => {
  if (visite.actif()) return;
  const z = zoneSous(e.clientX, e.clientY);
  if (z) entrerDans(z);
});
canvas.addEventListener('pointermove', (e) => {
  if (visite.actif()) { survol.hidden = true; canvas.classList.remove('clic'); return; }
  if (e.buttons) { survol.hidden = true; return; }
  const pose = agentSous(ndcDe(e.clientX, e.clientY));
  const z = pose ? null : zoneSous(e.clientX, e.clientY);
  canvas.classList.toggle('clic', !!(pose || z));          // curseur « clic » du pack sur un agent ou une salle
  if (!pose && !z) { survol.hidden = true; return; }
  if (pose) {
    const a = pose.agent;
    survol.textContent = `${a.prenomEquipe || a.prenom} · clic pour lui parler`;
    survol.style.setProperty('--c', a.pole ? POLES[a.pole].couleur : '#b8860b');
  } else { survol.textContent = z.nom; survol.style.setProperty('--c', z.couleur); }
  survol.style.left = e.clientX + 14 + 'px'; survol.style.top = e.clientY + 14 + 'px';
  survol.hidden = false;
});
canvas.addEventListener('pointerleave', () => { survol.hidden = true; });

/* ================= Zoom progressif (molette, pavé tactile, pincement) ================= */
const ZMIN = .65, ZMAX = 7;
let zoomBut = camera.zoom;
const curseur = new THREE.Vector2();
const placerCurseur = (x, y) => curseur.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1);
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (vol || visite.actif()) return;
  let dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1);
  dy = THREE.MathUtils.clamp(dy, -150, 150);
  zoomBut = THREE.MathUtils.clamp(zoomBut * Math.exp(-dy * (e.ctrlKey ? .012 : .0016)), ZMIN, ZMAX);
  placerCurseur(e.clientX, e.clientY);
  pauseRotation(7);
}, { passive: false });
let pince = 0;
const ecart = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
canvas.addEventListener('touchstart', (e) => { if (e.touches.length === 2) pince = ecart(e.touches); }, { passive: true });
canvas.addEventListener('touchmove', (e) => {
  if (e.touches.length !== 2 || !pince || vol) return;
  const d = ecart(e.touches);
  zoomBut = THREE.MathUtils.clamp(zoomBut * d / pince, ZMIN, ZMAX); pince = d;
  placerCurseur((e.touches[0].clientX + e.touches[1].clientX) / 2, (e.touches[0].clientY + e.touches[1].clientY) / 2);
}, { passive: true });
canvas.addEventListener('touchend', () => { pince = 0; }, { passive: true });

const planSol = new THREE.Plane(new THREE.Vector3(0, 1, 0), -Y0);
function auSol(v) { camera.updateMatrixWorld(); ray.setFromCamera(v, camera); return ray.ray.intersectPlane(planSol, new THREE.Vector3()); }
function avancerZoom(dt) {
  if (Math.abs(camera.zoom - zoomBut) < 1e-4) return;
  const a = auSol(curseur);
  camera.zoom += (zoomBut - camera.zoom) * (1 - Math.exp(-dt * 12));
  camera.updateProjectionMatrix();
  const b = auSol(curseur);
  if (a && b) { const d = a.sub(b); d.y = 0; decaler(d); }   // on zoome vers le pointeur
}

/* ================= Clavier : ZQSD / WASD / flèches pour se déplacer, Échap pour la vue d'ensemble ================= */
const touches = new Set();
const DEPLACE = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input, textarea')) return;
  if (visite.actif() || fenetre.ouverte()) return;   // en visite, Échap rend simplement la souris ; fenêtre d'agent : Échap la ferme                      // en visite, Échap rend simplement la souris
  if (e.code === 'Escape') { vueEnsemble(); return; }
  if (DEPLACE.includes(e.code)) { touches.add(e.code); e.preventDefault(); pauseRotation(7); }
});
addEventListener('keyup', (e) => touches.delete(e.code));
addEventListener('blur', () => touches.clear());
const avant3 = new THREE.Vector3(), droite = new THREE.Vector3(), mv = new THREE.Vector3();
function avancerClavier(dt) {
  if (!touches.size || vol) return;
  avant3.subVectors(controls.target, camera.position); avant3.y = 0; avant3.normalize();
  droite.crossVectors(avant3, camera.up).normalize();
  mv.set(0, 0, 0);
  if (touches.has('KeyW') || touches.has('ArrowUp')) mv.add(avant3);
  if (touches.has('KeyS') || touches.has('ArrowDown')) mv.sub(avant3);
  if (touches.has('KeyD') || touches.has('ArrowRight')) mv.add(droite);
  if (touches.has('KeyA') || touches.has('ArrowLeft')) mv.sub(droite);
  if (mv.lengthSq()) { decaler(mv.normalize().multiplyScalar(dt * 22 / camera.zoom)); pauseRotation(7); }
}
function borner() {
  const t = controls.target, cx = THREE.MathUtils.clamp(t.x, -BX - 4, ISLET.x + 2), cz = THREE.MathUtils.clamp(t.z, -BZ - 4, BZ + 4);
  if (cx !== t.x || cz !== t.z) decaler(new THREE.Vector3(cx - t.x, 0, cz - t.z));
}

/* ================= Façades : celles du côté de la caméra s'abaissent ================= */
const plat = new THREE.Vector3(); let cleFacades = '';
function majFacades() {
  plat.subVectors(camera.position, controls.target); plat.y = 0; plat.normalize();
  let cle = '';
  for (const k in facade) {
    const f = facade[k], pres = f.nx * plat.x + f.nz * plat.z > .2;
    f.tall.visible = !pres; f.low.visible = pres; cle += pres ? 1 : 0;
  }
  if (cle !== cleFacades) { cleFacades = cle; renderer.shadowMap.needsUpdate = true; }
}

/* ================= Fluidité : résolution adaptative et détection de la carte graphique ================= */
const fpsEl = $('#fps');
let refresh = 60, perfT = 0, perfN = 0, bonnes = 0, attente = 0;
function adapterResolution(dt, t) {
  if (document.hidden || dt >= .1) { perfT = 0; perfN = 0; return; }
  perfT += dt; perfN++;
  if (perfT < .5) return;
  const fps = perfN / perfT; perfT = 0; perfN = 0;
  refresh = Math.max(refresh, Math.min(fps, 240));
  const cible = Math.min(refresh, 144) * .92;
  if (fps < Math.max(55, cible * .85) && pr > PR_MIN) { pr = Math.max(PR_MIN, pr * .82); renderer.setPixelRatio(pr); bonnes = 0; attente = t + 4; }
  else if (fps >= cible && pr < PR_MAX && t > attente) { if (++bonnes >= 6) { pr = Math.min(PR_MAX, pr * 1.12); renderer.setPixelRatio(pr); bonnes = 0; attente = t + 2; } }
  else bonnes = 0;
}
const gl = renderer.getContext(), dbg = gl.getExtension('WEBGL_debug_renderer_info');
const GPU = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'inconnue';
const LOGICIEL = /swiftshader|llvmpipe|basic render|software/i.test(GPU);
fpsEl.title = 'Carte graphique utilisée : ' + GPU;
if (LOGICIEL) { renderer.shadowMap.enabled = false; pr = PR_MIN; renderer.setPixelRatio(pr); }

// accès pratique depuis la console du navigateur (débogage)
window.qg = { scene, camera, controls, zones, agents: agentsPoses, portes, allerVers, vueEnsemble, entrerDans, vueDuHaut, visite, onglets, reunion, collisions, sol: hauteurSol };

/* ================= Boucle ================= */
const clock = new THREE.Clock();
let fpsT = 0, fpsN = 0;
function image() {
  const dt = Math.min(clock.getDelta(), .1), t = clock.elapsedTime;
  for (const a of anim) a.fn(t, dt);
  visite.mettreAJour(dt);
  reunion.mettreAJour(dt);
  ciel.mettreAJour(t, visite.actif() ? visite.camera : camera);
  if (visite.actif()) {
    minimap.dessiner(visite.position(), visite.orientation());
    ajusterEtiquettesVisite(visite.camera.position);
    renderer.render(scene, visite.camera);
    adapterResolution(dt, t); compterImages(dt);
    requestAnimationFrame(image);
    return;
  }
  if (vol) {
    vol.t += dt;
    const k = ease(Math.min(1, vol.t / vol.duree));
    const p = vol.de.clone().lerp(vol.vers, k);
    decaler(p.sub(controls.target));
    camera.zoom = THREE.MathUtils.lerp(vol.z0, vol.z1, k); camera.updateProjectionMatrix(); zoomBut = camera.zoom;
    if (vol.t >= vol.duree) { vol = null; pauseRotation(3); }
  }
  if (!vol && !controls.autoRotate && horloge() > repriseA) controls.autoRotate = true;
  avancerClavier(dt);
  controls.update(dt);
  if (!vol) { avancerZoom(dt); borner(); }
  majFacades();
  ajusterEtiquettes(camera, innerHeight);
  renderer.render(scene, camera);
  adapterResolution(dt, t); compterImages(dt);
  requestAnimationFrame(image);
}
function compterImages(dt) {
  fpsT += dt; fpsN++;
  if (fpsT > .5) { fpsEl.textContent = `${Math.round(fpsN / fpsT)} i/s · résolution ${Math.round(pr / PR_MAX * 100)} %${LOGICIEL ? ' · ⚠ accélération matérielle désactivée' : ''}`; fpsT = 0; fpsN = 0; }
}
image();
