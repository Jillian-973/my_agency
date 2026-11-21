// Qualité des graphismes, en deux niveaux :
// - « élevés » : matériaux physiques (reflets doux, brillance des vitres et des métaux) éclairés par une ambiance de ciel
//   (un dôme dégradé et un soleil, calculés une fois au démarrage), lumière de jour douce ;
// - « légers » : matériaux Lambert, bien plus simples à calculer, pour les ordinateurs qui peinent.
// On passe de l'un à l'autre sans rien reconstruire : chaque objet garde son matériau physique de côté.
import * as THREE from 'three';

const LUMIERES = {
  eleve: { ciel: .25, soleil: 2.6, exposition: .95, reflets: .65 },   // réglés à l'œil : contraste franc, reflets discrets
  leger: { ciel: 1.15, soleil: 2.5, exposition: 1.05 },
};

/** Ambiance de ciel pour les reflets : dôme bleu en haut, horizon clair, sol chaud, et un soleil. Notre propre scène. */
function ambianceDeCiel(renderer, directionSoleil) {
  const sceneCiel = new THREE.Scene();
  const dome = new THREE.SphereGeometry(10, 48, 24);
  const couleurs = [], p = dome.attributes.position;
  const zenith = new THREE.Color('#78b4ff'), horizon = new THREE.Color('#f1f6ff').multiplyScalar(1.35), sol = new THREE.Color('#c4a57c').multiplyScalar(.55);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const h = p.getY(i) / 10;
    if (h >= 0) c.copy(horizon).lerp(zenith, Math.pow(h, .6)); else c.copy(horizon).lerp(sol, Math.min(1, -h * 3));
    couleurs.push(c.r, c.g, c.b);
  }
  dome.setAttribute('color', new THREE.Float32BufferAttribute(couleurs, 3));
  sceneCiel.add(new THREE.Mesh(dome, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const soleil = new THREE.Mesh(new THREE.SphereGeometry(.9, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff2d8').multiplyScalar(14) }));
  soleil.position.copy(directionSoleil).normalize().multiplyScalar(8.5);
  sceneCiel.add(soleil);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const cible = pmrem.fromScene(sceneCiel, .03);
  pmrem.dispose(); dome.dispose(); soleil.geometry.dispose();
  return cible.texture;
}

export function creerGraphismes({ renderer, scene, soleil, ciel, versLambert }) {
  let niveau = null, ambiance = null;

  /** Reflets d'un matériau physique : discrets partout, plus marqués sur les vitres (transparentes et lisses). */
  const regles = new WeakSet();
  function regler1(m) {
    if (!m.isMeshStandardMaterial || regles.has(m)) return;
    regles.add(m);
    if (m.transparent && m.roughness < .3) { m.envMapIntensity = 1.6; m.roughness = .05; m.metalness = .15; }
    else m.envMapIntensity = LUMIERES.eleve.reflets;
  }

  /** Met un objet (et ses enfants) au niveau courant : matériau physique, ou sa version Lambert. */
  function appliquer(objet) {
    objet.traverse((o) => {
      if (!o.isMesh) return;
      const liste = Array.isArray(o.material) ? o.material : [o.material];
      const physiques = o.userData.physique || liste;
      if (niveau === 'leger') {
        if (!o.userData.physique) o.userData.physique = liste;
        const l = physiques.map(m => (m.isMeshStandardMaterial ? versLambert(m) : m));
        o.material = Array.isArray(o.material) ? l : l[0];
      } else {
        if (o.userData.physique) { o.material = Array.isArray(o.material) ? physiques : physiques[0]; delete o.userData.physique; }
        if (niveau === 'eleve') for (const m of [].concat(o.material)) regler1(m);
      }
    });
  }

  function regler(n) {
    if (n === niveau) return;
    niveau = n;
    if (n === 'eleve' && !ambiance) ambiance = ambianceDeCiel(renderer, soleil.position);
    scene.environment = n === 'eleve' ? ambiance : null;
    const l = LUMIERES[n];
    ciel.intensity = l.ciel; soleil.intensity = l.soleil; renderer.toneMappingExposure = l.exposition;
    appliquer(scene);
    if (n === 'eleve') scene.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) regler1(m); });
    renderer.shadowMap.needsUpdate = true;
  }

  return { regler, appliquer, niveau: () => niveau };
}

/** Ombre douce posée au sol sous un personnage qui marche (les ombres du soleil ne sont recalculées qu'à l'arrêt). */
let texOmbre = null;
export function ombrePortee(groupe, taille = .75) {
  if (!texOmbre) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), d = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    d.addColorStop(0, 'rgba(0,0,0,.55)'); d.addColorStop(.6, 'rgba(0,0,0,.22)'); d.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = d; g.fillRect(0, 0, 64, 64);
    texOmbre = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(taille, taille), new THREE.MeshBasicMaterial({ map: texOmbre, transparent: true, depthWrite: false, toneMapped: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = .015; m.renderOrder = 1;
  m.userData.keep = true;
  groupe.add(m);
  return m;
}
