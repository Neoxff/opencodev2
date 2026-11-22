# Build 13 — Onglets Config et Logs

Branche : `feat/ui-config-logs` · date : 2026-11-22 · port Playwright : 4213 · viewport : 1920×1080

## Objectif

- **Config** : éditeur de la configuration **réelle** lue sur `GET /global/config`, avec validation
  et masquage systématique des secrets.
- **Logs** : journal **temps réel** de la session (niveau, source, message) alimenté par le flux SSE
  déjà souscrit, sans clé ni jeton.
- Aucune donnée de démonstration : tout ce qui s'affiche provient de l'API/du flux du serveur.

## Fichiers livrés

| Fichier | Rôle |
|---|---|
| `packages/webui/src/config-editor.ts` | Couche pure : masquage, validation, patch sûr, projection des lignes de journal |
| `packages/webui/src/config-editor.test.ts` | Tests : valeur invalide, secret masqué, patch sans secret |
| `packages/webui/src/config-tab.tsx` | Composant contrôlé Config (états chargement / erreur / vide / normal) |
| `packages/webui/src/logs-tab.tsx` | Composant Logs (filtre niveau + recherche, temps réel) |
| `packages/webui/src/config-logs.css` | CSS isolé, préfixe `cl-`, jetons de `tokens.css` uniquement |
| `packages/webui/src/app.tsx` | Barre d'onglets Conversation / Config / Logs + intégration |
| `docs/design/captures/build-13-config.png` | Capture Config, 1920×1080 |
| `docs/design/captures/build-13-logs.png` | Capture Logs, 1920×1080 |
| `docs/design/captures/build-13-rapport.md` | Ce rapport |

## Choix d'implémentation

1. **Vraie API, pas de maquette codée en dur.** Le maquette affiche un exemple figé
   (`repo`, `branch`, `autoGit`, `daemon.autostart`, `sky`, `glass`, `mcp.max_sessions`) qui n'existe
   pas tel quel dans le schéma serveur (`packages/opencode/src/config/config.ts`). L'éditeur lit donc
   `client.global.config.get()` et écrit via `client.global.config.update({ config: patch })` — la
   même porte que la feuille « réglages ». Les clés de liaison sont validées avec les règles de
   `script/link-config.ts` (`owner/repo`, branche git sûre, port 1–65535, workspace relatif).
2. **Secret : jamais affiché, jamais réécrit.** `maskConfig` projette la charge **avant** tout signal
   (les clés `key`/`apiKey`/`token`/`secret`/`password` deviennent `••••••••`). `buildConfigPatch`
   écarte toute branche contenant un secret ou le masque : enregistrer ne peut ni révéler ni écraser
   une clé réelle. `redactText` masque les motifs `sk-…`, `ghp_…`, JWT, etc. dans les messages.
3. **Composants contrôlés et testables.** Les composants ne possèdent ni la donnée ni l'écriture ;
   le conteneur fournit texte et callbacks. Aucun `any`, aucun `console.log`, aucun `TODO`.
4. **Logs sans seconde connexion.** Les lignes dérivent de `logEntries()`, déjà alimenté par
   `subscribeEvents` dans `app.tsx` — aucun SSE dupliqué, aucune clé transmise au navigateur.
5. **Accessibilité / responsive.** `<button>`/`<nav role="tablist">`, `aria-selected`,
   `aria-invalid`, `aria-describedby`, focus visible, cibles ≥ 44 px, contraste des jetons,
   grille de journal qui replie la source sous 768 px.

## Vérifications exécutées

Commandes (exit code réel observé) :

- `bun install --frozen-lockfile` → **0** (2 361 paquets ; dépendances absentes au départ)
- `bun run --cwd packages/webui typecheck` → **0**, aucune erreur (`tsgo --noEmit`)
- `bun run --cwd packages/webui test` → **0**, **31 fichiers / 719 tests réussis**, dont 16 nouveaux
  (`config-editor.test.ts`)
- `bun run --cwd packages/webui build` → **0**, 61 modules, `dist/assets/index-5tXr5Yns.js` 247,42 kB
  (gzip 71,53 kB), CSS 66,93 kB (gzip 12,09 kB)

