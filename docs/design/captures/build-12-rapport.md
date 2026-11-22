# Build 12 — Ciel étoilé discret

Branche `feat/ui-ciel` · date : 2026-11-22

## Objectif

Un ciel étoilé très discret derrière l'interface webui : fond **#000** pur,
~1 100 étoiles presque blanches sur trois couches, scintillement lent, dérive
1–4 px/s, vignettage. **Aucune étoile filante, aucune nébuleuse colorée.**
Rendu dans un Web Worker avec OffscreenCanvas, repli visuellement identique,
delta de temps réel borné, zéro allocation par image, arrêt complet à la
fermeture/au masquage de l'onglet. Réglage persistant **Activé / Statique /
Désactivé**.

## Choix d'implémentation

| Décision | Pourquoi |
|---|---|
| Un seul `SkyEngine` partagé par le worker et le repli | Garantit un rendu identique au pixel près : les deux chemins appellent le même `draw()`. |
| Handshake `probe` avant `transferControlToOffscreen()` | Le canvas n'est transféré qu'après la preuve que le worker vit ; si le worker échoue, le repli peut encore utiliser le canvas intact. |
| Tableaux typés pré-alloués + couleurs internées | `draw()` ne construit ni chaîne, ni dégradé, ni objet : zéro allocation par image (vérifié par un contexte factice qui interdit `createRadialGradient`/`createLinearGradient` et espionne `Math.random`). |
| Halo des étoiles proches en disque très pâle, pas en dégradé | Même effet visuel, aucune allocation de dégradé par image. |
| Vignettage en calque CSS statique | Ne dépend pas du temps ; aucune allocation, aucun redessin calculé. |
| Delta borné à 50 ms (`boundDelta`) | Un onglet qui reprend ne provoque aucun saut de dérive. |
| Arrêt du timer / `cancelAnimationFrame` sur `visibilitychange` | Aucune image demandée quand l'onglet est masqué ; reprise sans saut. |
| PRNG déterministe (mulberry32) | Ciel reproductible, sans `Math.random`, donc sans allocation liée au hasard. |
| Réglage dans la section **General**, clé `localStorage oc.webui.sky` | Préférence de navigateur, pas configuration serveur. Pas de huitième section : le test existant impose exactement sept sections, il n'est pas modifié. |
| Boutons radio natifs dans un `<fieldset>` | Navigation clavier et focus offerts par défaut, cibles ≥ 44 px, pas de `div onClick`. |

### Écarts assumés avec `docs/design/20-ciel-etoile.md`

La consigne Build 12 prime sur le document de design quand ils diffèrent :

| Point | Doc v3 | Build 12 (retenu) |
|---|---|---|
| Étoiles | 2 000 | **1 100** |
| Étoiles filantes | activées | **interdites** |
| Nébuleuse / voie lactée | gris teinté ≤ 5 % | **aucune nébuleuse colorée** |
| Niveaux | Activé / Réduit / Statique | **Activé / Statique / Désactivé** |
| Dérive | 1,2 / 2,5 / 5 px/s | **1–4 px/s** (1,2 / 2,1 / 3,3 × 0,85–1,15) |

Le doc reste la source pour la structure trois couches (62 / 30 / 8 %), les
périodes de scintillement (2–6 s), les amplitudes (20–60 %), le vignettage fort
et les garanties de fluidité.

## Fichiers

**Créés**

- `packages/webui/src/sky/types.ts` — contrat, constantes, `_starCount()`
- `packages/webui/src/sky/engine.ts` — `SkyEngine`, PRNG, delta borné, palette
- `packages/webui/src/sky/worker.ts` — boucle worker OffscreenCanvas
- `packages/webui/src/sky/controller.ts` — handshake, repli, visibilité, resize
- `packages/webui/src/sky/preferences.ts` — persistance localStorage
- `packages/webui/src/sky/sky.tsx` — `<SkyCanvas>` et `<SkySection>`
- `packages/webui/src/sky/sky.css` — CSS isolé, préfixé `sky-`
- `packages/webui/src/sky/{engine,preferences,controller,sky}.test.ts(x)` — 4 suites
- `scripts/bench/ciel-build12.ts` — banc + captures Playwright
- `docs/design/captures/build-12-{on,static,off}-1920x1080.png`
- `docs/design/captures/build-12-mesure.json` — mesures brutes

**Modifié**

- `packages/webui/src/app.tsx` — calque ciel, état du réglage, section General

