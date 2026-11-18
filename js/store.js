// Stockage local (dans le navigateur du téléphone / PC).
// Tout est enregistré sous des clés "speleo.*" dans localStorage.
const Store = (() => {
  const get = (key, fallback) => {
    try {
      const v = localStorage.getItem('speleo.' + key);
      return v === null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  };
  const set = (key, value) => {
    try {
      localStorage.setItem('speleo.' + key, JSON.stringify(value));
      return true;
    } catch (e) {
      alert("Impossible d'enregistrer : la mémoire du navigateur est peut-être pleine (trop de photos ?).");
      return false;
    }
  };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // Cavités d'exemple. Les coordonnées sont approximatives : à corriger
  // depuis la fiche (bouton « Modifier ») avec les vraies coordonnées de l'entrée.
  const DEFAULT_CAVES = [
    {
      id: 'lorettes',
      nom: 'Lorettes (Lésine des) [Gouffre des Fromages]',
      commune: 'Arzier-Le Muids',
      lat: 46.4890, lon: 6.1900,
      profondeur: 44, developpement: 125,
      active: false,
      acces: '',
      notes: '',
      coordsAVerifier: true,
    },
  ];

  return {
    uid,
    caves: () => get('caves', DEFAULT_CAVES),
    saveCaves: (c) => set('caves', c),
    profil: () => get('profil', {}),
    saveProfil: (p) => set('profil', p),
    sorties: () => get('sorties', []),
    saveSorties: (s) => set('sorties', s),
    alerte: () => get('alerte', null),
    saveAlerte: (a) => set('alerte', a),
    statut: () => get('statut', {}),          // { caveId: 'faite' | 'afaire' }
    saveStatut: (s) => set('statut', s),
  };
})();

// Petits utilitaires partagés
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtCoords = (lat, lon) => `${(+lat).toFixed(5)}, ${(+lon).toFixed(5)}`;
const fmtDuree = (min) => {
  min = Math.round(min || 0);
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
};
const fmtHeure = (iso) => new Date(iso).toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });
const fmtDate = (iso) => new Date(iso).toLocaleDateString('fr-CH', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });

// WGS84 -> coordonnées suisses LV95 (formules approchées swisstopo, précision ~1 m).
function toLV95(lat, lon) {
  const p = (lat * 3600 - 169028.66) / 10000;
  const l = (lon * 3600 - 26782.5) / 10000;
  const E = 2600072.37 + 211455.93 * l - 10938.51 * l * p - 0.36 * l * p * p - 44.54 * l ** 3;
  const N = 1200147.07 + 308807.95 * p + 3745.25 * l * l + 76.63 * p * p - 194.56 * l * l * p + 119.79 * p ** 3;
  return { E, N };
}
