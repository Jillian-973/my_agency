// Onglets discrets en bas de l'écran :
// - « Pôles » : parcourir chaque pôle puis chaque lieu commun, un par un (la caméra y vole, la fiche de la salle s'ouvre) ;
// - « Équipe » : ce que fait chaque agent en ce moment. Les tâches en cours viennent du serveur local (/api/etat) ;
//   pour les autres agents, c'est leur situation habituelle (donnees.js).
import { POLES, ETATS, AGENTS } from './donnees.js';
import { SANS_SERVEUR, appeler } from './api.js';

const PAUSE_OUVERT = 4000, PAUSE_FERME = 15000;   // rafraîchissement de l'onglet « Équipe » (ouvert / fermé)

export function creerOnglets({ zones, agentsPoses, allerVers, zoneActive, parler, desactive = () => false }) {
  const $ = (s, r = document) => r.querySelector(s);
  const barre = $('#onglets');
  const boutons = [...barre.querySelectorAll('[data-tiroir]')];
  const tiroirs = { poles: $('#tiroir-poles'), equipe: $('#tiroir-equipe') };
  let ouvert = null;

  function ouvrir(nom) {
    if (ouvert === nom) nom = null;                       // un second clic sur l'onglet le referme
    ouvert = nom;
    for (const b of boutons) b.setAttribute('aria-expanded', String(b.dataset.tiroir === nom));
    for (const [k, t] of Object.entries(tiroirs)) t.hidden = k !== nom;
    if (nom) document.body.dataset.tiroir = nom; else delete document.body.dataset.tiroir;
    if (nom === 'poles') ouvrirPoles();
    if (nom === 'equipe') { dessinerEquipe(); rafraichir(); }
  }
  boutons.forEach(b => b.addEventListener('click', () => ouvrir(b.dataset.tiroir)));
  for (const t of Object.values(tiroirs)) $('.fermer', t).addEventListener('click', () => ouvrir(null));
  // Échap referme d'abord l'onglet ouvert (la fenêtre d'un agent, au-dessus, garde la priorité)
  addEventListener('keydown', (e) => {
    if (!ouvert || e.code !== 'Escape' || desactive() || (e.target.closest && e.target.closest('input, textarea'))) return;
    e.preventDefault(); e.stopImmediatePropagation(); ouvrir(null);
  }, true);

  /* ---------- Pôles : les salles des pôles d'abord, puis le Quartier Général et chaque lieu commun ---------- */
  const salles = Object.values(POLES).map(p => p.salle);
  const ordre = [...salles, 'qg', ...zones.map(z => z.id).filter(id => !salles.includes(id) && id !== 'qg')]
    .map(id => zones.find(z => z.id === id)).filter(Boolean);
  const tp = tiroirs.poles, points = $('.points', tp);
  let indice = 0;
  const premierLieu = ordre.findIndex(z => !z.pole);
  ordre.forEach((z, i) => {
    if (i === premierLieu) { const sep = document.createElement('span'); sep.className = 'sep'; sep.setAttribute('aria-hidden', 'true'); points.append(sep); }
    const b = document.createElement('button');
    b.type = 'button'; b.title = z.nom; b.setAttribute('aria-label', z.nom); b.style.setProperty('--c', z.couleur);
    b.addEventListener('click', () => aller(i));
    points.append(b);
  });
  const boutonsPoints = [...points.querySelectorAll('button')];

  function ouvrirPoles() {
    const actif = zoneActive();
    const i = actif ? ordre.indexOf(actif) : -1;
    aller(i >= 0 ? i : indice);
  }
  function aller(i) {
    indice = (i + ordre.length) % ordre.length;
    const z = ordre[indice];
    if (zoneActive() !== z) allerVers(z);
    dessinerPoles();
  }
  function dessinerPoles() {
    const z = ordre[indice];
    tp.dataset.pole = z.pole || 'qg';
    const gens = agentsPoses.filter(a => a.zone === z.id).map(a => a.agent.prenom);
    $('.infos b', tp).textContent = z.nom;
    $('.infos span', tp).textContent = `${z.pole ? `Pôle ${POLES[z.pole].nom}` : z.id === 'qg' ? 'Direction' : 'Lieu commun'} · ${gens.length ? gens.join(', ') : 'personne n\'y travaille'}`;
    $('.infos small', tp).textContent = `${indice + 1} / ${ordre.length}`;
    boutonsPoints.forEach((b, k) => b.setAttribute('aria-current', String(k === indice)));
  }
  $('.prec', tp).addEventListener('click', () => aller(indice - 1));
  $('.suiv', tp).addEventListener('click', () => aller(indice + 1));
  // la fiche fermée à la main ou une autre salle choisie dans la scène : l'onglet suit
  function suivreZone() {
    if (ouvert !== 'poles') return;
    const i = ordre.indexOf(zoneActive());
    if (i >= 0 && i !== indice) { indice = i; dessinerPoles(); }
  }

  /* ---------- Équipe : regroupée par pôle, le Quartier Général à la fin ---------- */
  const te = tiroirs.equipe, groupes = $('.groupes', te), resume = $('.resume', te), compte = $('.compte', barre);
  let enCours = [], serveurOk = !SANS_SERVEUR, minuteur = 0;
  const idEquipe = (a) => a.idEquipe || a.id;
  const duree = (debut) => {
    const m = Math.max(0, Math.round((Date.now() - debut) / 60000));
    return m < 1 ? 'à l\'instant' : m < 60 ? `depuis ${m} min` : `depuis ${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
  };
  const familles = [...Object.keys(POLES).map(k => ({ cle: k, nom: POLES[k].nom, couleur: POLES[k].couleur })), { cle: null, nom: 'Quartier Général', couleur: '#c9971c' }];

  function dessinerEquipe() {
    if (ouvert !== 'equipe') return;
    const parAgent = new Map(enCours.map(t => [t.agent, t]));
    const n = enCours.length;
    resume.textContent = !serveurOk
      ? 'Serveur local éteint : seules les situations habituelles sont affichées. Lance node live/server.js pour suivre les tâches.'
      : n ? `${n} tâche${n > 1 ? 's' : ''} en cours. Clique sur un agent pour suivre son travail.` : 'Aucune tâche en cours. Clique sur un agent pour lui parler ou lui confier une tâche.';
    groupes.replaceChildren(...familles.map(f => {
      const membres = agentsPoses.filter(p => (p.agent.pole || null) === f.cle).sort((a, b) => AGENTS.indexOf(a.agent) - AGENTS.indexOf(b.agent));
      if (!membres.length) return '';
      const sec = document.createElement('section');
      const h = document.createElement('h3'); h.style.setProperty('--c', f.couleur); h.textContent = f.nom;
      const ul = document.createElement('ul');
      for (const pose of membres) {
        const a = pose.agent, t = parAgent.get(idEquipe(a));
        const li = document.createElement('li'); if (t) li.className = 'en-tache';
        const b = document.createElement('button'); b.type = 'button';
        b.title = t ? `Suivre la tâche de ${a.prenomEquipe || a.prenom}` : `Parler à ${a.prenomEquipe || a.prenom}`;
        b.addEventListener('click', () => parler(pose));
        const etat = t ? 'au travail' : a.etat;
        const dot = document.createElement('i'); dot.style.background = (ETATS[etat] || ETATS['en attente']).couleur;
        const nom = document.createElement('b'); nom.textContent = a.prenom;
        const poste = document.createElement('span'); poste.textContent = a.poste;
        const maintenant = document.createElement('p');
        if (t) {
          maintenant.textContent = t.mode === 'corbeille' ? `${t.resume}, ${duree(t.debut)}`
            : `Tâche en cours ${duree(t.debut)}${t.resume ? ` : « ${t.resume}${t.resume.length >= 160 ? '…' : ''} »` : ''}`;
          if (t.derniere) { const d = document.createElement('small'); d.textContent = `Dernière action : ${t.derniere}`; maintenant.append(d); }
        } else {
          maintenant.textContent = etat.charAt(0).toUpperCase() + etat.slice(1) + (a.missions && a.missions[0] && etat !== 'en attente' ? ` · ${a.missions[0]}` : '');
        }
        b.append(dot, nom, poste, maintenant);
        const voir = document.createElement('button'); voir.type = 'button'; voir.className = 'voir';
        voir.textContent = 'Voir'; voir.title = `Voler jusqu'au bureau de ${a.prenom}`;
        voir.addEventListener('click', () => { const z = zones.find(z => z.id === pose.zone); if (z) allerVers(z); });
        li.append(b, voir); ul.append(li);
      }
      sec.append(h, ul);
      return sec;
    }));
  }

  async function rafraichir() {
    clearTimeout(minuteur);
    if (SANS_SERVEUR) { dessinerEquipe(); return; }
    try { enCours = (await appeler('/api/etat')).enCours || []; serveurOk = true; }
    catch { enCours = []; serveurOk = false; }
    compte.textContent = enCours.length; compte.hidden = !enCours.length;
    compte.title = `${enCours.length} tâche${enCours.length > 1 ? 's' : ''} en cours`;
    dessinerEquipe();
    minuteur = setTimeout(rafraichir, ouvert === 'equipe' && !document.hidden ? PAUSE_OUVERT : PAUSE_FERME);
  }
  rafraichir();

  return { suivreZone, fermer: () => ouvrir(null), rafraichir };
}
