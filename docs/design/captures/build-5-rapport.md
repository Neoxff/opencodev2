# Build 5 — Rapport : registre de commandes

- Branche : `feat/ui-commandes-api` (worktree `.worktrees/b5`)
- Périmètre : API locale uniquement. **Aucune UI modifiée** → aucune capture Playwright.

## Pré-requis « Plan 1 rendu » — ÉCART

**Absent du dépôt.** Recherche effectuée sur `docs/`, `.opencode/`, `README*.md`, `*.md`, `*.html`, `*.json`, `*.yaml` :
aucune occurrence de « Plan 1 », `plan-1`, `plan1`. `docs/plans/` ne contient que
`2026-09-14-session-cost-controls.md`, `desktop-gui-modules-plan.md` et
`goal-state-completion-redesign.md`, sans rapport avec le registre de commandes.

**Conséquence assumée** : conformément à la consigne, la **source de vérité est le registre réel du CLI**,
`Command.Service.list()` (`packages/opencode/src/command/index.ts`), et non un document de plan. Aucun
registre écrit à la main, aucune donnée de démonstration.

## Source de vérité — registre du CLI

`Command.Service.list()` agrège exactement trois origines (elles-mêmes déduites du code) :

| Type (`source`) | Origine dans le CLI |
|---|---|
| `command` | commandes intégrées `init` / `review` + `cfg.command` |
| `mcp` | `mcp.prompts()` (prompts MCP) |
| `skill` | `skill.all()` (skills) |

Chaque `Command.Info` porte `name`, `description`, `source`, `hints` (= arguments attendus :
`$1`, `$2`, `$ARGUMENTS`). La projection vers le contrat public `{ name, description, type, arguments }`
est la fonction pure `project()` dans `src/opencodev2/command-registry.ts`, **partagée par la route et les
tests** — c'est ce qui rend la parité structurelle, pas déclarative.

## Livrables

| Fichier | Rôle |
|---|---|
| `src/opencodev2/command-registry.ts` | Registre partagé côté serveur : projection + validation stricte (nom, arguments, injection) + substitution de template. Pur : ni réseau, ni shell, ni processus. |
| `src/server/routes/instance/httpapi/command-routes.ts` | Routes locales `GET /opencodev2/commands` et `POST /opencodev2/commands/execute` ; jeton `x-opencodev2-token` identique à l'API Git ; contrôle d'hôte local (127.0.0.1 / localhost / ::1). |
| `server.ts` | Montage de `commandRoutes` dans l'arbre de routes. Jeton et contexte d'instance lus **à la demande** (comme `git-routes.ts`) pour ne pas casser les processus démarrés sans jeton. |
| `src/opencodev2/command-registry.test.ts` | Parité de projection, refus nom/arguments/injection, exécution bornée. |
| `src/server/routes/instance/httpapi/command-routes.test.ts` | Parité web == CLI, refus jeton absent / hôte externe / nom inconnu / injection, exécution skill sans shell. |

### Contrat des routes

- `GET /opencodev2/commands` → `200` + `Array<{ name, description?, type, arguments[] }>`.
- `POST /opencodev2/commands/execute` → corps `{ name, arguments? }` ; `200` +
  `{ name, type, arguments, prompt }`. Seuls `mcp` et `skill` sont exécutables ; aucune commande shell,
  aucun `spawn`. Le `prompt` est le template du CLI avec arguments substitués (`$1`, `$ARGUMENTS`).

| Code | Statut | Déclencheur |
|---|---|---|
| `NON_AUTHENTIFIE` | 401 | jeton absent/invalide |
| `HOTE_EXTERNE` | 403 | `Host` non local (DNS rebinding) |
| `NOM_INVALIDE` / `NOM_INCONNU` | 400 / 404 | nom hors registre |
| `TYPE_NON_EXECUTABLE` | 400 | tentative d'exécuter un `command` intégré |
| `ARGUMENT_INCONNU` / `ARGUMENT_INVALIDE` | 400 | argument non déclaré, valeur non-chaîne, injection |

Décisions de compatibilité : routes **additives** sous `/opencodev2/*` (aucune route existante modifiée) →
aucun impact client, aucune migration de contrat, pas de versioning nécessaire. Le jeton réutilise
`OPENCODEV2_GIT_TOKEN` / `x-opencodev2-token` : aucun nouveau secret, aucune nouvelle variable.

## Vérifications (commandes + résultats)

| Contrôle | Commande | Résultat |
|---|---|---|
| Tests nouveaux + voisins | `bun test --timeout 30000` sur les 5 fichiers (registre, routes, health, git, raw-route-auth) | **54 pass / 0 fail**, 161 assertions |
| Typecheck paquet | `bun run typecheck` (`tsgo --noEmit`) dans `packages/opencode` | vert |
| Typecheck webui | `bun run typecheck` dans `packages/webui` | vert |
| Build webui | non requis (aucun fichier webui modifié) | non lancé |
| Capture Playwright | non requise (aucune UI modifiée) | non lancée |

Régression détectée puis corrigée pendant la validation : la lecture du jeton au moment de la
**construction** de l'arbre de routes faisait échouer `httpapi-raw-route-auth.test.ts` (jeton absent).
Le jeton et le contexte d'instance sont désormais lus dans le handler, comme `git-routes.ts`.

## Hypothèses

- « Plan 1 rendu » désignerait un livrable de planification externe à ce dépôt ; en son absence, le registre
  du CLI fait foi (consigne explicite).
- « Jeton comme l'API Git » = mêmes variable d'environnement, en-tête et traitement `timingSafeEqual`.
- Le contrôle d'hôte local est appliqué en plus du jeton (défense en profondeur, cohérent avec
  `health-routes.ts`), bien que le serveur soit déjà lié en local par défaut.
- La « liste web » est la réponse de la route locale ; le « CLI » est `Command.Service.list()`. Les deux
  passent par `project()`, donc toute commande absente du registre CLI l'est aussi du registre web, et
  le test échoue si une entrée disparaît.
