# Build 6 — menus `/`, `@` et palette `ctrl+p` : rapport de livraison

Branche : `feat/ui-slash` (worktree `.worktrees/b6`). Aucune fusion, aucun changement de branche.

## Objectif

Reproduire dans la webui les trois menus de la maquette `docs/design/maquette-opencodev2-ui.html` — liste défilante `/`, mentions `@` (fichiers + sessions), palette `ctrl+p` — avec clavier complet, filtre, nom en mono, description grisée et étiquette MCP / Skill, **sur les vraies données du serveur**. Une commande inconnue ne doit jamais être envoyée au modèle.

## Livrables

| Fichier | Rôle |
|---|---|
| `packages/webui/src/menus.ts` | Logique pure : projection des commandes, filtre, navigation clavier, garde-fou « commande inconnue ». |
| `packages/webui/src/menu-components.tsx` | Composants Solid `SuggestMenu` et `CommandPalette`. |
| `packages/webui/src/menus.css` | CSS isolé (préfixe `oc-`, variables locales, aucun jeton global modifié). |
| `packages/webui/src/menus.test.ts` | Tests clavier / filtrage / garde-fou avec registre simulé. |
| `packages/webui/src/menu-components.test.tsx` | Tests de rendu et d'événements clavier des composants. |
| `packages/webui/src/menus.real.test.ts` | Les mêmes garanties contre le **vrai registre CLI** (serveur local `:4096`). |
| `packages/webui/src/app.tsx` | Intégration : accueil + compositeur de session, raccourci `ctrl+p`, message d'erreur. |
| `docs/design/captures/build-6/capture.cjs` | Script Playwright de reproduction des captures. |
| `docs/design/captures/build-6/*.png` | 12 captures 1920×1080. |

## Choix d'implémentation

- **Un seul registre, trois vues.** `commandRows()` projette `GET /command` (champ `source` : `command` / `mcp` / `skill`) ; le `/` et la palette consomment exactement la même fonction. L'étiquette vient du serveur, pas d'une heuristique sur le nom.
- **Aucune donnée de démonstration.** Les 430 commandes, les fichiers (`GET /find`) et les sessions (`GET /session`) viennent du serveur réel. La maquette, elle, portait 43 entrées statiques — c'est un écart de données, pas un défaut (voir ci-dessous).
- **Garde-fou d'envoi.** `guardCommand()` relit le registre avant chaque envoi d'un texte commençant par `/` (accueil **et** session) ; un nom absent est refusé avec un message explicite, et le texte n'entre dans aucun `promptAsync`. Le registre vide bloque aussi : ne pas savoir n'autorise pas à envoyer.
- **`Entrée` exécute, `Tab` complète.** `Entrée` sur une commande pose `/nom ` et l'envoie ; `Tab` ne fait que compléter. Sur une mention, les deux insèrent le chemin/titre en remplaçant le mot entier, avec retour du curseur après insertion.
- **CSS isolé.** Toutes les classes sont préfixées `oc-` ; les couleurs sont déclarées sur `.oc-menu, .oc-palette` et n'écrasent aucun jeton existant. Fond noir, pas de verre, aucune teinte bleue.
- **Accessibilité.** Liste `role="listbox"` / options `role="option"` + `aria-selected`, lignes en `<button type="button">` (pas de `<div onClick>`), `tabindex="-1"` pour ne pas polluer l'ordre de tabulation, focus visible, `aria-label` sur les champs de filtre, `Échap` ferme, `Home`/`End`/flèches bouclent, `prefers-reduced-motion` respecté.

## Vérifications

Commandes exécutées depuis `/home/joachim/Documents/opencodev2/.worktrees/b6` :

| Commande | Résultat |
|---|---|
| `bun run --cwd packages/webui typecheck` | `tsgo --noEmit` — code 0 |
| `bun run --cwd packages/webui test` | `32 passed, 1 skipped` fichiers · `738 passed, 3 skipped` tests — code 0 |
| `bun run --cwd packages/webui build` | `✓ 60 modules transformed` · `dist/assets/index-Y3eV5Szo.css 64.96 kB` · `dist/assets/index-D6nUMLs4.js 239.71 kB` — code 0 |
| `OPENCODE_TEST_REAL=1 bun x vitest run src/menus.real.test.ts` | `1 passed` fichier · `3 passed` tests — code 0 |

