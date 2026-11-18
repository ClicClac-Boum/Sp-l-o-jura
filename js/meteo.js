// Météo et risque de crue pour une cavité.
// Données : Open-Meteo (gratuit, sans clé), modèle MeteoSuisse ICON-CH quand
// il est disponible, sinon le meilleur modèle pour le lieu.
// Le risque est INDICATIF : il ne remplace ni le bulletin MeteoSuisse ni la
// connaissance de la cavité.
const Meteo = (() => {
  const cache = {};

  async function fetchPluie(lat, lon) {
    const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
    if (cache[key] && Date.now() - cache[key].t < 30 * 60 * 1000) return cache[key].data;
    const base = 'https://api.open-meteo.com/v1/forecast';
    const params = `latitude=${lat}&longitude=${lon}&hourly=precipitation,temperature_2m,snowfall` +
      `&past_days=3&forecast_days=3&timezone=Europe%2FZurich`;
    let res = await fetch(`${base}?${params}&models=meteoswiss_icon_ch2`).catch(() => null);
    if (!res || !res.ok) res = await fetch(`${base}?${params}`);
    if (!res.ok) throw new Error('Météo indisponible');
    const data = await res.json();
    cache[key] = { t: Date.now(), data };
    return data;
  }

  // Calcule les cumuls de pluie passés / à venir et un niveau de risque.
  function analyser(data, caveActive) {
    const times = data.hourly.time.map((t) => new Date(t).getTime());
    const pluie = data.hourly.precipitation.map((v) => v || 0);
    const neige = (data.hourly.snowfall || []).map((v) => v || 0);
    const temp = data.hourly.temperature_2m || [];
    const now = Date.now();
    const sum = (from, to, arr = pluie) => arr.reduce((s, v, i) => (times[i] >= from && times[i] < to ? s + v : s), 0);
    const H = 3600 * 1000;
    const passe72 = sum(now - 72 * H, now);
    const passe24 = sum(now - 24 * H, now);
    const futur24 = sum(now, now + 24 * H);
    const futur48 = sum(now, now + 48 * H);
    const neigeAuSol = sum(now - 72 * H, now, neige); // cm tombés récemment
    const idxNow = times.findIndex((t) => t >= now);
    const tempNow = idxNow >= 0 ? temp[idxNow] : null;
    // Fonte : neige récente + températures positives = apport d'eau.
    const fonte = neigeAuSol > 5 && tempNow !== null && tempNow > 3;

    // Score simple : la pluie à venir pèse plus que la pluie passée.
    let score = futur24 * 2 + (futur48 - futur24) + passe24 * 1.5 + (passe72 - passe24) * 0.5;
    if (fonte) score += 20;
    if (!caveActive) score *= 0.5; // cavité fossile : moins exposée

    let niveau = 'faible', texte = 'Faible';
    if (score >= 60) { niveau = 'eleve'; texte = 'Élevé'; }
    else if (score >= 25) { niveau = 'modere'; texte = 'Modéré'; }

    return { passe72, passe24, futur24, futur48, fonte, tempNow, niveau, texte, times, pluie, now };
  }

  // Petit histogramme SVG : 72 h passées + 72 h à venir.
  function graphique(a) {
    const W = 300, Hh = 80, n = a.pluie.length;
    const max = Math.max(4, ...a.pluie);
    const bw = W / n;
    const nowX = a.times.findIndex((t) => t >= a.now) * bw;
    const bars = a.pluie.map((v, i) => {
      const h = (v / max) * (Hh - 14);
      const futur = a.times[i] >= a.now;
      return `<rect x="${(i * bw).toFixed(2)}" y="${(Hh - 12 - h).toFixed(2)}" width="${Math.max(bw - 0.3, 0.5).toFixed(2)}" height="${h.toFixed(2)}" fill="${futur ? '#4aa3ff' : '#4aa3ff77'}"/>`;
    }).join('');
    return `<svg class="rain-chart" viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="none" role="img" aria-label="Pluie heure par heure">
      ${bars}
      <line x1="${nowX}" x2="${nowX}" y1="0" y2="${Hh - 12}" stroke="#ff7a3d" stroke-width="1.5"/>
      <text x="2" y="${Hh - 1}" fill="#a7b6b8" font-size="9">−72 h</text>
      <text x="${nowX - 14}" y="${Hh - 1}" fill="#ff7a3d" font-size="9">maint.</text>
      <text x="${W - 26}" y="${Hh - 1}" fill="#a7b6b8" font-size="9">+72 h</text>
      <text x="${W - 2}" y="9" fill="#a7b6b8" font-size="9" text-anchor="end">max ${max.toFixed(1)} mm/h</text>
    </svg>`;
  }

  async function render(el, cave) {
    el.innerHTML = '<p class="muted">Chargement de la météo…</p>';
    try {
      const a = analyser(await fetchPluie(cave.lat, cave.lon), cave.active);
      el.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
          <strong>Risque de crue</strong>
          <span class="risk ${a.niveau}">${a.texte}</span>
        </div>
        ${graphique(a)}
        <p class="muted" style="margin:.4rem 0 0">
          Pluie : ${a.passe72.toFixed(1)} mm sur 72 h · ${a.passe24.toFixed(1)} mm sur 24 h<br>
          Prévu : ${a.futur24.toFixed(1)} mm dans 24 h · ${a.futur48.toFixed(1)} mm dans 48 h
          ${a.tempNow !== null ? `<br>Température : ${a.tempNow.toFixed(0)} °C` : ''}
          ${a.fonte ? '<br>⚠️ Neige récente + redoux : fonte possible' : ''}
        </p>
        <p class="muted" style="font-size:.75rem;margin:.4rem 0 0">
          ${cave.active ? 'Cavité active (circulation d\'eau).' : 'Cavité marquée fossile : risque réduit de moitié.'}
          Estimation indicative. Consultez aussi <a href="https://www.meteosuisse.admin.ch/" target="_blank" rel="noopener" style="color:var(--accent)">MeteoSuisse</a>.
        </p>`;
    } catch (e) {
      el.innerHTML = '<p class="muted">Météo indisponible (pas de réseau ?).</p>';
    }
  }

  return { render };
})();
