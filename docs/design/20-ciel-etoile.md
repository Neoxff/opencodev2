# Ciel étoilé — spécification visuelle

Décision moteur : JavaScript pur (voir `docs/perf/decisions-rust.md`, aucun WASM). Le présent document décrit le rendu, pas son implémentation.

## Palette

| Emplacement | Valeur proposée | Statut |
|---|---|---|
| Bas de l'écran | `#05070f` | à confirmer au contraste |
| Haut de l'écran | `#0b0a1f` | à confirmer au contraste |
| Pointe violette | `#1a1040` | à confirmer au contraste |
| Pointe bleue | `#0c1a3a` | à confirmer au contraste |

Dégradé de nuit profond : bleu-noir en bas, violet très sombre en haut, sans bande visible.

## Étoiles

- **Couleurs** : blanc froid, blanc chaud, bleu pâle ; rares touches ambrées.
- **Tailles** : 0,5 px à 2,5 px.
- **Densité par couche** (trois couches de profondeur) :
  - lointaines : petites, très nombreuses ;
  - moyennes : taille et nombre intermédiaires ;
  - proches : rares, brillantes, léger halo.
- **Scintillement** : période 2–6 s, amplitude 20–60 %, phase par étoile.
- **Dérive** : lente, exprimée en px/s (valeur à calibrer avec la mesure de référence).
- **Parallaxe** : trois profondeurs, déplacement différencié.

## Étoiles filantes

- Angle oblique, longueur variable, durée 0,6–1,2 s.
- Traînée en dégradé (tête brillante, queue translucide).
- Occasionnelles : jamais en rafale, jamais pendant la saisie.

## Voie lactée

- Bande diagonale très douce, bruit lissé précalculé en image (aucun calcul par image).
- Opacité ≤ 12 %.

## Vignettage

- Léger, sur les bords uniquement ; aucun effet au centre.

## Versions

- **« Réduit »** : moins d'étoiles, sans étoiles filantes.
- **« Statique »** : animations réduites (ciel fixe, pas de scintillement).
- Respect de `prefers-reduced-motion` : passer automatiquement en « statique ».
- Onglet masqué : boucle arrêtée (`document.hidden`).
- Économiseur de batterie : densité réduite.

## Schémas SVG

```svg
<!-- Trois couches de profondeur -->
<svg viewBox="0 0 320 90" xmlns="http://www.w3.org/2000/svg" role="img">
  <title>Couches de parallaxe du ciel étoilé</title>
  <defs>
    <linearGradient id="nuit" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#05070f"/>
      <stop offset="1" stop-color="#0b0a1f"/>
    </linearGradient>
  </defs>
  <rect width="320" height="90" fill="url(#nuit)"/>
  <g fill="#cdd8ff"><circle cx="30" cy="20" r="0.5"/><circle cx="150" cy="60" r="0.6"/></g>
  <g fill="#ffffff"><circle cx="90" cy="35" r="1"/><circle cx="240" cy="25" r="1.1"/></g>
  <g fill="#fff3d6"><circle cx="270" cy="70" r="2"/></g>
</svg>
```

```svg
<!-- Étoile filante : traînée en dégradé -->
<svg viewBox="0 0 160 40" xmlns="http://www.w3.org/2000/svg" role="img">
  <title>Traînée d'une étoile filante</title>
  <defs>
    <linearGradient id="trainee" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="1"/>
    </linearGradient>
  </defs>
  <path d="M10 30 L150 10" stroke="url(#trainee)" stroke-width="1.5" fill="none"/>
  <circle cx="150" cy="10" r="1.5" fill="#ffffff"/>
</svg>
```

## Références de rendu

- Fond : dégradé vertical continu, sans motif répété.
- Étoiles : disques nets, halo uniquement sur la couche proche.
- Voie lactée : image précalculée, jamais recalculée par image.
- Aucune marque, logo ou image copiée ; les schémas ci-dessus sont des tracés originaux.
