# Build 1 — Coque UI (`feat/ui-coque`)

## Prérequis

`docs/design/19-ui-pixel.md` n'existe pas sur `main` ni sur les branches locales (`19-tokens.md` existe sur `docs/tokens-v3`, non fusionné et incomplet). Source de vérité retenue : `docs/design/maquette-opencodev2-ui.html` + `reference-opencode-v2.png`, conformément à `docs/design/README-ui.md` (« la maquette gagne »). Écart consigné, aucune validation inventée.

## Changements

- `packages/webui/src/tokens.css` : jetons maquette (`#000`, `#0c0c0e`, `#131316`, `#1b1b1f`, `#222226`, `#2c2c31`, `#ebebed`, `#a3a3ab`, `#6c6c75`, vert/rouge/ambre), polices Inter / JetBrains Mono / Space Grotesk / Pixelify Sans, alias de compatibilité conservés.
- `packages/webui/src/shell.css` (nouveau) : surcharge chargée après `styles.css` — rail 258 px, panneau principal `x=268`, rayon 14 px, gouttière 10 px, panneau droit 300 px optionnel, `--measure: 960px`. Aucun comportement modifié.
- `packages/webui/index.html` : charge Pixelify Sans.
- `packages/webui/src/columns.ts` + `columns.test.ts` : constantes de largeur alignées sur la maquette (sidebar 258, détails 300), solveur inchangé.
- `docs/design/captures/build-1-maquette-1920.png` et `build-1-webui-1920.png` : captures Playwright à 1920×1080.

## Vérifications

- `bun run --cwd packages/webui typecheck` → exit 0.
- `bun run --cwd packages/webui test` → 30 fichiers, 704 tests, 0 échec (exit 0).
- `bun run --cwd packages/webui build` → Vite 7.1.4, 58 modules, exit 0.
- Capture Playwright (Chromium système via `playwright-core`, viewport 1920×1080) → `pageerror: []`, exit 0.
- Mesures calculées sur le webui : `body.bg = rgb(0,0,0)`, rail `x=0 y=10 w=258`, panneau `x=268 y=10 w=1332`, `bg=rgb(12,12,14)`, `radius=14px`, grille `258px 1332px 300px` (une permission en attente ouvre la piste droite ; l'aside reste translaté hors écran tant qu'il n'a pas la classe `.open`), `--line-2 = #2c2c31`, `--measure = 960px`.

## Écarts observés vs maquette (même largeur 1920)

| # | Écart | État / périmètre |
|---|---|---|
| 1 | Le panneau droit de la maquette est visible (Goal, Context, MCP, LSP, Todo) ; le webui le garde fermé par défaut. | Optionnel et branché sur de vraies données au Build 9. |
| 2 | En-tête `New session` + `Goal definition` + onglets Conversation/Config/Logs absent côté webui. | Build 3. |
| 3 | Aucune ligne `edits / Thought / runs / delegates / message` rendue ; vue d'accueil `Into the Unknown`. | Build 3. |
| 4 | Composeur différent : sélecteur de dossier, « Default model / Default agent », bouton d'envoi gris ; la maquette attend `orchestrator`, `max`, modèle, micro, bouton rond blanc. | Build 4 et 11. |
| 5 | Logo textuel `OPENCODE/V2` + `HARNESS` au lieu de `opencode` + `V2` en Pixelify Sans ; la police Google n'est pas chargée hors réseau, donc repli monospace mesuré. | Build 2 ; dépendance réseau assumée. |
| 6 | Fond noir uni : ciel étoilé absent. | Build 12. |
| 7 | Rail : `Plugins`, `Dépôt`, `Ressources`, `settings` au lieu de `Workspaces`, `Archived`, `Server` ; sessions différentes (données réelles). | Build 2. |
| 8 | Aucun écart de géométrie de coque : largeurs, gouttière, rayon et fond mesurés conformes. | Vert |

## Décision

PR ouverte sans fusion. Arrêt demandé après ce build ; les builds 2 à 14 ne sont pas démarrés.
