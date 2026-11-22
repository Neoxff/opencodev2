# Build 9 — Panneau droit « comme le CLI »

- Branche : `feat/ui-panneau-droit` (worktree `.worktrees/b9`), HEAD de départ `bdb6d93cb`.
- Références : `docs/design/maquette-opencodev2-ui.html` (§ « Panneau droit »), `docs/design/reference-opencode-v2.png`, `docs/design/README-ui.md`.

## Changements

| Fichier | Rôle |
|---|---|
| `packages/webui/src/right-panel.tsx` | Composant `RightPanel` + `GoalAction` : cinq sections repliables (Goal, Context, MCP, LSP, Todo), pied `dossier:branche` + version, éditeur de contrat, cinq boutons d'action Goal. Toutes les données sont des props injectées — aucune donnée de démonstration. |
| `packages/webui/src/right-panel.css` | CSS isolé (préfixe `rp-`) traduisant les jetons de la maquette vers ceux du webui ; placé dans la 3ᵉ colonne, masqué sous 1100 px, clip de `.layout` pour éviter le défilement horizontal du tiroir fermé. |
| `packages/webui/src/right-panel.test.tsx` | 8 tests : cinq sections + notes + pied, repli indépendant, actions Goal, éditeur (refus du vide, liste nettoyée), chiffres de contexte, états vides, bascule `aria-hidden`/`is-open`. |
| `packages/webui/src/app.tsx` | Signal `panelOpen`, chargement réel de l'état MCP / config (LSP) / Git au montage, `goalAction()` écrivant `goalState` par `PATCH /session/{id}`, bouton de bascule `.rp-toggle` dans `.thread-head`, rendu du panneau, largeur de la 3ᵉ colonne pilotée par le panneau **ou** le tiroir de décisions, under-1100 sans colonne réservée. |

## Choix d'implémentation

- **Actions Goal** : les commandes `/goal-approve`, `/goal-edit`, `/goal-generate`, `/goal-regenerate`, `/goal-skip` sont des commandes **locales au TUI** (`packages/opencode/src/cli/cmd/tui/routes/session/index.tsx:820-987`) : le serveur n'expose aucune route pour elles. Le panneau reproduit leur effet sur `goalState` par la route réelle `PATCH /session/{id}`, déjà utilisée par `saveContract` — jamais une valeursupposée : le plan est relu après l'écriture.
- **Edit** : le bouton ouvre un éditeur inline (contrat, DOD) au lieu d'une boîte de dialogue TUI ; la sauvegarde passe par `contractPayload()` (préserve `findings`, `completion`, `version`).
- **Génération** : `generate`/`regenerate` reprennent le gabarit du TUI, alimentés par le dernier prompt utilisateur réel (`promptHistory`), avec le DOD minimal documenté.
- **MCP / LSP / Git** : états réels lus au montage ; absence de jeton Git en développement (Vite) → le pied affiche `—` plutôt qu'une branche inventée.
- **Colonne partagée** : le panneau et le tiroir de décisions occupent la même cellule `grid-column: 3 / grid-row: 1` ; la largeur n'est réservée que si l'un des deux est ouvert (et viewport ≥ 1100 px pour le panneau).

## Vérifications

- `bun run --cwd packages/webui typecheck` → `tsgo --noEmit`, **0 erreur**.
- `bun run --cwd packages/webui test` → **31 fichiers, 712 tests réussis** (dont 8 nouveaux `right-panel.test.tsx`).
- `bun run --cwd packages/webui build` → `✓ 59 modules transformed`, `dist/assets/index-ByD-i8ky.css 66,58 kB (gzip 12,07)`, `dist/assets/index-XQWZNOJv.js 244,86 kB (gzip 70,35)`, `✓ built in 4,78 s`.
- Playwright : `playwright-core@1.55.0` + `/usr/bin/chromium --no-sandbox`, viewport **1920×1080**, port **4209**, `vite preview` sur le build de production. `page.goto` en `domcontentloaded` (le flux SSE empêche `networkidle`).

## Captures et mesures

| Capture | Observation mesurée |
|---|---|
| `build-9-1920x1080.png` | `grid-template-columns: 280px 1280px 360px`, panneau 360 px, 5 sections `goal/ctx/mcp/lsp/todo`, `scrollWidth == clientWidth == 1920`. |
| `build-9-panel-1920x1080.png` | Notes `DOD(0) OOS(0)`, `1/2` (MCP), `0/0` (Todo), pied `opencodev2web:— • Opencodev2 2.4.31`, boutons `approve/edit/generate/regenerate/skip`. |
| `build-9-collapsed-1920x1080.png` | Clic sur l'en-tête Goal → `class="rp-rs shut"`, `aria-expanded="false"` ; le contenu reste dans le DOM (repli, pas destruction). |
| `build-9-closed-1920x1080.png` | Clic sur `.rp-toggle` → `is-open` retiré, largeur mesurée 0 px. |
| `build-9-768x800.png` | Panneau masqué (`display: none`), `scrollWidth == clientWidth == 768`. |
| `build-9-320x800.png` | `scrollWidth == clientWidth == 320` — aucun débordement horizontal. |

## Écarts avec la maquette (données de démonstration volontairement absentes)

- La maquette affiche un GOAL figé (DOD 5, OOS 4), 19 MCP, 8 todos et `~/Documents/opencodev2web:main`. L'application affiche l'état **réel** de la session ouverte ; sur une session sans contrat, les listes sont vides et le pied indique `—`. C'est la règle « aucune donnée de démonstration », pas un défaut de rendu.
- Le bouton **Generate** s'ajoute aux quatre boutons de la maquette (`Approve`, `Edit`, `Regenerate`, `Skip`) : il correspond à la commande `/goal-generate` du contrat Build 9.
- L'icône de bascule est un glyphe `▤` (le jeu d'icônes du webui n'a pas d'icône « panneau droit » dédiée) ; la maquette utilise un SVG `<use href="#panelr">`.
- Les jetons de couleur sont ceux du webui (`--text-*`, `--bg-*`, `--line-*`), pas les `--tx-*`/`--panel` de la maquette : le contraste AA est maintenu et aucun fond bleu/violet n'est introduit (README-ui).

## Points de vigilance

- **Débordement horizontal** : le tiroir de décisions fermé est `translateX(100 %)` dans la 3ᵉ colonne ; sans `overflow: hidden` sur `.layout`, il étendait `scrollWidth` de 360 px (mesuré 2280 pour 1920). Corrigé et re-mesuré sur les trois largeurs.
- **État de repli** : mémorisé dans un signal local au composant ; il survit aux re-rendus mais pas à un démontage du panneau.
- **Cibles tactiles** : les boutons Goal font 26 px de haut comme la maquette ; sous la recommandation 44 px, assumé pour coller à la densité du CLI.
- **404 console** : une requête 404 intermittente sur le serveur de prévisualisation (proxy sans backend local) ; non reproductible when rejouée, aucune requête ≥ 400 sur le second passage.
- **Console** : aucun `console.log` résiduel, aucun `any`, aucun `TODO` ajouté.
