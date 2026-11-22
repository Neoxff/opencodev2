# Build 10 — Raccourcis clavier (webui)

Branche : `feat/ui-raccourcis` (depuis `main`). Périmètre : `packages/webui` uniquement.

## Objectif

Implémenter les raccourcis de la maquette `docs/design/maquette-opencodev2-ui.html` sur les **vraies**
actions/API, sans donnée de démonstration, sans conflit navigateur non justifié.

| Raccourci | Action réelle | API / fonction |
|---|---|---|
| `ctrl+p` | Palette de commandes | `ShortcutPalette` → actions de l'app |
| `alt+n` | Nouvelle session | `client.session.create` via `createSession()` |
| `ctrl+r` | Renommer la session courante | `client.session.update` via `startRename()` |
| `ctrl+d` | Demander la confirmation de suppression | `setConfirming(id)` → `client.session.delete` |
| `esc` | Interrompre l'agent | `client.session.abort` via `abortRun()` |
| `enter` pendant le travail | Message mis en file | `client.session.promptAsync` (mode `queue`) |
| `alt+s` | Steer — consigne dans le tour en cours | `promptAsync` avec `metadata.steer = true` (mode `steer`) |

Le serveur porte le steer dans les métadonnées de la partie texte : vérifié dans
`packages/opencode/src/session/prompt-queue.ts` (`metadata?.steer === true`) et
`packages/opencode/src/session/prompt.ts`, exactement comme le TUI
(`packages/opencode/src/cli/cmd/tui/component/prompt/submit-mode.ts`). Le schéma `TextPartInput`
expose bien `metadata` (objet). Aucun steer n'est simulé : sans tour actif ou sans brouillon, un
message explicite est affiché et rien n'est envoyé.

Le mode `queue` n'invente rien non plus : `send()` utilisait déjà `promptAsync`, qui met en file
côté serveur pendant le travail ; le mode ajoute seulement le retour visuel « queued », affiché
**après acceptation** par le serveur (pas avant, pour ne pas mentir sur un envoi refusé).

## Fichiers

Créés :
- `packages/webui/src/shortcuts.ts` — registre pur des raccourcis, matching, conflits navigateur documentés, décision `send`/`queue`/`steer`.
- `packages/webui/src/shortcuts.test.ts` — 35 tests clavier.
- `packages/webui/src/shortcut-palette.tsx` — palette de commandes accessible (dialog, filtrage, navigation clavier).
- `packages/webui/src/shortcuts.css` — styles de la palette et des indices clavier (jetons existants).
- `docs/design/captures/build-10-{ui-repos,palette-ctrl-p,palette-filtree}.png` — captures 1920×1080.

Modifié :
- `packages/webui/src/app.tsx` — intégration : gestionnaire global, `send(mode)`, helpers `queueMessage`/`steerMessage`, palette, indices clavier, priorité Échap.

## Choix d'implémentation

- **Décisions pures dans un module testable** : `matchShortcut`, `keyState`, `submitMode`,
  `partMetadata`, `deliveryNotice`. Le composant ne fait que brancher ces décisions sur les actions.
- **`preventDefault` uniquement justifié** : `ctrl+p` (impression), `ctrl+r` (rechargement),
  `ctrl+d` (favori) l'écrasent volontairement ; `alt+n`, `esc`, `alt+s` laissent l'événement intact.
  `Entrée` appelle `preventDefault` dans le champ pour ne pas ajouter de ligne ; `Maj+Entrée` reste
  le retour à la ligne. `Cmd` n'est jamais intercepté (raccourcis système préservés), `Maj` est
  exclu, et le code physique (`event.code`) sert de repli quand `Alt` transforme la lettre
  (`Alt+N` → `˜` sur clavier FR).
- **Échap prioritaire, jamais destructif** : chaque calque (palette, suggestions, recherche,
  renommage) consomme son propre Échap (`stopPropagation`) ; le gestionnaire global ne ferme
  ensuite que ce qui est ouvert, et n'interrompt l'agent que si rien n'est ouvert. Le double-Échap
  historique est remplacé par un Échap simple, conformément à la maquette.
