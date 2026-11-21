// Chargement des modèles 3D Kenney (licence CC0) enregistrés dans site/models/kenney.
// Tous les modèles Kenney ont leur face avant tournée vers +z, comme nos propres meubles.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { grp } from './outils.js';

const MEUBLES = [
  'desk', 'chairDesk', 'computerKeyboard', 'bookcaseClosedWide', 'loungeSofa', 'loungeDesignSofa', 'loungeChair',
  'tableCoffee', 'stoolBar', 'pottedPlant', 'plantSmall1', 'plantSmall2', 'plantSmall3', 'kitchenFridge',
  'kitchenCoffeeMachine', 'lampRoundFloor', 'trashcan', 'speaker', 'cardboardBoxClosed',
];
const NATURE = [
  'tree_pineTallA', 'tree_pineDefaultA', 'tree_pineRoundB', 'tree_pineSmallA', 'rock_largeA', 'rock_largeC',
  'rock_smallA', 'stone_largeB', 'stone_tallA', 'stone_tallC', 'plant_bush', 'plant_bushSmall',
  'flower_redA', 'flower_yellowA', 'flower_purpleA', 'grass',
];

// Bornes d'arcade, flipper, machine à pinces… du kit Kenney « Mini Arcade » (CC0)
const ARCADE = ['arcade-machine', 'claw-machine', 'pinball', 'vending-machine', 'ticket-machine'];

// Échelle qui met le kit de mobilier Kenney à la taille de nos agents (un bureau ≈ 1,4 de large, 0,73 de haut).
export const ECHELLE_MEUBLES = 1.92;
// Échelle du kit Mini Arcade : une borne d'arcade fait alors environ 1,75 de haut.
export const ECHELLE_ARCADE = 2.4;

const modeles = {};

export async function chargerModeles(progression = () => {}) {
  const loader = new GLTFLoader();
  const liste = [...MEUBLES.map(n => ['furniture-kit', n]), ...NATURE.map(n => ['nature-kit', n]), ...ARCADE.map(n => ['mini-arcade', n])];
  let faits = 0;
  await Promise.all(liste.map(async ([kit, nom]) => {
    try {
      const gltf = await loader.loadAsync(`models/kenney/${kit}/${nom}.glb`);
      const racine = gltf.scene;
      racine.updateMatrixWorld(true);
      modeles[nom] = { racine, boite: new THREE.Box3().setFromObject(racine), kit };
    } catch (e) {
      console.warn('Modèle introuvable :', nom, e);
    }
    progression(++faits / liste.length);
  }));
}

export const aModele = (nom) => !!modeles[nom];

/**
 * Pose une copie d'un modèle : centrée en x/z sur (x, z), posée au sol (y), tournée de r.
 * o.s : échelle (par défaut celle du mobilier pour le kit meubles, 1 pour la nature)
 * o.h / o.w : impose une hauteur ou une largeur
 * o.teinte : { nomDeMatériau: couleur } pour recolorer une copie (ex. tissu d'un canapé)
 */
export function poser(parent, nom, x, z, r = 0, o = {}) {
  const m = modeles[nom];
  if (!m) return null;
  const taille = m.boite.getSize(new THREE.Vector3()), centre = m.boite.getCenter(new THREE.Vector3());
  let s = o.s ?? ({ 'furniture-kit': ECHELLE_MEUBLES, 'mini-arcade': ECHELLE_ARCADE }[m.kit] || 1);
  if (o.h) s = o.h / taille.y;
  if (o.w) s = o.w / taille.x;
  const pivot = grp(parent, x, o.y || 0, z, r);
  const copie = m.racine.clone(true);
  copie.scale.multiplyScalar(s);
  copie.position.set(-centre.x * s, -m.boite.min.y * s, -centre.z * s);
  copie.traverse((n) => {
    if (!n.isMesh) return;
    n.castShadow = o.ombre ?? true; n.receiveShadow = true;
    const t = o.teinte && o.teinte[n.material.name];
    if (t) { n.material = n.material.clone(); n.material.color.set(t); }
  });
  pivot.add(copie);
  pivot.userData.taille = taille.clone().multiplyScalar(s);
  return pivot;
}
