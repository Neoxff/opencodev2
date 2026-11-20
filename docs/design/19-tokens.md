# Jeton — système de design Opencodev2

**Thème sombre uniquement.** Ce fichier est la source de vérité des valeurs. `packages/webui/src/styles.css` les déclare dans `:root` (lignes 20-93) et les composants les consomment ; les documents 20 à 25 pointent ici plutôt que de recopier des valeurs.

**Règle d'usage.** Un composant ne code jamais en dur une couleur, un rayon, un espacement, une durée ou un flou. Toute valeur nouvelle passe d'abord par ce tableau. Les ratios ci-dessous sont **mesurés** (formule WCAG relative luminance), pas estimés.

---

## 1. Surfaces — 4 niveaux

Tous dans la famille `bluish` déjà déclarée dans `styles.css:52-62`. Aucune couleur nouvelle.

| Token | Valeur | Usage | Remplace |
|---|---|---|---|
| `--surface-0` | `bluish-950` `#151517` | fond de l'application, arrière-plan du ciel | `--bg-0` |
| `--surface-1` | `bluish-875` `#232324` | barre latérale, panneaux latéraux | `--bg-1` |
| `--surface-2` | `bluish-850` `#2c2c2e` | feuilles, tiroir, surfaces en verre (teinte de base) | `--bg-2` |
| `--surface-3` | `bluish-800` `#353638` | survol actif, verre, sélecteurs | *valeur présente dans `:root`, jamais utilisée* |

**Hiérarchie** : 0 = fond, 1 = panneau, 2 = surélévation, 3 = verre/survol. On ne superpose jamais deux surfaces de même niveau.

---

## 2. Texte — 3 niveaux

| Token | Valeur | Usage | Remplace |
|---|---|---|---|
| `--text-1` | `bluish-50` `#f9fafb` | contenu principal, titres, saisie | `--text-1` |
| `--text-2` | `bluish-400` `#adb2b8` | libellés, métadonnées, texte secondaire | `--text-2` |
| `--text-3` | `bluish-650` `#8c9697` | note, hint, texte désactivé | `--text-3` |

### Contraste mesuré (seuil AA texte normal 4,5:1, large 3:1)

| Texte | surface-0 | surface-1 | surface-2 | surface-3 |
|---|---|---|---|---|
| `--text-1` | **17,45** | **15,03** | **13,34** | **11,57** |
| `--text-2` | **8,54** | **7,36** | **6,53** | **5,67** |
| `--text-3` | **6,01** | **5,18** | **4,60** | 3,99 ✗ |

**Règle** : `--text-3` n'est utilisé que sur `surface-0`, `surface-1` et `surface-2`. Sur `surface-3` (verre), on utilise `--text-1` ou `--text-2`.

---

## 3. Accent — monochrome conservé

La règle 1 de `styles.css` (monochrome) est conservée : l'accent est le quasi-blanc tournant, pas une couleur nouvelle.

| Token | Valeur | Usage | Remplace |
|---|---|---|---|
| `--accent` | `#f9fafb` | marque, liens actifs, curseur de saisie | `#ffffff` codé en dur |
| `--accent-fort` | `#ffffff` | focus clavier, marque au premier plan | `#ffffff` |
| `--accent-doux` | `#ffffff14` | survol discret, fond de pastille | `#ffffff14` (5×), `#ffffff0f` (11×) |

---

## 4. États — 3 couleurs + variantes

| Token | Valeur | surface-0 | surface-1 | surface-2 | surface-3 | Usage |
|---|---|---|---|---|---|---|
| `--danger` | `#f25a5a` | 5,55 ✓ | 4,77 ✓ | 4,24 ✗ | 3,68 ✗ | erreur, conflit, suppression |
| `--danger-texte` | `#ff8080` | 7,51 ✓ | 6,47 ✓ | 5,74 ✓ | 4,98 ✓ | **texte** d'erreur sur toutes surfaces |
| `--attention` | `#f7ad31` | 9,53 ✓ | 8,21 ✓ | 7,28 ✓ | 6,32 ✓ | demande d'accord de l'agent |
| `--success` | `#4cc38a` | 8,23 ✓ | 7,09 ✓ | 6,29 ✓ | 5,46 ✓ | état sain, synchronisé |
| `--success-doux` | `#3fb9501f` | — | — | — | — | fond de pastille « à jour » |

