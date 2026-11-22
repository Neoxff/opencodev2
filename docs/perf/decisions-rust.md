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
# Décision — parseur markdown Rust pour le webui

**Décision : NE PAS adopter Rust. Conserver `packages/webui/src/markdown.ts` (parser TypeScript produisant un AST sûr).**

Date : 2026-11-21. Branche : `perf/rust-markdown`. Périmètre : évaluer si un parseur Rust doit remplacer le parser markdown de production.

## 1. Ce qui est réellement mesuré

Le banc historique (`scripts/bench/markdown.ts`) mesure **`marked` 17.0.1**, qui n'est **pas** le parser de l'interface. L'interface utilise `parseMarkdown()` de `packages/webui/src/markdown.ts` (492 lignes) : analyseur maison qui produit un **AST typé** (`MdBlock[]`) et jamais de HTML, par construction (aucune injection possible). C'est ce parser qui devrait être remplacé, pas `marked`.

La baseline correcte a donc été ajoutée (`scripts/bench/markdown-production.ts`, intégrée à `run.ts` et `docs/perf/base.json`) sur le même document de 5 000 lignes, 10 passages après chauffage :

| Outil | Médiane | p95 |
|---|---|---|
| `marked` 17.0.1 (référence historique, outil différent) | 60,74 ms | 98,07 ms |
| **`parseMarkdown` production (AST sûr)** | **11,57 ms** | **17,22 ms** |

## 2. Prototype Rust

`scripts/bench/rust-md-proto/main.rs` (std seul, Rust 1.100.0) classe chaque ligne du même document en blocs (titre/liste/code/règle/paragrophe) et mesure 10 passages après 2 chauffages. Résultat natif : médiane ~0,10 ms, p95 ~0,12 ms.

**Limite bloquante** : ce prototype n'est **pas fonctionnellement équivalent** au parser de production. Il ne construit pas l'AST (`MdBlock`/`MdInline`), ne gère ni le gras/italique/liens/images en ligne, ni les tableaux avec alignement, ni la langue des blocs de code, ni `safeHref()`. Son temps de 0,10 ms mesure un classifieur de lignes, pas un analyseur d'AST sûr. Le comparer aux 11,57 ms du parser réel reviendrait à comparer deux charges de travail différentes.

**Limite d'exécution** : aucun outillage WASM n'est disponible sur cet hôte — `rustup` absent, `wasm-pack` absent, `wasm-bindgen` absent, cible `wasm32-unknown-unknown` absente, aucun crate en cache. Le prototype ne peut donc pas être compilé pour le navigateur, seul environnement pertinent. Même avec WASM, le coût de franchissement JS↔WASM et de sérialisation de l'AST devrait être mesuré, pas supposé.

## 3. Application du gate

Règle : adoption Rust **uniquement si ≥ 30 % de gain sur la médiane ET ≥ 20 % sur le p95**, mesurés dans les mêmes conditions.

- Le gain apparent du prototype natif (~99 %) porte sur une charge de travail **différente** (classifieur vs AST sûr) et un **environnement différent** (natif vs navigateur) : il n'est pas recevable.
- Aucune mesure Rust valide dans les conditions de production n'a pu être produite (WASM indisponible).
- Le gate ne peut donc **pas être considéré comme atteint**. En application de la règle, la décision est de **rester en TypeScript**.

Aucune modification du parser de production n'est apportée. Le gain potentiel d'un Rust/WASM reste hypothétique et devra être réévalué si l'outillage WASM devient disponible **et** qu'un prototype produisant un AST équivalent (avec `safeHref`) est mesuré dans le navigateur.

## 4. Reproductibilité

- Baseline production : `bun scripts/bench/run.ts` → `docs/perf/base.json`, clé `mesures.markdownProduction`.
- Prototype natif : `rustc -O -o proto scripts/bench/rust-md-proto/main.rs && ./proto` (sortie JSON médiane/p95 sur 10 passages).

## 5. Non-régression

Aucun fichier de l'interface n'est modifié. Les tests markdown existants (`packages/webui/src/markdown.test.ts`) et le typecheck restent verts.
