// Petite fenêtre « Code PIN » (QG en ligne) : 6 chiffres, jamais gardés par la page.
// demanderPin({ titre, texte, erreur }) → le PIN tapé, ou null si on annule.
const racine = document.getElementById('pin');

export function demanderPin({ titre = 'Code PIN', texte = '', erreur = '', info = false } = {}) {
  if (!racine) return Promise.resolve(null);
  const $ = (s) => racine.querySelector(s);
  const champ = $('input'), form = $('form');
  $('.sf-entete').textContent = titre;
  $('.texte').textContent = texte;
  $('.erreur').textContent = erreur; $('.erreur').hidden = !erreur;
  champ.hidden = info; $('.valider').hidden = info; $('.annuler').textContent = info ? 'Fermer' : 'Annuler';
  champ.value = '';
  racine.hidden = false;
  (info ? $('.annuler') : champ).focus();          // tout de suite : rien de ce qui est tapé ne se perd
  return new Promise((resolve) => {
    const fin = (valeur) => {
      racine.hidden = true; champ.value = '';
      form.removeEventListener('submit', valider); $('.annuler').removeEventListener('click', annuler);
      removeEventListener('keydown', echap, true);
      resolve(valeur);
    };
    const valider = (e) => { e.preventDefault(); const v = champ.value.trim(); if (/^\d{6}$/.test(v)) fin(v); else { $('.erreur').textContent = 'Le PIN fait 6 chiffres.'; $('.erreur').hidden = false; } };
    const annuler = () => fin(null);
    const echap = (e) => { if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); fin(null); } };
    form.addEventListener('submit', valider); $('.annuler').addEventListener('click', annuler);
    addEventListener('keydown', echap, true);
  });
}
