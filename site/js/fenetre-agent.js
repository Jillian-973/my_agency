// Fiche d'un agent : qui il est (portrait, poste, pôle, lieu), ce qu'il fait en ce moment, son rôle au QG (missions,
// outils, collègues) ; en bas, « Discuter » (réponse de Claude Code sans aucun outil) et « Confier une tâche »
// (vraie session Claude Code lancée par live/server.js dans live/travaux/<Prénom>/).
// Du travail en cours, la page ne reçoit que le nom de l'outil et le nom du fichier, jamais leur contenu.
import { POLES, ETATS } from './donnees.js';
import { reglerTravail } from './mobilier.js';
import { JETON, SANS_SERVEUR, appeler } from './api.js';
import { portrait } from './portrait.js';

/** Flux d'une tâche (format « server-sent events »), lu avec fetch pour envoyer le jeton dans un en-tête. */
async function suivreFlux(id, surEvenement) {
  const r = await fetch(`/api/taches/${id}/flux`, { headers: { 'x-qg-jeton': JETON }, cache: 'no-store' });
  if (!r.ok || !r.body) throw new Error(r.status === 404 ? 'Tâche inconnue : le serveur a sans doute redémarré.' : `Le serveur a répondu ${r.status}.`);
  const lecteur = r.body.pipeThrough(new TextDecoderStream()).getReader();
  let tampon = '';
  for (;;) {
    const { value, done } = await lecteur.read();
    if (done) return;
    tampon += value;
    let i;
    while ((i = tampon.indexOf('\n\n')) >= 0) {
      const bloc = tampon.slice(0, i); tampon = tampon.slice(i + 2);
      const donnees = bloc.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('\n');
      if (donnees) { try { surEvenement(JSON.parse(donnees)); } catch { /* ligne illisible : ignorée */ } }
    }
  }
}

