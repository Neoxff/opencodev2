/** Routes HTTP locales /opencodev2/health/*. Jeton exigé, aucune exécution shell. */

import { Effect } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import * as fs from "node:fs"
import * as fsp from "node:fs/promises"
import { GIT_TOKEN_HEADER, gitToken } from "@/opencodev2/token"
import { daemonDir, isProcessRunning, pidFilePath, readPidFile } from "@/daemon/paths"

const HOST_LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i

export function verifieHost(request: HttpServerRequest.HttpServerRequest): boolean {
  const host = request.headers.host ?? ""
  return HOST_LOCAL.test(host)
}

function reponse(status: number, corps: unknown) {
  return Effect.succeed(HttpServerResponse.setStatus(HttpServerResponse.jsonUnsafe(corps), status))
}

/** Lit /proc/meminfo et retourne les valeurs clés en octets. */
async function lireMemInfo(): Promise<{
  totale: number
  utilisee: number
  disponible: number
  swapTotale: number
  swapUtilisee: number
}> {
  const texte = await fsp.readFile("/proc/meminfo", "utf-8")
  const lignes = texte.split("\n")
  const get = (cle: string): number => {
    const ligne = lignes.find((l) => l.startsWith(cle + ":"))
    if (!ligne) return 0
    return Number(ligne.split(":")[1]?.trim().split(" ")[0] ?? 0) * 1024
  }
  const totale = get("MemTotal")
  const libre = get("MemFree")
  const buffers = get("Buffers")
  const cache = get("Cached")
  const disponible = get("MemAvailable") || libre + buffers + cache
  const utilisee = Math.max(0, totale - disponible)
  const swapTotale = get("SwapTotal")
  const swapLibre = get("SwapFree")
  const swapUtilisee = Math.max(0, swapTotale - swapLibre)
  return { totale, utilisee, disponible, swapTotale, swapUtilisee }
}

/** Liste réduite des processus opencodev2 : jamais la ligne de commande. */
export async function listeProcessusOpencodev2(): Promise<
  Array<{ pid: number; nom: string; rss: number; duree: string }>
> {
  const entries = await fsp.readdir("/proc")
  const resultats: Array<{ pid: number; nom: string; rss: number; duree: string }> = []
  for (const entry of entries) {
    const pid = Number(entry)
    if (!Number.isFinite(pid) || pid <= 0 || !Number.isInteger(pid)) continue
    try {
      const stat = await fsp.readFile(`/proc/${pid}/stat`, "utf-8")
      const champs = stat.split(" ")
      const nom = (champs[1] ?? "").replace(/[()]/g, "")
      if (!nom.includes("opencode")) continue
      const rssPages = Number(champs[22]) || 0
      const rss = rssPages * 4096
      const starttime = Number(champs[21]) || 0
      const clockTicks = 100
      const uptimeSec = Number((await fsp.readFile("/proc/uptime", "utf-8")).split(" ")[0])
      const dureeSec = Math.max(0, uptimeSec - starttime / clockTicks)
      const duree = formaterDuree(dureeSec)
      resultats.push({ pid, nom, rss, duree })
    } catch {
      // Processus disparu entre-temps, on l'ignore
    }
  }
  resultats.sort((a, b) => b.rss - a.rss)
  return resultats.slice(0, 5)
}

export function formaterDuree(secondes: number): string {
  const h = Math.floor(secondes / 3600)
  const m = Math.floor((secondes % 3600) / 60)
  if (h > 0) return `${h} h ${m} min`
  return `${m} min`
}

export function etatDemon(): { enMarche: boolean; pid: number | null; duree?: string } {
  const pid = readPidFile(daemonDir())
  if (!pid || !isProcessRunning(pid)) {
    return { enMarche: false, pid: null }
  }
  let duree: string | undefined
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf-8")
    const champs = stat.split(" ")
    const starttime = Number(champs[21]) || 0
    const clockTicks = 100
    const uptimeSec = Number(fs.readFileSync("/proc/uptime", "utf-8").split(" ")[0])
    const dureeSec = Math.max(0, uptimeSec - starttime / clockTicks)
    duree = formaterDuree(dureeSec)
  } catch {
    // pas de durée disponible
  }
  return { enMarche: true, pid, duree }
}

export function estProcessusOpencodev2(pid: number): boolean {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf-8")
    const champs = stat.split(" ")
    const nom = champs[1]?.replace(/[()]/g, "") ?? ""
    return nom.includes("opencode")
  } catch {
    return false
  }
}

