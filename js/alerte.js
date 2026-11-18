// Alerte de sortie + journal en direct.
// Principe : sous terre il n'y a pas de réseau, donc le téléphone ne peut pas
// donner l'alerte lui-même. AVANT de descendre, on envoie à ses proches un SMS
// avec la cavité, les coordonnées GPS de l'entrée, l'équipe, l'heure de retour
// prévue et l'heure limite à partir de laquelle ils doivent appeler les secours.
// En ressortant, on leur envoie « bien sorti ».
// Pendant la sortie, on peut noter des étapes horodatées (fonctionne hors réseau)
// qui sont reprises automatiquement dans le carnet.
const Alerte = (() => {
  const H = 3600 * 1000;

  const mapsLink = (lat, lon) => `https://www.google.com/maps?q=${(+lat).toFixed(5)},${(+lon).toFixed(5)}`;
  const smsLink = (tel, body) => `sms:${String(tel).replace(/[^\d+]/g, '')}?body=${encodeURIComponent(body)}`;
  const qui = (profil) => profil.nom || 'Je';

  function lv95(a) {
    const { E, N } = toLV95(a.lat, a.lon);
    return `${Math.round(E)} / ${Math.round(N)}`;
  }

  function infosMedicales(profil) {
    const m = profil.medical || {};
    if (!m.inclure) return '';
    const parts = [
      m.sang && `groupe ${m.sang}`,
      m.allergies && `allergies : ${m.allergies}`,
      m.traitements && `traitements : ${m.traitements}`,
      m.autre,
    ].filter(Boolean);
    return parts.length ? `Infos médicales : ${parts.join(' ; ')}` : '';
  }

  function messageDepart(a, profil) {
    return [
      profil.nom ? `[Spéléo] ${profil.nom} part sous terre.` : '[Spéléo] Je pars sous terre.',
      `Cavité : ${a.caveNom}${a.commune ? ' (' + a.commune + ')' : ''}`,
      `Entrée GPS : ${fmtCoords(a.lat, a.lon)}`,
      `Coord. suisses : ${lv95(a)}`,
      mapsLink(a.lat, a.lon),
      a.voiture ? `Voiture : ${a.voiture}` : '',
      `Équipe : ${a.equipe || 'seul'}`,
      `Entrée sous terre : ${fmtHeure(a.debut)}`,
      `Retour prévu : ${fmtHeure(a.retour)}`,
      `SANS NOUVELLES À ${fmtHeure(a.limite)} : appelle le 112 (ou Rega 1414 en Suisse), dis "accident de spéléologie" et donne ces coordonnées.`,
      infosMedicales(profil),
    ].filter(Boolean).join('\n');
  }
  const messageRetour = (a, profil) =>
    `[Spéléo] ${qui(profil)} : bien sorti de ${a.caveNom} à ${fmtHeure(new Date().toISOString())}. Tout va bien, pas besoin d'alerter. 👍`;
  const messageProlongation = (a, profil) =>
    `[Spéléo] ${qui(profil)} : sortie de ${a.caveNom} prolongée. Nouveau retour prévu ${fmtHeure(a.retour)}. ` +
    `Sans nouvelles à ${fmtHeure(a.limite)} : appelle le 112 / Rega 1414. Entrée GPS : ${fmtCoords(a.lat, a.lon)} (CH ${lv95(a)}) ${mapsLink(a.lat, a.lon)}`;

  // Un bouton SMS par proche + partage (WhatsApp…) + copie.
  function envoyerBoutons(proches, body) {
    const share = navigator.share ? `<button class="btn" type="button" data-share>Partager (WhatsApp…)</button>` : '';
    return `
      <div class="card"><pre style="white-space:pre-wrap;margin:0;font-family:inherit;font-size:.85rem">${esc(body)}</pre></div>
      <div class="btn-row">
        ${proches.map((p) => `<a class="btn primary" href="${smsLink(p.tel, body)}">📩 SMS à ${esc(p.nom || p.tel)}</a>`).join('')}
        ${share}
        <button class="btn" type="button" data-copy>Copier</button>
      </div>`;
  }
  function brancherEnvoi(root, body) {
    root.querySelector('[data-share]')?.addEventListener('click', () => navigator.share({ text: body }).catch(() => {}));
    root.querySelector('[data-copy]')?.addEventListener('click', (e) => {
      navigator.clipboard?.writeText(body).then(() => { e.target.textContent = '✓ Copié'; }).catch(() => {});
    });
  }

  // ---------- Démarrer une sortie ----------
  function ouvrirDepart(cave) {
    const profil = Store.profil();
    const proches = (profil.proches || []).filter((p) => p.tel);
    if (!proches.length) {
      App.modal(`<h2>Contact d'urgence manquant</h2>
        <p>Ajoute d'abord le numéro d'au moins un proche dans ton profil. C'est lui qui recevra les coordonnées GPS de l'entrée et qui appellera les secours si besoin.</p>
        <button class="btn primary" data-go-profil>Aller au profil</button>`, (root) => {
        root.querySelector('[data-go-profil]').onclick = () => { App.closeModal(); App.show('profil'); };
      });
      return;
    }
    if (Store.alerte()) { App.modal('<h2>Sortie déjà en cours</h2><p>Termine d\'abord la sortie en cours avec « Je suis sorti ».</p>'); return; }

    const pad = (n) => String(n).padStart(2, '0');
    const t = new Date(Date.now() + 5 * H);

    App.modal(`
      <h2>🔦 Je pars sous terre</h2>
      <p class="muted">${esc(cave.nom)}<br><span class="coords">GPS entrée : ${fmtCoords(cave.lat, cave.lon)}</span></p>
      ${cave.coordsAVerifier ? '<div class="warn-box">⚠️ Les coordonnées de cette cavité sont approximatives. Corrige-les dans la fiche avant de partir.</div>' : ''}
      <form class="form" id="depart-form">
        <label>Équipiers<input name="equipe" placeholder="ex. Léa, Marc"></label>
        <label>Voiture (optionnel)<input name="voiture" placeholder="ex. Golf grise VD 123 456, parking du chalet"></label>
        <div class="row">
          <label>Retour prévu<input name="retour" type="time" required value="${pad(t.getHours())}:${pad(t.getMinutes())}"></label>
          <label>Marge avant alerte
            <select name="marge">
              <option value="1">1 h</option><option value="2" selected>2 h</option>
              <option value="3">3 h</option><option value="4">4 h</option>
            </select>
          </label>
        </div>
        <p class="muted">Recevront le SMS : ${proches.map((p) => esc(p.nom || p.tel)).join(', ')}.</p>
        <button class="btn primary" type="submit">Préparer le message</button>
      </form>`, (root) => {
      root.querySelector('#depart-form').onsubmit = (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        const [hh, mm] = f.get('retour').split(':').map(Number);
        const retour = new Date(); retour.setHours(hh, mm, 0, 0);
        if (retour < new Date()) retour.setDate(retour.getDate() + 1); // retour le lendemain
        const limite = new Date(retour.getTime() + Number(f.get('marge')) * H);
        const a = {
          caveId: cave.id, caveNom: cave.nom, commune: cave.commune, lat: cave.lat, lon: cave.lon,
          equipe: f.get('equipe').trim(), voiture: f.get('voiture').trim(), debut: new Date().toISOString(),
          retour: retour.toISOString(), limite: limite.toISOString(), marge: Number(f.get('marge')), etapes: [],
        };
        const body = messageDepart(a, profil);
        root.innerHTML = `<h2>Envoie le message</h2>
          <p class="muted">Envoie-le <strong>avant de perdre le réseau</strong>, puis confirme.</p>
          ${envoyerBoutons(proches, body)}
          <button class="btn ok" data-confirm style="width:100%;margin-top:8px">✓ Message envoyé, je descends</button>`;
        brancherEnvoi(root, body);
        root.querySelector('[data-confirm]').onclick = () => {
          a.debut = new Date().toISOString();
          a.etapes = [{ t: a.debut, txt: 'Entrée sous terre' }];
          Store.saveAlerte(a);
          demanderNotif();
          App.closeModal(); App.closeSheet(); majBandeau(); App.show('encours');
        };
      };
    });
  }

  // ---------- Journal en direct ----------
  const ETAPES_RAPIDES = ['Tête de puits', 'Bas du puits', 'Fond atteint', 'Pause / repas', 'Demi-tour', 'Passage étroit', 'Eau / siphon', 'Problème matériel'];

  function ajouterEtape(txt) {
    const x = Store.alerte(); if (!x || !txt) return false;
    x.etapes = x.etapes || [];
    x.etapes.push({ t: new Date().toISOString(), txt });
    return Store.saveAlerte(x);
  }

  function ouvrirJournal() {
    const a = Store.alerte(); if (!a) return;
    const dessiner = (root) => {
      const cur = Store.alerte();
      root.innerHTML = `
        <h2>📝 Journal de sortie</h2>
        <p class="muted">Fonctionne sans réseau. Tout sera repris dans le carnet.</p>
        <div class="btn-row">${ETAPES_RAPIDES.map((e) => `<button class="btn small" type="button" data-quick="${esc(e)}">${esc(e)}</button>`).join('')}</div>
        <form class="form" id="etape-form" style="display:flex;gap:8px;align-items:flex-end">
          <label style="flex:1;margin:0">Note libre<input name="txt" placeholder="ex. P15 rééquipé, corde frottante"></label>
          <button class="btn primary" type="submit">Ajouter</button>
        </form>
        <ol class="timeline">${[...cur.etapes].reverse().map((e, i) => `
          <li><span class="t">${fmtHeure(e.t)}</span> ${esc(e.txt)}
          ${i < cur.etapes.length - 1 ? `<button type="button" class="link-del" data-rm="${cur.etapes.length - 1 - i}" aria-label="Supprimer">✕</button>` : ''}</li>`).join('')}</ol>`;
      const ajouter = (txt) => { if (ajouterEtape(txt)) dessiner(root); };
      root.querySelectorAll('[data-quick]').forEach((b) => b.onclick = () => ajouter(b.dataset.quick));
      root.querySelector('#etape-form').onsubmit = (e) => { e.preventDefault(); ajouter(new FormData(e.target).get('txt').trim()); };
      root.querySelectorAll('[data-rm]').forEach((b) => b.onclick = () => {
        const x = Store.alerte(); x.etapes.splice(+b.dataset.rm, 1); Store.saveAlerte(x); dessiner(root);
      });
    };
    App.modal('', dessiner);
  }

  // ---------- Fin de sortie ----------
  function ouvrirRetour() {
    const a = Store.alerte(); if (!a) return;
    const profil = Store.profil();
    const proches = (profil.proches || []).filter((p) => p.tel);
    const body = messageRetour(a, profil);
    App.modal(`<h2>✅ Je suis sorti</h2>
      <p>Préviens tes proches que tout va bien :</p>
      ${envoyerBoutons(proches, body)}
      <button class="btn ok" data-done style="width:100%;margin-top:8px">Terminer et noter dans le carnet</button>`, (root) => {
      brancherEnvoi(root, body);
      root.querySelector('[data-done]').onclick = () => {
        const fin = new Date();
        const etapes = [...(a.etapes || []), { t: fin.toISOString(), txt: 'Sortie' }];
        Store.saveAlerte(null);
        majBandeau();
        App.closeModal();
        App.show('map');
        Carnet.nouvelle({
          caveId: a.caveId, caveNom: a.caveNom,
          date: a.debut.slice(0, 10),
          equipe: a.equipe,
          dureeMin: Math.round((fin - new Date(a.debut)) / 60000),
          etapes,
        });
      };
    });
  }

  function ouvrirProlonger() {
    const a = Store.alerte(); if (!a) return;
    App.modal(`<h2>⏱ Prolonger la sortie</h2>
      <form class="form" id="prol-form">
        <label>Ajouter<select name="h"><option value="1">1 h</option><option value="2" selected>2 h</option><option value="3">3 h</option></select></label>
        <button class="btn primary" type="submit">Préparer le message</button>
      </form>`, (root) => {
      root.querySelector('#prol-form').onsubmit = (e) => {
        e.preventDefault();
        const add = Number(new FormData(e.target).get('h')) * H;
        a.retour = new Date(new Date(a.retour).getTime() + add).toISOString();
        a.limite = new Date(new Date(a.limite).getTime() + add).toISOString();
        const profil = Store.profil();
        const body = messageProlongation(a, profil);
        root.innerHTML = `<h2>Préviens tes proches</h2>${envoyerBoutons((profil.proches || []).filter((p) => p.tel), body)}
          <button class="btn ok" data-confirm style="width:100%;margin-top:8px">✓ Envoyé</button>`;
        brancherEnvoi(root, body);
        root.querySelector('[data-confirm]').onclick = () => { Store.saveAlerte(a); App.closeModal(); majBandeau(); EnCours.render(); };
      };
    });
  }

  // ---------- Bandeau + rappels ----------
  let notifiee = false;
  function demanderNotif() {
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  }
  function notifier(texte) {
    try {
      if ('Notification' in window && Notification.permission === 'granted') new Notification('Spéléo Jura', { body: texte });
    } catch { /* certains navigateurs mobiles refusent hors service worker */ }
    if (navigator.vibrate) navigator.vibrate([300, 150, 300]);
  }

  function majBandeau() {
    const el = document.getElementById('alert-banner');
    const a = Store.alerte();
    document.getElementById('tab-encours').classList.toggle('hidden', !a);
    if (!a) { el.classList.add('hidden'); document.body.classList.remove('has-banner'); notifiee = false; return; }
    const now = Date.now();
    const retour = new Date(a.retour).getTime();
    const enRetard = now > retour;
    const reste = Math.round((retour - now) / 60000);
    el.className = 'alert-banner' + (enRetard ? ' late' : '');
    el.innerHTML = `<span data-go style="cursor:pointer">${enRetard
      ? `⚠️ Retour dépassé ! Tes proches alertent les secours à ${fmtHeure(a.limite)}`
      : `🔦 ${esc(a.caveNom.split('[')[0].trim())} · retour ${fmtHeure(a.retour)} (${fmtDuree(reste)})`}</span>
      <span style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn small" data-journal style="border-color:currentColor;color:inherit">📝 Journal</button>
        <button class="btn small" data-prol style="border-color:currentColor;color:inherit">+ temps</button>
        <button class="btn small ok" data-sorti>Je suis sorti</button>
      </span>`;
    el.querySelector('[data-sorti]').onclick = ouvrirRetour;
    el.querySelector('[data-prol]').onclick = ouvrirProlonger;
    el.querySelector('[data-journal]').onclick = ouvrirJournal;
    el.querySelector('[data-go]').onclick = () => App.show('encours');
    // Sur la page « En cours », le bandeau ferait doublon : on le masque.
    const surEnCours = document.getElementById('view-encours').classList.contains('active');
    el.classList.toggle('hidden', surEnCours);
    document.body.classList.toggle('has-banner', !surEnCours);
    document.documentElement.style.setProperty('--banner-h', el.offsetHeight + 'px');
    if (enRetard && !notifiee) {
      notifiee = true;
      notifier(`Heure de retour dépassée. Si tu es sorti, préviens tes proches avant ${fmtHeure(a.limite)} !`);
    }
  }
  setInterval(majBandeau, 30 * 1000);

  return { ouvrirDepart, ouvrirRetour, ouvrirProlonger, ouvrirJournal, ajouterEtape, majBandeau, ETAPES_RAPIDES };
})();
