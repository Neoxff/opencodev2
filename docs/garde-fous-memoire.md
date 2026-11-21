# Garde-fous mémoire du harnais web

Objectif : plus jamais de sessions headless d'évaluation lancées sans décision explicite.

## 1. Autodémarrage du démon désactivé par défaut

`bun run web` (`script/web.ts`) lance le serveur avec `OPENCODE_NO_DAEMON_AUTOSTART=1`.
Le code amont (`daemon/autostart.ts`) lit déjà ce drapeau : `shouldAutoStart()` renvoie
`false` quand il vaut `1`, donc `ensureDaemonStarted()` (`cli/cmd/serve.ts`) ne lance
rien. Un démon déjà en cours n'est pas touché.

Pour réautoriser explicitement l'autodémarrage depuis le lanceur web :

```
OPENCODEV2_ALLOW_DAEMON_AUTOSTART=1 bun run web
```

(`true` est aussi accepté.)

## 2. Aucune évaluation réelle depuis le harnais web

`OPENCODE_DAEMON_EVAL_REAL` est retiré de l'environnement transmis au serveur par
`script/web.ts`. Le harnais web ne peut donc pas exécuter d'évaluations en environnement
réel, même si la variable était positionnée dans le shell parent. Le code amont
(`daemon/triggers.ts`, `cli/cmd/watch.ts`) n'est pas modifié.

## 3. Plafond de sessions headless simultanées

Le code amont expose `MAX_CONCURRENT_TASKS = 3` dans `daemon/auto-executor.ts` : c'est
le plafond de tâches exécutées en parallèle par l'auto-exécuteur. Il n'existe **aucun**
réglage configurable pour ce plafond dans la configuration exposée, et le harnais web
ne démarre pas l'auto-exécuteur (voir §1 : pas de démon). En pratique, depuis `bun run web`,
le nombre de sessions headless d'évaluation lancées sans action est **zéro**. Ce build ne
modifie pas `MAX_CONCURRENT_TASKS` : le plafond effectif est déjà de 1 au plus par le
chemin web (aucune session déclenchée). Aucun réglage n'est inventé.

## 4. Limitation des serveurs MCP par session

Le schéma de configuration (`config.ts`, champ `mcp`) permet de désactiver un serveur
MCP avec `{ "enabled": false }`. Il n'existe **aucun** réglage de limite du nombre de
serveurs MCP lancés par session. Pour limiter leur nombre, il faut désactiver
explicitement les serveurs inutilisés dans la configuration, un par un :

```json
{ "mcp": { "serveur-inutile": { "enabled": false } } }
```

Ce build n'invente pas de réglage de limite qui n'existe pas.

## 5. Plafond mémoire optionnel

Avec `OPENCODEV2_MEM_MAX` positionné, `script/web.ts` encapsule le serveur dans
`systemd-run` :

```
OPENCODEV2_MEM_MAX=4G bun run web
# → systemd-run --user --scope -p MemoryHigh=3G -p MemoryMax=4G <serveur>
```

`MemoryHigh` vaut 75 % de `MemoryMax`. Sans la variable, le serveur est lancé
directement (aucun changement de comportement). Le plafond est optionnel et
n'affecte que le processus lancé par le harnais web.

## 6. Lignes modifiées du code amont

Changement amont minimal : `script/web.ts` uniquement (le module `script/garde-fous.ts`
et ses tests sont nouveaux, ils ne modifient pas le code existant).

- `script/web.ts` ligne 15 : ajout de l'import `commandeServeur, environnementWeb` depuis `./garde-fous`.
- `script/web.ts` lignes 70-79 : remplace le `Bun.spawn` direct par le calcul de
  `environnementServeur` / `commandeServeurWeb` puis `Bun.spawn(commandeServeurWeb, { env: environnementServeur })`.

Aucune autre ligne du code amont n'est modifiée.