export const healthRoutes = HttpRouter.use((router) =>
  Effect.gen(function* () {
    yield* router.add(
      "GET",
      "/opencodev2/health/memoire",
      (request: HttpServerRequest.HttpServerRequest) =>
        Effect.gen(function* () {
          if (!verifieHost(request)) {
            return yield* reponse(400, { code: "HORS_PERIMETRE", message: "Host non autorisé" })
          }
          const jeton = gitToken()
          if (!jeton.valide(request.headers[GIT_TOKEN_HEADER])) {
            return yield* reponse(401, { code: "NON_AUTHENTIFIE", message: "jeton local invalide" })
          }
          const memoire = yield* Effect.promise(() => lireMemInfo())
          return yield* reponse(200, memoire)
        }),
    )

    yield* router.add(
      "GET",
      "/opencodev2/health/processus",
      (request: HttpServerRequest.HttpServerRequest) =>
        Effect.gen(function* () {
          if (!verifieHost(request)) {
            return yield* reponse(400, { code: "HORS_PERIMETRE", message: "Host non autorisé" })
          }
          const jeton = gitToken()
          if (!jeton.valide(request.headers[GIT_TOKEN_HEADER])) {
            return yield* reponse(401, { code: "NON_AUTHENTIFIE", message: "jeton local invalide" })
          }
          const processus = yield* Effect.promise(() => listeProcessusOpencodev2())
          return yield* reponse(200, { processus })
        }),
    )

    yield* router.add(
      "GET",
      "/opencodev2/health/demon",
      (request: HttpServerRequest.HttpServerRequest) =>
        Effect.gen(function* () {
          if (!verifieHost(request)) {
            return yield* reponse(400, { code: "HORS_PERIMETRE", message: "Host non autorisé" })
          }
          const jeton = gitToken()
          if (!jeton.valide(request.headers[GIT_TOKEN_HEADER])) {
            return yield* reponse(401, { code: "NON_AUTHENTIFIE", message: "jeton local invalide" })
          }
          const etat = etatDemon()
          return yield* reponse(200, { enMarche: etat.enMarche, pid: etat.pid, duree: etat.duree })
        }),
    )

    yield* router.add(
      "POST",
      "/opencodev2/health/demon/arreter",
      (request: HttpServerRequest.HttpServerRequest) =>
        Effect.gen(function* () {
          if (!verifieHost(request)) {
            return yield* reponse(400, { code: "HORS_PERIMETRE", message: "Host non autorisé" })
          }
          const jeton = gitToken()
          if (!jeton.valide(request.headers[GIT_TOKEN_HEADER])) {
            return yield* reponse(401, { code: "NON_AUTHENTIFIE", message: "jeton local invalide" })
          }
          const etat = etatDemon()
          if (!etat.enMarche || etat.pid === null) {
            return yield* reponse(400, { code: "NOT_FOUND", message: "démon non en marche" })
          }
          try {
            process.kill(etat.pid, "SIGTERM")
            return yield* reponse(200, { arrete: true, pid: etat.pid, signal: "SIGTERM" })
          } catch (e) {
            return yield* reponse(
              500,
              { code: "ECHEC", message: e instanceof Error ? e.message : String(e) },
            )
          }
        }),
    )

    yield* router.add(
      "POST",
      "/opencodev2/health/processus/:pid/arreter",
      (request: HttpServerRequest.HttpServerRequest) =>
        Effect.gen(function* () {
          if (!verifieHost(request)) {
            return yield* reponse(400, { code: "HORS_PERIMETRE", message: "Host non autorisé" })
          }
          const jeton = gitToken()
          if (!jeton.valide(request.headers[GIT_TOKEN_HEADER])) {
            return yield* reponse(401, { code: "NON_AUTHENTIFIE", message: "jeton local invalide" })
          }
          const pidParam = (request as any).params?.pid
          let pid: number
          try {
            pid = champPid(pidParam)
          } catch (e) {
            return yield* reponse(400, { code: "ARGUMENT_INVALIDE", message: e instanceof Error ? e.message : String(e) })
          }
          if (!estProcessusOpencodev2(pid)) {
            return yield* reponse(403, { code: "HORS_PERIMETRE", message: "PID non autorisé : seul un processus opencodev2 peut être arrêté" })
          }
          try {
            process.kill(pid, "SIGTERM")
            return yield* reponse(200, { arrete: true, pid, signal: "SIGTERM" })
          } catch (e) {
            return yield* reponse(
              500,
              { code: "ECHEC", message: e instanceof Error ? e.message : String(e) },
            )
          }
        }),
    )
  }),
)

export function champPid(valeur: unknown): number {
  const n = Number(valeur)
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
    throw new Error("pid doit être un entier positif")
  }
  return n
}
