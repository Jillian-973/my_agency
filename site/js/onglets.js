// Onglets discrets en bas de l'écran :
// - « Pôles » : parcourir chaque pôle puis chaque lieu commun, un par un (la caméra y vole, la fiche de la salle s'ouvre) ;
// - « Outils » : le nom de chacun de tes connecteurs et s'il marche (le serveur lit « claude mcp list » et ne
//   transmet que le nom et un état parmi quelques mots fixes : ni adresse, ni commande, ni message d'erreur) ;
// - « Équipe » : ce que fait chaque agent en ce moment. Les tâches en cours viennent du serveur local (/api/etat) ;
//   pour les autres agents, c'est leur situation habituelle (donnees.js). On y coche aussi des agents, et le sifflet
//   les appelle en réunion (reunion.js).
import { POLES, ETATS, AGENTS } from './donnees.js';
import { SANS_SERVEUR, appeler } from './api.js';

const PAUSE_OUVERT = 4000, PAUSE_FERME = 15000;   // rafraîchissement de l'onglet « Équipe » (ouvert / fermé)

/** Coup de sifflet d'arbitre, joué par le navigateur (une trille courte puis une longue, sans fichier son). */
function siffler() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const t0 = ctx.currentTime, vol = ctx.createGain();
    vol.gain.value = 0; vol.connect(ctx.destination);
    const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = 2900;
    const lfo = ctx.createOscillator(), prof = ctx.createGain(); lfo.frequency.value = 32; prof.gain.value = 140;
    lfo.connect(prof); prof.connect(osc.frequency); osc.connect(vol);
    for (const [debut, duree] of [[0, .16], [.24, .42]]) {
      vol.gain.setValueAtTime(0, t0 + debut); vol.gain.linearRampToValueAtTime(.07, t0 + debut + .02);
      vol.gain.setValueAtTime(.07, t0 + debut + duree - .04); vol.gain.linearRampToValueAtTime(0, t0 + debut + duree);
    }
    osc.start(t0); lfo.start(t0); osc.stop(t0 + .75); lfo.stop(t0 + .75);
    osc.onended = () => ctx.close();
  } catch { /* pas de son : tant pis */ }
}

