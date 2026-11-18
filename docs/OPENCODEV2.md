# Opencodev2 — origine, dépôt et synchronisation

Projet personnel. Le dépôt `Neoxff/opencodev2` est **public**, par décision explicite du propriétaire.

## Origine

- **Amont** : <https://github.com/menoxz/opencode>, lui-même fork communautaire de <https://github.com/anomalyco/opencode> (avis dans `README.md`, conservez `LICENSE` et les attributions).
- **Remote `upstream`** : `https://github.com/menoxz/opencode`, en lecture seule (`git remote set-url --push upstream DISABLED`).
- **Remote `origin`** : `https://github.com/Neoxff/opencodev2.git`, branche par défaut `main`.
- **Commit de départ** (base commune, `merge-base` avec `upstream/dev`) : `62697076fe999e0b239caffc8c170193ba1e939f` — `chore(release): v2.4.31`, daté du **2026-10-25T09:41:23Z**.
- **Création du dépôt GitHub** : **2026-11-17T22:29:25Z** (API GitHub, champ `created_at`).
- **Méthode** : copie miroir de l'historique existant vers le dépôt du compte personnel. Aucun force-push, aucune réécriture d'historique publié.

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
