/** Banc 5 — temps de démarrage à froid de `bun run web`, jusqu'à la première réponse HTTP. */

import { RACINE, serie } from "./lib"

async function uneOuverture(port: number): Promise<number> {
  const demarrage = performance.now()
  // Groupe détaché : `bun run web` lance lui-même un serveur enfant. Sans
  // groupe, tuer le parent laisserait un serveur orphelin sur le port.
  const proc = Bun.spawn(["bun", "run", "web"], {
    cwd: RACINE,
    env: { ...process.env, OPENCODE_SERVER_PORT: String(port) },
    stdout: "ignore",
    stderr: "ignore",
    detached: true,
  })
  let pret = false
  try {
    for (let i = 0; i < 300; i++) {
      await Bun.sleep(100)
      try {
        const r = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(500) })
        if (r.ok) {
          pret = true
          return performance.now() - demarrage
        }
      } catch {}
    }
    throw new Error("démarrage web timeout")
  } finally {
    // Le lanceur crée un enfant serveur : tuer le GROUPE pour ne pas laisser d'orphelin.
    try {
      process.kill(-proc.pid, "SIGTERM")
    } catch {
      try {
        proc.kill()
      } catch {}
    }
    await proc.exited.catch(() => undefined)
  }
}

export async function mesurerDemarrage() {
  const portBase = 4400
  const durees: number[] = []
  for (let i = 0; i < 10; i++) {
    durees.push(await uneOuverture(portBase + i))
    await Bun.sleep(300)
  }
  const { statistiques } = await import("./lib")
  return { commande: "bun run web", dureeMs: statistiques(durees) }
}
