// Page « En cours » : tout ce qu'il faut pendant la sortie, pour la seule
// cavité sélectionnée : carte avec son unique point, photos de l'entrée,
// topo, équipement, journal et boutons de fin de sortie.
const EnCours = (() => {
  let miniMap = null, marker = null;

  function render() {
    const a = Store.alerte();
    const head = document.getElementById('encours-head');
    const body = document.getElementById('encours-body');
    const mapEl = document.getElementById('encours-map');
    if (!a) {
      head.innerHTML = `<h1>Aucune sortie en cours</h1>
        <p class="muted">Ouvre une cavité sur la carte et appuie sur « Je pars sous terre ».</p>`;
      body.innerHTML = '';
      mapEl.classList.add('hidden');
      return;
    }
    const cave = Store.caves().find((c) => c.id === a.caveId) || { id: a.caveId, nom: a.caveNom, lat: a.lat, lon: a.lon };
    const depuis = Math.round((Date.now() - new Date(a.debut)) / 60000);
    const retard = Date.now() > new Date(a.retour);

    head.innerHTML = `
      <h1>${esc(cave.nom)}</h1>
      <div class="muted">${[cave.commune, cave.profondeur && `prof. ${cave.profondeur} m`, cave.developpement && `dév. ${cave.developpement} m`].filter(Boolean).map(esc).join(' · ')}</div>
      <div class="encours-stats">
        <div class="stat"><b>${fmtDuree(depuis)}</b><span>sous terre</span></div>
        <div class="stat ${retard ? 'late' : ''}"><b>${fmtHeure(a.retour)}</b><span>retour prévu</span></div>
        <div class="stat"><b>${fmtHeure(a.limite)}</b><span>alerte secours</span></div>
      </div>
      <div class="btn-row">
        <button class="btn" data-prol>+ temps</button>
        <button class="btn ok" data-sorti style="flex:1">✅ Je suis sorti</button>
      </div>`;
    head.querySelector('[data-prol]').onclick = Alerte.ouvrirProlonger;
    head.querySelector('[data-sorti]').onclick = Alerte.ouvrirRetour;

    // Carte : uniquement le point de la cavité
    mapEl.classList.remove('hidden');
    const ll = [cave.lat, cave.lon];
    if (!miniMap) {
      miniMap = L.map(mapEl, { zoomControl: true, attributionControl: true }).setView(ll, 16);
      App.geoadmin('ch.swisstopo.pixelkarte-farbe', 'jpeg').addTo(miniMap);
      App.geoadmin('ch.swisstopo.swissalti3d-reliefschattierung', 'png', { opacity: 0.4, maxNativeZoom: 17 }).addTo(miniMap);
    }
    marker?.remove();
    marker = L.marker(ll, {
      icon: L.divIcon({ className: '', html: '<div class="cave-marker big"></div>', iconSize: [26, 26], iconAnchor: [13, 13] }),
    }).addTo(miniMap);
    setTimeout(() => { miniMap.invalidateSize(); miniMap.setView(ll, miniMap.getZoom() || 16); }, 50);

    const { E, N } = toLV95(cave.lat, cave.lon);
    body.innerHTML = `
      <div class="coords" style="margin-bottom:8px">Entrée : ${fmtCoords(cave.lat, cave.lon)} · CH ${Math.round(E)} / ${Math.round(N)}</div>

      <section class="card">
        <h3 style="margin-top:0">📝 Journal</h3>
        <div class="btn-row">${Alerte.ETAPES_RAPIDES.map((e) => `<button class="btn small" type="button" data-quick="${esc(e)}">${esc(e)}</button>`).join('')}</div>
        <form class="form" id="enc-etape" style="display:flex;gap:8px;align-items:flex-end">
          <label style="flex:1;margin:0">Note<input name="txt" placeholder="ex. P15 rééquipé, corde frottante"></label>
          <button class="btn primary" type="submit">Ajouter</button>
        </form>
        <ol class="timeline">${[...a.etapes].reverse().map((e) => `<li><span class="t">${fmtHeure(e.t)}</span> ${esc(e.txt)}</li>`).join('')}</ol>
      </section>

      <h3>Photos de l'entrée</h3>
      ${App.galerie(cave.photosEntree, "Photo de l'entrée") || '<p class="muted">Aucune photo d\'entrée enregistrée.</p>'}

      <h3>Topo</h3>
      ${cave.topos?.length ? cave.topos.map((t) => `<img class="topo-img" src="${t}" alt="Topo" data-zoom>`).join('') : '<p class="muted">Aucune topo enregistrée. Ajoute-la depuis la fiche de la cavité (Modifier).</p>'}

      <h3>Équipement</h3>
      <div id="enc-eq"></div>

      ${cave.acces ? `<h3>Accès</h3><p style="white-space:pre-wrap;margin:0">${esc(cave.acces)}</p>` : ''}
      ${cave.notes ? `<h3>Notes</h3><p style="white-space:pre-wrap;margin:0">${esc(cave.notes)}</p>` : ''}`;

    const ajouter = (txt) => { if (Alerte.ajouterEtape(txt)) render(); };
    body.querySelectorAll('[data-quick]').forEach((b) => b.onclick = () => ajouter(b.dataset.quick));
    body.querySelector('#enc-etape').onsubmit = (e) => { e.preventDefault(); ajouter(new FormData(e.target).get('txt').trim()); };
    body.querySelectorAll('[data-zoom]').forEach((img) => img.onclick = () => App.zoomImage(img.src));
    Equipement.render(body.querySelector('#enc-eq'), cave, (eq) => {
      const caves = Store.caves().filter((x) => x.id !== cave.id);
      caves.push({ ...cave, equipement: eq });
      Store.saveCaves(caves); App.closeModal(); render();
    });
  }

  // Rafraîchit le chrono si la page est affichée.
  setInterval(() => {
    if (document.getElementById('view-encours').classList.contains('active') && !document.querySelector('#enc-etape input:focus')) {
      const y = document.getElementById('view-encours').scrollTop;
      render();
      document.getElementById('view-encours').scrollTop = y;
    }
  }, 60 * 1000);

  return { render };
})();
