// Les agents qui quittent leur bureau, pour deux raisons :
// - la réunion : les agents cochés marchent jusqu'à la salle de réunion, s'assoient autour de la table (debout autour
//   quand les chaises sont prises), puis rentrent à leur bureau à la fin de la réunion ;
// - la pause : un agent en pause va boire un café ou jouer à l'arcade, puis revient (c'est foule.js qui décide).
// Pendant une sortie, le corps assis reste caché au bureau (sa chaise vide est à sa place) ; un corps debout marche
// (marche.js) le long d'un chemin calculé sur la grille du sol (chemins.js), et l'étiquette de l'agent le suit.
import * as THREE from 'three';
import { anim } from './outils.js';
import { personnage, chair, majEtiquette } from './mobilier.js';

export function creerReunion({ scene, zones, agentsPoses, sol, chemins, marche, compacter = () => {}, ombres = () => {}, quandChange = () => {} }) {
  const salle = zones.find(z => z.id === 'reunion');
  const { itineraire } = chemins;

  /* ---------- places dans la salle de réunion : les 8 chaises, puis debout autour ---------- */
  const centre = { x: salle.x, z: salle.z + .3 };
  const places = [
    ...[-1.2, 0, 1.2].map(x => ({ x, z: -.62, r: 0 })), ...[-1.2, 0, 1.2].map(x => ({ x, z: 1.22, r: Math.PI })),
    { x: -2.25, z: .3, r: Math.PI / 2 }, { x: 2.25, z: .3, r: -Math.PI / 2 },
  ].map(p => ({ x: salle.x + p.x, z: salle.z + p.z, r: p.r, assise: true, prise: null }));
  const debout = [];
  for (const lz of [-1.75, 2.2]) for (let lx = -2.7; lx <= 2.71; lx += .6) {
    const x = salle.x + lx, z = salle.z + lz;
    if (chemins.libre(x, z)) debout.push({ x, z, r: Math.atan2(centre.x - x, centre.z - z), assise: false, prise: null });
  }
  debout.sort((a, b) => Math.hypot(a.x - centre.x, a.z - centre.z) - Math.hypot(b.x - centre.x, b.z - centre.z));
  places.push(...debout);
  const placeLibrePres = (x, z) => {
    const libres = places.filter(p => !p.prise), chaises = libres.filter(p => p.assise);
    const d = (p) => Math.hypot(p.x - x, p.z - z);
    return (chaises.length ? chaises : libres).reduce((best, p) => (!best || d(p) < d(best) ? p : best), null);   // les chaises d'abord
  };

  /* ---------- corps : debout pour marcher, assis à la table ---------- */
  const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), ech = new THREE.Vector3();
  const jeter = (o) => { scene.remove(o); o.traverse(m => { if (m.isMesh && m.geometry) m.geometry.dispose(); }); };
  function corpsDebout(pose, x, z, r) {
    const g = personnage(scene, x, z, r, pose.groupe.userData.look, 'stand');
    g.position.y = sol(x, z) ?? 0;
    g.userData.poseAgent = pose;
    compacter(g);
    return g;
  }
  function corpsAssis(pose, place) {
    const n = anim.length;
    const g = personnage(scene, place.x, place.z, place.r, { ...pose.groupe.userData.look, siege: false }, 'sit', 'en attente');
    anim.splice(n);                                  // pas d'animation de clavier ici (et rien qui s'accumule d'une sortie à l'autre)
    g.position.y = sol(place.x, place.z) ?? 0;
    g.userData.poseAgent = pose;
    compacter(g);
    return g;
  }
  function changerCorps(pose, nouveau) {
    const s = pose.sortie;
    if (s.corps) { marche.arreter(s.corps); jeter(s.corps); }
    s.corps = nouveau; pose.corps = nouveau;
    nouveau.add(pose.etiquette.sprite);              // l'étiquette suit l'agent
  }

  /* ---------- se lever, aller quelque part, rentrer ---------- */
  function lever(pose) {
    // le corps assis disparaît, la chaise vide reste au bureau
    pose.groupe.updateMatrixWorld(true);
    pose.groupe.matrixWorld.decompose(pos, quat, ech);
    const vide = new THREE.Group(); vide.position.copy(pos); vide.quaternion.copy(quat);
    if (pose.groupe.userData.look.siege !== false) chair(vide, 0, -.02, 0, pose.groupe.userData.look.chair);
    scene.add(vide);
    pose.sortie = { bureau: { x: pos.x, z: pos.z }, chaiseVide: vide, corps: null };
    pose.groupe.visible = false;
  }
  const ici = (pose) => (pose.sortie && pose.sortie.corps ? { x: pose.sortie.corps.position.x, z: pose.sortie.corps.position.z } : null);
  function bureauDe(pose) { pose.groupe.updateMatrixWorld(true); pose.groupe.matrixWorld.decompose(pos, quat, ech); return { x: pos.x, z: pos.z }; }
  function allerA(pose, chemin, quandArrive) {
    const s = pose.sortie, depart = chemin[0];
    changerCorps(pose, corpsDebout(pose, depart.x, depart.z, s.corps ? s.corps.rotation.y : pose.groupe.rotation.y));
    marche.marcher(s.corps, chemin, () => { quandArrive(); quandChange(); });
  }
  /** Retour au bureau ; à défaut de chemin, celui de l'aller à l'envers (l'agent est bien venu par là). */
  function rentrer(pose) {
    const s = pose.sortie;
    if (!s || s.etape === 'retour') return;
    const depart = ici(pose) || s.bureau, surPlace = s.etape === 'sur-place';
    if (s.place) { s.place.prise = null; s.place = null; }
    if (s.liberer) { s.liberer(); s.liberer = null; }
    s.etape = 'retour';
    pose.enReunion = false; majEtiquette(pose);
    const chemin = itineraire(depart, s.bureau) || (surPlace ? [...s.aller].reverse() : [depart, ...[...s.aller].reverse()]);
    allerA(pose, chemin, () => {
      // de retour : l'agent se rassoit à son bureau, comme avant
      jeter(s.corps); scene.remove(s.chaiseVide);
      pose.groupe.visible = true; pose.groupe.add(pose.etiquette.sprite);
      pose.corps = null; pose.sortie = null; pose.lieu = null; majEtiquette(pose);
      ombres();
    });
    quandChange();
  }

  /* ---------- réunion ---------- */
  function inviter(liste) {
    let n = 0;
    for (const pose of liste) {
      const s = pose.sortie;
      if (s && s.motif === 'reunion' && s.etape !== 'retour') continue;          // déjà en réunion ou en route
      const depart = ici(pose) || bureauDe(pose);
      const place = placeLibrePres(depart.x, depart.z), chemin = place && itineraire(depart, place);
      if (!chemin) { console.warn(`Réunion : aucun chemin pour ${pose.agent.prenom}, il reste où il est.`); continue; }
      if (!pose.sortie) lever(pose);
      const m = pose.sortie;
      if (m.place) m.place.prise = null;
      if (m.liberer) { m.liberer(); m.liberer = null; }                       // il quitte sa pause pour la réunion
      Object.assign(m, { motif: 'reunion', etape: 'aller', place, aller: chemin });
      place.prise = pose;
      pose.enReunion = true; pose.lieu = 'reunion'; majEtiquette(pose);
      allerA(pose, chemin, () => {
        m.etape = 'sur-place';
        if (place.assise) changerCorps(pose, corpsAssis(pose, place));
        else m.corps.rotation.y = place.r;
      });
      n++;
    }
    if (n) { ombres(); quandChange(); }
    return n;
  }
  function terminer() {
    for (const pose of agentsPoses) if (pose.sortie && pose.sortie.motif === 'reunion') rentrer(pose);
    quandChange();
  }

  /* ---------- pause : aller à un endroit (café, arcade…), y rester, revenir (foule.js mène la danse) ---------- */
  /** endroit : { x, z, r, zone } ; liberer() est appelé quand l'agent quitte l'endroit. Renvoie vrai si l'agent part. */
  function pause(pose, endroit, quandSurPlace = () => {}, liberer = () => {}) {
    if (pose.sortie || pose.enTache) return false;
    const depart = bureauDe(pose), chemin = itineraire(depart, endroit);
    if (!chemin) return false;
    lever(pose);
    const m = pose.sortie;
    Object.assign(m, { motif: 'pause', etape: 'aller', aller: chemin, liberer });
    pose.lieu = endroit.zone;
    allerA(pose, chemin, () => { m.etape = 'sur-place'; m.corps.rotation.y = endroit.r; quandSurPlace(m.corps); });
    ombres(); quandChange();
    return true;
  }

  // pour l'onglet « Équipe » : étapes de la réunion seulement ('aller', 'reunion', 'retour')
  const etape = (pose) => {
    const s = pose.sortie;
    if (!s || (s.motif !== 'reunion' && !(s.etape === 'retour' && s.motif === 'reunion'))) return null;
    return s.etape === 'sur-place' ? 'reunion' : s.etape;
  };
  const enPause = (pose) => !!(pose.sortie && pose.sortie.motif === 'pause' && pose.sortie.etape !== 'retour');
  const presents = () => agentsPoses.filter(p => p.sortie && p.sortie.motif === 'reunion' && p.sortie.etape !== 'retour').length;
  return { inviter, terminer, pause, rentrer, etape, enPause, presents, places: places.length, itineraire, traverseMur: chemins.traverseMur };
}