- **Steer honnête** : `metadata.steer = true` sur la partie texte, jamais une réécriture locale du
  tour. Aucun inventaire de commandes factice : la palette liste 8 actions déjà présentes dans l'UI.
- **Palette accessible** : `role="dialog"`, `aria-modal`, libellé, champ focalisé au montage,
  `Flèches`/`Entrée`/`Échap`, cibles ≥ 44 px, `focus-visible`.

## Vérifications

Exécutées depuis la racine du worktree :

```
bun run --cwd packages/webui typecheck   → exit 0
bun run --cwd packages/webui test        → exit 0  (31 fichiers, 739 tests)
bun run --cwd packages/webui build       → exit 0  (60 modules, dist/index.html 1.11 kB,
                                                   CSS 63.79 kB, JS 241.71 kB)
bun run --cwd packages/webui test -- shortcuts.test.ts → 1 fichier, 35 tests, exit 0
```

`bun install --frozen-lockfile` a été nécessaire au préalable : le worktree ne contenait pas de
`node_modules` (présent seulement dans l'arbre principal). Aucun lockfile modifié.

### Playwright

Configuration imposée : `require('/home/joachim/.bun/install/cache/playwright-core@1.55.0@@@1/index.js')`,
`executablePath: /usr/bin/chromium`, `args: ['--no-sandbox']`, viewport `1920×1080`, port `4210`.

Résultats mesurés :

```json
{
  "paletteVisible": true,
  "paletteTitle": "Palette de commandes",
  "commandCount": 8,
  "filteredCount": 1,
  "paletteAfterEscape": 0,
  "errors": ["Failed to load resource: 404 (Not Found)"]
}
```

`filteredCount` mesure le filtrage sur `steer` : 0 avant correction (seul le libellé français était
consulté), 1 après ajout du filtre sur l'identifiant canonique de la commande. L'erreur 404 n'a pas
reproduit lors d'une seconde passe dédiée à l'inspection réseau (`[]`) ; elle est donc transitoire
(ressource de premier chargement, probablement un favicon) et non imputable aux raccourcis.

## Écarts relevés (maquette → implémentation)

1. **Langue** : la maquette affiche des libellés anglais (`new`, `del`, `ren`, `steer`) ; la webui
   et la palette sont en français (cohérence avec le reste de l'interface). Le filtre accepte aussi
   les identifiants anglais, donc « steer » trouve bien la commande.
2. **Palette** : la maquette ouvre un dialogue générique avec liste et coche ; la webui utilise une
   palette dédiée avec champ de filtre. Même geste, présentation différente et plus compacte.
3. **Indices sur les lignes de session** : la maquette porte `alt+n`, `ctrl+d`, `ctrl+r` en regard
   de chaque session ; ces indices ne sont pas dupliqués sur les lignes (les actions existent dans
   le menu « … » et les raccourcis globaux). Les indices du **tour en cours** (`esc`, `enter`,
   `alt+s`) sont bien affichés, mais seulement pendant le travail, comme dans la maquette.
4. **Échap simple** : la maquette prescribe `esc` = interrompre ; l'implémentation précède
   l'interruption de la fermeture des calques et champs. C'est volontaire : un Échap qui ferme un
   champ ne doit pas arrêter l'agent par-dessus.
5. **Capture** : les captures montrent l'état « serveur injoignable » (aucun backend démarré sur le
   port proxy 4096), donc sans sessions ni indice de travail ; seuls la palette et son filtrage
   sont visibles. Aucune donnée de démonstration n'a été injectée pour les masquer.
6. **404 transient** : vu une fois dans la console au premier chargement, non reproductible ;
   documenté ci-dessus, non corrigé car non attribué.

## Points de vigilance

- `esc` interrompt sur une seule pression : c'est un changement de comportement par rapport au
  double-Échap précédent, assumé et demandé.
- Le steer dépend du protocole serveur `metadata.steer`. Si ce protocole change, c'est
  `shortcuts.ts::partMetadata` qu'il faut mettre à jour, pas l'interface.
- Les raccourcis globaux sont branchés sur `window` ; tout nouveau calque modal doit consommer son
  propre Échap avec `stopPropagation` pour ne pas interrompre l'agent en se fermant.
