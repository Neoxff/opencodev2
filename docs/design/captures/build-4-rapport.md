# Build 4 — composeur

## Objectif

Reproduire le composeur de `docs/design/maquette-opencodev2-ui.html` dans le webui SolidJS, avec des valeurs réelles uniquement (agents, modèles, variantes, statistiques de contexte, état de travail), puis livrer tests, captures, validation et PR.

## Fichiers livrés

- `packages/webui/src/composer-ui.tsx` — composants isolés `ComposerControls`, `ComposerSuggestions`, `ComposerStatusBar` et constante `COMPOSER_PLACEHOLDER`.
- `packages/webui/src/composer-ui.css` — CSS isolé dans les classes `.cv-*`, chargé après `styles.css`.
- `packages/webui/src/app.tsx` — intégration des deux composeurs (accueil et fil), variantes projetées, envoi de `variant`, actions `@ tag files` / `ctrl+p commands`, interruption.
- `packages/webui/src/settings.ts` — `modelVariantCatalog()` et `preferredVariant()` ; projection des variantes sans conserver la charge brute de `/config/providers`.
- `packages/webui/src/picker.tsx` — props optionnelles `icon`, `chevronRight`, `compact` pour réutiliser le sélecteur existant dans la barre de saisie.
- `packages/webui/src/icons.tsx` — `BotIcon` et `MicIcon`.
- `packages/webui/index.html` — lien vers `composer-ui.css` après `styles.css`.
- `packages/webui/src/composer-ui.test.tsx` — 9 tests des états repos/travail, Interrupt, statistiques, sélecteurs et pièce jointe.
- `docs/design/captures/build-4-*.png` — captures Playwright 1920×1080 et vues responsive.
- `docs/design/captures/build-4-rapport.md` — ce rapport.

## Choix d'implémentation

- Aucune donnée de démonstration : agents et modèles viennent des signaux existants alimentés par l'API ; les variantes sont dérivées du catalogue réel déjà chargé au montage. Quand aucune valeur n'est disponible, l'interface affiche des placeholders explicites (`default agent`, `default model`, `default variant`) ou `—`, pas des chiffres inventés.
- Le calque markdown existant est conservé : le `textarea` reste transparent avec un calque de même métrique, ce qui préserve curseur, sélection et coloration.
- La barre de gestes suit l'ordre de la maquette : `+`, agent avec icône robot, espace, variante, modèle, micro, bouton rond d'envoi. Pendant le travail, le bouton rond devient un carré creux et appelle `abortRun`.
- Le micro est présent mais désactivé : le serveur n'expose aucune API vocale ; un bouton actif serait mensonger.
- `enter queue` et `alt+s steer` sont des indications d'état, pas des actions : aucun backend correspondant n'existe. `esc interrupt` est actionnable.
- Les chooseurs réutilisent `Picker` avec des variantes de présentation, plutôt que d'importer une bibliothèque supplémentaire.

## Validation

Commandes exécutées dans `/home/joachim/Documents/opencodev2/.worktrees/b4` :

- `bun run --cwd packages/webui typecheck` — exit 0, aucune erreur.
- `bun run --cwd packages/webui test` — exit 0, **31 fichiers, 713 tests réussis** (baseline : 30 fichiers / 704 tests ; +9 tests).
- `bun run --cwd packages/webui build` — exit 0, 59 modules transformés ; `dist/assets/index-Cial74S7.css` 65,60 kB (gzip 12,00 kB), `dist/assets/index-D9cdc94p.js` 239,73 kB (gzip 68,62 kB).

Captures Playwright : `require('/home/joachim/.bun/install/cache/playwright-core@1.55.0@@@1/index.js')`, `chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] })`, viewport 1920×1080.

## Captures

- `build-4-maquette.png` — maquette de référence à 1920×1080.
- `build-4-home.png` — application complète à 1920×1080.
- `build-4-home-composer.png` — gros plan du composeur au repos.
- `build-4-working-composer.png` — état de travail simulé dans le DOM pour la capture ; le comportement réel d'interruption est couvert par les tests unitaires.
- `build-4-320.png`, `build-4-768.png`, `build-4-1440.png` — vues responsive.

## Comparaison mesurée (1920×1080)

| Propriété | Maquette | Application |
|---|---|---|
| Largeur composeur | 660 px | 660 px |
| Padding | `12px 14px 10px` | idem |
| Fond | `rgb(19,19,22)` | idem |
| Bordure | `1px solid rgb(44,44,49)` | idem |
| Rayon | `14px` | idem |
| Police composeur | `13px/18.85px` | idem |
| Largeur barre de gestes | 630 px | idem |
| Gap barre de gestes | 8 px | idem |
| Bouton rond / envoi | 28 px, rayon 50 % | idem |
| Barre d'état | 660 px, gap 14 px, `11.5px/16.675px`, `rgb(108,108,117)` | idem |
| Placeholder | `Describe what you want to build. / commands, @ files or sessions` | idem |

## Écarts relevés

1. Valeurs d'état : la maquette affiche des exemples figés (`Tidepool Alpha Free`, `max`, `634k / 1.0M (63%)`, `52 tok/s`) ; l'application affiche les valeurs réelles quand elles existent, sinon `default model`, `default variant` et `—`. C'est volontaire : pas de données de démonstration.
2. Le `textarea` garde `color: transparent` et un calque markdown, contre du texte visible direct dans la maquette ; le rendu visible reste aligné, mais la couleur calculée du champ diffère.
3. Le micro est désactivé faute d'API vocale serveur.
4. `enter queue` et `alt+s steer` sont des libellés d'état uniquement ; `esc interrupt` déclenche bien l'arrêt.
5. La capture de l'état de travail est une simulation visuelle du DOM ; aucun run réel n'a été lancé pendant la capture.
6. Responsive : le composeur reste dans sa colonne (592 px à 768, 660 px à 1440). Le document peut toutefois déborder horizontalement à 320/768/1440 quand le panneau latéral droit de l'application est ouvert ; ce comportement vient de la charpente existante `.layout`/`.side`, hors périmètre du composeur.
7. Le bouton d'attache est un `<label>` associé à l'input fichier, pas un `<button>` ; le clavier passe par le champ fichier masqué.