**Règle** : `--danger` est une couleur de **signal** (icône, filet, pastille). Le **texte** d'erreur utilise `--danger-texte`, qui passe AA sur les quatre surfaces. Les trois états ne portent jamais l'information à la couleur seule : icône + libellé obligatoires.

---

## 5. Rayons

`styles.css:17` impose « rayon 0 ; seules les commandes sont arrondies ». L'échelle ci-dessous ne l'assouplit pas : les panneaux restent à 0, l'échelle sert aux commandes, menus, feuilles et panneau Ressources.

| Token | Valeur | Usage | Remplace |
|---|---|---|---|
| `--radius-0` | `0` | panneaux, filets, barre latérale | valeur implicite actuelle |
| `--radius-4` | `4 px` | pastilles, petites puces | `4px` (7×) |
| `--radius-6` | `6 px` | boutons compacts, jetons | `6px` (29×) |
| `--radius-8` | `8 px` | boutons, champs | `8px` (13×) |
| `--radius-10` | `10 px` | alias conservé de `--radius` | `--radius: 10px` (5×), `10px` (3×) |
| `--radius-12` | `12 px` | cartes, élévations | `12px` (1×) |
| `--radius-16` | `16 px` | feuilles, menus | `16px` (2×), `14px` (2×) |
| `--radius-20` | `20 px` | panneau Ressources, grandes surfaces flottantes | *inexistant* |
| `--radius-28` | `28 px` | écran d'accueil, hero | *inexistant* |
| `--radius-full` | `9999 px` | avatars, interrupteurs, pastilles rondes | `999px` (6×), `50%` (3×) |

**Migration** : les valeurs `2px`, `3px`, `5px`, `7px`, `9px`, `14px` (18 occurrences) sont des héritages de mise au point ; elles convergent vers le token le plus proche au fil des retouches, sans changement de gabarit.

---

## 6. Espacements — échelle de 4 px

| Token | Valeur | Usage |
|---|---|---|
| `--space-1` | `4 px` | respiration interne d'un bouton, puce |
| `--space-2` | `8 px` | gap de liste, marge de libellé |
| `--space-3` | `12 px` | marge de bloc compact |
| `--space-4` | `16 px` | marge de section |
| `--space-5` | `24 px` | gouttière (`--gutter: 24px`) |
| `--space-6` | `32 px` | séparation de panneau |
| `--space-7` | `48 px` | écran d'accueil, hero |
| `--measure` | `780 px` | largeur de lecture maximale (conservé) |

**Dette mesurée** : `styles.css` contient des `padding`/`gap` en `1px`, `2px`, `3px`, `5px`, `6px`, `7px`, `10px`, `14px` (plus de 150 occurrences). Ils ne sont pas retirés d'un coup ; chaque composant touché arrondit au token le plus proche.

---

## 7. Typographie

Les trois familles sont déjà chargées dans `packages/webui/index.html:11-16` (Google Fonts, repli hors ligne déclaré dans `styles.css:87-88`).

| Token | Valeur | Usage |
|---|---|---|
| `--font-display` | `"Space Grotesk", "Inter", system-ui, sans-serif` | titres de page, écran d'accueil, marque |
| `--font` | `"Inter", "Segoe UI", system-ui, sans-serif` | interface |
| `--mono` | `"JetBrains Mono", ui-monospace, "Cascadia Mono", Consolas, monospace` | code, chemins, données |

