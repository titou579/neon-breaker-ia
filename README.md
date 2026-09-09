# NEON BREAKER

Un jeu d'arcade de casse-briques au style néon, codé en vanilla HTML/CSS/JavaScript — sans aucune dépendance externe.

## Aperçu

- 5 niveaux avec difficulté croissante
  - Niveau 1 : Introduction (briques simples)
  - Niveau 2 : Pyramide
  - Niveau 3 : Damier
  - Niveau 4 : Forteresse (briques résistantes)
  - Niveau 5 : Défi final (briques renforcées)
- 3 types de briques : Normales (1 coup), Résistantes (2 coups), Renforcées (3 coups)
- 2 power-ups : Raquette large (W) et Balle lente (S)
- Système de combo : les bris successifs multiplient le score
- Effets visuels : particules, screen shake, traînée de balle, glow néon
- Sons procéduraux générés via Web Audio API (aucun fichier audio requis)
- Contrôles : souris, clavier (flèches / A-D), et tactile
- Score sauvegardé localement (localStorage)
- Design responsive adapté au desktop et au mobile

## Contrôles

| Action | Contrôle |
|--------|----------|
| Déplacer la raquette | Souris, Flèches gauche/droite, ou A/D |
| Lancer la balle | Espace ou Clic |
| Pause | P ou Échap |
| Couper le son | M ou bouton en haut à droite |

## Structure du projet

```
neon-breaker/
├── index.html      # Structure HTML
├── style.css       # Styles et design néon
├── game.js         # Logique du jeu complète
├── render.yaml     # Configuration Render (optionnel)
└── README.md       # Ce fichier
```

## Lancer localement

Aucune installation requise. Ouvrez simplement `index.html` dans un navigateur.

Ou utilisez un serveur local :

```bash
# Avec Python
python3 -m http.server 8080

# Puis ouvrez http://localhost:8080
```

## Déploiement sur Render

### Option 1 : Via le tableau de bord Render

1. Créez un nouveau dépôt GitHub contenant tous les fichiers
2. Sur [render.com](https://render.com), cliquez sur "New" puis "Static Site"
3. Connectez votre dépôt GitHub
4. Configurez :
   - **Build Command** : (laisser vide)
   - **Publish Directory** : `.` (racine)
5. Cliquez sur "Create Static Site"

### Option 2 : Via render.yaml

Le fichier `render.yaml` est inclus. Après avoir connecté votre dépôt GitHub à Render, le service sera détecté automatiquement.

## Technologies

- HTML5 Canvas (rendu 2D)
- CSS3 (animations, flexbox, backdrop-filter)
- JavaScript vanilla (ES5 compatible)
- Web Audio API (sons procéduraux)
- localStorage (sauvegarde du score)

## Licence

MIT — Libre d'utilisation, de modification et de distribution.
