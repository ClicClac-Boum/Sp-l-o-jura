// Carnet de sorties : date, cavité, équipe, temps sous terre, photos, liens vidéo.
const Carnet = (() => {
  // Réduit une photo avant de la stocker (sinon la mémoire du navigateur sature vite).
  function reduirePhoto(file, max = 1280, qualite = 0.72) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', qualite));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Photo illisible')); };
      img.src = url;
    });
  }

  const liensValides = (txt) => String(txt || '').split(/\s+/).map((s) => s.trim())
    .filter((s) => /^https?:\/\/\S+$/i.test(s));

  // ---------- Liste ----------
  function render() {
    const sorties = Store.sorties().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const total = sorties.reduce((s, x) => s + (x.dureeMin || 0), 0);
    const cavites = new Set(sorties.map((s) => s.caveId || s.caveNom)).size;
    document.getElementById('carnet-stats').innerHTML = `
      <div class="stat"><b>${sorties.length}</b><span>sorties</span></div>
      <div class="stat"><b>${fmtDuree(total)}</b><span>sous terre</span></div>
      <div class="stat"><b>${cavites}</b><span>cavités</span></div>`;

    const list = document.getElementById('carnet-list');
    if (!sorties.length) {
      list.innerHTML = '<p class="muted">Aucune sortie pour l\'instant. Utilise « Je pars sous terre » depuis une fiche cavité : la sortie s\'ajoutera ici automatiquement à ton retour.</p>';
      return;
    }
    list.innerHTML = sorties.map((s) => `
      <article class="card sortie">
        <h3>${esc(s.caveNom || 'Cavité')}</h3>
        <div class="meta">📅 ${s.date ? fmtDate(s.date) : '—'} · ⏱ ${fmtDuree(s.dureeMin)}</div>
        ${s.equipe ? `<div class="meta">👥 ${esc(s.equipe)}</div>` : ''}
        ${s.etapes?.length ? `<ol class="timeline">${s.etapes.map((e) => `<li><span class="t">${fmtHeure(e.t)}</span> ${esc(e.txt)}</li>`).join('')}</ol>` : ''}
        ${s.notes ? `<p style="margin:.5rem 0 0;white-space:pre-wrap">${esc(s.notes)}</p>` : ''}
        ${s.photos?.length ? `<div class="photos">${s.photos.map((p) => `<img src="${p}" alt="Photo de sortie" loading="lazy" data-zoom>`).join('')}</div>` : ''}
        ${s.videos?.length ? `<div class="links">${s.videos.map((v) => `<a href="${esc(v)}" target="_blank" rel="noopener">🎬 ${esc(v)}</a>`).join('')}</div>` : ''}
        <div class="btn-row"><button class="btn small" data-edit="${s.id}">Modifier</button>
        <button class="btn small" data-del="${s.id}" style="border-color:var(--danger);color:var(--danger)">Supprimer</button></div>
      </article>`).join('');

    list.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => formulaire(Store.sorties().find((s) => s.id === b.dataset.edit)));
    list.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => {
      if (!confirm('Supprimer cette sortie ?')) return;
      Store.saveSorties(Store.sorties().filter((s) => s.id !== b.dataset.del));
      render();
    });
    list.querySelectorAll('[data-zoom]').forEach((img) => img.onclick = () =>
      App.modal(`<img src="${img.src}" alt="Photo" style="width:100%;border-radius:10px">`));
  }

  // ---------- Formulaire ----------
  function formulaire(s) {
    const edit = !!s?.id;
    s = { id: Store.uid(), date: new Date().toISOString().slice(0, 10), photos: [], videos: [], ...s };
    let photos = [...(s.photos || [])];
    const caves = Store.caves();
    const h = Math.floor((s.dureeMin || 0) / 60), m = (s.dureeMin || 0) % 60;

    App.modal(`
      <h2>${edit ? 'Modifier la sortie' : 'Nouvelle sortie'}</h2>
      <form class="form" id="sortie-form">
        <label>Date<input type="date" name="date" required value="${esc(s.date)}"></label>
        <label>Cavité
          <input name="caveNom" list="caves-list" required value="${esc(s.caveNom || '')}" placeholder="Nom de la cavité">
          <datalist id="caves-list">${caves.map((c) => `<option value="${esc(c.nom)}">`).join('')}</datalist>
        </label>
        <label>Équipe<input name="equipe" value="${esc(s.equipe || '')}" placeholder="ex. Léa, Marc"></label>
        <div class="row">
          <label>Heures sous terre<input type="number" name="h" min="0" max="200" value="${h}"></label>
          <label>Minutes<input type="number" name="m" min="0" max="59" value="${m}"></label>
        </div>
        <label>Récit / notes<textarea name="notes" placeholder="Parcours, état de l'équipement, niveau d'eau…">${esc(s.notes || '')}</textarea></label>
        <label>Photos<input type="file" accept="image/*" multiple id="photo-input"></label>
        <div class="photos" id="photo-preview"></div>
        <label>Liens vidéo (YouTube, Drive… un par ligne)<textarea name="videos" placeholder="https://youtu.be/…">${esc((s.videos || []).join('\n'))}</textarea></label>
        <button class="btn primary" type="submit" style="width:100%">Enregistrer</button>
      </form>`, (root) => {
      const preview = root.querySelector('#photo-preview');
      const drawPhotos = () => {
        preview.innerHTML = photos.map((p, i) => `<div class="photo-thumb"><img src="${p}" alt=""><button type="button" data-rm="${i}">✕</button></div>`).join('');
        preview.querySelectorAll('[data-rm]').forEach((b) => b.onclick = () => { photos.splice(+b.dataset.rm, 1); drawPhotos(); });
      };
      drawPhotos();
      root.querySelector('#photo-input').onchange = async (e) => {
        for (const file of e.target.files) {
          try { photos.push(await reduirePhoto(file)); } catch { alert(`Impossible de lire ${file.name}`); }
        }
        e.target.value = '';
        drawPhotos();
      };
      root.querySelector('#sortie-form').onsubmit = (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        const caveNom = f.get('caveNom').trim();
        const cave = caves.find((c) => c.nom === caveNom);
        const sortie = {
          ...s,
          date: f.get('date'),
          caveNom, caveId: cave?.id || s.caveId || null,
          equipe: f.get('equipe').trim(),
          dureeMin: (Number(f.get('h')) || 0) * 60 + (Number(f.get('m')) || 0),
          notes: f.get('notes').trim(),
          photos,
          videos: liensValides(f.get('videos')),
        };
        const all = Store.sorties().filter((x) => x.id !== sortie.id);
        all.push(sortie);
        if (!Store.saveSorties(all)) return;
        // Une sortie notée = cavité « faite »
        if (sortie.caveId) { const st = Store.statut(); st[sortie.caveId] = 'faite'; Store.saveStatut(st); App.refreshMarkers(); }
        App.closeModal();
        App.show('carnet');
      };
    });
  }

  return { render, nouvelle: formulaire, reduirePhoto };
})();
