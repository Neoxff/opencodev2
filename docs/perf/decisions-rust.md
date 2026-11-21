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
