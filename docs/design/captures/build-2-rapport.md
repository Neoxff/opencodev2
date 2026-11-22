# Build 2 — barre latérale (`feat/ui-sidebar`)

## Périmètre

Branche `feat/ui-sidebar` créée depuis `main` (`bdb6d93cb`). Le Build 1 n'étant pas fusionné, cette branche ne contient **ni** `shell.css` **ni** la largeur 258 px : elle part de la charpente `main` (rail 280 px). Ce point est listé comme écart, pas corrigé ici.

## Changements

- `packages/webui/src/sidebar.tsx` : composants du rail de la maquette — logo `opencode` + `V2`, `New session`, `Workspaces` + 4 icônes, champ de filtre, dossiers repliables avec heure, sessions avec dégradé de fin de texte et point d'activité, `read more (n)`, rappel des touches, `Archived` et `Server`.
- `packages/webui/src/sidebar.css` : styles chargés après `styles.css`, sans toucher à la feuille historique.
- `packages/webui/src/icons.tsx` : quatre icônes manquantes (nouvelle session, réduire, archives, serveur).
- `packages/webui/index.html` : charge Pixelify Sans et `sidebar.css`.
- `packages/webui/src/app.tsx` : le rail utilise ces composants et **uniquement les données du serveur** :
  - dossiers et sessions : `groupByWorkspace(sessions(), projects(), directory())`, issus de `GET /session` et `GET /project` ;
  - activité : carte lue sur `GET /session/status`, tenue à jour par les événements `session.status` / `session.idle` ;
  - historique : sessions récentes du serveur, triées par horodatage ;
  - `Archived` : aucun endpoint d'archivage n'existe côté serveur, l'écran le dit au lieu d'inventer une liste ;
  - `Server` : ouvre la configuration réelle.
- Les panneaux `Dépôt` et `Ressources` ne sont plus rendus dans le rail : ils ne figurent pas dans la maquette.

## Vérifications

- `bun run --cwd packages/webui typecheck` → exit 0.
- `bun run --cwd packages/webui test` → 31 fichiers, 715 tests, exit 0 (11 tests de rendu/navigation ajoutés).
- `bun run --cwd packages/webui build` → Vite 7.1.4, exit 0.
- Playwright (Chromium système, 1920×1080) → `pageerror: []`, exit 0.
- Mesures : rail 280 px, logo `opencodeV2`, `New session`, 4 icônes (`Search folders`, `Add folder`, `Session history`, `Collapse sidebar`), 1 dossier réel, 4 sessions réelles, `read more (96)`, touches `alt+n / ctrl+d / ctrl+r`, `Archived` et `Server`.
- Navigation vérifiée dans le navigateur : ouverture du filtre, ouverture de l'historique, repli d'un dossier (4 → 0 sessions), ouverture de `Archived` après le battement de rendu.

## Écarts vs maquette (captures `build-2-*.png`)

| # | Écart | Cause / périmètre |
|---|---|---|
| 1 | Rail large de 280 px au lieu de 258 px. | Build 1 non fusionné sur cette branche. |
| 2 | Panneau central non arrondi, pas de grille à 10 px. | `shell.css` du Build 1 absent. |
| 3 | Un seul dossier réel (`joachim`) au lieu des quatre de la maquette. | Données réelles du serveur ; aucune donnée de démonstration. |
| 4 | Aucune session marquée occupée au moment de la capture. | Le point d'activité est branché sur `GET /session/status` ; toutes les sessions étaient au repos. |
| 5 | `Archived` n'affiche aucune session. | Aucune route d'archivage exposée par le serveur ; message explicite à la place d'une liste inventée. |
| 6 | `Dépôt` et `Ressources` ont disparu du rail. | Conformité à la maquette ; accès à replanifier si souhaité. |

## Décision

PR ouverte sans fusion. Arrêt demandé après ce build : les builds 3 à 14 ne sont pas démarrés.
