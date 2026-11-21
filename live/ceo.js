// Jillian, la CEO : elle reçoit une demande (depuis Claude Code, par le MCP du QG), la découpe en missions,
// attribue chaque mission au bon agent, fait lancer les tâches dès qu'une place se libère (par étapes quand
// une mission dépend d'une autre), puis rédige le compte rendu final.
//
// Planification et compte rendu : deux courtes sessions Claude Code sans aucun outil, avec le modèle de la CEO.
// Les missions elles-mêmes sont de vraies tâches d'agents (lancées par le serveur, visibles dans le QG).
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const BUDGET_PLAN = 0.5, BUDGET_SYNTHESE = 0.5;     // dollars, pour chacune des deux sessions de la CEO
const MISSIONS_MAX = 6, ETAPES_MAX = 3;
const CEO = 'jillian';

function creerCeo({ equipe, claude, communes, modeleDe, connecteursDe, lancer, occupe, places, dossierCeo, env = {} }) {
  const missions = new Map();                       // id → mission (les 30 dernières, en mémoire)
  const ceo = () => equipe()[CEO];

  /* ---------- une session courte, sans outil, avec le modèle de la CEO ---------- */
  function demanderACeo(systeme, consigne, budget) {
    return new Promise((resolve, reject) => {
      if (!claude) return reject(new Error('Claude Code est introuvable sur cet ordinateur.'));
      const dossier = path.join(os.tmpdir(), 'qg-jill-korp-ceo'); fs.mkdirSync(dossier, { recursive: true });
      const args = ['-p', '--model', modeleDe(CEO).id, ...communes, '--tools', '', '--no-session-persistence',
        '--max-budget-usd', String(budget), '--output-format', 'json', '--system-prompt', systeme];
      const enfant = spawn(claude, args, { cwd: dossier, windowsHide: true, env: { ...process.env, ...env } });
      let sortie = '', erreurs = '';
      enfant.stdout.on('data', d => { sortie += d; });
      enfant.stderr.on('data', d => { erreurs += d; if (erreurs.length > 4000) erreurs = erreurs.slice(-4000); });
      const minuteur = setTimeout(() => enfant.kill(), 5 * 60e3);
      enfant.on('error', (e) => { clearTimeout(minuteur); reject(e); });
      enfant.on('close', () => {
        clearTimeout(minuteur);
        try {
          const j = JSON.parse(sortie);
          if (j.is_error) return reject(new Error(j.result || 'Claude Code a renvoyé une erreur.'));
          resolve({ texte: String(j.result || '').trim(), cout: typeof j.total_cost_usd === 'number' ? j.total_cost_usd : 0 });
        } catch { reject(new Error((erreurs || sortie || 'Réponse illisible de Claude Code.').slice(0, 300))); }
      });
      enfant.stdin.end(consigne);
    });
  }

  /* ---------- l'équipe telle que la CEO la connaît ---------- */
  function annuaire() {
    return Object.values(equipe()).filter(a => a.id !== CEO).map(a => {
      const cnx = connecteursDe(a.id);
      return `- ${a.id} : ${a.prenom}, ${a.poste} (pôle ${a.pole}) · missions : ${a.missions.join(' ; ')} · outils : ${a.outils.join(', ')}` +
        `${cnx.length ? ` · connecteurs branchés : ${cnx.join(', ')}` : ''} · modèle : ${modeleDe(a.id).nom}`;
    }).join('\n');
  }

  /* ---------- 1. planifier : qui fait quoi, dans quel ordre ---------- */
  async function planifier(demande) {
    const c = ceo();
    const systeme = [
      `Tu es ${c ? c.prenom : 'Jillian'}, CEO du QG de JILL KORP, l'agence de la personne qui te parle. Tu es au-dessus de toute l'équipe : tu connais chaque agent, tu reçois les demandes et tu distribues le travail.`,
      'Voici ton équipe (identifiant : prénom, poste, missions, outils, connecteurs, modèle) :',
      annuaire(),
      '',
      'Pour la demande reçue :',
      `- découpe-la en missions concrètes (au plus ${MISSIONS_MAX}) et attribue chacune à l'agent le plus compétent ; une seule mission si un seul agent suffit ;`,
      "- chaque consigne doit se suffire à elle-même : l'agent ne voit que ta consigne, il ne connaît pas la conversation ; précise le livrable attendu (en général des fichiers dans son dossier de travail) ;",
      `- les agents travaillent en parallèle ; si une mission a besoin du résultat d'une autre, mets-la à une étape suivante (étapes 1 à ${ETAPES_MAX}) : elle recevra les comptes rendus de l'étape d'avant ;`,
      "- les agents n'envoient jamais rien à l'extérieur (aucun mail envoyé, aucune publication) : ne leur demande pas de le faire ;",
      '- si la demande est une simple question à laquelle tu peux répondre toi-même, ne crée aucune mission et réponds dans « message ».',
      'Réponds UNIQUEMENT avec un objet JSON, sans texte autour, de cette forme :',
      '{"message": "ce que tu dis à ta patronne ou ton patron, en une à trois phrases", "missions": [{"agent": "identifiant", "etape": 1, "consigne": "…"}]}',
      'Tu parles en français et tu tutoies.',
    ].join('\n');
    const r = await demanderACeo(systeme, `Demande reçue :\n${demande}`, BUDGET_PLAN);
    const debut = r.texte.indexOf('{'), fin = r.texte.lastIndexOf('}');
    let plan;
    try { plan = JSON.parse(r.texte.slice(debut, fin + 1)); } catch { throw new Error('La CEO n\'a pas rendu de plan lisible. Reformule la demande et réessaie.'); }
    const agents = equipe();
    const liste = (Array.isArray(plan.missions) ? plan.missions : []).slice(0, MISSIONS_MAX).map(m => ({
      agent: String(m && m.agent || '').toLowerCase().trim(),
      etape: Math.min(ETAPES_MAX, Math.max(1, parseInt(m && m.etape, 10) || 1)),
      consigne: String(m && m.consigne || '').trim().slice(0, 4000),
    })).filter(m => agents[m.agent] && m.agent !== CEO && m.consigne);
    return { message: String(plan.message || '').trim().slice(0, 1500), missions: liste, cout: r.cout };
  }

  /* ---------- 2. faire avancer : lancer chaque mission dès que l'agent et une place sont libres ---------- */
  function consigneComplete(mission, st) {
    let texte = `Mission confiée par ${ceo() ? ceo().prenom : 'Jillian'}, la CEO du QG, pour cette demande : « ${mission.demande} ».\n\n${st.consigne}`;
    const avant = mission.sousTaches.filter(x => x.etape < st.etape && x.compteRendu);
    if (avant.length) texte += '\n\nComptes rendus de l\'étape précédente, transmis par la CEO :\n' +
      avant.map(x => `- ${equipe()[x.agent].prenom} : ${x.compteRendu.slice(0, 1500)}${x.fichiers.length ? ` (fichiers : ${x.fichiers.join(', ')})` : ''}`).join('\n');
    return texte;
  }
  function avancer() {
    for (const m of missions.values()) {
      if (m.etat !== 'en cours') continue;
      const restantes = m.sousTaches.filter(st => st.etat === 'attente' || st.etat === 'en cours');
      if (!restantes.length) { m.etat = 'synthese'; synthetiser(m); continue; }
      m.etape = Math.min(...restantes.map(st => st.etape));
      for (const st of m.sousTaches) {
        if (st.etat !== 'attente' || st.etape !== m.etape) continue;
        if (occupe(st.agent) || places() <= 0) continue;
        const agent = equipe()[st.agent];
        st.etat = 'en cours'; st.debut = Date.now();    // avant le lancement : une tâche qui échoue aussitôt passe à « arrêté » sans être écrasée
        try {
          const t = lancer(agent, consigneComplete(m, st), {
            quandFini: (tache, fin) => {
              st.etat = fin.ok ? 'terminee' : 'echec';
              st.compteRendu = String(fin.compteRendu || fin.erreur || '').trim();
              st.fichiers = (fin.fichiers || []).map(f => `live/travaux/${agent.prenom}/${f}`);
              st.cout = fin.cout || 0;
              setImmediate(avancer);
            },
          });
          st.tache = t.id;
        } catch (e) { st.etat = 'echec'; st.compteRendu = e.message; }
      }
    }
  }
  setInterval(avancer, 3000);

  /* ---------- 3. le compte rendu final de la CEO ---------- */
  async function synthetiser(m) {
    const c = ceo();
    const rapports = m.sousTaches.map(st => `## ${equipe()[st.agent].prenom} (${equipe()[st.agent].poste}) · ${st.etat === 'terminee' ? 'terminé' : 'arrêté'}\n` +
      `${(st.compteRendu || 'Pas de compte rendu.').slice(0, 3000)}\n${st.fichiers.length ? `Fichiers : ${st.fichiers.join(', ')}` : 'Aucun fichier.'}`).join('\n\n');
    let texte;
    try {
      const r = await demanderACeo(
        `Tu es ${c ? c.prenom : 'Jillian'}, CEO du QG de JILL KORP. Tes agents ont terminé les missions que tu leur as confiées. ` +
        'Rédige le compte rendu final pour ta patronne ou ton patron : en tête, la réponse à sa demande en quelques lignes ; puis qui a fait quoi, ' +
        'les résultats clés et les fichiers produits (avec leur chemin) ; enfin ce qui reste éventuellement à faire ou à valider. ' +
        'En français, tutoiement, concis, en Markdown simple.',
        `Demande d'origine : « ${m.demande} »\n\nComptes rendus des agents :\n\n${rapports}`, BUDGET_SYNTHESE);
      texte = r.texte; m.cout += r.cout;
    } catch (e) {
      texte = `La CEO n'a pas pu rédiger sa synthèse (${e.message}). Voici les comptes rendus des agents :\n\n${rapports}`;
    }
    m.cout += m.sousTaches.reduce((s, st) => s + (st.cout || 0), 0);
    m.synthese = texte; m.etat = 'terminee'; m.fin = Date.now();
    // le compte rendu est rangé dans le dossier de la CEO
    try {
      const d = new Date(m.debut), z = (n) => String(n).padStart(2, '0');
      const nom = `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}-mission.md`;
      const dossier = path.join(dossierCeo, 'missions'); fs.mkdirSync(dossier, { recursive: true });
      fs.writeFileSync(path.join(dossier, nom), `# Mission du ${d.toLocaleString('fr-FR')}\n\n> ${m.demande.replace(/\n/g, '\n> ')}\n\n${texte}\n`);
      m.fichier = `live/travaux/${path.basename(dossierCeo)}/missions/${nom}`;
    } catch { /* le compte rendu reste disponible dans la réponse */ }
  }

  /* ---------- l'entrée : une demande ---------- */
  async function demander(demande) {
    const m = { id: crypto.randomUUID(), demande, debut: Date.now(), etat: 'planification', message: '', sousTaches: [], etape: 1, cout: 0, synthese: '', fichier: null };
    missions.set(m.id, m);
    if (missions.size > 30) for (const [k, v] of missions) { if (v.etat === 'terminee') { missions.delete(k); break; } }
    try {
      const plan = await planifier(demande);
      m.message = plan.message; m.cout += plan.cout;
      m.sousTaches = plan.missions.map((x, i) => ({ n: i + 1, ...x, etat: 'attente', tache: null, compteRendu: '', fichiers: [], cout: 0 }));
      if (!m.sousTaches.length) { m.etat = 'terminee'; m.synthese = plan.message || 'La CEO n\'a confié aucune mission.'; m.fin = Date.now(); }
      else { m.etat = 'en cours'; avancer(); }
    } catch (e) { m.etat = 'echec'; m.message = e.message; m.fin = Date.now(); }
    return vue(m);
  }

  /** Ce que l'on montre d'une mission (au MCP et à la page) : jamais le contenu des fichiers. */
  function vue(m) {
    return {
      id: m.id, demande: m.demande, etat: m.etat, message: m.message, etape: m.etape, debut: m.debut, fin: m.fin || null,
      cout: Math.round(m.cout * 100) / 100, synthese: m.synthese, fichier: m.fichier,
      sousTaches: m.sousTaches.map(st => ({ n: st.n, agent: st.agent, prenom: equipe()[st.agent] ? equipe()[st.agent].prenom : st.agent, etape: st.etape,
        consigne: st.consigne, etat: st.etat, tache: st.tache, compteRendu: st.compteRendu, fichiers: st.fichiers })),
    };
  }
  const liste = () => [...missions.values()].sort((a, b) => b.debut - a.debut).map(vue);
  const lire = (id) => (missions.has(id) ? vue(missions.get(id)) : null);
  const actives = () => liste().filter(m => m.etat === 'planification' || m.etat === 'en cours' || m.etat === 'synthese');

  return { demander, liste, lire, actives };
}

module.exports = { creerCeo };
