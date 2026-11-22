# Build 7 — Commandes d'interface — Rapport de captures et d'écarts

Branche : `feat/ui-commandes-ui` (worktree `.worktrees/b7`), depuis `main`.
Référence visuelle : `docs/design/maquette-opencodev2-ui.html` et `docs/design/reference-opencode-v2.png`.

## Objectif

Implémenter les commandes qui agissent sur l'interface — par opposition à celles qui envoient un
prompt à l'agent — sur les **vraies valeurs** du serveur, sans aucune donnée de démonstration.

## Décision d'architecture (deux approches comparées)

| Approche | Avantage | Coût | Verdict |
|---|---|---|---|
| Éparpiller chaque commande dans `app.tsx` | Aucun nouveau fichier | 19 handlers dans un fichier de 3 000 lignes, non testables isolément, données dupliquées | Rejetée |
| Module pur + un seul hôte de dialogue (retenu) | `buildView()` testable sans DOM, un seul composant pour 19 vues, données projetées une fois | Un module de plus, un contrat de props à tenir | Retenue |

Le module pur (`ui-commands.ts`) ne connaît ni Solid ni le réseau ; il projette des `CommandData`
en une `View`. Le composant (`ui-command-dialog.tsx`) ne fait que rendre cette vue et tenir le
clavier. L'adaptation des payloads réels vit dans `ui-commands-data.ts`. `app.tsx` reste le seul
endroit qui connaît le client SDK : c'est le point de branchement, pas un distributeur de logique.

Évolution future : une 20ᵉ commande s'ajoute dans `COMMAND_IDS`, `commandMeta` et un `case` de
`buildView` — le dialogue, le focus et les tests génériques ne changent pas.

## Fichiers livrés

| Fichier | Rôle |
|---|---|
| `packages/webui/src/ui-commands.ts` | Registre des 19 commandes, types de vues, `buildView`, filtre et piège de focus |
| `packages/webui/src/ui-command-dialog.tsx` | Hôte Solid : dialogue accessible, focus piégé, Échap, navigation clavier |
| `packages/webui/src/ui-commands.css` | CSS isolé, préfixe `uic-`, jetons existants, thèmes noirs `data-th` |
| `packages/webui/src/ui-commands-data.ts` | Projections des payloads réels (modèles, variantes, agents, skills, MCP, sessions, diff) |
| `packages/webui/src/app.tsx` | Intégration : interception `/commande`, `ctrl+p`, callbacks, effets visuels |
| `packages/webui/src/ui-commands.test.ts` | **Un test par commande** + clavier |
| `packages/webui/src/ui-command-dialog.test.tsx` | Accessibilité du dialogue (7 tests) |
| `docs/design/captures/build-7/capture.cjs` | Script Playwright reproductible |
| `docs/design/captures/build-7/*.png` | 21 captures 1920×1080 |

## Les 19 commandes et leur source réelle

