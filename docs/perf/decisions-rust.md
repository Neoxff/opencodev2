# Décisions Rust — Opencodev2

Référence : `docs/perf/base.json` (branche `perf/mesures-base`, commit `30c080196`), banc `bun scripts/bench/run.ts`. Protocole : 10 passages indépendants après 2 échauffements, médiane et p95.

Machine (mesurée le 2026-11-17T23:47:32.054Z) : Linux noyau 7.3.4-arch1-1, x64, Intel Core i3-1215U (8 cœurs), 15,3 GiB, Bun 1.4.2, Node v26.3.0, git `62697076f`.

| Candidat | Charge | Médiane | p95 |
|---|---|---|---|
| Ciel étoilé (JS pur) | 2 000 étoiles | 1,3 ms/image ; 59,88 i/s | 1,4 ms ; 59,88 i/s |
| Événements | 10 000 | 2,556 ms | 6,029 ms |
| Markdown (marked 17.0.1) | 5 000 lignes | 113,23 ms | 166,797 ms |
| Recherche (ripgrep) | 20 000 fichiers | 55,567 ms | 62,266 ms |
| Démarrage `bun run web` | — | 4 937,895 ms | 5 238,922 ms |

## Ciel étoilé : pas de Rust (décision validée le 2026-11-18)

- Le calcul JavaScript est déjà à **1,3 ms par image**, soit environ 7,8 % du budget d'une image à 60 i/s (16,67 ms).
- Le rythme mesuré est de **59,88 i/s** : le plafond VSync 60 i/s est déjà atteint.
- Seuil de la règle « ≥ 30 % de gain » : 1,3 × 0,7 = **0,91 ms par image**. Même en l'atteignant, le gain de 0,39 ms ne peut pas produire plus d'images par seconde : la limite est l'affichage, pas le calcul.
- Le second critère (« plus d'étoiles tenables à 60 i/s ») n'a pas été testé : aucun prototype WASM n'a été construit, conformément au GO du 2026-11-18.
- **Décision : garder le rendu JavaScript.** Ne créer ni crate Rust ni module WASM pour le ciel. Aucune mesure WASM n'est avancée ici : elle n'a pas été exécutée.

## Markdown : seul candidat restant, à étudier plus tard

- **113,23 ms** (médiane) et **166,797 ms** (p95) pour 5 000 lignes : c'est le seul poste où un gain mesurable est plausible.
- Aucun prototype, aucun changement de comportement. Étude à lancer uniquement sur GO explicite du propriétaire, avec test de parité sur 1 000 cas, repli automatique et régression mémoire ≤ 10 %.

## Candidats écartés au vu des mesures existantes

- Événements : 2,556 ms pour 10 000, déjà très rapide ; coût dominé par l'E/S.
- Recherche : ripgrep est déjà un binaire Rust ; un second module n'apporterait rien.
- Démarrage : 4,9 s dominé par l'installation et la construction de l'UI, hors périmètre Rust.
