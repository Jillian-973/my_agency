// Fenêtre d'un agent : « Discuter » (réponse de Claude Code sans aucun outil) et « Confier une tâche »
// (vraie session Claude Code lancée par live/server.js dans live/travaux/<Prénom>/).
// Du travail en cours, la page ne reçoit que le nom de l'outil et le nom du fichier, jamais leur contenu.
import { POLES, ETATS } from './donnees.js';
import { reglerTravail } from './mobilier.js';

/* ---------- liaison avec le serveur local ---------- */
// Le serveur glisse un jeton secret dans la page à chaque démarrage ; l'API refuse toute demande sans lui.
const JETON = document.querySelector('meta[name="qg-jeton"]')?.content || '';
const SANS_SERVEUR = !JETON || JETON.startsWith('__');

async function appeler(chemin, corps) {
  const entetes = { 'x-qg-jeton': JETON };
  if (corps) entetes['Content-Type'] = 'application/json';
  const r = await fetch(chemin, { method: corps ? 'POST' : 'GET', headers: entetes, body: corps ? JSON.stringify(corps) : undefined, cache: 'no-store' });
  let j = {};
  try { j = await r.json(); } catch { /* réponse vide */ }
  if (!r.ok) throw new Error(j.erreur || `Le serveur a répondu ${r.status}.`);
  return j;
}

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
export function creerFenetreAgent({ agentsPoses, quandFermee = () => {} }) {
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
  };
  const discussions = new Map();   // id de l'agent → messages (en mémoire seulement, rien n'est enregistré)
  const taches = new Map();        // id de l'agent → { id, journal, fin }
  let actuel = null, onglet = null, claudeOk = true, connecteurs = {};   // connecteurs : id EQUIPE.md → noms des connecteurs

  const idEquipe = (a) => a.idEquipe || a.id;               // identifiant dans EQUIPE.md (le CEO s'y appelle Jillian)
  const prenomDe = (a) => a.prenomEquipe || a.prenom;
  const poseDe = (id) => agentsPoses.find(p => p.agent.id === id);

  /* ----- ouverture, fermeture, onglets ----- */
  function ouvrir(agent) {
    actuel = agent;
    racine.dataset.pole = agent.pole || 'qg';              // la fenêtre prend la couleur du pôle de l'agent
    ui.titre.textContent = prenomDe(agent);
    ui.poste.textContent = agent.poste.charAt(0).toUpperCase() + agent.poste.slice(1);
    ui.pole.textContent = agent.pole ? `Pôle ${POLES[agent.pole].nom}` : 'Quartier Général';
    ui.consigne.placeholder = `Ce que ${prenomDe(agent)} doit faire, avec le plus de détails possible…`;
    ui.saisie.placeholder = `Écris à ${prenomDe(agent)}…`;
    const cnx = connecteurs[idEquipe(agent)];
    ui.noteTache.textContent = `Session Claude Code, modèle Sonnet, 2 $ maximum. ${prenomDe(agent)} peut lire, écrire et modifier les fichiers de son dossier live/travaux/${prenomDe(agent)}/ et chercher sur le web` +
      (cnx ? `, avec ses connecteurs : ${cnx.join(', ')} (seulement les outils prévus pour son poste, jamais d'envoi).` : ", rien d'autre.") + ' 4 tâches en même temps au plus.';
    majEtat();
    const t = taches.get(agent.id);
    ui.message.hidden = !(SANS_SERVEUR || !claudeOk);
    if (SANS_SERVEUR) ui.message.textContent = 'Pour parler aux agents, ouvre le QG avec le serveur local : node live/server.js';
    else if (!claudeOk) ui.message.textContent = 'Claude Code est introuvable sur cet ordinateur : les agents ne peuvent pas répondre.';
    choisir(t ? 'tache' : null);
    racine.hidden = false;
    (onglet === 'tache' ? ui.onglets[1] : ui.onglets[0]).focus();
  }
  function fermer() {
    if (racine.hidden) return;
    racine.hidden = true; actuel = null;
    quandFermee();
  }
  function choisir(nom) {
    onglet = nom;
    racine.classList.toggle('large', !!nom);          // la fenêtre s'agrandit pour discuter ou suivre une tâche
    for (const b of ui.onglets) b.setAttribute('aria-selected', String(b.dataset.onglet === nom));
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
  }
  ui.onglets.forEach(b => b.addEventListener('click', () => choisir(b.dataset.onglet)));
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
  function suivre(agentId, id) {
    const t = { id, journal: [], fin: null };
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
      suivre(agent.id, id);
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
      for (const { id, agent } of etat.enCours || []) {
        const pose = agentsPoses.find(p => idEquipe(p.agent) === agent);
        if (pose && !taches.has(pose.agent.id)) suivre(pose.agent.id, id);
      }
    }).catch(() => { /* serveur ancien ou injoignable : la fenêtre l'indiquera à l'usage */ });
  }

  return { ouvrir, fermer, ouverte: () => !racine.hidden };
}
