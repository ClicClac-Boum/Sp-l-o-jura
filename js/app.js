// Application principale : carte swisstopo, fiches cavités, navigation.
const App = (() => {
  // ---------- Navigation ----------
  function show(view) {
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + view));
    document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
    if (view !== 'map') closeSheet();
    Alerte.majBandeau();
    if (view === 'map') setTimeout(() => map.invalidateSize(), 50);
    if (view === 'encours') EnCours.render();
    if (view === 'carnet') Carnet.render();
    if (view === 'profil') Profil.render();
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
  const zoomImage = (src) => modal(`<img src="${src}" alt="" style="width:100%;border-radius:10px">`);

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

  // Position GPS
  function maPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('Géolocalisation indisponible sur cet appareil.'));
      navigator.geolocation.getCurrentPosition(
        (p) => resolve(p.coords),
        () => reject(new Error('Position introuvable. Active la localisation et réessaie.')),
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
    });
  }
  let posMarker = null;
  document.getElementById('btn-locate').onclick = () => maPosition().then((c) => {
    const ll = [c.latitude, c.longitude];
    posMarker?.remove();
    posMarker = L.circleMarker(ll, { radius: 8, color: '#fff', weight: 2, fillColor: '#4aa3ff', fillOpacity: 1 }).addTo(map);
    map.setView(ll, 15);
  }).catch((e) => alert(e.message));

  // ---------- Cavités ----------
  const TYPES_CAVE = { gouffre: 'Gouffre', grotte: 'Grotte', perte: 'Perte', resurgence: 'Résurgence', mine: 'Mine / carrière', autre: 'Autre' };
  const DIFFICULTES = { '': '—', facile: 'Facile (initiation)', moyen: 'Moyen', difficile: 'Difficile', expert: 'Très difficile' };

  const markersLayer = L.layerGroup().addTo(map);
  function refreshMarkers() {
    markersLayer.clearLayers();
    const statut = Store.statut();
    Store.caves().forEach((c) => {
      const icon = L.divIcon({ className: '', html: `<div class="cave-marker ${statut[c.id] || ''}"></div>`, iconSize: [18, 18], iconAnchor: [9, 9] });
      L.marker([c.lat, c.lon], { icon, title: c.nom }).on('click', () => ouvrirFiche(c.id)).addTo(markersLayer);
    });
  }

  function sauverCave(cave) {
    const caves = Store.caves().filter((x) => x.id !== cave.id);
    caves.push(cave);
    return Store.saveCaves(caves);
  }

  const galerie = (imgs, label) => imgs?.length
    ? `<div class="photos">${imgs.map((p) => `<img src="${p}" alt="${label}" loading="lazy" data-zoom>`).join('')}</div>` : '';

  function ouvrirFiche(id) {
    const c = Store.caves().find((x) => x.id === id); if (!c) return;
    const statut = Store.statut()[c.id];
    const sorties = Store.sorties().filter((s) => s.caveId === c.id);
    const enCours = Store.alerte();
    const { E, N } = toLV95(c.lat, c.lon);
    const infos = [
      c.type && TYPES_CAVE[c.type],
      c.altitude && `alt. ${c.altitude} m`,
      c.profondeur && `prof. ${c.profondeur} m`,
      c.developpement && `dév. ${c.developpement} m`,
      c.active ? '💧 active' : 'fossile',
    ].filter(Boolean).join(' · ');
    const content = document.getElementById('sheet-content');
    content.innerHTML = `
      <h2>${esc(c.nom)}</h2>
      <div class="muted">${esc(c.commune || '')}${c.commune ? ' · ' : ''}${infos}</div>
      ${c.difficulte || c.duree ? `<div class="muted">${c.difficulte ? 'Difficulté : ' + esc(DIFFICULTES[c.difficulte]) : ''}${c.difficulte && c.duree ? ' · ' : ''}${c.duree ? 'Durée : ~' + esc(c.duree) + ' h' : ''}</div>` : ''}
      <div class="coords">WGS84 ${fmtCoords(c.lat, c.lon)} · CH ${Math.round(E)} / ${Math.round(N)}</div>
      ${c.coordsAVerifier ? '<div class="warn-box">⚠️ Coordonnées approximatives : clique sur « Modifier », puis « Utiliser ma position » une fois devant l\'entrée.</div>' : ''}
      ${c.restrictions ? `<div class="warn-box">🚫 ${esc(c.restrictions)}</div>` : ''}
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
        ? `<button class="btn" data-go-encours style="width:100%">Sortie en cours : ${esc(enCours.caveNom.split('[')[0].trim())} →</button>`
        : `<button class="btn danger" data-depart style="width:100%;margin-top:4px">🔦 Je pars sous terre</button>`}
      <div class="meteo" id="meteo-box"></div>
      <h3>Photos de l'entrée</h3>
      ${galerie(c.photosEntree, "Photo de l'entrée") || '<p class="muted">Aucune. Ajoute-les avec « Modifier ».</p>'}
      <h3>Topo</h3>
      ${galerie(c.topos, 'Topo') || '<p class="muted">Aucune topo. Ajoute une image (photo ou capture) avec « Modifier ».</p>'}
      <h3>Équipement</h3>
      <div id="eq-box"></div>
      ${c.acces ? `<h3>Accès</h3><p style="white-space:pre-wrap;margin:0">${esc(c.acces)}</p>` : ''}
      ${c.notes ? `<h3>Notes</h3><p style="white-space:pre-wrap;margin:0">${esc(c.notes)}</p>` : ''}
      <h3>Mes sorties ici (${sorties.length})</h3>
      ${sorties.length ? sorties.map((s) => `<div class="muted">📅 ${fmtDate(s.date)} · ${fmtDuree(s.dureeMin)}${s.equipe ? ' · ' + esc(s.equipe) : ''}</div>`).join('') : '<p class="muted">Aucune pour l\'instant.</p>'}`;

    content.querySelectorAll('[data-statut]').forEach((b) => b.onclick = () => {
      const st = Store.statut();
      st[c.id] = st[c.id] === b.dataset.statut ? undefined : b.dataset.statut;
      Store.saveStatut(st); refreshMarkers(); ouvrirFiche(c.id);
    });
    content.querySelector('[data-edit]').onclick = () => editerCave(c);
    content.querySelector('[data-depart]')?.addEventListener('click', () => Alerte.ouvrirDepart(c));
    content.querySelector('[data-go-encours]')?.addEventListener('click', () => show('encours'));
    content.querySelectorAll('[data-zoom]').forEach((img) => img.onclick = () => zoomImage(img.src));
    Equipement.render(content.querySelector('#eq-box'), c, (eq) => {
      sauverCave({ ...c, equipement: eq }); closeModal(); ouvrirFiche(c.id);
    });
    Meteo.render(content.querySelector('#meteo-box'), c);
    sheetEl.classList.remove('hidden');
    sheetEl.scrollTop = 0;
  }

  function editerCave(c) {
    const nouveau = !Store.caves().some((x) => x.id === c.id);
    const images = { topos: [...(c.topos || [])], photosEntree: [...(c.photosEntree || [])] };
    const opt = (obj, val) => Object.entries(obj).map(([k, v]) => `<option value="${k}" ${val === k ? 'selected' : ''}>${v}</option>`).join('');
    modal(`
      <h2>${nouveau ? 'Nouvelle cavité' : 'Modifier la cavité'}</h2>
      <form class="form" id="cave-form">
        <label>Nom<input name="nom" required value="${esc(c.nom || '')}"></label>
        <div class="row">
          <label>Commune<input name="commune" value="${esc(c.commune || '')}"></label>
          <label>Type<select name="type">${opt({ '': '—', ...TYPES_CAVE }, c.type || '')}</select></label>
        </div>
        <div class="row">
          <label>Latitude<input name="lat" type="number" step="any" required value="${c.lat}"></label>
          <label>Longitude<input name="lon" type="number" step="any" required value="${c.lon}"></label>
        </div>
        <button type="button" class="btn small" id="btn-gps">📍 Utiliser ma position actuelle</button>
        <p class="muted" id="gps-info" style="margin:.3rem 0 0"></p>
        <div class="row">
          <label>Altitude (m)<input name="altitude" type="number" value="${c.altitude ?? ''}"></label>
          <label>Profondeur (m)<input name="profondeur" type="number" min="0" value="${c.profondeur ?? ''}"></label>
          <label>Dév. (m)<input name="developpement" type="number" min="0" value="${c.developpement ?? ''}"></label>
        </div>
        <div class="row">
          <label>Difficulté<select name="difficulte">${opt(DIFFICULTES, c.difficulte || '')}</select></label>
          <label>Durée estimée (h)<input name="duree" type="number" min="0" step="0.5" value="${c.duree ?? ''}"></label>
        </div>
        <label style="display:flex;gap:8px;align-items:center;color:var(--text)">
          <input type="checkbox" name="active" style="width:auto;margin:0" ${c.active ? 'checked' : ''}>
          Cavité active (rivière, siphon, se met en charge) : augmente le risque de crue
        </label>
        <label>Restrictions (fermeture, chauves-souris, autorisation)<input name="restrictions" value="${esc(c.restrictions || '')}" placeholder="ex. fermée du 1er nov. au 31 mars (chiroptères)"></label>
        <label>Lien Grottocenter<input name="grottocenter" type="url" value="${esc(c.grottocenter || '')}" placeholder="https://grottocenter.org/…"></label>
        <label>Accès (parking, marche, propriétaire)<textarea name="acces">${esc(c.acces || '')}</textarea></label>
        <label>Notes<textarea name="notes">${esc(c.notes || '')}</textarea></label>
        <label>Photos de l'entrée<input type="file" accept="image/*" multiple data-img="photosEntree"></label>
        <div class="photos" data-preview="photosEntree"></div>
        <label>Topo (images : photo, capture d'écran…)<input type="file" accept="image/*" multiple data-img="topos"></label>
        <div class="photos" data-preview="topos"></div>
        <button class="btn primary" type="submit" style="width:100%;margin-top:12px">Enregistrer</button>
        ${nouveau ? '' : '<button class="btn" type="button" data-del style="width:100%;margin-top:8px;border-color:var(--danger);color:var(--danger)">Supprimer la cavité</button>'}
      </form>`, (root) => {
      const form = root.querySelector('#cave-form');
      const drawImgs = (k) => {
        const box = root.querySelector(`[data-preview="${k}"]`);
        box.innerHTML = images[k].map((p, i) => `<div class="photo-thumb"><img src="${p}" alt=""><button type="button" data-rm="${i}">✕</button></div>`).join('');
        box.querySelectorAll('[data-rm]').forEach((b) => b.onclick = () => { images[k].splice(+b.dataset.rm, 1); drawImgs(k); });
      };
      Object.keys(images).forEach(drawImgs);
      root.querySelectorAll('[data-img]').forEach((inp) => inp.onchange = async () => {
        const k = inp.dataset.img;
        // Les topos gardent plus de résolution pour rester lisibles.
        for (const f of inp.files) {
          try { images[k].push(await Carnet.reduirePhoto(f, k === 'topos' ? 2200 : 1280, k === 'topos' ? 0.8 : 0.72)); } catch { alert(`Impossible de lire ${f.name}`); }
        }
        inp.value = ''; drawImgs(k);
      });
      root.querySelector('#btn-gps').onclick = () => {
        const info = root.querySelector('#gps-info');
        info.textContent = 'Recherche de la position…';
        maPosition().then((p) => {
          form.elements.lat.value = p.latitude.toFixed(6);
          form.elements.lon.value = p.longitude.toFixed(6);
          if (p.altitude != null && !form.elements.altitude.value) form.elements.altitude.value = Math.round(p.altitude);
          info.textContent = `✓ Position prise (précision ± ${Math.round(p.accuracy)} m)`;
        }).catch((e) => { info.textContent = e.message; });
      };
      form.onsubmit = (e) => {
        e.preventDefault();
        const f = new FormData(form);
        const num = (k) => (f.get(k) === '' ? null : Number(f.get(k)));
        const lat = num('lat'), lon = num('lon');
        const cave = {
          ...c, nom: f.get('nom').trim(), commune: f.get('commune').trim(), type: f.get('type'), lat, lon,
          altitude: num('altitude'), profondeur: num('profondeur'), developpement: num('developpement'),
          difficulte: f.get('difficulte'), duree: num('duree'),
          active: f.get('active') === 'on', restrictions: f.get('restrictions').trim(),
          grottocenter: f.get('grottocenter').trim(), acces: f.get('acces').trim(), notes: f.get('notes').trim(),
          topos: images.topos, photosEntree: images.photosEntree,
        };
        if (lat !== c.lat || lon !== c.lon) cave.coordsAVerifier = false;
        if (!sauverCave(cave)) return;
        closeModal(); refreshMarkers(); ouvrirFiche(cave.id);
      };
      root.querySelector('[data-del]')?.addEventListener('click', (e) => {
        if (e.target.dataset.sure !== '1') { e.target.dataset.sure = '1'; e.target.textContent = 'Confirmer la suppression'; return; }
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

  document.getElementById('btn-new-sortie').onclick = () => Carnet.nouvelle({});

  // ---------- Démarrage ----------
  refreshMarkers();
  Alerte.majBandeau();
  if (Store.alerte()) setTimeout(() => show('encours'), 0);

  return { show, modal, closeModal, closeSheet, refreshMarkers, geoadmin, zoomImage, galerie };
})();
