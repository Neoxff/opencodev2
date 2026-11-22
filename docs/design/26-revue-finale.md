# Revue finale — finition v3 (spec 25)

Date : 2026-11-21. Branche : `feat/finition-v3` (depuis `main`). Périmètre : panneau Dépôt tel qu'il existe sur `main`.

## 1. Clavier

- Échap annule la confirmation de commit/push (`git-panel.tsx` `onKeyDown` sur le champ) — test `confirmation avant commit`.
- Toutes les actions sont des `<button>` avec `aria-label`, atteignables au Tab.
- Bouton `↻` Réessayer présent dans le bloc `role="alert"` — test §2.5.

## 2. Contraste (mesuré, pas estimé)

`contraste-finition.test.ts` lit les jetons réels de `styles.css`, résout `var(--x)` et calcule le ratio WCAG :

| Couple | Jetons | Ratio | Seuil |
|---|---|---|---|
| texte principal / fond panneau | `--text-1` (#f9fafb) sur `--bg-2` (#2c2c2e) | ≥ 13:1 | 4,5 ✓ |
| texte secondaire / fond | `--text-2` (#adb2b8) sur `--bg-2` | ≥ 6:1 | 4,5 ✓ |
| texte tertiaire / fond | `--text-3` (#8c9697) sur `--bg-2` | ≥ 4,5:1 | 4,5 ✓ |

## 3. Cibles tactiles

Hors périmètre sur `main` : le build 13 (PR #21) a ajouté les cibles ≥ 44 × 44 px en `@media (pointer: coarse)` ; cette PR n'est pas fusionnée. Aucune régression introduite ici.

## 4. i18n

Sur `main`, le panneau n'a pas de module de traduction : les libellés sont en français. Le build 13 (PR #21) livre le dictionnaire FR/EN complet (35 clés) ; il n'est pas fusionné ici. L'info-bulle FR « Branche courante » ajoutée dans ce build est le libellé source conforme à la spec 23 §2.2.

## 5. Verre (spec 22 §4)

Vérification : `git-panel.css` ne contient ni `backdrop-filter` ni `.glass` ; le fond est `var(--bg-2)` opaque. Le panneau Dépôt n'est donc **pas** une surface en verre sur `main`, et la règle « text-3 interdit sur verre » ne s'applique pas. Le verre de la spec 22 est livré par la PR #13 (non fusionnée).

## 6. Correction §2.5 (spec 23)

Avant : toute erreur connue other than `NON_DISPONIBLE` affichait « Chargement du dépôt… » dans le corps alors que l'en-tête annonçait l'état d'échec. Après : le `fallback` du `<Show when={statut()}>` affiche un bloc `role="alert"` avec le message court (`libelleErreur`) et l'action `↻ Réessayer` ; le texte de progression ne subsiste que si aucune erreur n'est connue. Tests : « erreur connue au chargement : jamais de texte de progression (§2.5) » et « état divergent après un pull refusé ».

## 7. Contrôles reproductibles

- `bun run test` (packages/webui) → 29 fichiers, 682 tests verts.
- `bun run typecheck` → exit 0.

## 8. Dépendances hors branche

Les éléments des sections 3, 4 et 5 (cibles tactiles, i18n, verre) sont dans des PR non fusionnées (#13, #21). Ce build ne les duplique pas : il documente leur état et applique uniquement ce qui est vérifiable sur `main`.
