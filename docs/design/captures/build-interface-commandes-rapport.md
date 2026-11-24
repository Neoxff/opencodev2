# Rapport BUILD — commandes d’interface

Branche : `feat/ui-commandes-interface` (depuis `origin/main` `8297e50d6`).
Commit : `5402c631db2ddb1c6cfb5c20a9ebe35ff35a1ac5`.

## Périmètre rendu réel hors DEMO

`/agents`, `/models`, `/variants`, `/decision-model`, `/vision-model`, `/themes`, `/thinking`, `/timestamps`, `/timeline`, `/sessions`, `/status`, `/help`, `/skills`, `/subagent`, `/connect`, `/config`, `/logs`, `/diff`, `/mcps`.

- Sources de vérité : `/agent`, `/provider`, `/global/jev/models`, `/config`, `/skill`, `/session`, `/session/:id/message`, `/session/:id/diff`, `/mcp`, `/provider/auth`, `/global/health`.
- `/mcps` appelle réellement `GET /mcp` puis `POST /mcp/:name/connect` ou `POST /mcp/:name/disconnect`, met à jour `MCPS` et redessine le panneau via `rp()` ; `arguments.callee` supprimé.
- Écritures de configuration limitées à `jev.decision_model` et `attachment.image.vision_model` ; aucun élargissement de `SAFE_CONFIG_FIELDS`.
- Aucune modification de `ui.html` ni `ui.css`.

## Preuves

```text
bun run --cwd packages/webui test -- src/ui-interface-commands.test.ts
Test Files  1 passed (1)
Tests  24 passed (24)
exit 0
```

```text
bun run test
Test Files  64 passed | 1 skipped (65)
Tests  1097 passed | 3 skipped (1100)
exit 0
```

```text
bun run typecheck
$ tsgo --noEmit
exit 0
```

```text
bun run ui:diff
barre latérale       0.000% (0/276060 px)
en-tête              0.000% (0/69160 px)
conversation         0.000% (0/1351280 px)
composeur            0.000% (0/187530 px)
panneau de droite    0.000% (0/321000 px)
écran d'ouverture    0.000% (0/1351280 px)
OK : toutes les zones sont à 0,000 %
exit 0
```

## Réserves

- Les modèles hôtes listés par `/global/jev/models` restent affichés en lecture seule : le transport Jev hôte exige `jev.provider`/`jev.model`, hors du chemin d’écriture sûr retenu. Condition de revoyure : accord explicite pour une clé de configuration dédiée.
- Les fournisseurs non-OAuth affichent un état connecté réel ou demandent une clé API configurée ; aucun succès simulé.
