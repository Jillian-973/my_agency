// Étiquettes : celles des salles et celles des agents (prénom, poste, état).
// Leur taille à l'écran est bornée en pixels, quelle que soit la fenêtre ou le zoom.
import * as THREE from 'three';
import { ETATS } from './donnees.js';

const salles = [];   // { sprite, base }
const agents = [];   // { sprite, base, data, dessiner }

function texture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function sprite(tex, w, h) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(w, h, 1); s.renderOrder = 10;
  return s;
}

/** Étiquette d'une salle (ou de quoi que ce soit) : pastille de couleur + texte. */
export function etiquette(texte, couleur, x, y, z, parent, hauteur = 1.35) {
  const c = document.createElement('canvas'), g = c.getContext('2d');
  const fs = 44, font = `${fs}px "Kenney Future Narrow", system-ui, "Segoe UI", sans-serif`;
  g.font = font; const tw = g.measureText(texte).width;
  c.width = Math.ceil(tw + fs * 2.3); c.height = Math.ceil(fs * 1.9);
  g.font = font;
  const rr = c.height / 2;
  g.fillStyle = 'rgba(255,255,255,.95)'; g.beginPath(); g.roundRect(2, 2, c.width - 4, c.height - 4, rr - 2); g.fill();
  g.strokeStyle = couleur; g.lineWidth = 4; g.stroke();
  g.fillStyle = couleur; g.beginPath(); g.arc(rr + 4, c.height / 2, fs * .28, 0, 7); g.fill();
  g.fillStyle = '#1f2937'; g.textBaseline = 'middle'; g.fillText(texte, rr + fs * .55 + 4, c.height / 2 + 2);
  const s = sprite(texture(c), hauteur * c.width / c.height, hauteur);
  s.position.set(x, y, z);
  salles.push({ sprite: s, base: s.scale.clone() });
  parent.add(s);
  return s;
}

/** Étiquette d'un agent, au-dessus de sa tête : prénom, poste, état (avec sa pastille de couleur). */
export function etiquetteAgent(data, couleurPole, parent) {
  const c = document.createElement('canvas'), g = c.getContext('2d');
  const s = sprite(texture(c), 1, 1);
  const item = { sprite: s, base: new THREE.Vector3(), data, canvas: c };
  item.dessiner = () => {
    const nomF = '42px "Kenney Future", system-ui, sans-serif', posteF = '500 30px Inter, system-ui, sans-serif', etatF = '600 28px Inter, system-ui, sans-serif';   // nom en sci-fi, le reste en Inter
    g.font = nomF; const w1 = g.measureText(data.prenom).width;
    g.font = posteF; const w2 = g.measureText(data.poste).width;
    const etat = item.etat || data.etat;       // item.etat : état provisoire (une tâche confiée tourne)
    g.font = etatF; const w3 = g.measureText(etat).width + 34;
    const pad = 22, W = Math.ceil(Math.max(w1, w2, w3) + pad * 2), H = 150;
    c.width = W; c.height = H + 14;
    g.fillStyle = 'rgba(255,255,255,.96)'; g.beginPath(); g.roundRect(3, 3, W - 6, H - 6, 22); g.fill();
    g.strokeStyle = couleurPole; g.lineWidth = 5; g.stroke();
    g.fillStyle = 'rgba(255,255,255,.96)'; g.beginPath(); g.moveTo(W / 2 - 13, H - 4); g.lineTo(W / 2 + 13, H - 4); g.lineTo(W / 2, H + 11); g.fill();
    g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    g.fillStyle = '#111827'; g.font = nomF; g.fillText(data.prenom, pad, 50);
    g.fillStyle = '#4b5563'; g.font = posteF; g.fillText(data.poste, pad, 90);
    const ec = (ETATS[etat] || ETATS['en attente']).couleur;
    g.fillStyle = ec; g.beginPath(); g.arc(pad + 10, 121, 10, 0, 7); g.fill();
    g.fillStyle = '#1f2937'; g.font = etatF; g.fillText(etat, pad + 30, 131);
    s.material.map.dispose(); s.material.map = texture(c); s.material.needsUpdate = true;
    const h = 1.7; item.base.set(h * c.width / c.height, h, 1);
    s.scale.copy(item.base);
  };
  item.dessiner();
  s.renderOrder = 11;        // au-dessus des étiquettes de salles
  s.position.set(0, 2.05, 0);
  s.center.set(.5, 0);       // la pointe de la bulle est en bas, juste au-dessus de la tête
  agents.push(item);
  parent.add(s);
  return item;
}

/**
 * En visite à la première personne : les étiquettes de salles disparaissent ; celles des agents gardent
 * une taille réelle (environ 55 cm de haut), ne s'affichent qu'à moins de 7 m et sont cachées par les murs.
 */
const pa = new THREE.Vector3();
export function ajusterEtiquettesVisite(camPos) {
  cle = '';
  for (const e of salles) e.sprite.visible = false;
  for (const e of agents) {
    e.sprite.material.depthTest = true;
    e.sprite.scale.copy(e.base).multiplyScalar(.55 / 1.7);
    e.sprite.getWorldPosition(pa);
    const d = pa.distanceTo(camPos);
    const a = THREE.MathUtils.clamp((7.5 - d) / 2, 0, 1);
    e.sprite.material.opacity = a; e.sprite.visible = a > .01;
  }
}
export function quitterEtiquettesVisite() {
  for (const e of salles) e.sprite.visible = true;
  for (const e of agents) e.sprite.material.depthTest = false;
  cle = '';
}

/** Ajuste la taille (bornée en pixels) et la visibilité des étiquettes à chaque changement de vue. */
let cle = '';
export function ajusterEtiquettes(camera, hauteurEcran) {
  const k = camera.zoom.toFixed(4) + '_' + hauteurEcran + '_' + camera.top;
  if (k === cle) return;
  cle = k;
  const mondeParPx = (camera.top - camera.bottom) / camera.zoom / hauteurEcran;
  // salles : entre 20 et 28 px de haut
  const pxS = THREE.MathUtils.clamp(1.35 / mondeParPx, 20, 28), ks = pxS / 1.35 * mondeParPx;
  for (const e of salles) e.sprite.scale.copy(e.base).multiplyScalar(ks);
  // agents : entre 54 et 70 px, visibles seulement quand on est assez près (sinon la vue serait illisible)
  const pxA = THREE.MathUtils.clamp(1.7 / mondeParPx, 54, 70), ka = pxA / 1.7 * mondeParPx;
  const alpha = THREE.MathUtils.clamp((camera.zoom - 1.25) / .45, 0, 1);
  for (const e of agents) {
    e.sprite.scale.copy(e.base).multiplyScalar(ka);
    e.sprite.material.opacity = alpha; e.sprite.visible = alpha > .01;
  }
}
