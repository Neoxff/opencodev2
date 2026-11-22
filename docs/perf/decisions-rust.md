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

## Ciel étoilé : pas de Rust (décision validée)

- Le calcul JavaScript est déjà à **1,3 ms par image**, soit environ 7,8 % du budget d'une image à 60 i/s (16,67 ms).
- Le rythme mesuré est de **59,88 i/s** : le plafond VSync 60 i/s est déjà atteint.
- Seuil de la règle « ≥ 30 % de gain » : 1,3 × 0,7 = **0,91 ms par image**. Même en l'atteignant, le gain de 0,39 ms ne peut pas produire plus d'images par seconde : la limite est l'affichage, pas le calcul. Le seuil n'est donc pas atteignable en FPS.
- **Aucun prototype WASM n'a été construit** : aucun chiffre WASM n'est avancé ici.
- **Décision : garder JavaScript pour le ciel étoilé.**

## Markdown : seul candidat Rust restant, à étudier plus tard

- **113 ms** (médiane 113,23 ms, p95 166,797 ms) pour 5 000 lignes : c'est le seul poste où un gain mesurable est plausible.
- Étude reportée ; elle ne sera lancée que sur GO explicite du propriétaire, avec test de parité de résultat, repli automatique et régression mémoire ≤ 10 %.

## Candidats écartés au vu des mesures existantes

- Événements : 2,556 ms pour 10 000, coût dominé par l'E/S.
- Recherche : ripgrep est déjà un binaire Rust.
- Démarrage : 4,9 s dominé par l'installation et la construction de l'UI, hors périmètre Rust.
# Décision — Rust dans Opencodev2

## Ciel étoilé : JavaScript, définitif

Le ciel est implémenté en JavaScript (Canvas/Workers), sans Rust. Mesures reproductibles
(`bun scripts/bench/run.ts` → `docs/perf/base.json`, 10 passages, 2 000 étoiles) :

| Mesure | Valeur |
|---|---|
| Images par seconde (médiane) | **59,88 i/s** |
| Calcul du ciel par image (médiane) | **1,3 ms** |
| Calcul du ciel par image (p95) | **1,4 ms** |
| Longues tâches dans la trace | 0,002 ms |

Le plafond d'affichage est la **VSync à 60 i/s** : 59,88 i/s est le maximum atteignable sur
cette machine, pas un défaut de l'implémentation. Le budget est de 60 i/s soutenus
(`docs/lean/budgets-webui-v3.md`, B1).

### Pourquoi le seuil « −30 % » ne s'applique pas en images par seconde

La règle de décision Rust est : adoption seulement si gain ≥ 30 % sur la médiane **et** ≥ 20 %
sur le p95. Appliquée au calcul par image, la cible serait :

```
1,3 ms × (1 − 0,30) = 0,91 ms
```

Or un gain de 30 % en images par seconde demanderait **~78 i/s**, ce qui est impossible sous
une VSync à 60 i/s : le nombre d'images ne peut pas dépasser le rafraîchissement de l'écran.
Le critère doit donc être évalué sur le **temps de calcul par image** (ms), pas sur les i/s.
À 0,91 ms, le gain resterait invisible à l'écran (le budget de 60 i/s est déjà atteint) et
n'aurait aucune valeur utilisateur : **aucun module Rust n'est retenu pour le ciel**.

## Markdown : seul candidat Rust

Le markdown est le seul composant pour lequel un gain Rust a été envisagé. Le banc historique
mesurait `marked` 17.0.1, mais le parser réel de l'interface est
`packages/webui/src/markdown.ts` (AST sûr, sans HTML). La baseline correcte a été ajoutée :
**11,57 ms médiane / 17,22 ms p95** sur 5 000 lignes.

Décision enregistrée (Build 12, PR #20) : **NO-GO**. Aucun outillage WASM n'est disponible sur
l'hôte (rustup, wasm-pack, cible wasm absents) et le prototype natif n'est pas un AST équivalent
au parser de production. Le gate ≥ 30 % médiane **et** ≥ 20 % p95 n'a donc pas pu être validé
dans les conditions de production. Le markdown reste en TypeScript.

## Réévaluation

Le dossier Rust ne sera rouvert que si, simultanément :

1. un outillage WASM est disponible et une chaîne Rust est épinglée ;
2. un prototype produit un AST équivalent (y compris `safeHref`) ;
3. la mesure est faite dans le navigateur, sur le parser réel, avec le gate ci-dessus.

Tant que ces trois conditions ne sont pas réunies, aucun module Rust n'est ajouté.

## Liens

- Mesures : [`base.json`](base.json).
- Budgets : [`docs/lean/budgets-webui-v3.md`](../lean/budgets-webui-v3.md).
- Registre de risques : [`security/risk-register.md`](../../security/risk-register.md).
