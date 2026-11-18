// Application principale : carte swisstopo, fiches cavités, navigation.
const App = (() => {
  // ---------- Navigation ----------
  function show(view) {
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + view));
    document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
    if (view !== 'map') closeSheet();
    if (view === 'map') setTimeout(() => map.invalidateSize(), 50);
    if (view === 'carnet') Carnet.render();
    if (view === 'profil') remplirProfil();
  }
  document.querySelectorAll('.tabbar button').forEach((b) => b.onclick = () => show(b.dataset.view));

  // ---------- Modale / panneau ----------
  const modalEl = document.getElementById('modal');
  function modal(html, onReady) {
    document.getElementById('modal-content').innerHTML = html;
    modalEl.classList.remove('hidden');
    onReady?.(document.getElementById('modal-content'));
  }
  function closeModal() { modalEl.classList.add('hidden'); }
  modalEl.addEventListener('click', (e) => { if (e.target === modalEl || e.target.closest('[data-close-modal]')) closeModal(); });

  const sheetEl = document.getElementById('sheet');
  function closeSheet() { sheetEl.classList.add('hidden'); }
  sheetEl.querySelector('[data-close-sheet]').onclick = closeSheet;

  // ---------- Carte swisstopo ----------
  const geoadmin = (layer, ext, opts = {}) => L.tileLayer(
    `https://wmts.geo.admin.ch/1.0.0/${layer}/default/current/3857/{z}/{x}/{y}.${ext}`,
    { maxZoom: 19, maxNativeZoom: 18, attribution: '© <a href="https://www.swisstopo.admin.ch/" target="_blank">swisstopo</a>', ...opts });

  const fonds = {
    carte: geoadmin('ch.swisstopo.pixelkarte-farbe', 'jpeg'),
    ortho: geoadmin('ch.swisstopo.swissimage', 'jpeg', { maxNativeZoom: 19 }),
  };
  const superpositions = {
    'ov-relief': geoadmin('ch.swisstopo.swissalti3d-reliefschattierung', 'png', { opacity: 0.45, maxNativeZoom: 17 }),
    'ov-ruissellement': geoadmin('ch.bafu.gefaehrdungskarte-oberflaechenabfluss', 'png', { opacity: 0.6, attribution: '© OFEV' }),
    'ov-pente': geoadmin('ch.swisstopo.hangneigung-ueber_30', 'png', { opacity: 0.5 }),
  };

  const map = L.map('map', { zoomControl: false }).setView([46.55, 6.25], 11); // Jura vaudois
  L.control.zoom({ position: 'bottomleft' }).addTo(map);
  let fondActif = fonds.carte.addTo(map);
  superpositions['ov-relief'].addTo(map);

  document.querySelectorAll('input[name="base"]').forEach((r) => r.onchange = () => {
    map.removeLayer(fondActif);
    fondActif = fonds[r.value].addTo(map);
    fondActif.bringToBack();
  });
  Object.keys(superpositions).forEach((id) => {
    document.getElementById(id).onchange = (e) => e.target.checked ? superpositions[id].addTo(map) : map.removeLayer(superpositions[id]);
  });
  document.getElementById('btn-layers').onclick = () => document.getElementById('layers-panel').classList.toggle('hidden');

  // Ma position
  let posMarker = null;
  document.getElementById('btn-locate').onclick = () => {
    if (!navigator.geolocation) return alert('Géolocalisation indisponible.');
    navigator.geolocation.getCurrentPosition((p) => {
      const ll = [p.coords.latitude, p.coords.longitude];
      posMarker?.remove();
      posMarker = L.circleMarker(ll, { radius: 8, color: '#fff', weight: 2, fillColor: '#4aa3ff', fillOpacity: 1 }).addTo(map);
      map.setView(ll, 15);
    }, () => alert('Position introuvable.'), { enableHighAccuracy: true, timeout: 15000 });
  };

  // ---------- Cavités ----------
  const markersLayer = L.layerGroup().addTo(map);
  function refreshMarkers() {
    markersLayer.clearLayers();
    const statut = Store.statut();
    Store.caves().forEach((c) => {
      const icon = L.divIcon({ className: '', html: `<div class="cave-marker ${statut[c.id] || ''}"></div>`, iconSize: [18, 18], iconAnchor: [9, 9] });
      L.marker([c.lat, c.lon], { icon, title: c.nom }).on('click', () => ouvrirFiche(c.id)).addTo(markersLayer);
    });
  }

  function ouvrirFiche(id) {
    const c = Store.caves().find((x) => x.id === id); if (!c) return;
    const statut = Store.statut()[c.id];
    const sorties = Store.sorties().filter((s) => s.caveId === c.id);
    const enCours = Store.alerte();
    const { E, N } = toLV95(c.lat, c.lon);
    const content = document.getElementById('sheet-content');
    content.innerHTML = `
      <h2>${esc(c.nom)}</h2>
      <div class="muted">${esc(c.commune || '')}${c.profondeur ? ` · prof. ${c.profondeur} m` : ''}${c.developpement ? ` · dév. ${c.developpement} m` : ''}
        · ${c.active ? '💧 active' : 'fossile'}</div>
      <div class="coords">WGS84 ${fmtCoords(c.lat, c.lon)} · CH ${Math.round(E)} / ${Math.round(N)}</div>
      ${c.coordsAVerifier ? '<div class="warn-box">⚠️ Coordonnées approximatives : clique sur « Modifier » pour mettre celles de l\'entrée.</div>' : ''}
      <div class="btn-row">
        ${c.grottocenter ? `<a class="btn small" href="${esc(c.grottocenter)}" target="_blank" rel="noopener">Grottocenter</a>` : ''}
        <a class="btn small" href="https://map.geo.admin.ch/?lang=fr&E=${Math.round(E)}&N=${Math.round(N)}&zoom=10&crosshair=marker" target="_blank" rel="noopener">swisstopo</a>
        <a class="btn small" href="https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lon}" target="_blank" rel="noopener">Itinéraire</a>
      </div>
      <div class="btn-row">
        <button class="btn small ${statut === 'afaire' ? 'primary' : ''}" data-statut="afaire">★ À faire</button>
        <button class="btn small ${statut === 'faite' ? 'primary' : ''}" data-statut="faite">✓ Déjà faite</button>
        <button class="btn small" data-edit>✎ Modifier</button>
      </div>
      ${enCours
        ? `<p class="muted">Sortie en cours : ${esc(enCours.caveNom)}</p>`
        : `<button class="btn danger" data-depart style="width:100%;margin-top:4px">🔦 Je pars sous terre</button>`}
      <div class="meteo" id="meteo-box"></div>
      ${c.acces ? `<h3>Accès</h3><p style="white-space:pre-wrap;margin:0">${esc(c.acces)}</p>` : ''}
      ${c.notes ? `<h3>Équipement / notes</h3><p style="white-space:pre-wrap;margin:0">${esc(c.notes)}</p>` : ''}
      <h3>Mes sorties ici (${sorties.length})</h3>
      ${sorties.length ? sorties.map((s) => `<div class="muted">📅 ${fmtDate(s.date)} · ${fmtDuree(s.dureeMin)}${s.equipe ? ' · ' + esc(s.equipe) : ''}</div>`).join('') : '<p class="muted">Aucune pour l\'instant.</p>'}`;

    content.querySelectorAll('[data-statut]').forEach((b) => b.onclick = () => {
      const st = Store.statut();
      st[c.id] = st[c.id] === b.dataset.statut ? undefined : b.dataset.statut;
      Store.saveStatut(st); refreshMarkers(); ouvrirFiche(c.id);
    });
    content.querySelector('[data-edit]').onclick = () => editerCave(c);
    content.querySelector('[data-depart]')?.addEventListener('click', () => Alerte.ouvrirDepart(c));
    Meteo.render(content.querySelector('#meteo-box'), c);
    sheetEl.classList.remove('hidden');
    sheetEl.scrollTop = 0;
  }

  function editerCave(c) {
    const nouveau = !Store.caves().some((x) => x.id === c.id);
    modal(`
      <h2>${nouveau ? 'Nouvelle cavité' : 'Modifier la cavité'}</h2>
      <form class="form" id="cave-form">
        <label>Nom<input name="nom" required value="${esc(c.nom || '')}"></label>
        <label>Commune<input name="commune" value="${esc(c.commune || '')}"></label>
        <div class="row">
          <label>Latitude<input name="lat" type="number" step="any" required value="${c.lat}"></label>
          <label>Longitude<input name="lon" type="number" step="any" required value="${c.lon}"></label>
        </div>
        <div class="row">
          <label>Profondeur (m)<input name="profondeur" type="number" min="0" value="${c.profondeur ?? ''}"></label>
          <label>Développement (m)<input name="developpement" type="number" min="0" value="${c.developpement ?? ''}"></label>
        </div>
        <label style="display:flex;gap:8px;align-items:center;color:var(--text)">
          <input type="checkbox" name="active" style="width:auto;margin:0" ${c.active ? 'checked' : ''}>
          Cavité active (rivière, siphon, se met en charge) — augmente le risque de crue
        </label>
        <label>Lien Grottocenter<input name="grottocenter" type="url" value="${esc(c.grottocenter || '')}" placeholder="https://grottocenter.org/…"></label>
        <label>Accès (parking, marche, autorisations)<textarea name="acces">${esc(c.acces || '')}</textarea></label>
        <label>Équipement / notes (cordes, amarrages, puits)<textarea name="notes">${esc(c.notes || '')}</textarea></label>
        <button class="btn primary" type="submit" style="width:100%">Enregistrer</button>
        ${nouveau ? '' : '<button class="btn" type="button" data-del style="width:100%;margin-top:8px;border-color:var(--danger);color:var(--danger)">Supprimer la cavité</button>'}
      </form>`, (root) => {
      root.querySelector('#cave-form').onsubmit = (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        const num = (k) => (f.get(k) === '' ? null : Number(f.get(k)));
        const lat = num('lat'), lon = num('lon');
        const cave = {
          ...c, nom: f.get('nom').trim(), commune: f.get('commune').trim(), lat, lon,
          profondeur: num('profondeur'), developpement: num('developpement'),
          active: f.get('active') === 'on', grottocenter: f.get('grottocenter').trim(),
          acces: f.get('acces').trim(), notes: f.get('notes').trim(),
        };
        if (lat !== c.lat || lon !== c.lon) cave.coordsAVerifier = false;
        const caves = Store.caves().filter((x) => x.id !== cave.id);
        caves.push(cave);
        Store.saveCaves(caves);
        closeModal(); refreshMarkers(); ouvrirFiche(cave.id);
      };
      root.querySelector('[data-del]')?.addEventListener('click', () => {
        if (!confirm('Supprimer cette cavité ?')) return;
        Store.saveCaves(Store.caves().filter((x) => x.id !== c.id));
        closeModal(); closeSheet(); refreshMarkers();
      });
    });
  }

  // Ajouter une cavité en touchant la carte
  let modeAjout = false;
  const btnAdd = document.getElementById('btn-add-cave');
  btnAdd.onclick = () => {
    modeAjout = !modeAjout;
    btnAdd.classList.toggle('on', modeAjout);
    document.getElementById('add-hint').classList.toggle('hidden', !modeAjout);
  };
  map.on('click', (e) => {
    document.getElementById('layers-panel').classList.add('hidden');
    if (!modeAjout) return;
    modeAjout = false; btnAdd.classList.remove('on');
    document.getElementById('add-hint').classList.add('hidden');
    editerCave({ id: Store.uid(), nom: '', lat: +e.latlng.lat.toFixed(6), lon: +e.latlng.lng.toFixed(6), active: false });
  });

  // ---------- Profil ----------
  const profilForm = document.getElementById('profil-form');
  function remplirProfil() {
    const p = Store.profil();
    ['nom', 'procheNom', 'procheTel'].forEach((k) => profilForm.elements[k].value = p[k] || '');
    document.getElementById('profil-saved').classList.add('hidden');
  }
  profilForm.onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(profilForm);
    Store.saveProfil({ nom: f.get('nom').trim(), procheNom: f.get('procheNom').trim(), procheTel: f.get('procheTel').trim() });
    document.getElementById('profil-saved').classList.remove('hidden');
  };

  document.getElementById('btn-new-sortie').onclick = () => Carnet.nouvelle({});

  // ---------- Démarrage ----------
  refreshMarkers();
  Alerte.majBandeau();

  return { show, modal, closeModal, closeSheet, refreshMarkers };
})();
