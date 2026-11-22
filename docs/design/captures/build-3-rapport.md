# Build 3 — conversation (`feat/ui-conversation`)

## Périmètre

Branche `feat/ui-conversation` créée depuis `main` (`bdb6d93cb`). Les builds 1 et 2 n'étant pas fusionnés, cette branche ne contient ni `shell.css`, ni `sidebar.css` : la coque et le rail restent ceux de `main`. La conversation a été reproduite sans modifier la logique du serveur ni leflux d'événements.

## Changements

- `packages/webui/src/conversation.tsx` : en-tête (retour, titre, `Goal definition`, onglets `Conversation / Config / Logs`, `Working...` avec icône qui tourne) et lignes du flux : `edits`, `Thought`, `runs`, `delegates`, paragraphes (code vert), message utilisateur, mention `queued`, curseur à trois points et flèche haute.
- `packages/webui/src/conversation.css` : styles chargés après `styles.css`, sans toucher à la feuille historique.
- `packages/webui/src/icons.tsx` : icônes retour, rafraîchissement et cible.
- `packages/webui/index.html` : charge `conversation.css`.
- `packages/webui/src/app.tsx` : les lignes sont rendues depuis `turns()`, lui-même dérivé de `GET /session/messages` et des événements du flux. Aucune donnée de démonstration.
  - `edits` : ± lignes lues dans `metadata.filediff`, durée bornée par le serveur.
  - `Thought` : durée calculée depuis `reasoning.time`, nombre de caractères du texte réel, dépli.
  - `runs` : titre, statut, durée et sortie réelle de l'outil, dépli avec « Click to collapse ».
  - `delegates` : outils `task` / `subagent`, `running` avec chrono vivant ou `done`.
  - `queued` : uniquement sur le dernier prompt envoyé pendant qu'un autre tour est servi.
- `packages/webui/src/conversation.test.tsx` : 10 tests de rendu et d'état.

## Vérifications

- `bun run --cwd packages/webui typecheck` → exit 0.
- `bun run --cwd packages/webui test` → 31 fichiers, 714 tests, exit 0.
- `bun run --cwd packages/webui build` → Vite 7.1.4, exit 0.
- Playwright (Chromium système, 1920×1080) → `pageerror: []`, exit 0.
- Mesures sur une session réelle ouverte : titre `Maquette UI Opencodev2 noir pur`, onglets `Conversation / Config / Logs`, `Goal definition`, 380 lignes rendues dont 15 `edits`, 155 `Thought`, 210 `runs`, 85 paragraphes, 20 messages utilisateur, 305 extraits de code en vert, flèche haute et trois points du curseur présents.

## Écarts vs maquette (captures `build-3-*.png`)

| # | Écart | Cause / périmètre |
|---|---|---|
| 1 | Rail 280 px, logo `OPENCODE/V2/HARNESS`, panneaux `Dépôt` et `Ressources` visibles. | Builds 1 et 2 non fusionnés sur cette branche. |
| 2 | Panneau central non arrondi, pas de grille à 10 px. | `shell.css` du Build 1 absent. |
| 3 | Aucun `delegates` dans la session capturée. | Le flux réel ouvert ne contenait aucun outil `task`/`subagent` ; l'état est couvert par les tests. |
| 4 | Aucun `Working...` ni `queued` dans la capture. | Session au repos au moment de la capture ; les deux états sont couverts par les tests. |
| 5 | Les horodatages ne sont pas affichés. | Comme dans la maquette, ils n'apparaissent qu'après activation explicite (`timestamps`, Build 7). |
| 6 | Densité plus élevée que la maquette (380 lignes pour une session réelle de 38 tours). | Données réelles ; la maquette montrait un extrait choisi. |

## Décision

PR ouverte sans fusion. Arrêt demandé après ce build : les builds 4 à 14 ne sont pas démarrés.