| Commande | Source réelle (aucune valeur inventée) |
|---|---|
| `/agents` | `GET /agent` → `agentOptions()` |
| `/models` | `GET /config/providers` → `modelOptions()` |
| `/variants` | `models[id].variants` du même payload, pour le modèle courant |
| `/decision-model`, `/vision-model` | catalogue réel des modèles, choix conservé en `localStorage` |
| `/themes` | trois thèmes noirs de la maquette (`""`, `contrast`, `warm`) appliqués à `data-th` |
| `/thinking`, `/timestamps` | état UI local, appliqué au rendu du fil |
| `/timeline` | prompts réels des tours rendus, ancre `data-turn` indexée sur le fil |
| `/sessions` | `GET /session` |
| `/status` | `GET /global/health`, réglages, agent/modèle, compteurs de tokens et de MCP |
| `/help` | raccourcis réels de l'application |
| `/skills` | `GET /skill` (425 skills sur l'instance de test) |
| `/subagent` | `GET /agent` filtré sur `mode === "subagent"` |
| `/connect` | `GET /provider/auth`, puis ouverture de la section fournisseurs |
| `/config` | feuille de réglages existante |
| `/logs` | vue journaux / trajectoire existante |
| `/diff` | `GET /session/{id}/diff` (`SnapshotFileDiff`), patch parsé en lignes |
| `/mcps` | `GET /mcp` + `POST /mcp/{name}/connect|disconnect`, puis **relecture** du statut et mise à jour du panneau MCP |

Les interrupteurs MCP ne sont pas optimistes : la route est appelée, puis `/mcp` est relu et le
signal `mcp` est réécrit. Le panneau MCP de la feuille de réglages suit cette relecture.

## Vérifications exécutées

```
bun run --cwd packages/webui typecheck   → tsgo --noEmit, exit 0
bun run --cwd packages/webui test        → 32 fichiers, 734 tests, 734 passés, exit 0
bun run --cwd packages/webui build       → 61 modules, dist/ 250,69 ko JS + 65,68 ko CSS, exit 0
```

Captures : `chromium` système (`/usr/bin/chromium`), `playwright-core@1.55.0`, args
`['--no-sandbox']`, viewport **1920×1080**, serveur Vite dédié sur le port **4207**, backend réel
sur 4096. Une seule erreur console relevée : `404` sur une ressource statique non critique
(navigation du serveur), aucune erreur JavaScript.

## Captures et comparaison à la maquette

21 PNG dans `docs/design/captures/build-7/` : `00-accueil`, `01-palette`, `cmd-<commande>` pour les
19 commandes. Toutes les commandes ont produit la vue attendue (titres relevés dans le log du
script : « Switch agent », « Switch model », « Switch theme », « Toggle MCPs », « Diff viewer », …).

Métriques calculées sur la palette, relevées au navigateur :

| Propriété | Mesuré (Build 7) | Maquette | Écart |
|---|---|---|---|
| Largeur dialogue | 560 px | `min(560px,100%)` | conforme |
| Rayon | 12 px | 14 px | **−2 px** |
| Fond dialogue | `rgb(35,35,36)` | `var(--raise)` | teinte plus claire que la maquette |
| Fond overlay | `rgba(0,0,0,.7)` | `rgba(0,0,0,.66)` | **+0,04** d'opacité |
| Padding | 16 px | 16 px | conforme |
| Hauteur max | 842 px (78 vh) | 78 vh | conforme |
| Lignes de la palette | 19 | 19 | conforme |
| Durée d'entrée | 0,18 s | 0,25 s | **−0,07 s** |

### Écarts listés

**Dans le périmètre des dialogues (à corriger si l'on veut un pixel-match) :**

1. Rayon du dialogue 12 px au lieu de 14 px (`--radius-12` au lieu d'une valeur dédiée 14 px).
2. Fond `rgb(35,35,36)` (`--surface-1`) au lieu du `--raise` de la maquette : la maquette est plus
   proche du noir pur. Le README impose « plus de noir, moins de verre » ; le fond retenu respecte
   la règle mais pas la valeur exacte.
3. Overlay à 0,70 au lieu de 0,66 : la scène derrière le dialogue est légèrement plus assombrie.
4. Animation d'entrée 0,18 s au lieu de 0,25 s.
5. Hauteur de ligne 36 px au lieu de 32 px (`.mi` de la maquette) : la liste est plus aérée.

**Hors périmètre (état antérieur de la webui, non modifié par le Build 7) :**

6. Pas de ciel étoilé animé dans la webui : la maquette en a un, la webui reste sur son fond uni.
7. Le panneau droit de la maquette (Goal / Context / MCP / LSP / Todo) n'existe pas dans la webui,
   qui a un tiroir « Decisions ». Les commandes `/status` et `/mcps` en tiennent lieu en dialogue.
8. L'accueil de la webui (« Into the Unknown » + sélecteur de dossier) diffère du bandeau
   d'accueil de la maquette (« Bonjour · … », motto, chips `/humanizer`, `/mcps`, `@ files`).
9. Les libellés de la maquette (`Tidepool Alpha Free`, `Hy4 Flash Free`, `orchestrator`, …) sont des
   exemples figés ; les dialogues affichent les **vrais** agents et modèles du serveur, comme demandé.
10. `/config` et `/logs` sont des onglets dans la maquette ; ils ouvrent ici la feuille de réglages
    et la vue trajectoire existantes (mêmes fonctions, autre emplacement).

## Points de vigilance

- **Perf** : `/skills` (425 entrées), `/models` (696), `/connect` et `/sessions` sont des listes
  longues. Elles sont filtrables et bornées en hauteur (52 vh) mais **non virtualisées** ; sous
  1 000 lignes le coût de rendu reste acceptable, à revisiter si le catalogue grandit.
- **Sécurité** : la charge brute de `/config/providers` porte des clés API en clair. Seules les
  variantes en sont extraites ; la charge n'entre dans aucun signal (test de non-régression).
- **Accessibilité** : focus piégé, Échap ferme et rend le focus, `role="dialog"`, `aria-modal`, titre
  relié, vrais `<button>`. Non testé : lecteur d'écran réel et navigation au toucher.
- **Compatibilité** : `:root[data-th]` modifie les jetons globaux — c'est le seul sélecteur non
  préfixé du CSS isolé, volontaire, sans quoi le thème ne peut pas s'appliquer hors du dialogue.