**Tailles** (déjà dans `:root`, inchangées) : `--fs-display` 1,5rem · `--fs-title` 1rem · `--fs-base` 0,875rem · `--fs-note` 0,8125rem · `--fs-meta` 0,75rem.
**Interlignes** : `--lh-tight` 1,25 (une ligne d'interface) · `--lh-normal` 1,5 (liste, saisie) · `--lh-prose` 1,6 (prose, markdown).

**Trou relevé** : `Space Grotesk` est chargée mais **aucun jeton ne l'utilise** aujourd'hui. `--font-display` est le chaînon manquant ; le titre de page et l'écran d'accueil l'emploient.

---

## 8. Ombres

Une seule ombre douce, en deux profondeurs. Jamais de double ombre, jamais d'ombre colorée.

| Token | Valeur | Usage |
|---|---|---|
| `--shadow-1` | `0 1px 2px #0000001a` | survol, élévation discrète |
| `--shadow-2` | `0 8px 24px #00000033` | feuilles, panneau Ressources, menus |
| `--shadow-3` | `0 16px 48px #0000004d` | écran d'accueil, verre flottant |

**Remplace** : `#0000001a` (2×) codé en dur.

---

## 9. Verre — opacités, flou, contour, reflet

Valeurs portées ici, consommées par `22-verre-sobre-web.md`.

| Token | Valeur | Usage |
|---|---|---|
| `--glass-opaque` | `0,80` | surface portant du texte (`--text-1`/`--text-2`) |
| `--glass-moyen` | `0,65` | panneaux sans texte essentiel |
| `--glass-legger` | `0,55` | décoration, profondeur |
| `--glass-blur` | `16 px` | flou standard (`saturate(1,1)`) |
| `--glass-blur-fort` | `20 px` | feuille modale |
| `--glass-contour` | `1 px` à `12 %` | bord lumineux |
| `--glass-reflet` | dégradé blanc `6–10 %` | reflet fin sur le bord haut |

**Repli sans `backdrop-filter`** : `@supports not (backdrop-filter: blur(1px))` → surface opaque `var(--surface-2)`, même contour et même ombre. Voir le document 22.

### Contraste mesuré sur verre (pire cas : étoile brillante `#ffffff` derrière)

| Teinte | Opacité | Verre résultant | text-1 | text-2 | text-3 |
|---|---|---|---|---|---|
| `surface-2` `#2c2c2e` | 0,80 | `#565658` | 7,01 ✓ | 3,43 ✗ | 2,41 ✗ |
| `surface-2` `#2c2c2e` | 0,90 | `#414143` | 9,75 ✓ | 4,77 ✓ | 3,36 ✗ |
| `surface-1` `#232324` | 0,85 | `#444445` | 9,31 ✓ | 4,56 ✓ | 3,21 ✗ |
| `surface-0` `#151517` | 0,90 | `#2c2c2e` | 13,34 ✓ | 6,53 ✓ | 4,60 ✓ |

**Règle** : une surface en verre qui porte du texte utilise **`surface-2` à 0,90** (ou `surface-0` à 0,90) ; `text-1` est garanti, `text-2` passe, `text-3` est interdit. Sans ces opacités, `text-2` tombe à 3,43 et `text-3` à 2,41 — illisibles sur une étoile brillante.

---

## 10. Valeurs codées en dur à absorber

Relevé dans `packages/webui/src/styles.css` (compte d'occurrences).

| Valeur | Occ. | Token de destination |
|---|---|---|
| `#ffffff0a` | 14 | `--accent-doux` / `--glass-contour` |
| `#ffffff08` | 13 | `--glass-contour` |
| `#ffffff0f` | 11 | `--line-1` |
| `#f85149` | 7 | `--danger` (rouge Git à normaliser) |
| `#ffffff14` | 5 | `--accent-doux` |
| `#f7ad31` | 2 | `--attention` |
| `#81858c` | 2 | `--text-3` |
| `#6f7a92` | 2 | `--text-3` |
| `#4d7cfe1f` | 2 | `--accent-doux` |
| `#4c8dff` | 2 | `--accent` |
| `#3fb9501f` | 2 | `--success-doux` |
| `#0000001a` | 2 | `--shadow-1` |
| `#ff8f40` | 1 | `--attention` |
| `#f778ba` | 1 | `--diff-ajout` (à créer si le rose de diff persiste) |

---

## 11. Schémas SVG

### Surfaces et hiérarchie texte

```svg
<svg viewBox="0 0 320 120" xmlns="http://www.w3.org/2000/svg" role="img">
  <title>Les quatre surfaces et les trois niveaux de texte</title>
  <rect width="320" height="120" fill="#151517"/>
  <rect x="16" y="16" width="132" height="88" fill="#232324"/>
  <rect x="164" y="16" width="60" height="88" fill="#2c2c2e"/>
  <rect x="240" y="16" width="64" height="88" fill="#353638"/>
  <text x="28" y="48" fill="#f9fafb" font-family="Inter, sans-serif" font-size="12">texte-1 · 15,03</text>
  <text x="28" y="70" fill="#adb2b8" font-family="Inter, sans-serif" font-size="12">texte-2 · 7,36</text>
  <text x="28" y="92" fill="#8c9697" font-family="Inter, sans-serif" font-size="12">texte-3 · 5,18</text>
  <rect x="172" y="28" width="44" height="10" rx="5" fill="#f25a5a"/>
  <rect x="172" y="46" width="44" height="10" rx="5" fill="#f7ad31"/>
  <rect x="172" y="64" width="44" height="10" rx="5" fill="#4cc38a"/>
  <rect x="248" y="28" width="48" height="8" rx="4" fill="#ffffff" opacity=".14"/>
</svg>
```

### Surface en verre sur ciel étoilé (pire cas)

```svg
<svg viewBox="0 0 320 120" xmlns="http://www.w3.org/2000/svg" role="img">
  <title>Verre à 0,80 sur étoile brillante : texte-1 lisible, texte-2 non garanti</title>
  <defs>
    <linearGradient id="nuit" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#05070f"/>
      <stop offset="1" stop-color="#0b0a1f"/>
    </linearGradient>
  </defs>
  <rect width="320" height="120" fill="url(#nuit)"/>
  <circle cx="90" cy="45" r="2" fill="#ffffff"/>
  <circle cx="230" cy="75" r="1.5" fill="#cdd8ff"/>
  <rect x="60" y="20" width="200" height="80" rx="16" fill="#2c2c2e" opacity=".80"/>
  <rect x="60" y="20" width="200" height="80" rx="16" fill="none" stroke="#ffffff" stroke-opacity=".12"/>
  <text x="76" y="52" fill="#f9fafb" font-family="Inter, sans-serif" font-size="12">texte-1 · 7,01 AA</text>
  <text x="76" y="74" fill="#adb2b8" font-family="Inter, sans-serif" font-size="12">texte-2 · 3,43 insuffisant</text>
</svg>
```

---

## 12. Règles d'usage

1. Un seul accent : le quasi-blanc. Les couleurs d'état sont réservées à l'état.
2. Jamais de texte directement sur le ciel : `texte-1` sur `#ffffff` = 1,05. Le ciel n'est visible que dans les interstices, et toute zone de texte repose sur une surface ou sur du verre à opacité ≥ 0,90.
3. Trois surfaces en verre simultanées maximum.
4. Jamais de verre sur les messages, les blocs de code et les tableaux.
5. Jamais d'animation du rayon de flou.
6. `--radius-0` pour les panneaux ; l'échelle 4–28 px est réservée aux commandes et surfaces flottantes.
7. Contraste vérifié au moment d'introduire un couple texte/surface nouveau : le ratio figure dans ce fichier avant que le composant existe.