/* ---------- la fenêtre ---------- */
export function creerFenetreAgent({ agentsPoses, quandFermee = () => {}, nomDuLieu = () => '', voirLieu = null }) {
  const $ = (s) => racine.querySelector(s);
  const racine = document.getElementById('agent');
  const ui = {
    titre: $('#agent-titre'), poste: $('.poste'), pastille: $('.qui i'), pole: $('.qui .pole'), etat: $('.qui .etat'), message: $('.message'),
    onglets: [...racine.querySelectorAll('[data-onglet]')],
    discuter: $('.onglet.discuter'), fil: $('.fil'), ecrire: $('.ecrire'), saisie: $('.ecrire input'),
    tache: $('.onglet.tache'), confier: $('.confier'), consigne: $('.confier textarea'), noteTache: $('.confier .note'),
    suivi: $('.suivi'), statut: $('.statut'), journal: $('.journal'), fin: $('.fin'), compteRendu: $('.compte-rendu'),
    fichiers: $('.fichiers'), cout: $('.cout'), ouvrir: $('.ouvrir'), nouvelle: $('.nouvelle'),
    propositions: $('.propositions'), listeCorbeille: $('.liste-corbeille'), corbeille: $('.corbeille'),
    fiche: $('.vue-fiche'), portrait: $('.portrait'), lieu: $('.lieu'), activite: $('.activite'), detail: $('.maintenant .detail'),
    suivreTache: $('.suivre'), missions: $('.missions'), puces: $('.outils-agent .puces'), notePuces: $('.note-puces'),
    equipe: $('.equipe-agent'), collegues: $('.collegues'), retour: $('.retour'),
    modele: $('.identite .modele'), noteDiscussion: $('.note-discussion'),
  };
  const discussions = new Map();   // id de l'agent → messages (en mémoire seulement, rien n'est enregistré)
  const taches = new Map();        // id de l'agent → { id, journal, fin }
  let actuel = null, onglet = null, claudeOk = true, connecteurs = {};   // connecteurs : id EQUIPE.md → noms des connecteurs
  let modeles = {}, modeleDiscussion = '';                     // modèle et plafond de chaque agent (live/modeles.js)

  const idEquipe = (a) => a.idEquipe || a.id;               // identifiant dans EQUIPE.md (le CEO s'y appelle Jillian)
  const prenomDe = (a) => a.prenomEquipe || a.prenom;
  const poseDe = (id) => agentsPoses.find(p => p.agent.id === id);

  /* ----- la fiche : qui il est, ce qu'il fait, son rôle ----- */
  const majuscule = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  let enCoursServeur = [];                                     // tâches vues par le serveur (lancées ici ou ailleurs)
  function dessinerFiche() {
    const agent = actuel, pose = poseDe(agent.id);
    // portrait en buste, à la couleur de son pôle
    if (pose && pose.groupe.userData.look) ui.portrait.replaceChildren(portrait(pose.groupe.userData.look));
    const lieu = pose && nomDuLieu(pose.zone);
    ui.lieu.textContent = lieu ? `Travaille à : ${lieu}` : '';
    ui.lieu.hidden = !lieu;
    const m = modeles[idEquipe(agent)];
    ui.modele.textContent = m ? `Modèle : ${m.nom} · ${m.plafond} $ au plus par tâche` : '';
    ui.modele.hidden = !m;
    ui.noteDiscussion.textContent = `Réponse${modeleDiscussion ? ` de ${modeleDiscussion}` : ''}, sans aucun outil. Rien n'est enregistré : la discussion s'efface en rechargeant la page.`;
    // son rôle : missions, outils (● branché quand c'est un de ses connecteurs), collègues de pôle
    const missions = agent.missions && agent.missions.length ? agent.missions : [agent.poste];
    ui.missions.replaceChildren(...missions.map(m => { const li = document.createElement('li'); li.textContent = majuscule(m); return li; }));
    const cnx = (connecteurs[idEquipe(agent)] || []).map(c => c.toLowerCase());
    const branche = (o) => cnx.some(c => o.toLowerCase().includes(c) || c.includes(o.toLowerCase()) || (c === 'google drive' && /google (sheets|slides|docs)/i.test(o)));
    const outils = [...(agent.outils || [])];
    for (const c of connecteurs[idEquipe(agent)] || []) {
      const deja = outils.some(o => o.toLowerCase().includes(c.toLowerCase())) || (c === 'Google Drive' && outils.some(o => /google (sheets|slides|docs)/i.test(o)));
      if (!deja) outils.push(c);                               // un connecteur que la ligne « Outils » ne nomme pas
    }
    ui.puces.replaceChildren(...outils.map(o => { const s = document.createElement('span'); s.textContent = o; if (branche(o)) { s.className = 'branche'; s.title = 'Connecteur branché'; } return s; }));
    ui.notePuces.hidden = !outils.some(branche);
    const collegues = agent.pole ? agentsPoses.filter(p => p.agent.pole === agent.pole && p.agent !== agent) : [];
    ui.equipe.hidden = !collegues.length;
    ui.collegues.replaceChildren(...collegues.map(p => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = p.agent.prenom; b.title = `Voir la fiche de ${p.agent.prenom} (${p.agent.poste})`;
      b.addEventListener('click', () => ouvrir(p.agent));
      return b;
    }));
    dessinerMaintenant();
  }
  /** « En ce moment » : une tâche (d'ici ou du serveur), une réunion, une pause, ou sa situation habituelle. */
  function dessinerMaintenant() {
    if (!actuel) return;
    const agent = actuel, pose = poseDe(agent.id), t = taches.get(agent.id);
    const serveur = enCoursServeur.find(x => x.agent === idEquipe(agent));
    let activite, detail = '';
    if ((t && !t.fin) || serveur) {
      const resume = (t && t.consigne) || (serveur && serveur.resume) || '';
      activite = `Travaille sur une tâche${resume ? ` : « ${resume.length > 140 ? resume.slice(0, 140) + '…' : resume} »` : ''}`;
      const derniere = t && t.journal.length ? t.journal[t.journal.length - 1] : null;
      detail = derniere && derniere.outil ? `Dernière action : ${derniere.outil}${derniere.fichier ? ` · ${derniere.fichier}` : ''}` : serveur && serveur.derniere ? `Dernière action : ${serveur.derniere}` : '';
    } else if (pose && pose.sortie && pose.sortie.motif === 'reunion') {
      activite = pose.sortie.etape === 'retour' ? 'Revient de réunion' : pose.sortie.etape === 'aller' ? 'Part en réunion' : 'En réunion, dans la salle de réunion';
    } else if (pose && pose.sortie && pose.sortie.motif === 'pause') {
      activite = pose.sortie.etape === 'retour' ? 'Revient de sa pause' : `En pause${pose.lieu ? ` · ${nomDuLieu(pose.lieu)}` : ''}`;
    } else if (t && t.fin) {
      activite = t.fin.ok ? 'A terminé sa dernière tâche' : 'Sa dernière tâche s\'est arrêtée';
      detail = 'Le compte rendu est dans « Confier une tâche ».';
    } else {
      activite = agent.etat === 'au travail' ? `Au travail${agent.missions && agent.missions[0] ? ` : ${agent.missions[0].charAt(0).toLowerCase() + agent.missions[0].slice(1)}` : ''}`
        : agent.etat === 'en pause' ? 'En pause à son bureau' : 'En attente d\'une mission';
    }
    ui.activite.textContent = activite;
    ui.detail.textContent = detail; ui.detail.hidden = !detail;
    ui.suivreTache.hidden = !t;
    ui.suivreTache.textContent = t && t.fin ? 'Voir le compte rendu' : 'Suivre sa tâche';
  }
  ui.suivreTache.addEventListener('click', () => choisir('tache'));
  ui.retour.addEventListener('click', () => choisir(null));

  /* ----- ouverture, fermeture, onglets ----- */
  function ouvrir(agent) {
    actuel = agent;
    racine.dataset.pole = agent.pole || 'qg';              // la fenêtre prend la couleur du pôle de l'agent
    ui.titre.textContent = prenomDe(agent);
    ui.poste.textContent = agent.poste.charAt(0).toUpperCase() + agent.poste.slice(1);
    ui.pole.textContent = agent.pole ? `Pôle ${POLES[agent.pole].nom}` : 'Quartier Général';
    ui.consigne.placeholder = `Ce que ${prenomDe(agent)} doit faire, avec le plus de détails possible…`;
    ui.saisie.placeholder = `Écris à ${prenomDe(agent)}…`;
    const cnx = connecteurs[idEquipe(agent)], m = modeles[idEquipe(agent)];
    ui.noteTache.textContent = `Session Claude Code${m ? `, modèle ${m.nom}, ${m.plafond} $ maximum` : ''}. ${prenomDe(agent)} peut lire, écrire et modifier les fichiers de son dossier live/travaux/${prenomDe(agent)}/ et chercher sur le web` +
      (cnx ? `, avec ses connecteurs : ${cnx.join(', ')} (seulement les outils prévus pour son poste, jamais d'envoi).` : ", rien d'autre.") + ' 4 tâches en même temps au plus.';
    majEtat();
    const t = taches.get(agent.id);
    ui.message.hidden = !(SANS_SERVEUR || !claudeOk);
    if (SANS_SERVEUR) ui.message.textContent = 'Pour parler aux agents, ouvre le QG avec le serveur local : node live/server.js';
    else if (!claudeOk) ui.message.textContent = 'Claude Code est introuvable sur cet ordinateur : les agents ne peuvent pas répondre.';
    dessinerFiche();
    choisir(null);                                           // on arrive toujours sur la fiche
    racine.hidden = false;
    $('.fermer').focus();
    // ce que fait l'agent d'après le serveur (une tâche lancée depuis un autre onglet, par exemple)
    if (!SANS_SERVEUR) appeler('/api/etat').then((etat) => {
      enCoursServeur = etat.enCours || []; connecteurs = etat.connecteurs || connecteurs;
      modeles = etat.modeles || modeles; modeleDiscussion = etat.discussion || modeleDiscussion;
      if (actuel === agent && !onglet) dessinerFiche();
    }).catch(() => {});
  }
  function fermer() {
    if (racine.hidden) return;
    // le curseur de saisie ne doit pas rester dans la fenêtre fermée : sinon les touches de marche y seraient tapées
    if (racine.contains(document.activeElement)) document.activeElement.blur();
    racine.hidden = true; actuel = null;
    quandFermee();
  }
  /** nom : 'discuter', 'tache', ou null pour la fiche. */
  function choisir(nom) {
    onglet = nom;
    racine.classList.toggle('large', !!nom);          // la fenêtre s'agrandit pour discuter ou suivre une tâche
    for (const b of ui.onglets) b.setAttribute('aria-selected', String(b.dataset.onglet === nom));
    ui.fiche.hidden = !!nom; ui.retour.hidden = !nom;
    if (!nom) dessinerMaintenant();
    ui.discuter.hidden = nom !== 'discuter';
    ui.tache.hidden = nom !== 'tache';
    if (nom === 'discuter') { dessinerFil(); ui.saisie.focus(); }
    if (nom === 'tache') { dessinerTache(); if (!taches.get(actuel.id)) ui.consigne.focus(); }
  }
  function majEtat() {
    if (!actuel) return;
    const t = taches.get(actuel.id);
    const etat = t && !t.fin ? 'au travail' : actuel.etat;
    ui.etat.textContent = t && !t.fin ? 'au travail · tâche en cours' : etat;
    ui.pastille.style.color = ui.pastille.style.background = (ETATS[etat] || ETATS['en attente']).couleur;
    if (!onglet) dessinerMaintenant();
  }
  ui.onglets.forEach(b => b.addEventListener('click', () => choisir(onglet === b.dataset.onglet ? null : b.dataset.onglet)));   // un second clic ramène à la fiche
  $('.fermer').addEventListener('click', fermer);
  racine.addEventListener('pointerdown', (e) => { if (e.target === racine) fermer(); });
  // Échap ferme la fenêtre (avant les autres raccourcis de la page)
  addEventListener('keydown', (e) => {
    if (racine.hidden) return;
    if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); fermer(); }
  }, true);

  /* ----- Discuter ----- */
  function dessinerFil() {
    const fil = discussions.get(actuel.id) || [];
    ui.fil.replaceChildren(...fil.map(m => {
      const li = document.createElement('li');
      li.className = m.role === 'agent' ? 'agent' : m.role === 'erreur' ? 'erreur' : m.role === 'attente' ? 'agent attente' : 'moi';
      li.textContent = m.texte;
      return li;
    }));
    ui.fil.scrollTop = ui.fil.scrollHeight;
    const attend = fil.some(m => m.role === 'attente');
    ui.saisie.disabled = attend || SANS_SERVEUR;
  }
  ui.ecrire.addEventListener('submit', async (e) => {
    e.preventDefault();
    const texte = ui.saisie.value.trim();
    if (!texte || !actuel) return;
    const agent = actuel;
    if (!discussions.has(agent.id)) discussions.set(agent.id, []);
    const fil = discussions.get(agent.id);
    for (let i = fil.length - 1; i >= 0; i--) if (fil[i].role === 'erreur') fil.splice(i, 1);
    fil.push({ role: 'moi', texte });
    const envoi = fil.filter(m => m.role === 'moi' || m.role === 'agent');
    const attente = { role: 'attente', texte: `${prenomDe(agent)} écrit…` };
    fil.push(attente);
    ui.saisie.value = '';
    dessinerFil();
    try {
      const r = await appeler('/api/discuter', { agent: idEquipe(agent), messages: envoi });
      fil.splice(fil.indexOf(attente), 1, { role: 'agent', texte: r.reponse || '…' });
    } catch (err) {
      fil.splice(fil.indexOf(attente), 1, { role: 'erreur', texte: err.message });
    }
    if (actuel === agent && onglet === 'discuter') { dessinerFil(); ui.saisie.focus(); }
  });

  /* ----- Confier une tâche ----- */
  let journalDessine = 0;
  function ligneJournal(evt) {
    const li = document.createElement('li');
    if (evt.info) { li.className = 'info'; li.textContent = evt.info; return li; }
    const b = document.createElement('b'); b.textContent = evt.outil;
    li.append(b);
    if (evt.fichier) li.append(' · ', evt.fichier);
    return li;
  }
  function dessinerTache() {
    if (!actuel) return;
    const t = taches.get(actuel.id);
    ui.confier.hidden = !!t;
    ui.suivi.hidden = !t;
    ui.consigne.disabled = SANS_SERVEUR;
    if (!t) return;
    ui.journal.replaceChildren(...t.journal.map(ligneJournal));
    journalDessine = t.journal.length;
    ui.journal.scrollTop = ui.journal.scrollHeight;
    dessinerStatut(t);
  }
  function dessinerStatut(t) {
    const prenom = prenomDe(actuel);
    ui.statut.classList.toggle('en-cours', !t.fin);
    ui.statut.textContent = !t.fin ? `${prenom} travaille à son bureau…` : t.fin.ok ? 'Tâche terminée' : 'Tâche arrêtée';
    ui.fin.hidden = !t.fin;
    if (!t.fin) return;
    ui.compteRendu.textContent = [t.fin.compteRendu, t.fin.erreur && !t.fin.ok ? `⚠ ${t.fin.erreur}` : ''].filter(Boolean).join('\n\n') || 'Pas de compte rendu.';
    ui.fichiers.replaceChildren(...(t.fin.fichiers || []).map(f => { const li = document.createElement('li'); li.textContent = f; return li; }));
    ui.cout.textContent = typeof t.fin.cout === 'number' ? `Coût de la tâche : ${t.fin.cout.toFixed(2).replace('.', ',')} $ (plafond 2 $)` : '';
    ui.ouvrir.hidden = !t.id;
    // mails proposés pour la corbeille : rien ne part sans ton accord
    const props = !t.corbeilleLancee && Array.isArray(t.fin.propositions) ? t.fin.propositions : [];
    ui.propositions.hidden = !props.length;
    ui.listeCorbeille.replaceChildren(...props.map((m) => {
      const li = document.createElement('li'), label = document.createElement('label'), caseA = document.createElement('input');
      caseA.type = 'checkbox'; caseA.checked = true; caseA.value = m.threadId;
      caseA.addEventListener('change', compterCorbeille);
      const titre = document.createElement('b'); titre.textContent = m.objet || '(sans objet)';
      const de = document.createElement('span'); de.textContent = [m.de, m.date].filter(Boolean).join(' · ');
      const raison = document.createElement('em'); raison.textContent = m.raison;
      label.append(caseA, titre, de, raison); li.append(label); return li;
    }));
    compterCorbeille();
  }
  function compterCorbeille() {
    const n = ui.listeCorbeille.querySelectorAll('input:checked').length;
    ui.corbeille.textContent = n ? `Mettre ${n} mail${n > 1 ? 's' : ''} à la corbeille` : 'Coche au moins un mail';
    ui.corbeille.disabled = !n;
  }
  function suivre(agentId, id, consigne = '') {
    const t = { id, journal: [], fin: null, consigne };
    taches.set(agentId, t);
    reglerTravail(poseDe(agentId), true);
    const ici = () => actuel && actuel.id === agentId && onglet === 'tache';
    suivreFlux(id, (evt) => {
      if (evt.type === 'outil' || evt.type === 'info') {
        t.journal.push(evt.type === 'info' ? { info: String(evt.texte || '') } : { outil: String(evt.outil || '?'), fichier: evt.fichier ? String(evt.fichier) : null });
        if (ici()) { for (; journalDessine < t.journal.length; journalDessine++) ui.journal.append(ligneJournal(t.journal[journalDessine])); ui.journal.scrollTop = ui.journal.scrollHeight; }
      } else if (evt.type === 'fin') {
        t.fin = evt;
      }
    }).catch((err) => {
      if (!t.fin) t.fin = { ok: false, erreur: err.message, fichiers: [] };
    }).finally(() => {
      if (!t.fin) t.fin = { ok: false, erreur: 'Le lien avec le serveur s\'est coupé.', fichiers: [] };
      reglerTravail(poseDe(agentId), false);
      if (ici()) dessinerStatut(t);
      if (actuel && actuel.id === agentId) majEtat();
    });
    return t;
  }
  ui.confier.addEventListener('submit', async (e) => {
    e.preventDefault();
    const consigne = ui.consigne.value.trim();
    if (!consigne || !actuel) return;
    const agent = actuel, bouton = ui.confier.querySelector('button');
    bouton.disabled = true; ui.message.hidden = true;
    try {
      const { id } = await appeler('/api/taches', { agent: idEquipe(agent), consigne });
      ui.consigne.value = '';
      suivre(agent.id, id, consigne.replace(/\s+/g, ' '));
      if (actuel === agent) { majEtat(); dessinerTache(); }
    } catch (err) {
      if (actuel === agent) { ui.message.textContent = err.message; ui.message.hidden = false; }
    } finally { bouton.disabled = false; }
  });
  ui.ouvrir.addEventListener('click', async () => {
    const t = actuel && taches.get(actuel.id);
    if (!t) return;
    try { await appeler(`/api/taches/${t.id}/ouvrir`, {}); }
    catch (err) { ui.message.textContent = err.message; ui.message.hidden = false; }
  });
  ui.corbeille.addEventListener('click', async () => {
    const t = actuel && taches.get(actuel.id);
    if (!t || !t.fin) return;
    const threadIds = [...ui.listeCorbeille.querySelectorAll('input:checked')].map(c => c.value);
    if (!threadIds.length) return;
    const agent = actuel;
    ui.corbeille.disabled = true; ui.message.hidden = true;
    try {
      const { id } = await appeler(`/api/taches/${t.id}/corbeille`, { threadIds });
      t.corbeilleLancee = true;
      suivre(agent.id, id);
      if (actuel === agent) { majEtat(); dessinerTache(); }
    } catch (err) {
      ui.corbeille.disabled = false;
      if (actuel === agent) { ui.message.textContent = err.message; ui.message.hidden = false; }
    }
  });
  ui.nouvelle.addEventListener('click', () => {
    if (!actuel) return;
    taches.delete(actuel.id);
    dessinerTache(); ui.consigne.focus();
  });

  /* ----- au chargement : les tâches qui tournent déjà (page rechargée) ----- */
  if (!SANS_SERVEUR) {
    appeler('/api/etat').then((etat) => {
      claudeOk = !!etat.claude;
      connecteurs = etat.connecteurs || {};
      modeles = etat.modeles || {}; modeleDiscussion = etat.discussion || '';
      for (const { id, agent } of etat.enCours || []) {
        const pose = agentsPoses.find(p => idEquipe(p.agent) === agent);
        if (pose && !taches.has(pose.agent.id)) suivre(pose.agent.id, id);
      }
    }).catch(() => { /* serveur ancien ou injoignable : la fenêtre l'indiquera à l'usage */ });
  }

  return { ouvrir, fermer, ouverte: () => !racine.hidden };
}
