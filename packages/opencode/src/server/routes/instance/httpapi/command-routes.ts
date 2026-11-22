/**
 * Routeurs HTTP locaux /opencodev2/commands/*. Jeton exigé (comme l'API Git),
 * hôte local obligatoire, aucune exécution shell.
 *
 * Le registre rendu est exactement celui du CLI : `Command.Service.list()` est
 * projeté par `project()`, la même fonction que les tests utilisent.
 */

import { Effect } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { Command } from "@/command"
import { InstanceRef } from "@/effect/instance-ref"
import { InstanceStore } from "@/project/instance-store"
import { lireWorkspace } from "@/opencodev2/config"
import { GIT_TOKEN_HEADER, gitToken } from "@/opencodev2/token"
import { verifieHost } from "./health-routes"
import {
  project,
  resoudreTemplate,
  validerArguments,
  validerNom,
  validerTypeExecutable,
  type RegistryEntry,
  type Refus,
} from "@/opencodev2/command-registry"

export const COMMANDS_LISTE = "/opencodev2/commands"
export const COMMANDS_EXECUTION = "/opencodev2/commands/execute"

export type ReponseLocale = { status: number; corps: unknown }
type Jeton = { valide(fourni: string | undefined | null): boolean }

function refus(status: number, code: string, message: string): Refus {
  return { ok: false, status, code, message }
}

/** Contrôle d'accès partagé avec la route et ses tests : hôte local + jeton. */
export function controleAcces(request: HttpServerRequest.HttpServerRequest, jeton: Jeton): Refus | { ok: true } {
  if (!verifieHost(request)) return refus(403, "HOTE_EXTERNE", "hôte non local")
  if (!jeton.valide(request.headers[GIT_TOKEN_HEADER])) {
    return refus(401, "NON_AUTHENTIFIE", "jeton local invalide")
  }
  return { ok: true }
}

function enReponse(r: Refus): ReponseLocale {
  return { status: r.status, corps: { code: r.code, message: r.message } }
}

/** GET /opencodev2/commands — la liste web, identique au registre du CLI. */
export function listeLocale(input: {
  request: HttpServerRequest.HttpServerRequest
  jeton: Jeton
  infos: readonly Command.Info[]
}): ReponseLocale {
  const acces = controleAcces(input.request, input.jeton)
  if (!acces.ok) return enReponse(acces)
  const entrees = project(input.infos)
  return { status: 200, corps: entrees }
}

type ExecutionPreparee = { refus: ReponseLocale } | { entree: RegistryEntry; args: Record<string, string> }

/**
 * Validation de l'exécution, avant toute résolution de template : nom connu,
 * type autorisé, arguments déclarés et sans injection.
 */
export function preparerExecution(input: {
  request: HttpServerRequest.HttpServerRequest
  jeton: Jeton
  infos: readonly Command.Info[]
  corps: unknown
}): ExecutionPreparee {
  const acces = controleAcces(input.request, input.jeton)
  if (!acces.ok) return { refus: enReponse(acces) }

  if (typeof input.corps !== "object" || input.corps === null || Array.isArray(input.corps)) {
    return { refus: enReponse(refus(400, "CORPS_INVALIDE", "corps JSON attendu")) }
  }
  const corps = input.corps as Record<string, unknown>

  const nom = validerNom(corps.name, project(input.infos))
  if (!nom.ok) return { refus: enReponse(nom) }

  const type = validerTypeExecutable(nom.value)
  if (!type.ok) return { refus: enReponse(type) }

  const args = validerArguments(corps.arguments, nom.value)
  if (!args.ok) return { refus: enReponse(args) }

  return { entree: nom.value, args: args.value }
}

/** Construit la réponse d'exécution à partir du template résolu (déjà validé). */
export function reponseExecution(
  entree: RegistryEntry,
  args: Record<string, string>,
  template: string | undefined,
): ReponseLocale {
  if (template === undefined) {
    return enReponse(refus(404, "NOM_INCONNU", `commande inconnue : ${entree.name}`))
  }
  return {
    status: 200,
    corps: {
      name: entree.name,
      type: entree.type,
      arguments: args,
      prompt: resoudreTemplate(template, args),
    },
  }
}

function reponse(r: ReponseLocale): HttpServerResponse.HttpServerResponse {
  return HttpServerResponse.setStatus(HttpServerResponse.jsonUnsafe(r.corps), r.status)
}

/**
 * Les deux routes locales. `Command.Service` et `InstanceStore.Service` sont
 * fournis globalement par `createRoutes()` ; le contexte d'instance est chargé
 * depuis le workspace du processus, comme le fait l'API Git.
 *
 * Le jeton et le contexte sont lus À LA DEMANDE, dans le handler : le construire
 * ici ferait échouer la construction de l'arbre de routes pour tout processus
 * démarré sans le jeton du lanceur (tests, CLI, scripts) — exactement comme
 * `git-routes.ts` ne lit le jeton qu'à la réception d'une requête.
 */
export const commandRoutes = HttpRouter.use((router) =>
  Effect.gen(function* () {
    const store = yield* InstanceStore.Service
    const commandService = yield* Command.Service

    const dansInstance = <A, E, R>(eff: Effect.Effect<A, E, R>) =>
      Effect.gen(function* () {
        const ctx = yield* store.load({ directory: lireWorkspace(process.cwd()) })
        return yield* eff.pipe(Effect.provideService(InstanceRef, ctx))
      })

    yield* router.add("GET", COMMANDS_LISTE, (request) =>
      Effect.gen(function* () {
        const jeton = gitToken()
        const acces = controleAcces(request, jeton)
        if (!acces.ok) return reponse(enReponse(acces))
        const infos = yield* dansInstance(commandService.list())
        return reponse(listeLocale({ request, jeton, infos }))
      }),
    )

    yield* router.add("POST", COMMANDS_EXECUTION, (request) =>
      Effect.gen(function* () {
        // Le jeton est vérifié avant même de lire le corps : un refus ne dépend
        // jamais d'un JSON valide.
        const jeton = gitToken()
        const acces = controleAcces(request, jeton)
        if (!acces.ok) return reponse(enReponse(acces))

        const option = yield* Effect.option(request.json)
        const brut = option._tag === "Some" ? option.value : undefined
        const infos = yield* dansInstance(commandService.list())
        const prepare = preparerExecution({ request, jeton, infos, corps: brut })
        if ("refus" in prepare) return reponse(prepare.refus)

        const info = yield* dansInstance(commandService.get(prepare.entree.name))
        const template = yield* Effect.promise(async () => (info ? await info.template : undefined))
        return reponse(reponseExecution(prepare.entree, prepare.args, template))
      }),
    )
  }),
)
