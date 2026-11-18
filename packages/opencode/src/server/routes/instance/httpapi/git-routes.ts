/** Routeurs HTTP locales /opencodev2/git/*. Jeton exigé, git sans shell. */

import { Effect } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { GIT_TOKEN_HEADER, gitToken } from "@/opencodev2/token"
import {
  annulerLocal,
  apresAgent,
  ecrireReglagesAuto,
  lireJournal,
  lireReglagesAuto,
} from "@/opencodev2/auto"
import { lireWorkspace } from "@/opencodev2/config"
import { GitError, gitBranch, gitCommit, gitFetch, gitPull, gitPush, gitStatus } from "@/opencodev2/git"

const STATUTS: Record<string, number> = {
  NON_AUTHENTIFIE: 401,
  CONFLIT: 409,
  DEPOT_SALE: 409,
  NON_FAST_FORWARD: 409,
  PAS_DE_RESEAU: 503,
  ARGUMENT_INVALIDE: 400,
  HORS_PERIMETRE: 400,
  FICHIER_INTERDIT: 400,
  ECHEC_GIT: 500,
}

function reponse(status: number, corps: unknown) {
  return Effect.succeed(HttpServerResponse.setStatus(HttpServerResponse.jsonUnsafe(corps), status))
}

type Resultat = { ok: true; valeur: unknown } | { ok: false; code: string; message: string }

async function executer(f: () => Promise<unknown>): Promise<Resultat> {
  try {
    return { ok: true, valeur: await f() }
  } catch (e) {
    if (e instanceof GitError) return { ok: false, code: e.code, message: e.message }
    return { ok: false, code: "ECHEC_GIT", message: e instanceof Error ? e.message : String(e) }
  }
}

function champTexte(corps: unknown, cle: string): string {
  if (typeof corps !== "object" || corps === null || !(cle in corps)) {
    throw new GitError("ARGUMENT_INVALIDE", `${cle} requis`)
  }
  const valeur = (corps as Record<string, unknown>)[cle]
  if (typeof valeur !== "string") throw new GitError("ARGUMENT_INVALIDE", `${cle} doit être une chaîne`)
  return valeur
}

function champFichiers(corps: unknown): string[] {
  if (typeof corps !== "object" || corps === null || !("files" in corps)) {
    throw new GitError("ARGUMENT_INVALIDE", "files requis")
  }
  const valeur = (corps as Record<string, unknown>).files
  if (!Array.isArray(valeur) || valeur.some((x) => typeof x !== "string")) {
    throw new GitError("ARGUMENT_INVALIDE", "files doit être une liste de chaînes")
  }
  return valeur as string[]
}

function brancheOptionnelle(corps: unknown): string | undefined {
  if (typeof corps !== "object" || corps === null) return undefined
  const valeur = (corps as Record<string, unknown>).branch
  return typeof valeur === "string" ? valeur : undefined
}

type Action = (racine: string, corps: unknown) => Promise<unknown>

function route(action: Action, avecCorps: boolean) {
  return (request: HttpServerRequest.HttpServerRequest) =>
    Effect.gen(function* () {
      const jeton = gitToken()
      if (!jeton.valide(request.headers[GIT_TOKEN_HEADER])) {
        return yield* reponse(401, { code: "NON_AUTHENTIFIE", message: "jeton local invalide" })
      }
      const corps = avecCorps ? yield* request.json : undefined
      const resultat = yield* Effect.promise(() => executer(() => action(lireWorkspace(process.cwd()), corps)))
      if (!resultat.ok) {
        return yield* reponse(STATUTS[resultat.code] ?? 500, { code: resultat.code, message: resultat.message })
      }
      return yield* reponse(200, resultat.valeur)
    })
}

export const gitRoutes = HttpRouter.use((router) =>
  Effect.gen(function* () {
    yield* router.add("GET", "/opencodev2/git/status", route((r) => gitStatus(r), false))
    yield* router.add("POST", "/opencodev2/git/fetch", route((r) => gitFetch(r), false))
    yield* router.add("POST", "/opencodev2/git/pull", route((r) => gitPull(r), false))
    yield* router.add(
      "POST",
      "/opencodev2/git/commit",
      route((r, c) => gitCommit(r, champTexte(c, "message"), champFichiers(c)), true),
    )
    yield* router.add("POST", "/opencodev2/git/push", route((r, c) => gitPush(r, brancheOptionnelle(c)), true))
    yield* router.add("POST", "/opencodev2/git/branch", route((r, c) => gitBranch(r, champTexte(c, "name")), true))

    // Automatisme local — désactivé par défaut, réglages et journal hors Git.
    yield* router.add("GET", "/opencodev2/auto/reglages", route(() => Promise.resolve(lireReglagesAuto()), false))
    yield* router.add(
      "POST",
      "/opencodev2/auto/reglages",
      route(
        (r, c) =>
          Promise.resolve(
            ecrireReglagesAuto({
              fetchAuDemarrage: (c as Record<string, unknown>).fetchAuDemarrage === true,
              commitAuto: (c as Record<string, unknown>).commitAuto === true,
              pushAuto: (c as Record<string, unknown>).pushAuto === true,
            }),
          ),
        true,
      ),
    )
    yield* router.add("GET", "/opencodev2/auto/journal", route(() => Promise.resolve(lireJournal()), false))
    yield* router.add(
      "POST",
      "/opencodev2/auto/annuler",
      route((r, c) => annulerLocal(r, champTexte(c, "id")), true),
    )
    yield* router.add(
      "POST",
      "/opencodev2/auto/apres-agent",
      route((r, c) => apresAgent(r, champTexte(c, "sessionID")), true),
    )
  }),
)
