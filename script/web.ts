#!/usr/bin/env bun
/**
 * Lance la version web d'opencodev2 en une seule commande, sans build de binaire.
 *
 *   bun run web            # construit l'UI si besoin, puis demarre le serveur
 *   bun run web --rebuild  # force la reconstruction de l'UI
 *
 * Le serveur sert lui-meme l'UI compilee (OPENCODE_WEB_UI_DIR), donc une seule origine :
 * pas de proxy, pas de CORS a configurer, un seul port.
 */
import { existsSync } from "node:fs"
import path from "node:path"
import { LinkConfigError, loadLinkConfig, workspacePath } from "./link-config"
import { ecrireGitToken, genererGitToken, GIT_TOKEN_ENV } from "../packages/opencode/src/opencodev2/token"
import { commandeServeur, environnementWeb } from "./garde-fous"

const root = path.resolve(import.meta.dir, "..")
const webui = path.join(root, "packages", "webui")
const dist = path.join(webui, "dist")
const entry = path.join(root, "packages", "opencode", "src", "index.ts")

// Liaison facultative : sans fichier, comportement identique à aujourd'hui.
// Avec un fichier invalide, on refuse de démarrer plutôt que de deviner un port.
let link
try {
  link = loadLinkConfig(root)
} catch (error) {
  if (error instanceof LinkConfigError) {
    console.error(`[web] configuration de liaison invalide : ${error.message}`)
    process.exit(1)
  }
  throw error
}
if (link) {
  console.log(`[web] dépôt lié : ${link.repo} (branche ${link.defaultBranch}, espace ${workspacePath(root, link)})`)
}

// Fetch silencieux au démarrage, uniquement si l'utilisateur l'a activé
// (désactivé par défaut). Never bloque le lancement : tout échec est avalé.
try {
  const { autoFetchAuDemarrage } = await import("../packages/opencode/src/opencodev2/auto")
  await autoFetchAuDemarrage(workspacePath(root, link ?? { repo: "local", defaultBranch: "main", port: 4096, workspace: "." }))
} catch {
  // silencieux par conception
}

const port = process.env.OPENCODE_SERVER_PORT ?? String(link?.port ?? 4096)
const rebuild = process.argv.includes("--rebuild")
const bun = process.execPath

if (rebuild || !existsSync(path.join(dist, "index.html"))) {
  console.log("[web] construction de l'interface…")
  const build = Bun.spawnSync([bun, "run", "--cwd", webui, "build"], { stdout: "inherit", stderr: "inherit" })
  if (build.exitCode !== 0) {
    console.error("[web] la construction de l'interface a echoue — serveur non demarre.")
    process.exit(build.exitCode ?? 1)
  }
}

console.log(`[web] interface servie depuis ${dist}`)
console.log(`[web] ouvre http://127.0.0.1:${port}`)

// Jeton Git généré UNE fois par lancement, transmis au serveur : le fichier
// local et le serveur partagent ainsi la même valeur, sans course entre
// processus. Respecte un jeton déjà fourni explicitement.
// Le lanceur est le SEUL auteur du jeton : il l'écrit sur le disque et
// l'injecte au serveur. Serveur et daemon ne font que le lire.
const gitTokenEnv = process.env[GIT_TOKEN_ENV] ?? genererGitToken()
ecrireGitToken(gitTokenEnv)

// Garde-fous mémoire : pas d'autodémarrage du démon ni d'éval réelle depuis le
// harnais web ; plafond mémoire optionnel via systemd-run (OPENCODEV2_MEM_MAX).
const environnementServeur = environnementWeb(process.env, {
  webUiDir: dist,
  gitTokenEnv: GIT_TOKEN_ENV,
  gitToken: gitTokenEnv,
})
const commandeServeurWeb = commandeServeur(bun, entry, ["serve", "--port", port], process.env)

const server = Bun.spawn(commandeServeurWeb, {
  stdio: ["inherit", "inherit", "inherit"],
  env: environnementServeur,
})

// Transmet l'interruption pour ne pas laisser de serveur orphelin.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.kill())
}

process.exit(await server.exited)
