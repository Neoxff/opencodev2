# Spécification — Ciel étoilé v3

Référence visuelle : [`maquette-opencodev2.html`](maquette-opencodev2.html), bloc
`/* Ciel étoilé (canvas) */` (lignes 219–290). Les valeurs ci-dessous sont tirées de ce bloc
et du document de prompts ; quand ils diffèrent, **le document de prompts l'emporte**.

## 1. Règle absolue de couleur

- Fond **`#000`** (noir pur) partout. Aucune dominante bleue ni violette, aucun gris clair en fond.
- Le ciel est rendu en **JavaScript** (Worker + OffscreenCanvas, repli sur le thread principal).
  **Aucun Rust**, aucune dépendance réseau.
- Le verre est presque absent : en cas de doute, plus de noir et moins de verre.

## 2. Trois couches d'étoiles

Répartition et rayons (maquette `build()`, `l=i<n*.62?0:i<n*.92?1:2`) :

| Couche | Part | Rayon `r` | Vitesse de dérive | Détail |
|---|---|---|---|---|
| Lointaine | **62 %** | 0,4–0,9 px | **1,2 px/s** | point simple |
| Moyenne | **30 %** | 0,8–1,4 px | **2,5 px/s** | point simple |
| Proche | **8 %** | 1,4–2,4 px | **5 px/s** | **halo** radial (`r*5`, opacité 35 % du point) |

La vitesse de chaque étoile est la vitesse de couche multipliée par un facteur 0,8–1,2
(maquette : `v:[1.2,2.5,5][l]*rnd(.8,1.2)`).

## 3. Scintillement et couleurs

- Période **2–6 s** (`tw:rnd(2,6)`), amplitude **20–60 %** (`amp:rnd(.2,.6)`).
- Formule : `1 - amp * (0.5 + 0.5 * sin(2π·t/tw + phase))` (maquette `draw()`).
- Couleurs **presque toutes blanches** : la maquette utilise
  `255,255,255` (×2), `255,252,245`, `245,248,255`, `255,236,210`. Aucune teinte bleue
  ou violette sur les étoiles.

## 4. Nébuleuse et voie lactée

- **Gris neutre**, opacité **≤ 5 %**. La maquette contient des teintes légèrement teintées
  (`rgba(80,70,90,.01)`, `rgba(70,62,90,.02)`, `rgba(55,58,70,.015)`) : conformément à la
  règle absolue, elles sont remplacées par du **gris neutre** (`R=G=B`) à opacité ≤ 5 %.
- Vignettage **fort** : bords noirs, sans dégradé coloré.

## 5. Étoiles filantes

Valeurs de la maquette (`spawn()` et `draw()`) et du prompt :

| Paramètre | Valeur |
|---|---|
| Vitesse | **420–640 px/s** (`sp:rnd(420,640)`) |
| Durée | **1,9–2,7 s** (`max:rnd(1.9,2.7)`) |
| Longueur | **170–300 px** (`len:rnd(170,300)`) |
| Largeur du trait | **1,4 px** (`lineWidth=1.4`) |
| Opacité | **`sin(π·p)^1,3`** (`fade=Math.pow(Math.sin(Math.PI*p),1.3)`), entrée et sortie douces |
| Fréquence réelle | **20–40 s** (override du prompt ; la maquette utilise 5–9 s, valeur non retenue) |
| Saisie | **jamais pendant la saisie** (override du prompt : ne pas déclencher de filante tant que l'utilisateur tape) |

La traînée est un dégradé linéaire blanc vers transparent, sans bleu (override du prompt
sur les arrêts `rgba(170,200,255,…)` / `rgba(120,150,255,0)` de la maquette).

## 6. Trois niveaux

| Niveau | Comportement |
|---|---|
| **Activé** | toutes les étoiles, dérive, scintillement, filantes aux fréquences ci-dessus |
| **Réduit** | **moitié des étoiles**, **aucune filante** ; dérive et scintillement conservés |
| **Statique** | une seule image dessinée, aucune animation, aucune filante |

Le budget est de **2 000 étoiles** maximum (maquette : `Math.min(2000, base*max(.5,area))`).
Le niveau Statique correspond à `prefers-reduced-motion: reduce` si l'utilisateur n'a pas
choisi explicitement un autre niveau.

## 7. Fluidité — garanties à implémenter

1. **Delta de temps réel borné à 50 ms** : `dt = Math.min(0.05, (ts - last)/1000 || 0)`
   (maquette `loop()`). Un onglet qui reprend après pause ne provoque pas de saut.
2. **Positions flottantes** : `x`, `y` et vitesses en nombres flottants, jamais arrondis
   entre deux images (maquette : `s.x -= s.v*dt`).
3. **Aucune allocation par image** : pré-allouer le tableau d'étoiles, réutiliser les objets
   de dégradé et les buffers du canvas. La maquette alloue des dégradés dans `draw()` ;
   l'implémentation v3 doit les pré-construire (sprites de halo et de traînée) pour respecter
   cette règle.
4. **Aucune boucle si l'onglet est caché** : sur `visibilitychange` avec `document.hidden`,
   annuler `requestAnimationFrame` et remettre `raf=0` ; ne reprendre qu'au retour, avec
   `last = performance.now()` (maquette `visibilitychange`).
5. N'animer que **`transform` et `opacity`** pour les éléments DOM du ciel ; le canvas est
   redessiné entièrement à chaque image sans modifier le layout.

## 8. Vérification

- Contraste et couleurs : le fond est `#000` (aucun `color-scheme:light`, aucun bleu en fond).
- Mesures de référence : `docs/perf/base.json` → `mesures.etoiles` (59,88 i/s, 1,3 ms/image
  sur cette machine, 2 000 étoiles) ; budget dans `docs/lean/budgets-webui-v3.md`.
- Arrêt onglet masqué : vérifier que `raf` passe à 0 et qu'aucune image n'est demandée.
- Aucun test existant ne doit être modifié ni mis en échec par l'implémentation.
