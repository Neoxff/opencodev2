# Référence UI — Opencodev2

Ce dossier contient les deux pièces de référence visuelle du projet. Elles sont ajoutées telles quelles, sans modification.

## Les deux fichiers

- `maquette-opencodev2-ui.html` — la maquette HTML de l'interface. C'est la source de vérité visuelle : elle fixe ce qui doit être reproduit à l'identique (espacements, rayons, tailles, polices, icônes, libellés anglais, texte qui s'estompe, curseur à trois points).
- `reference-opencode-v2.md` — la transcription textuelle des libellés de la capture de référence (`opencodeV2`, `Workspaces`, `Archived`, `Server`, `New session`, `Goal definition`, `Working...`). La capture étant fournie sous forme de texte et non d'image binaire, elle est conservée en `.md` pour refléter son contenu réel. Elle sert de garde-fou pour les textes exacts.

## Ouvrir la maquette

Aucun serveur n'est nécessaire : c'est un fichier HTML autonome. Depuis la racine du dépôt :

```
xdg-open docs/design/maquette-opencodev2-ui.html
```

ou directement dans Chromium :

```
chromium docs/design/maquette-opencodev2-ui.html
```

Les polices sont chargées depuis Google Fonts ; une connexion est nécessaire pour le rendu exact des polices.

## Priorité en cas de conflit

En cas de divergence entre cette maquette et un ancien document de design (`19-tokens.md`, `20-ciel-etoile.md`, `21-animations.md`, etc.), **la maquette gagne**. Chaque écart est une anomalie à corriger, pas une interprétation.

Règles rappelées : noir pur `#000` partout, verre quasi absent (au plus deux surfaces, flou 6 px, fond `rgba(0,0,0,.88)`), aucune étoile filante, aucune teinte bleue ou violette en fond. En cas de doute : plus noir, moins de verre.
