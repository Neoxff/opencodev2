# Opencodev2 — origine, dépôt et synchronisation

Projet personnel. Le dépôt `Neoxff/opencodev2` est **public**, par décision explicite du propriétaire.

## Origine

- **Amont** : <https://github.com/menoxz/opencode>, lui-même fork communautaire de <https://github.com/anomalyco/opencode> (avis dans `README.md` ; `LICENSE` et attributions conservés).
- **Remote `upstream`** : `https://github.com/menoxz/opencode`, en lecture seule (`git remote set-url --push upstream DISABLED`).
- **Remote `origin`** : `https://github.com/Neoxff/opencodev2.git`, branche par défaut `main`.
- **Commit de départ** (base commune, `merge-base` avec `upstream/dev`) : `62697076fe999e0b239caffc8c170193ba1e939f` — `chore(release): v2.4.31`, daté du **2026-10-25T09:41:23Z**.
- **Création du dépôt GitHub** : **2026-11-17T22:29:25Z** (API GitHub, champ `created_at`).
- **Méthode** : copie miroir de l'historique existant vers le dépôt du compte personnel. Aucun force-push, aucune réécriture d'historique publié.

## Lancer le harnais

- Prérequis : Bun installé.
- Commande : `bun run web` à la racine du dépôt.
- URL : <http://127.0.0.1:4096> (port configurable dans `opencodev2.config.json` local, modèle `opencodev2.config.example.json`).
- Le lanceur `lancer-opencodev2.sh` vérifie Bun, installe gitleaks 8.30.1 avec vérification SHA-256, puis appelle `bun run web`.

## Documentation

- `docs/perf/base.json` — mesures de référence du banc reproductible.
- `docs/perf/decisions-rust.md` — décisions Rust à partir des mesures.
- `docs/design/captures/depot/README.md` — captures du panneau Dépôt (clair/sombre).
- `docs/design/20-ciel-etoile.md` — spécification du ciel étoilé.
- `docs/design/21-animations.md` — spécification des animations.

## Branches

| Branche | Rôle |
|---|---|
| `main` | Ligne du propriétaire, protégée par le ruleset `protection-main` (cible `~DEFAULT_BRANCH`, règles `deletion` et `non_fast_forward`, actif, sans bypass). |
| `upstream/dev` | Suivi de l'amont, **lecture seule**. |
| `integration/upstream-AAAA-MM-JJ` | Branche dédiée d'absorption des mises à jour amont. |
| `feat/*`, `perf/*`, `docs/*` | Travaux isolés, poussés sur `origin` sans fusion automatique. |

## Procédure de synchronisation avec l'amont

1. `git fetch upstream` (jamais de push vers `upstream`).
2. Créer `integration/upstream-AAAA-MM-JJ` depuis `main`.
3. `git merge --ff-only upstream/dev` si possible ; sinon `git merge --no-ff upstream/dev` **dans cette branche**, jamais dans `main`.
4. Résumer les commits entrants, les fichiers touchés et les conflits ; résoudre les conflits dans la branche d'intégration.
5. Vérifier : `bun run --cwd packages/webui test`, `bun run --cwd packages/webui typecheck`, démarrage de `bun run web`.
6. Proposer la fusion dans `main` ; ne l'exécuter qu'après le mot-clé explicite `fusion: go` du propriétaire.
7. Pousser sans force : `git push origin <branche>`.

## Règles permanentes

- Jamais de force-push ni de rebase d'historique publié.
- Aucun secret dans Git : `.gitignore`, hook `.husky/pre-commit` avec gitleaks 8.30.1 obligatoire, `.gitleaksignore` par empreintes.
- Aucune PR créée ni fusionnée sans accord explicite ; aucun tag sans validation.
- Configuration locale de liaison : `opencodev2.config.json` (hors Git), modèle dans `opencodev2.config.example.json`.
# Opencodev2 — prérequis et fonctionnement

## Origine

- **Amont** : `menoxz/opencode` — remote `upstream` (`https://github.com/menoxz/opencode`), push désactivé.
- **Point de fork vérifié** : `62697076fe999e0b239caffc8c170193ba1e939f`, daté du 2026-10-25,
  `chore(release): v2.4.31` (merge-base de `main` et `upstream/dev`).
- **Premier commit local après le fork** : `e878e176f3dfcd3cfd6be05ce568f183920ad4e4`, daté du
  2026-11-17, `feat(liaison): ajoute la configuration locale de liaison au dépôt`.
- **Tête de `main` au moment de ce document** : `61aed8d40df904671c50a2aabe8c06b3546213eb`,
  daté du 2026-11-19, `Merge pull request #4 from Neoxff/perf/mesures-base`.

## Dépôt

- **Dépôt public** : `https://github.com/Neoxff/opencodev2` (remote `origin`).
- Fork personnel de `menoxz/opencode` : aucun secret, aucun jeton, aucune donnée privée n'y est versionné.

## Lancer le harnais

```sh
bun run web
```

Interface servie sur `http://127.0.0.1:4096`. Le lanceur génère un jeton local, l'écrit en
mode `0600` hors du dépôt et l'injecte au serveur ; il pose
`OPENCODE_NO_DAEMON_AUTOSTART=1` par défaut (aucun démon démarré sans décision explicite).

## Synchronisation avec l'amont

1. Créer une branche dédiée datée : `sync/upstream-AAAA-MM-JJ` depuis `main` à jour.
2. Récupérer l'amont : `git fetch upstream`.
3. Fusionner : `git merge upstream/dev` (ou le commit cible), en **merge commit**.
4. Résoudre les conflits à la main, puis pousser la branche **sans force**.
5. Ouvrir une PR vers `main` ; ne fusionner qu'après validation.

**Interdit** : `git push --force`, `--force-with-lease`, squash et rebase d'une branche publiée.

## Règles de fusion

- Fusion **en merge commit uniquement** (`gh pr merge N --repo Neoxff/opencodev2 --merge`).
- Jamais de squash, jamais de rebase d'une branche déjà poussée.
- Avant fusion : worktree temporaire hors dépôt, tests webui/serveur/script et typechecks,
  comparaison des tests en échec à la base ; tout nouveau échec dans un fichier touché = arrêt.
- Après fusion : ruleset de protection de `main` actif, `main` sans conflit, hash consigné dans le rapport.

## Liens

- Mesures et décisions de performance : [`docs/perf/`](perf/) — dont
  [`base.json`](perf/base.json) et [`decisions-rust.md`](perf/decisions-rust.md).
- Spécifications d'interface : [`docs/design/`](design/) — animations, verre, accueil/Dépôt,
  Ressources et revue.
- Critères d'acceptation : [`docs/pm/02-criteres-webui-v3.md`](pm/02-criteres-webui-v3.md).
- Registre de risques : [`security/risk-register.md`](../security/risk-register.md).
