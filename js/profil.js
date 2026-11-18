// Profil : nom, proches à prévenir, infos médicales.
const Profil = (() => {
  function render() {
    const p = Store.profil();
    const m = p.medical || {};
    const proches = p.proches.length ? p.proches : [{ nom: '', tel: '' }];
    const el = document.getElementById('profil-content');
    el.innerHTML = `
      <form id="profil-form" class="card form">
        <label>Ton nom<input name="nom" required value="${esc(p.nom || '')}" placeholder="Prénom Nom"></label>

        <h3>Proches à prévenir</h3>
        <p class="muted">Ils recevront les infos de ta sortie (cavité, coordonnées GPS de l'entrée, heure de retour) et devront appeler les secours si tu n'es pas ressorti à temps.</p>
        <div id="proches-list">
          ${proches.map((x, i) => ligneProche(x, i)).join('')}
        </div>
        <button type="button" class="btn small" id="add-proche">＋ Ajouter un proche</button>

        <h3>Infos médicales (optionnel)</h3>
        <p class="muted">Utile aux secours. Restent sur ton téléphone, et ne sont ajoutées au SMS que si tu coches la case.</p>
        <div class="row">
          <label>Groupe sanguin
            <select name="sang">
              ${['', 'A+', 'A−', 'B+', 'B−', 'AB+', 'AB−', 'O+', 'O−'].map((g) => `<option ${m.sang === g ? 'selected' : ''} value="${g}">${g || '—'}</option>`).join('')}
            </select>
          </label>
        </div>
        <label>Allergies<input name="allergies" value="${esc(m.allergies || '')}" placeholder="ex. pénicilline, guêpes"></label>
        <label>Traitements en cours<input name="traitements" value="${esc(m.traitements || '')}" placeholder="ex. asthme (Ventolin)"></label>
        <label>Autre<input name="autre" value="${esc(m.autre || '')}" placeholder="ex. diabète, ancienne blessure au genou"></label>
        <label style="display:flex;gap:8px;align-items:center;color:var(--text)">
          <input type="checkbox" name="inclure" style="width:auto;margin:0" ${m.inclure ? 'checked' : ''}>
          Ajouter ces infos médicales au SMS de départ
        </label>

        <button class="btn primary" type="submit" style="width:100%">Enregistrer</button>
        <p id="profil-saved" class="muted hidden">✓ Enregistré</p>
      </form>`;

    const list = el.querySelector('#proches-list');
    const brancherSuppr = () => list.querySelectorAll('[data-rm-proche]').forEach((b) => b.onclick = () => {
      b.closest('.proche-row').remove();
    });
    brancherSuppr();
    el.querySelector('#add-proche').onclick = () => {
      list.insertAdjacentHTML('beforeend', ligneProche({ nom: '', tel: '' }, list.children.length));
      brancherSuppr();
    };

    el.querySelector('#profil-form').onsubmit = (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const noms = f.getAll('procheNom'), tels = f.getAll('procheTel');
      const nouveaux = noms.map((n, i) => ({ nom: n.trim(), tel: tels[i].trim() })).filter((x) => x.tel);
      if (!nouveaux.length) {
        el.querySelector('#profil-saved').textContent = '⚠️ Ajoute au moins un numéro de proche.';
        el.querySelector('#profil-saved').classList.remove('hidden');
        return;
      }
      Store.saveProfil({
        nom: f.get('nom').trim(),
        proches: nouveaux,
        medical: {
          sang: f.get('sang'), allergies: f.get('allergies').trim(), traitements: f.get('traitements').trim(),
          autre: f.get('autre').trim(), inclure: f.get('inclure') === 'on',
        },
      });
      render();
      const ok = document.getElementById('profil-saved');
      ok.textContent = '✓ Enregistré'; ok.classList.remove('hidden');
    };
  }

  function ligneProche(x, i) {
    return `<div class="proche-row">
      <label>Nom<input name="procheNom" value="${esc(x.nom)}" placeholder="ex. Maman"></label>
      <label>Téléphone<input name="procheTel" type="tel" value="${esc(x.tel)}" placeholder="+41 79 123 45 67"></label>
      ${i > 0 ? '<button type="button" class="link-del" data-rm-proche aria-label="Retirer ce proche">✕</button>' : ''}
    </div>`;
  }

  return { render };
})();
