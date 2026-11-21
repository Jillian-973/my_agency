// Les détails un peu fous du QG :
// - à la salle de sport, quelqu'un travaille sur son ordinateur… en marchant sur un tapis de course ;
// - un drone part du comptoir du café, survole les murs et dépose un café sur le bureau d'un agent, puis revient ;
// - un robot aspirateur fait le ménage dans le Hall, en se cognant poliment aux meubles.
import * as THREE from 'three';
import { grp, box, cyl, sph, glow, mat } from './outils.js';
import { personnage, lookFigurant } from './mobilier.js';
import { tasse } from './details.js';

export function creerFous({ scene, zones, sol, collisions, agentsPoses, compacter = () => {} }) {
  const Z = (id) => zones.find(z => z.id === id);
  const hasard = (a, b) => a + Math.random() * (b - a);
  const morceaux = [], objets = {};          // objets : pour regarder depuis la console (débogage)

  /* ---------- le tapis de course ---------- */
  {
    const s = Z('sport');
    if (s) {
      const tx = s.x - 1.8, tz = s.z - 3.0, y0 = sol(tx, tz) ?? 0;
      // ordinateur portable posé sur la console du tapis
      const pc = grp(scene, tx - .08, y0 + 1.5, tz - .74, Math.PI);
      box(pc, .34, .02, .24, 0, 0, 0, '#cbd5e1');
      const ecran = grp(pc, 0, .02, .11); ecran.rotation.x = .35; box(ecran, .34, .22, .015, 0, 0, 0, '#cbd5e1'); box(ecran, .3, .18, .005, 0, .02, -.01, glow('#7dd3fc'));
      const coureur = personnage(scene, tx, tz + .2, Math.PI, lookFigurant(Math.random), 'stand');
      coureur.position.y = y0 + .2;
      compacter(coureur); objets.coureur = coureur;
      const { jambes, brasDebout } = coureur.userData;
      morceaux.push((t) => {
        const pas = Math.sin(t * 6.5);
        jambes.forEach((j, n) => { j.rotation.x = pas * .5 * (n ? -1 : 1); });
        brasDebout.forEach((b, n) => { b.rotation.x = -1.35 + Math.sin(t * 15 + n * 2) * .08; });   // il tape sur son clavier
        coureur.position.y = y0 + .2 + Math.abs(pas) * .03;
      });
    }
  }

  /* ---------- le drone livreur de café ---------- */
  {
    const c = Z('cafe');
    if (c) {
      const maison = new THREE.Vector3(c.x - 3.8, (sol(c.x - 3.8, c.z + 1.2) ?? 0) + 1.08, c.z + 1.2);   // sur le comptoir du café
      const drone = grp(scene, maison.x, maison.y, maison.z);
      const corps = grp(drone);
      box(corps, .22, .07, .22, 0, 0, 0, '#1f2937'); box(corps, .14, .03, .14, 0, .07, 0, '#facc15');
      sph(corps, .025, 0, .04, .115, glow('#22d3ee'), 0);
      const helices = [];
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const bras = box(corps, .26, .025, .03, sx * .13, .03, sz * .13, '#334155'); bras.rotation.y = sx * sz > 0 ? -Math.PI / 4 : Math.PI / 4;
        cyl(corps, .02, .02, .05, sx * .2, .03, sz * .2, '#111827', 6);
        const h = cyl(corps, .1, .1, .006, sx * .2, .085, sz * .2, mat('#94a3b8', { transparent: true, opacity: .45 }), 12);
        helices.push(h);
      }
      corps.traverse(o => { o.castShadow = false; });
      objets.drone = drone;
      const fil = box(drone, .006, .2, .006, 0, -.2, 0, '#e5e7eb');
      let colis = null; objets.etatDrone = () => etat.phase;                                       // la tasse suspendue sous le drone
      const deposees = [];                                    // { tasse, quand }
      const etat = { phase: 'repos', jusqua: performance.now() + hasard(4000, 9000), cible: null, haut: 0 };
      const avancer = (vers, vitesse, dt) => {
        const d = vers.clone().sub(drone.position), l = d.length();
        if (l < 1e-3) return true;
        const pas = Math.min(l, vitesse * dt);
        drone.position.addScaledVector(d.divideScalar(l), pas);
        corps.rotation.z += ((d.x * -.25) - corps.rotation.z) * Math.min(1, dt * 4);   // il penche dans le sens du vol
        corps.rotation.x += ((d.z * .25) - corps.rotation.x) * Math.min(1, dt * 4);
        return pas >= l - 1e-4;
      };
      const v = new THREE.Vector3();
      function choisirBureau() {
        const candidats = agentsPoses.filter(p => p.groupe.visible && !p.sortie);
        if (!candidats.length) return null;
        const p = candidats[Math.floor(Math.random() * candidats.length)];
        const a = new THREE.Vector3(); p.groupe.getWorldPosition(a); p.groupe.getWorldDirection(v); v.y = 0; v.normalize();
        const x = a.x + v.x * .55 + v.z * .32, z = a.z + v.z * .55 - v.x * .32;        // sur le bureau, un peu sur le côté du clavier
        return { pose: p, point: new THREE.Vector3(x, (sol(x, z) ?? a.y) + .755, z) };
      }
      morceaux.push((t, dt) => {
        const maintenant = performance.now();
        for (const h of helices) h.rotation.y += dt * (etat.phase === 'repos' ? 3 : 45);
        if (etat.phase !== 'repos') drone.position.y += Math.sin(t * 3) * .0008;
        for (let i = deposees.length - 1; i >= 0; i--) if (maintenant - deposees[i].quand > 60000) { scene.remove(deposees[i].tasse); deposees.splice(i, 1); }
        switch (etat.phase) {
          case 'repos':
            corps.rotation.set(0, 0, 0); fil.visible = false;
            if (maintenant > etat.jusqua) {
              etat.cible = choisirBureau();
              if (!etat.cible) { etat.jusqua = maintenant + 5000; break; }
              colis = tasse(drone, 0, -.42, 0, ['#ffffff', '#fde68a', '#fbcfe8', '#bfdbfe'][Math.floor(Math.random() * 4)]);
              colis.traverse(o => { o.castShadow = false; });
              fil.visible = true;
              etat.haut = Math.max(maison.y, etat.cible.point.y) + 2.6;
              etat.phase = 'monte';
            }
            break;
          case 'monte': if (avancer(new THREE.Vector3(maison.x, etat.haut, maison.z), 1.6, dt)) etat.phase = 'aller'; break;
          case 'aller': if (avancer(new THREE.Vector3(etat.cible.point.x, etat.haut, etat.cible.point.z), 3.2, dt)) etat.phase = 'descend'; break;
          case 'descend':
            if (avancer(new THREE.Vector3(etat.cible.point.x, etat.cible.point.y + .5, etat.cible.point.z), 1.2, dt)) {
              // la tasse est posée sur le bureau ; elle y reste une minute
              const pos = new THREE.Vector3(); colis.getWorldPosition(pos); drone.remove(colis);
              colis.position.set(etat.cible.point.x, etat.cible.point.y, etat.cible.point.z); scene.add(colis);
              deposees.push({ tasse: colis, quand: maintenant }); colis = null; fil.visible = false;
              if (deposees.length > 5) scene.remove(deposees.shift().tasse);
              etat.phase = 'remonte'; etat.jusqua = maintenant + 600;
            }
            break;
          case 'remonte': if (maintenant > etat.jusqua && avancer(new THREE.Vector3(etat.cible.point.x, etat.haut, etat.cible.point.z), 1.6, dt)) etat.phase = 'retour'; break;
          case 'retour': if (avancer(new THREE.Vector3(maison.x, etat.haut, maison.z), 3.2, dt)) etat.phase = 'pose'; break;
          case 'pose': if (avancer(maison, 1.2, dt)) { etat.phase = 'repos'; etat.jusqua = maintenant + hasard(8000, 18000); } break;
        }
      });
    }
  }

  /* ---------- le robot aspirateur du Hall ---------- */
  {
    const h = Z('hall');
    if (h) {
      const robot = grp(scene, h.x - 2, sol(h.x - 2, h.z + 2) ?? 0, h.z + 2);
      cyl(robot, .17, .17, .07, 0, 0, 0, '#e5e7eb', 18); cyl(robot, .12, .12, .012, 0, .07, 0, '#1f2937', 18);
      const led = sph(robot, .018, 0, .085, .1, glow('#22c55e'), 0);
      box(robot, .2, .03, .03, 0, .02, .16, '#94a3b8');
      robot.traverse(o => { o.castShadow = false; }); objets.robot = robot;
      const r = { cap: Math.random() * Math.PI * 2, tourne: 0, vers: 0 };
      const dedans = (x, z) => Math.abs(x - h.x) < h.w / 2 - .35 && Math.abs(z - h.z) < h.d / 2 - .35;
      morceaux.push((t, dt) => {
        led.material = glow(Math.sin(t * 4) > 0 ? '#22c55e' : '#16a34a');
        if (r.tourne > 0) {                                   // il pivote sur place après un choc
          r.tourne -= dt; robot.rotation.y += r.vers * dt;
          if (r.tourne <= 0) r.cap = robot.rotation.y;
          return;
        }
        const nx = robot.position.x + Math.sin(r.cap) * .38 * dt, nz = robot.position.z + Math.cos(r.cap) * .38 * dt;
        const s = sol(nx, nz);
        if (s === null || !dedans(nx, nz) || collisions.bloque(nx + Math.sin(r.cap) * .05, nz + Math.cos(r.cap) * .05, .19, s - .25)) {
          r.tourne = hasard(.6, 1.3); r.vers = (Math.random() < .5 ? -1 : 1) * hasard(2, 3.2);
          return;
        }
        robot.position.set(nx, s + .004, nz); robot.rotation.y = r.cap;
        if (Math.random() < dt * .08) { r.tourne = hasard(.4, .9); r.vers = (Math.random() < .5 ? -1 : 1) * 2.5; }   // une idée soudaine
      });
    }
  }

  let t = 0;
  return { mettreAJour(dt) { t += dt; for (const f of morceaux) f(t, dt); }, objets };
}
