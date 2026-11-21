// Portrait d'un agent pour sa fiche : son personnage en buste, rendu une seule fois à l'ouverture de la fiche
// dans un petit canevas (un second moteur de rendu, minuscule, réutilisé d'une fiche à l'autre).
import * as THREE from 'three';
import { personnage } from './mobilier.js';

let moteur = null, scene = null, camera = null, modele = null;

function preparer() {
  moteur = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  moteur.setPixelRatio(Math.min(devicePixelRatio, 2));
  moteur.setSize(96, 96, false);
  moteur.outputColorSpace = THREE.SRGBColorSpace;
  moteur.toneMapping = THREE.ACESFilmicToneMapping; moteur.toneMappingExposure = 1.05;
  moteur.domElement.className = 'portrait-3d';
  moteur.domElement.setAttribute('aria-hidden', 'true');
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xd6ecff, 0x9a7b55, 1.3));
  const soleil = new THREE.DirectionalLight(0xfff0d6, 2.2); soleil.position.set(1.5, 3, 2.5); scene.add(soleil);
  camera = new THREE.PerspectiveCamera(30, 1, .1, 20);
  camera.position.set(1.0, 1.58, 2.7);
  camera.lookAt(0, 1.22, 0);
}

/** Dessine le buste d'un agent (apparence = look de mobilier.js) et renvoie le canevas à placer dans la fiche. */
export function portrait(look) {
  if (!moteur) preparer();
  if (modele) scene.remove(modele);                 // les formes sont partagées : on retire sans rien détruire
  modele = personnage(scene, 0, 0, 0, { ...look, siege: false }, 'stand');
  modele.rotation.y = .35;
  moteur.render(scene, camera);
  return moteur.domElement;
}
