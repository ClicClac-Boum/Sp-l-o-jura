# Spéléo Jura

Application web (mobile et PC) pour les cavités du Jura.

- **Carte swisstopo** : carte nationale ou photo aérienne, relief ombré swissALTI3D, zones d'inondation par ruissellement (OFEV), pentes > 30°.
- **Fiche cavité** : profondeur, développement, coordonnées WGS84 et suisses (LV95), accès, équipement, liens swisstopo / Grottocenter / itinéraire. Ajout d'une cavité en touchant la carte.
- **Météo et risque de crue** : pluie des 72 h passées et prévue pour les 72 h à venir (Open-Meteo), estimation indicative du risque, plus élevé pour une cavité active.
- **Alerte de sortie** : chacun enregistre le numéro d'un proche. Avant de descendre, l'app prépare un SMS pour lui : cavité, coordonnées GPS de l'entrée, équipe, heure de retour et heure limite pour appeler le 112 / Rega 1414. Au retour : SMS « bien sorti ».
- **Carnet de sorties** : date, équipe, temps passé sous terre (calculé automatiquement après une alerte), photos, liens vidéo.

Les données sont stockées dans le navigateur (localStorage), sans compte ni serveur.

## Lancer en local

```
python -m http.server 8000
```
puis ouvrir http://localhost:8000