export function creerOnglets({ zones, agentsPoses, allerVers, zoneActive, parler, reunion, apresSifflet = () => {}, desactive = () => false }) {
  const $ = (s, r = document) => r.querySelector(s);
  const barre = $('#onglets');
  const boutons = [...barre.querySelectorAll('[data-tiroir]')];
  const tiroirs = { poles: $('#tiroir-poles'), equipe: $('#tiroir-equipe'), outils: $('#tiroir-outils') };
  let ouvert = null;

  function ouvrir(nom) {
    if (ouvert === nom) nom = null;                       // un second clic sur l'onglet le referme
    ouvert = nom;
    for (const b of boutons) b.setAttribute('aria-expanded', String(b.dataset.tiroir === nom));
    for (const [k, t] of Object.entries(tiroirs)) t.hidden = k !== nom;
    if (nom) document.body.dataset.tiroir = nom; else delete document.body.dataset.tiroir;
    if (nom === 'poles') ouvrirPoles();
    if (nom === 'equipe') { dessinerEquipe(); rafraichir(); }
    if (nom === 'outils') chargerOutils(false);
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
  let enCours = [], serveurOk = !SANS_SERVEUR, minuteur = 0, signature = '';
  const coches = new Set();                                   // agents cochés pour la réunion (gardés entre deux rafraîchissements)
  const ETAPES = { aller: 'En route vers la salle de réunion', reunion: 'En réunion', retour: 'Retourne à son bureau' };
  const idEquipe = (a) => a.idEquipe || a.id;
  const duree = (debut) => {
    const m = Math.max(0, Math.round((Date.now() - debut) / 60000));
    return m < 1 ? 'à l\'instant' : m < 60 ? `depuis ${m} min` : `depuis ${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
  };
  const familles = [...Object.keys(POLES).map(k => ({ cle: k, nom: POLES[k].nom, couleur: POLES[k].couleur })), { cle: null, nom: 'Quartier Général', couleur: '#c9971c' }];

  function dessinerEquipe(forcer = false) {
    if (ouvert !== 'equipe') return;
    // on ne redessine que si quelque chose a changé (sinon le clavier perdrait sa place toutes les 4 secondes)
    const sig = JSON.stringify([serveurOk, enCours.map(t => [t.agent, t.derniere, Math.floor((Date.now() - t.debut) / 60000)]),
      agentsPoses.map(p => reunion.etape(p)), [...coches].map(p => p.agent.id)]);
    if (!forcer && sig === signature) return;
    signature = sig;
    const focus = document.activeElement && te.contains(document.activeElement) ? document.activeElement.dataset.cle : null;
    dessinerReunion();
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
        const etape = reunion.etape(pose), dejaLa = !!etape && etape !== 'retour';
        if (dejaLa) li.classList.add('en-reunion');
        const coche = document.createElement('input'); coche.type = 'checkbox'; coche.dataset.cle = 'c-' + a.id;
        coche.checked = dejaLa || coches.has(pose); coche.disabled = dejaLa;
        coche.setAttribute('aria-label', `Inviter ${a.prenom} à la réunion`);
        coche.title = dejaLa ? `${a.prenom} est déjà en réunion` : `Inviter ${a.prenom} à la réunion`;
        coche.addEventListener('change', () => { if (coche.checked) coches.add(pose); else coches.delete(pose); dessinerEquipe(); });
        const b = document.createElement('button'); b.type = 'button'; b.className = 'agent'; b.dataset.cle = 'b-' + a.id;
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
          if (etape) { const r = document.createElement('small'); r.textContent = ETAPES[etape]; maintenant.append(r); }
        } else if (etape) {
          maintenant.textContent = ETAPES[etape];
        } else {
          maintenant.textContent = etat.charAt(0).toUpperCase() + etat.slice(1) + (a.missions && a.missions[0] && etat !== 'en attente' ? ` · ${a.missions[0]}` : '');
        }
        if (dejaLa && !t) dot.style.background = ETATS['en réunion'].couleur;
        b.append(dot, nom, poste, maintenant);
        const voir = document.createElement('button'); voir.type = 'button'; voir.className = 'voir'; voir.dataset.cle = 'v-' + a.id;
        voir.textContent = 'Voir'; voir.title = dejaLa ? 'Voler jusqu\'à la salle de réunion' : `Voler jusqu'au bureau de ${a.prenom}`;
        voir.addEventListener('click', () => { const z = zones.find(z => z.id === (dejaLa ? 'reunion' : pose.zone)); if (z) allerVers(z); });
        li.append(coche, b, voir); ul.append(li);
      }
      sec.append(h, ul);
      return sec;
    }));
    if (focus) { const e = te.querySelector(`[data-cle="${focus}"]`); if (e) e.focus(); }
  }

  /* ---------- réunion : cocher des agents, siffler, puis « Fin de réunion » ---------- */
  const barreReunion = $('.reunion', te), sifflet = $('.sifflet', barreReunion), fin = $('.fin', barreReunion), tous = $('.tous', barreReunion), etatReunion = $('.etat-reunion', barreReunion);
  const invitables = () => agentsPoses.filter(p => { const e = reunion.etape(p); return !e || e === 'retour'; });
  function dessinerReunion() {
    for (const p of coches) if (reunion.etape(p) && reunion.etape(p) !== 'retour') coches.delete(p);
    const n = coches.size, presents = reunion.presents();
    sifflet.disabled = !n;
    $('span', sifflet).textContent = n ? `Siffler la réunion (${n})` : 'Siffler la réunion';
    sifflet.title = n ? `Appeler ${n} agent${n > 1 ? 's' : ''} en salle de réunion` : 'Coche d\'abord les agents à réunir';
    fin.hidden = !presents;
    etatReunion.textContent = presents ? `${presents} en réunion` : n ? '' : 'Coche des agents pour les réunir.';
    const liste = invitables();
    tous.hidden = !liste.length;
    tous.textContent = liste.every(p => coches.has(p)) ? 'Tout décocher' : 'Tout cocher';
  }
  tous.addEventListener('click', () => {
    const liste = invitables();
    if (liste.every(p => coches.has(p))) coches.clear(); else liste.forEach(p => coches.add(p));
    dessinerEquipe();
  });
  sifflet.addEventListener('click', () => {
    const liste = [...coches];
    coches.clear();
    if (!reunion.inviter(liste)) { dessinerEquipe(); return; }
    siffler();
    ouvrir(null);
    apresSifflet();
  });
  fin.addEventListener('click', () => { reunion.terminer(); dessinerEquipe(); });

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

  /* ---------- Outils : mes connecteurs et leur état ---------- */
  const to = tiroirs.outils, groupesOutils = $('.groupes', to), resumeOutils = $('.resume', to), verifier = $('.verifier', to), alerte = $('.alerte', barre);
  const ETATS_OUTIL = {
    ok: { texte: 'connecté', couleur: '#22c55e', ordre: 0 },
    'en-panne': { texte: 'en panne', couleur: '#ef4444', ordre: 1 },
    'a-connecter': { texte: 'à connecter', couleur: '#f59e0b', ordre: 2 },
    'non-configure': { texte: 'non configuré', couleur: '#94a3b8', ordre: 3 },
    inconnu: { texte: 'état inconnu', couleur: '#94a3b8', ordre: 4 },
  };
  const titreGroupe = (g) => (g === 'claude.ai' ? 'Connecteurs claude.ai' : g === 'local' ? 'Sur cet ordinateur' : g.replace(/^extension /, 'Extension « ') + (g.startsWith('extension ') ? ' »' : ''));
  const rangGroupe = (g) => (g === 'claude.ai' ? 0 : g === 'local' ? 2 : 1);
  let outils = null, chargement = null;
  function dessinerOutils() {
    if (!outils) return;
    const liste = outils.connecteurs || [];
    const n = (e) => liste.filter(c => c.etat === e).length;
    const panne = n('en-panne');
    alerte.textContent = panne || ''; alerte.hidden = !panne; alerte.title = panne ? `${panne} connecteur${panne > 1 ? 's' : ''} en panne` : '';
    if (ouvert !== 'outils') return;
    if (outils.echec) { resumeOutils.textContent = 'Impossible de lire l\'état de tes connecteurs pour le moment.'; groupesOutils.replaceChildren(); return; }
    const morceaux = [[n('ok'), 'connecté', 'connectés'], [panne, 'en panne', 'en panne'], [n('a-connecter'), 'à connecter', 'à connecter'], [n('non-configure'), 'non configuré', 'non configurés']]
      .filter(([k]) => k).map(([k, un, plusieurs]) => `${k} ${k > 1 ? plusieurs : un}`);
    const h = new Date(outils.date);
    resumeOutils.textContent = (morceaux.join(' · ') || 'Aucun connecteur') + ` — vérifié à ${String(h.getHours()).padStart(2, '0')} h ${String(h.getMinutes()).padStart(2, '0')}`;
    const parGroupe = new Map();
    for (const c of liste) { if (!parGroupe.has(c.groupe)) parGroupe.set(c.groupe, []); parGroupe.get(c.groupe).push(c); }
    const groupesTries = [...parGroupe.keys()].sort((a, b) => rangGroupe(a) - rangGroupe(b) || a.localeCompare(b, 'fr'));
    groupesOutils.replaceChildren(...groupesTries.map(g => {
      const sec = document.createElement('section');
      const t = document.createElement('h3'); t.textContent = titreGroupe(g);
      const ul = document.createElement('ul');
      const items = parGroupe.get(g).sort((a, b) => (ETATS_OUTIL[a.etat] || ETATS_OUTIL.inconnu).ordre - (ETATS_OUTIL[b.etat] || ETATS_OUTIL.inconnu).ordre || a.nom.localeCompare(b.nom, 'fr'));
      for (const c of items) {
        const e = ETATS_OUTIL[c.etat] || ETATS_OUTIL.inconnu;
        const li = document.createElement('li'); li.className = 'etat-' + (ETATS_OUTIL[c.etat] ? c.etat : 'inconnu');
        const i = document.createElement('i'); i.style.background = e.couleur;
        const b = document.createElement('b'); b.textContent = c.nom; b.title = c.nom;
        const s = document.createElement('span'); s.textContent = e.texte;
        li.append(i, b, s); ul.append(li);
      }
      sec.append(t, ul);
      return sec;
    }));
  }
  async function chargerOutils(forcer) {
    if (SANS_SERVEUR) { resumeOutils.textContent = 'Serveur local éteint : démarre le serveur du QG pour voir l\'état de tes connecteurs.'; return; }
    if (chargement) return chargement;
    if (!outils || forcer) { resumeOutils.textContent = forcer ? 'Vérification de tes connecteurs…' : 'Lecture de tes connecteurs…'; if (!outils) groupesOutils.replaceChildren(); }
    verifier.disabled = true;
    chargement = appeler('/api/outils' + (forcer ? '?verifier=1' : ''))
      .then((r) => { outils = r; }, () => { outils = { date: Date.now(), connecteurs: [], echec: true }; })
      .finally(() => { chargement = null; verifier.disabled = false; dessinerOutils(); });
    return chargement;
  }
  verifier.addEventListener('click', () => chargerOutils(true));
  if (!SANS_SERVEUR) setTimeout(() => chargerOutils(false), 3000);   // une première lecture discrète : l'onglet signale un connecteur en panne

  return { suivreZone, fermer: () => ouvrir(null), rafraichir, redessiner: () => dessinerEquipe() };
}
