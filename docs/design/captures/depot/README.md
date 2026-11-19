# Captures du panneau Dépôt

Captures produites avec Playwright (Chromium 157) sur le vrai composant `GitPanel` du webui,
avec une API simulée (`page.route` sur `/opencodev2/git/**` et `/opencodev2/auto/**`).
Le jeton de la balise meta est une valeur factice ; aucun secret réel n'apparaît dans ces images.
Note : le thème clair est une palette dérivée simulée, pas un thème implémenté.

| Fichier | État affiché | `data-etat` observé | Thème | Taille |
|---|---|---|---|---|
| depot-a-jour-dark.png | a-jour | a-jour | dark | 18498 octets |
| depot-en-avance-dark.png | en-avance | en-avance | dark | 18904 octets |
| depot-en-retard-dark.png | en-retard | en-retard | dark | 18324 octets |
| depot-divergent-dark.png | divergent | divergent | dark | 6380 octets |
| depot-conflit-dark.png | conflit | conflit | dark | 6148 octets |
| depot-hors-ligne-dark.png | hors-ligne | hors-ligne | dark | 6324 octets |
| depot-a-jour-light.png | a-jour | a-jour | light | 18084 octets |
| depot-en-avance-light.png | en-avance | en-avance | light | 18452 octets |
| depot-en-retard-light.png | en-retard | en-retard | light | 17829 octets |
| depot-divergent-light.png | divergent | divergent | light | 6448 octets |
| depot-conflit-light.png | conflit | conflit | light | 6224 octets |
| depot-hors-ligne-light.png | hors-ligne | hors-ligne | light | 6411 octets |

## Procédure

1. `cd packages/webui && OPENCODE_SERVER_PORT=4199 node_modules/.bin/vite --port 5199`
2. Harnais temporaire `capture.html` + `capture-entry.tsx` (non versionnés).
3. `node scripts/capture-depot.mjs` (hors dépôt, supprimé après capture).