Tests ciblés (extraits) :

- valeur invalide : `validateConfig({ port: 70000 })` → `[{ path: "port", message: "entier entre 1 et 65535" }]`
- secret masqué : `configSource({ provider: { openai: { apiKey: "sk-…" } } })` → `apiKey: "••••••••"`,
  `sk-…` absent de la chaîne
- patch sûr : un brouillon contenant `provider.openai.apiKey = "••••••••"` produit un patch sans la
  branche `provider`, sans aucune chaîne `sk-`
- journal : `logRow({ type: "session.error", note: "failed" })` →
  `{ level: "error", source: "session", message: "session.error · failed" }`

Playwright (`playwright-core@1.55.0`, `/usr/bin/chromium`, `--no-sandbox`, 1920×1080, port 4213) :

- **Config** : éditeur présent (7 605 caractères de configuration réelle), `••••••••` présent,
  **aucune occurrence de `sk-`**, 0 erreur de validation, 0 alerte. Début du contenu observé :
  `$schema`, `shell`, `skills.paths`, `plugin`, `default_agent`, `username`, `agent`.
- **Logs** : **200 lignes** réelles, toutes avec heure / niveau / source / message, statut
  `live · 200 events`, **aucune occurrence de `sk-`**. Premières lignes : `message.part.delta`,
  `message.part.updated`, toutes classées `debug`, source `message`, note « no session open ».
- Une seule erreur console : `404` sur une ressource statique (favicon) — sans rapport avec les onglets.

## Écarts avec la maquette (`docs/design/maquette-opencodev2-ui.html`, lignes 292–293, 453–460)

| Maquette | Livré | Écart assumé / justifié |
|---|---|---|
| `read-only preview` d'un bloc `opencodev2.config.json` figé (8 clés) | éditeur **vivant** de `/global/config` (37+ clés), boutons Reload / Save | volontaire : objectif = éditeur réel avec validation, pas aperçu |
| Clés `repo`, `branch`, `autoGit`, `daemon.autostart`, `sky`, `glass`, `mcp.max_sessions` | `$schema`, `shell`, `skills`, `plugin`, `default_agent`, `username`, `agent`, … | ces clés de maquette n'existent pas dans le schéma serveur ; aucune donnée de démonstration n'a été inventée |
| Coloration syntaxique (clés gras, booléens soulignés) | textarea monospace + liste d'issues sous le champ | simplification : la validation lisible prime sur la coloration ; la coloration sera ajoutée si demandée |
| Onglets dans l'en-tête du panneau, à côté du titre | barre d'onglets dédiée au-dessus du contenu | même geste, placement différent pour ne pas toucher l'en-tête existant |
| Logs = un bloc `<pre>` de 7 lignes d'exemple (`mcp connected`, `git fetch`, …) | liste de 200 événements SSE réels, niveau/source/message dérivés du type | obligation « zéro données de démonstration » |
| Aucun filtre | puces de niveau (all/info/warn/error/debug) + recherche texte | ajout utile non présent dans la maquette |
| Badges `<i>info</i>` en ligne | badges colorés par niveau dans une grille | même information, présentation plus lisible |
| Ciel étoilé animé en fond | inchangé (géré par le projet, hors périmètre build 13) | non modifié volontairement |

## Points de vigilance

- **Perf** : le journal est plafonné à 200 événements (déjà dans `app.tsx`) ; pas de virtualisation
  nécessaire à cette taille. La configuration est lue à la demande à l'ouverture de l'onglet.
- **Sécurité** : le masquage est appliqué côté client sur une charge qui contient des secrets en clair.
  Le correctif de fond (une route serveur qui ne renvoie pas les clés) reste à faire côté serveur ;
  il est hors périmètre de ce build et consigné ici.
- **Compatibilité** : la validation des clés de liaison reflète `script/link-config.ts` ; si ce script
  évolue, `config-editor.ts` doit suivre (règle intentionnellement dupliquée, pas importée — le webui
  est un client du SDK et ne doit pas importer de code de script Node).
- **Limite assumée** : un réglage non secret voisin d'un secret dans la même branche n'est pas écrit
  depuis cet éditeur (la feuille « réglages » reste la voie pour ces cartes structurées).
