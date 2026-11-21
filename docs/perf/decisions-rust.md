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
