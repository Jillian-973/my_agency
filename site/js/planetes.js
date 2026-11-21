// Le ciel du QG : des planètes (images du kit Kenney « Planets », CC0) en orbite autour du bureau, chacune à sa
// distance, et la Lune — le satellite le plus proche — dont la phase suit celle de la vraie Lune.
import * as THREE from 'three';

// Orbites : rayon, hauteur, diamètre, image. Plus une planète est loin, plus elle tourne lentement (comme Kepler).
const ORBITES = [
  { img: 'planet03', r: 42, y: 3, t: 4.2 },
  { img: 'planet06', r: 49, y: 11, t: 5.2 },
  { img: 'planet01', r: 56, y: 5, t: 6.4 },
  { img: 'planet09', r: 63, y: 16, t: 7.6 },
  { img: 'planet04', r: 70, y: 8, t: 9.0 },
  { img: 'planet07', r: 78, y: 20, t: 10.4 },
  { img: 'planet00', r: 86, y: 12, t: 11.8 },
  { img: 'planet08', r: 95, y: 24, t: 13.5 },
];
const PERIODE_REF = 110;            // secondes pour un tour à 40 m du centre
const LUNE = { r: 35, y: 9, t: 3.2, periode: 70 };

/* ---------- phase de la Lune ---------- */
const MOIS_SYNODIQUE = 29.530588853;                       // jours entre deux nouvelles lunes
const NOUVELLE_LUNE_REF = Date.UTC(2000, 0, 6, 18, 14) / 864e5;   // nouvelle lune du 6 janvier 2000, 18 h 14 UTC
/** Fraction du cycle lunaire : 0 nouvelle lune, 0,25 premier quartier, 0,5 pleine lune, 0,75 dernier quartier. */
export function phaseLune(date = new Date()) {
  const f = ((date.getTime() / 864e5 - NOUVELLE_LUNE_REF) / MOIS_SYNODIQUE) % 1;
  return f < 0 ? f + 1 : f;
}
export function nomPhase(f) {
  if (f < .03 || f > .97) return 'nouvelle lune';
  if (f < .22) return 'premier croissant';
  if (f < .28) return 'premier quartier';
  if (f < .47) return 'gibbeuse croissante';
  if (f < .53) return 'pleine lune';
  if (f < .72) return 'gibbeuse décroissante';
  if (f < .78) return 'dernier quartier';
  return 'dernier croissant';
}
export const eclairage = (f) => (1 - Math.cos(2 * Math.PI * f)) / 2;   // part du disque éclairée

export function creerCiel(scene) {
  const charger = new THREE.TextureLoader();
  const tex = (nom) => { const t = charger.load(`models/kenney/planets/${nom}.png`); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  const groupe = new THREE.Group(); scene.add(groupe);

  const planetes = ORBITES.map((o, i) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex(o.img), transparent: true, depthWrite: false }));
    s.scale.set(o.t, o.t, 1);
    groupe.add(s);
    return { s, ...o, depart: i * 2.39, periode: PERIODE_REF * Math.pow(o.r / 40, 1.5), penche: .06 + (i % 3) * .05 };
  });

  // La Lune : un disque toujours tourné vers la caméra, éclairé comme la vraie Lune vue de la Terre
  // (côté droit qui s'éclaire quand elle croît, comme dans l'hémisphère nord).
  const lune = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uMers: { value: tex('noise24') }, uPhase: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      varying vec2 vUv; uniform sampler2D uMers; uniform float uPhase;
      void main() {
        vec2 p = vUv * 2.0 - 1.0; float r2 = dot(p, p);
        if (r2 > 1.0) discard;
        vec3 n = vec3(p, sqrt(1.0 - r2));
        vec3 soleil = vec3(sin(uPhase), 0.0, -cos(uPhase));
        float jour = smoothstep(-0.05, 0.08, dot(n, soleil));
        vec4 mers = texture2D(uMers, vUv);
        vec3 sol = mix(vec3(0.90, 0.89, 0.85), vec3(0.55, 0.55, 0.56), mers.a * 0.85);
        vec3 c = sol * (0.07 + 0.93 * jour) * (0.78 + 0.22 * n.z);   // 0,07 : lumière cendrée
        gl_FragColor = vec4(c, smoothstep(1.0, 0.96, r2));
        #include <colorspace_fragment>
      }`,
  }));
  lune.scale.setScalar(LUNE.t);
  lune.userData.keep = true;
  groupe.add(lune);

  let phase = phaseLune(), prochaine = 0;
  const majPhase = () => { phase = phaseLune(); lune.material.uniforms.uPhase.value = phase * Math.PI * 2; };
  majPhase();

  return {
    phase: () => phase,
    mettreAJour(t, camera) {
      for (const p of planetes) {
        const a = p.depart + t * Math.PI * 2 / p.periode;
        p.s.position.set(Math.cos(a) * p.r, p.y + Math.sin(a * 2 + p.depart) * p.r * p.penche * .2, Math.sin(a) * p.r);
      }
      const a = 1.1 + t * Math.PI * 2 / LUNE.periode;
      lune.position.set(Math.cos(a) * LUNE.r, LUNE.y + Math.sin(a) * 1.5, Math.sin(a) * LUNE.r);
      lune.quaternion.copy(camera.quaternion);                 // toujours face à la caméra
      if (t > prochaine) { majPhase(); prochaine = t + 60; }   // la phase avance avec le temps réel
    },
  };
}
