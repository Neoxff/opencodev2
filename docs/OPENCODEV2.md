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
