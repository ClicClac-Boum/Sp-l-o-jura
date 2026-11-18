// Alerte de sortie.
// Principe : sous terre il n'y a pas de réseau, donc le téléphone ne peut pas
// donner l'alerte lui-même. AVANT de descendre, on envoie au proche un SMS
// avec la cavité, les coordonnées GPS de l'entrée, l'équipe, l'heure de retour
// prévue et l'heure limite à partir de laquelle il doit appeler les secours.
// En ressortant, on lui envoie « bien sorti ».
const Alerte = (() => {
  const H = 3600 * 1000;

  const mapsLink = (lat, lon) => `https://www.google.com/maps?q=${(+lat).toFixed(5)},${(+lon).toFixed(5)}`;

  function smsLink(tel, body) {
    const num = String(tel).replace(/[^\d+]/g, '');
    return `sms:${num}?body=${encodeURIComponent(body)}`;
  }

  function messageDepart(a, profil) {
    return [
      (profil.nom ? `[Spéléo] ${profil.nom} part sous terre.` : '[Spéléo] Je pars sous terre.'),
      `Cavité : ${a.caveNom}${a.commune ? ' (' + a.commune + ')' : ''}`,
      `Entrée GPS : ${fmtCoords(a.lat, a.lon)}`,
      `Coord. suisses : ${Math.round(toLV95(a.lat, a.lon).E)} / ${Math.round(toLV95(a.lat, a.lon).N)}`,
      mapsLink(a.lat, a.lon),
      `Équipe : ${a.equipe || 'seul'}`,
      `Entrée sous terre : ${fmtHeure(a.debut)}`,
      `Retour prévu : ${fmtHeure(a.retour)}`,
      `SANS NOUVELLES À ${fmtHeure(a.limite)} : appelle le 112 (ou Rega 1414 en Suisse), dis "accident de spéléologie" et donne ces coordonnées.`,
    ].join('\n');
  }

  function messageRetour(a, profil) {
    return `[Spéléo] ${profil.nom || 'Je'} : bien sorti de ${a.caveNom} à ${fmtHeure(new Date().toISOString())}. Tout va bien, pas besoin d'alerter. 👍`;
  }

  function messageProlongation(a, profil) {
    return `[Spéléo] ${profil.nom || 'Je'} : sortie de ${a.caveNom} prolongée. Nouveau retour prévu ${fmtHeure(a.retour)}. ` +
      `Sans nouvelles à ${fmtHeure(a.limite)} : appelle le 112 / Rega 1414. Entrée GPS : ${fmtCoords(a.lat, a.lon)} ${mapsLink(a.lat, a.lon)}`;
  }

  // Ouvre l'appli SMS avec le message pré-rempli + propose le partage (WhatsApp…).
  function envoyerBoutons(tel, body) {
    const share = navigator.share ? `<button class="btn" data-share>Partager (WhatsApp…)</button>` : '';
    return `
      <div class="card"><pre style="white-space:pre-wrap;margin:0;font-family:inherit;font-size:.85rem">${esc(body)}</pre></div>
      <div class="btn-row">
        <a class="btn primary" href="${smsLink(tel, body)}">📩 Envoyer par SMS</a>
        ${share}
        <button class="btn" data-copy>Copier</button>
      </div>`;
  }
  function brancherEnvoi(root, body) {
    root.querySelector('[data-share]')?.addEventListener('click', () => navigator.share({ text: body }).catch(() => {}));
    root.querySelector('[data-copy]')?.addEventListener('click', (e) => {
      navigator.clipboard?.writeText(body).then(() => { e.target.textContent = '✓ Copié'; });
    });
  }

  // ---------- Démarrer une sortie ----------
  function ouvrirDepart(cave) {
    const profil = Store.profil();
    if (!profil.procheTel) {
      App.modal(`<h2>Contact d'urgence manquant</h2>
        <p>Ajoute d'abord le numéro d'un proche dans ton profil. C'est lui qui recevra les coordonnées GPS de l'entrée et qui appellera les secours si besoin.</p>
        <button class="btn primary" data-go-profil>Aller au profil</button>`, (root) => {
        root.querySelector('[data-go-profil]').onclick = () => { App.closeModal(); App.show('profil'); };
      });
      return;
    }
    if (Store.alerte()) { alert('Une sortie est déjà en cours. Termine-la d\'abord.'); return; }

    const pad = (n) => String(n).padStart(2, '0');
    const t = new Date(Date.now() + 5 * H);
    const retourDefaut = `${pad(t.getHours())}:${pad(t.getMinutes())}`;

    App.modal(`
      <h2>🔦 Je pars sous terre</h2>
      <p class="muted">${esc(cave.nom)}<br><span class="coords">GPS entrée : ${fmtCoords(cave.lat, cave.lon)}</span></p>
      ${cave.coordsAVerifier ? '<div class="warn-box">⚠️ Les coordonnées de cette cavité sont approximatives. Corrige-les dans la fiche avant de partir.</div>' : ''}
      <form class="form" id="depart-form">
        <label>Équipiers<input name="equipe" placeholder="ex. Léa, Marc"></label>
        <div class="row">
          <label>Retour prévu<input name="retour" type="time" required value="${retourDefaut}"></label>
          <label>Marge avant alerte
            <select name="marge">
              <option value="1">1 h</option>
              <option value="2" selected>2 h</option>
              <option value="3">3 h</option>
              <option value="4">4 h</option>
            </select>
          </label>
        </div>
        <p class="muted">Ton proche (${esc(profil.procheNom)}, ${esc(profil.procheTel)}) recevra un SMS avec toutes les infos.</p>
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
          equipe: f.get('equipe').trim(), debut: new Date().toISOString(),
          retour: retour.toISOString(), limite: limite.toISOString(), marge: Number(f.get('marge')),
        };
        const body = messageDepart(a, profil);
        root.innerHTML = `<h2>Envoie le message à ${esc(profil.procheNom)}</h2>
          <p class="muted">Envoie-le <strong>avant de perdre le réseau</strong>, puis confirme.</p>
          ${envoyerBoutons(profil.procheTel, body)}
          <button class="btn ok" data-confirm style="width:100%;margin-top:8px">✓ Message envoyé, je descends</button>`;
        brancherEnvoi(root, body);
        root.querySelector('[data-confirm]').onclick = () => {
          a.debut = new Date().toISOString();
          Store.saveAlerte(a);
          demanderNotif();
          App.closeModal(); App.closeSheet(); majBandeau();
        };
      };
    });
  }

  // ---------- Fin de sortie ----------
  function ouvrirRetour() {
    const a = Store.alerte(); if (!a) return;
    const profil = Store.profil();
    const body = messageRetour(a, profil);
    App.modal(`<h2>✅ Je suis sorti</h2>
      <p>Préviens ${esc(profil.procheNom)} que tout va bien :</p>
      ${envoyerBoutons(profil.procheTel, body)}
      <button class="btn ok" data-done style="width:100%;margin-top:8px">Terminer et noter dans le carnet</button>`, (root) => {
      brancherEnvoi(root, body);
      root.querySelector('[data-done]').onclick = () => {
        const fin = new Date();
        Store.saveAlerte(null);
        majBandeau();
        App.closeModal();
        Carnet.nouvelle({
          caveId: a.caveId, caveNom: a.caveNom,
          date: a.debut.slice(0, 10),
          equipe: a.equipe,
          dureeMin: Math.round((fin - new Date(a.debut)) / 60000),
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
        root.innerHTML = `<h2>Préviens ${esc(profil.procheNom)}</h2>${envoyerBoutons(profil.procheTel, body)}
          <button class="btn ok" data-confirm style="width:100%;margin-top:8px">✓ Envoyé</button>`;
        brancherEnvoi(root, body);
        root.querySelector('[data-confirm]').onclick = () => { Store.saveAlerte(a); App.closeModal(); majBandeau(); };
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
    if (!a) { el.classList.add('hidden'); document.body.classList.remove('has-banner'); notifiee = false; return; }
    const now = Date.now();
    const retour = new Date(a.retour).getTime();
    const enRetard = now > retour;
    const reste = Math.round((retour - now) / 60000);
    el.className = 'alert-banner' + (enRetard ? ' late' : '');
    el.innerHTML = `<span>${enRetard
      ? `⚠️ Retour dépassé ! Ton proche alerte les secours à ${fmtHeure(a.limite)}`
      : `🔦 ${esc(a.caveNom.split('[')[0].trim())} · retour ${fmtHeure(a.retour)} (${fmtDuree(reste)})`}</span>
      <span style="display:flex;gap:6px">
        <button class="btn small" data-prol style="border-color:currentColor;color:inherit">+ temps</button>
        <button class="btn small ok" data-sorti>Je suis sorti</button>
      </span>`;
    el.querySelector('[data-sorti]').onclick = ouvrirRetour;
    el.querySelector('[data-prol]').onclick = ouvrirProlonger;
    document.body.classList.add('has-banner');
    if (enRetard && !notifiee) {
      notifiee = true;
      notifier(`Heure de retour dépassée. Si tu es sorti, préviens ton proche avant ${fmtHeure(a.limite)} !`);
    }
  }
  setInterval(majBandeau, 30 * 1000);

  return { ouvrirDepart, ouvrirRetour, majBandeau };
})();
