// Fiche d'équipement : obstacle par obstacle (puits, ressaut, main courante),
// avec calcul automatique des cordes et du matériel à emporter.
const Equipement = (() => {
  const TYPES = { plaquettes: 'Spits / goujons (plaquettes)', broches: 'Broches', AN: 'Amarrages naturels' };

  // Corde suggérée si non renseignée : hauteur + 20 %, + 2 m par fractionnement,
  // + 4 m pour la tête de puits, arrondi aux 5 m supérieurs. Indicatif.
  const cordeSuggeree = (o) => o.hauteur ? Math.ceil(((+o.hauteur) * 1.2 + 2 * (+o.fractios || 0) + 4) / 5) * 5 : 0;
  const cordeDe = (o) => (+o.corde) || cordeSuggeree(o);

  function bilan(obs) {
    const t = { cordes: [], mousquetons: 0, plaquettes: 0, sangles: 0, total: 0 };
    obs.forEach((o) => {
      const points = (+o.tete || 0) + (+o.fractios || 0);
      const dev = +o.deviations || 0;
      const c = cordeDe(o);
      if (c) { t.cordes.push({ nom: o.nom, m: c, estimee: !(+o.corde) }); t.total += c; }
      t.mousquetons += points + dev;
      if (o.amarrage === 'plaquettes') t.plaquettes += points;
      if (o.amarrage === 'AN') t.sangles += points;
      t.sangles += dev;
    });
    return t;
  }

  function render(el, cave, onSave) {
    const obs = cave.equipement || [];
    if (!obs.length) {
      el.innerHTML = `<p class="muted">Pas encore de fiche d'équipement.</p>
        <button class="btn small" data-eq-edit>＋ Créer la fiche d'équipement</button>`;
    } else {
      const b = bilan(obs);
      el.innerHTML = `
        <div class="table-wrap"><table class="eq-table">
          <thead><tr><th>Obstacle</th><th>Haut.</th><th>Corde</th><th>Amarrages</th></tr></thead>
          <tbody>${obs.map((o) => `<tr>
            <td><strong>${esc(o.nom || '—')}</strong>${o.notes ? `<br><span class="muted">${esc(o.notes)}</span>` : ''}</td>
            <td>${o.hauteur ? esc(o.hauteur) + ' m' : '—'}</td>
            <td>${cordeDe(o) ? cordeDe(o) + ' m' + (+o.corde ? '' : '*') : '—'}</td>
            <td>${(+o.tete || 0) + (+o.fractios || 0)} pts${+o.fractios ? ` (${o.fractios} fractio)` : ''}${+o.deviations ? ` · ${o.deviations} dév.` : ''}<br><span class="muted">${esc(TYPES[o.amarrage] || '')}</span></td>
          </tr>`).join('')}</tbody>
        </table></div>
        <div class="kit">
          <strong>À emporter</strong>
          <ul>
            <li>Cordes : ${b.cordes.map((c) => `${c.m} m`).join(' + ')} = <strong>${b.total} m</strong></li>
            <li>${b.mousquetons} mousquetons${b.plaquettes ? ` · ${b.plaquettes} plaquettes` : ''}${b.sangles ? ` · ${b.sangles} sangles / anneaux` : ''}</li>
            <li>+ kit de secours, clé de 13 ${b.plaquettes ? '' : '(si spits)'}</li>
          </ul>
          ${b.cordes.some((c) => c.estimee) ? '<p class="muted" style="font-size:.75rem;margin:0">* longueur estimée (hauteur + 20 % + marges). Mets la vraie longueur dès que tu la connais.</p>' : ''}
        </div>
        <button class="btn small" data-eq-edit>✎ Modifier l'équipement</button>`;
    }
    el.querySelector('[data-eq-edit]').onclick = () => editer(cave, onSave);
  }

  function ligne(o, i) {
    return `<fieldset class="eq-row card" data-i="${i}">
      <div class="row">
        <label>Obstacle<input name="nom" value="${esc(o.nom || '')}" placeholder="ex. P15, R3, MC"></label>
        <label>Hauteur (m)<input name="hauteur" type="number" min="0" step="0.5" value="${esc(o.hauteur ?? '')}"></label>
      </div>
      <div class="row">
        <label>Corde (m)<input name="corde" type="number" min="0" step="1" value="${esc(o.corde ?? '')}" placeholder="auto"></label>
        <label>Amarrages
          <select name="amarrage">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${o.amarrage === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        </label>
      </div>
      <div class="row">
        <label>Points en tête<input name="tete" type="number" min="0" value="${esc(o.tete ?? 2)}"></label>
        <label>Fractios<input name="fractios" type="number" min="0" value="${esc(o.fractios ?? 0)}"></label>
        <label>Déviations<input name="deviations" type="number" min="0" value="${esc(o.deviations ?? 0)}"></label>
      </div>
      <label>Notes<input name="notes" value="${esc(o.notes || '')}" placeholder="ex. frottement à −8 m, protéger la corde"></label>
      <div class="btn-row" style="margin:4px 0 0">
        <button type="button" class="btn small" data-up>↑</button>
        <button type="button" class="btn small" data-down>↓</button>
        <button type="button" class="btn small" data-rm style="border-color:var(--danger);color:var(--danger)">Supprimer</button>
      </div>
    </fieldset>`;
  }

  function editer(cave, onSave) {
    let obs = (cave.equipement || []).map((o) => ({ ...o }));
    if (!obs.length) obs.push({ nom: 'P1', tete: 2, fractios: 0, deviations: 0, amarrage: 'plaquettes' });

    const lire = (root) => [...root.querySelectorAll('.eq-row')].map((fs) => {
      const v = (n) => fs.querySelector(`[name="${n}"]`).value.trim();
      const num = (n) => (v(n) === '' ? null : Number(v(n)));
      return { nom: v('nom'), hauteur: num('hauteur'), corde: num('corde'), amarrage: v('amarrage'),
        tete: num('tete') ?? 0, fractios: num('fractios') ?? 0, deviations: num('deviations') ?? 0, notes: v('notes') };
    });

    const dessiner = (root) => {
      root.innerHTML = `
        <h2>Équipement : ${esc(cave.nom)}</h2>
        <p class="muted">De l'entrée vers le fond. Laisse « Corde » vide pour une longueur estimée.</p>
        <form class="form" id="eq-form">
          <div id="eq-rows">${obs.map(ligne).join('')}</div>
          <button type="button" class="btn small" id="eq-add">＋ Ajouter un obstacle</button>
          <button class="btn primary" type="submit" style="width:100%;margin-top:12px">Enregistrer</button>
        </form>`;
      root.querySelector('#eq-add').onclick = () => {
        obs = lire(root);
        obs.push({ nom: `P${obs.length + 1}`, tete: 2, fractios: 0, deviations: 0, amarrage: obs.at(-1)?.amarrage || 'plaquettes' });
        dessiner(root);
        root.querySelector('.eq-row:last-child input').focus();
      };
      root.querySelectorAll('.eq-row').forEach((fs) => {
        const i = +fs.dataset.i;
        const bouger = (d) => { obs = lire(root); const j = i + d; if (j < 0 || j >= obs.length) return; [obs[i], obs[j]] = [obs[j], obs[i]]; dessiner(root); };
        fs.querySelector('[data-up]').onclick = () => bouger(-1);
        fs.querySelector('[data-down]').onclick = () => bouger(1);
        fs.querySelector('[data-rm]').onclick = () => { obs = lire(root); obs.splice(i, 1); dessiner(root); };
      });
      root.querySelector('#eq-form').onsubmit = (e) => {
        e.preventDefault();
        onSave(lire(root).filter((o) => o.nom || o.hauteur));
      };
    };
    App.modal('', dessiner);
  }

  return { render };
})();