Le test réel a relevé sur le serveur vivant `:4096` : **430 commandes** — `420 skill`, `8 command`, `2 mcp`. C'est le même registre que celui que le CLI consulte (`packages/opencode/src/command/index.ts`). Le binaire `opencode` n'étant pas dans le `PATH` de cette machine, la vérification « vrai registre CLI » a été faite par la route HTTP du serveur, qui en est la source autoritaire ; c'est la seule différence de moyen, pas de données.

### Captures Playwright

Script : `require('/home/joachim/.bun/install/cache/playwright-core@1.55.0@@@1/index.js')`, `chromium.executablePath = /usr/bin/chromium`, `args: ['--no-sandbox']`, viewport **1920×1080**, port **4206**.

Observations relevées pendant la capture :

| État | Maquette | Webui (vraies données) |
|---|---|---|
| `/` liste complète | 43 entrées statiques | **430 commandes** du serveur, liste défilante bornée à 352 px |
| `/human` (filtre) | — | 3 lignes (`humanizer`, `humanizer-*`aussi selon le registre) |
| `@` | 4 entrées statiques | **12 lignes** : fichiers du dossier puis sessions |
| Palette `ctrl+p` | liste statique | **430 commandes**, filtre et flèches opérationnels |
| Commande inconnue | — | message affiché : `Unknown command "/build-6-commande-qui-nexiste-pas". Nothing was sent to the model.` |
| Échap palette | — | palette fermée (observé) |

Fichiers : `01-maquette-accueil.png` … `12-webui-palette-filtre.png` (12 PNG, 1920×1080).

## Écarts relevés par rapport à la maquette

1. **Données, pas de démonstration.** La maquette affiche 43 slash statiques et 4 mentions `@`. La webui affiche 430 commandes et 12 fichiers/sessions réels. C'est l'écart le plus visible ; il est **volontaire** et imposé par l'exigence « aucune donnée de démonstration ».
2. **Largeur du menu.** La maquette centre une liste de `min(760px, 100vw-40px)` au-dessus du composeur. La webui aligne la liste sur la largeur du composeur (~660 px), dans sa boîte. Le comportement (défilement, survol, `Entrée`) est identique ; la largeur suit le composeur existant pour ne pas casser sa mise en page.
3. **Couleur de la description.** La maquette utilise `--tx-3` (`#6c6c75`, ≈3.6:1 sur `#131316`). La webui utilise `#a3a3ab` (≈6.6:1) pour tenir le contraste ≥ 4.5:1. Écart d'accessibilité assumé.
4. **Hauteur de ligne.** 32 px dans les deux cas, donc conforme à la maquette mais sous la cible de 44 px de nos standards ; avec 430 entrées, des lignes de 44 px ne montreraient que 8 commandes à l'écran. La cible large reste servie par le clavier complet et les zones de clic sur toute la ligne.
5. **Fond.** La maquette a un ciel étoilé ; la webui reste sur fond noir pur sans ciel. C'est conforme à la règle de priorité du dépôt (« plus de noir, moins de verre ») et l'objet de Build 6 n'était pas le ciel.
6. **Message d'erreur.** Absent de la maquette (elle simule tout) ; ajouté ici pour rendre visible le refus d'une commande inconnue — exigence fonctionnelle du build.
7. **Observations non bloquantes.** Une erreur console `404 (Not Found)` est apparue une fois pendant la capture complète (probable requête de favicon) ; elle ne s'est **pas reproduite** lors d'une recharge ciblée (`BAD: []`). Aucun `pageerror` relevé. Les polices Google chargées par la maquette peuvent différer selon la connectivité ; les piles de repli sont déclarées.

## Points de vigilance

- `GET /command` pèse ~1,95 Mo sur l'instance de développement ; il est chargé une seule fois, à la première frappe de `/` ou à l'ouverture de la palette, jamais au montage. Le garde-fou le relit avant envoi mais la fonction est mémoïsée (`if (commandOptions().length > 0) return`).
- La recherche de fichiers est temporisée à 150 ms ; les sessions sont bornées à 12 et les fichiers à 20 (`client.find.files`). Listes au-delà de ~100 éléments : non applicable ici.
- Le menu est rendu dans le flux du compositeur (il le pousse vers le bas), comme dans la maquette ; un popup `fixed` masquerait la ligne en cours d'écriture.
