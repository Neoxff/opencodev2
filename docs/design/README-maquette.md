# README — Maquette Opencodev2

## À quoi elle sert

`maquette-opencodev2.html` est la **référence visuelle validée** de l'interface v3.
Elle sert de cible de conception pour le webui (`packages/webui`, Solid + Vite) :
couleurs, composition, ciel étoilé, panneaux et typographie. Ce document est une
maquette statique, pas du code applicatif : il n'est pas chargé par `bun run web`.

La maquette a été copiée **sans modification** dans ce dépôt. Son empreinte SHA-256
est `452345d74e2378c69888b0af77bc357f96bb55b3dc1183fae54d6334453d562d`
(25 093 octets). Elle utilise `background:#000` et aucun `color-scheme:light`.

## Comment l'ouvrir

Ouvrez le fichier local directement dans Chromium, sans serveur :

```
file:///home/joachim/Documents/opencodev2/docs/design/maquette-opencodev2.html
```

Vous pouvez aussi glisser le fichier dans une fenêtre Chromium, ou utiliser
`Ctrl+O` puis sélectionner `docs/design/maquette-opencodev2.html`.

## Priorité des valeurs (important)

**Les valeurs de verre du document de prompts remplacent celles de la maquette.**
Là où la maquette et le document de prompts diffèrent, c'est le document de prompts
qui l'emporte : verre **plus sobre**, presque absent. En cas de doute, choisir
**plus de noir et moins de verre**.

Règle absolue rappelée : **noir pur `#000` partout**, plein noir, jamais de bleu ni
de gris clair en fond. Trop de verre = refus.

Les autres décisions fixes restent en vigueur : thème sombre uniquement, ciel en
JavaScript (Worker + OffscreenCanvas, repli thread principal), pas de Rust pour le
ciel, messages et code jamais en verre.