Aucun test existant n'a été modifié. Aucune donnée de démonstration n'a été
introduite : la page est chargée sans session et sans backend — l'éventuel
bandeau « server unreachable » est l'état réel, pas une fixture.

## Validation

| Commande | Résultat |
|---|---|
| `bun run --cwd packages/webui typecheck` | **EXIT 0** |
| `bun run --cwd packages/webui test` | **EXIT 0** — 34 fichiers, **731 tests réussis** |
| `bun run --cwd packages/webui build` | **EXIT 0** — `dist/assets/index-N0lGMeWI.js` 249,98 kB (73,42 kB gzip), CSS 63,20 kB (11,47 kB gzip) |

Les tests couvrent : population 1 100 étoiles, répartition 682 / 330 / 88,
rayons et vitesses 1–4 px/s, couleurs quasi blanches, absence de dégradé et de
`Math.random` par image, déterminisme du mode statique, dérive bornée, handshake
worker, deux chemins de repli, messages `mode`/`visibility`, arrêt total à la
fermeture de l'onglet, persistance et composant de réglage.

## Mesure

Protocole : Playwright **1.55.0** (`/home/joachim/.bun/install/cache/playwright-core@1.55.0@@@1/index.js`),
Chromium `/usr/bin/chromium`, args `['--no-sandbox']`, viewport **1920×1080**,
serveur Vite sur le port unique **4212**.

### Application réelle

Mesurée sur le chemin de repli (moteur partagé avec le worker), boucle rAF
instrumentée sur 3,9 s, 185 images :

| Métrique | Valeur |
|---|---|
| Images/s | **47,43** |
| ms par image (médiane des durées de callback) | **1,515 ms** |
| p95 par image | **3,7 ms** |
| Tas JS utilisé / total (CDP `Performance.getMetrics`) | **4,73 Mo / 8,78 Mo** |
| Chemin worker actif en condition normale | **oui** (`transferControlToOffscreen` appelé) |

### Banc de référence existant (`scripts/bench/etoiles.ts`)

Pour comparabilité avec `docs/perf/base.json`, 2 000 étoiles, 10 passages,
240 images par passage :

| Métrique | Valeur |
|---|---|
| Images/s (médiane) | **59,88** |
| ms par image (médiane) | **1,1 ms** (p95 1,6 ms) |
| Outils | Playwright 1.63.0 du cache, Chromium ms-playwright |

Écart de i/s entre les deux : la mesure applicative inclut le rendu DOM complet
et tourne dans un Chromium headless piloté, tandis que le banc de référence est
une page canvas isolée à 2 000 étoiles. Le coût par image reste du même ordre
(1,5 ms contre 1,1 ms), sans allocation par image dans les deux cas.

## Captures et vérification du fond noir

Trois PNG **1920×1080**, comparés à `docs/design/maquette-opencodev2-ui.html` :
`build-12-on-1920x1080.png`, `build-12-static-1920x1080.png`,
`build-12-off-1920x1080.png`.

Scan de **tous les pixels** du canvas (2 073 600) sur l'application réelle :

| Contrôle | Résultat |
|---|---|
| Noir pur `(0,0,0)` | **2 050 894 px (98,9 %)** |
| Pixels d'étoiles (R,G,B > 90) | **1 444 px** — les étoiles sont bien rendues |
| Teintes bleues (`B > R + 12`) | **0 px** — aucune nébuleuse colorée |
| Chroma maximal hors fond | **17** (blancs très légèrement nuancés) |
| Luminance maximale | **226** |
| Vignette calculée | `radial-gradient(... rgba(0,0,0,0) 48%, rgba(0,0,0,0.92) 100%)` — bords noirs, sans couleur |

Comparaison à la maquette : même répartition en trois couches, même fond noir,
étoiles plus discrètes (1 100 au lieu de 2 000) et aucun des effets que la
consigne interdit (filantes, nébuleuses teintées). La barre latérale et le
tiroir gardent leur fond opaque ; la colonne centrale transparente laisse voir
le ciel, comme dans la maquette.

## Points de vigilance

- La mesure i/s est faite sur le repli instrumenté ; le chemin worker est vérifié
  à part (transfert effectif), car un worker n'expose pas de compteur de frames
  au thread principal sans instrumentation intrusive. Le moteur étant unique,
  le coût par image mesuré est représentatif des deux chemins.
- Sous `prefers-reduced-motion: reduce` et sans préférence enregistrée, le
  niveau par défaut est **Statique** ; un choix explicite de l'utilisateur
  l'emporte toujours.
- Aucune dépendance ajoutée. Aucun `any`, aucun `console.log`, aucun TODO.
