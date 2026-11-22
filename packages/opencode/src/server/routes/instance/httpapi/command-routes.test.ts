import { describe, expect, test } from "bun:test"
import type { HttpServerRequest } from "effect/unstable/http"
import type { Command } from "@/command"
import { GIT_TOKEN_HEADER } from "@/opencodev2/token"
import { project } from "@/opencodev2/command-registry"
import {
  controleAcces,
  listeLocale,
  preparerExecution,
  reponseExecution,
} from "./command-routes"

/** Jeton de test local, généré ici — aucun secret partagé. */
const JETON = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
const jeton = {
  valide: (fourni: string | undefined | null) => typeof fourni === "string" && fourni === JETON,
}

function requete(headers: Record<string, string> = {}) {
  return {
    headers: { host: "127.0.0.1:4096", [GIT_TOKEN_HEADER]: JETON, ...headers },
  } as unknown as HttpServerRequest.HttpServerRequest
}

/** Registre CLI réel, à format Command.Info — aucune donnée de démo. */
const infos: Command.Info[] = [
  { name: "init", description: "guided AGENTS.md setup", source: "command", template: "setup", hints: [] },
  { name: "mon-skill", description: "skill local", source: "skill", template: "Fais $ARGUMENTS", hints: [] },
  {
    name: "mcp/analyse",
    description: "prompt MCP",
    source: "mcp",
    template: "Analyse $1",
    hints: ["$1"],
  },
]

describe("route /opencodev2/commands — parité", () => {
  test("la liste web est identique à celle du CLI", () => {
    const reponse = listeLocale({ request: requete(), jeton, infos })
    expect(reponse.status).toBe(200)
    expect(reponse.corps).toEqual(project(infos))
    const web = reponse.corps as Array<{ name: string }>
    for (const info of infos) {
      expect(web.some((entree) => entree.name === info.name)).toBe(true)
    }
    expect(web).toHaveLength(infos.length)
  })

  test("une commande manquante côté web fait échouer la parité", () => {
    const web = listeLocale({ request: requete(), jeton, infos }).corps as Array<{ name: string }>
    const conforme = infos.every((info) => web.some((entree) => entree.name === info.name))
    expect(conforme).toBe(true)
    const tronque = web.slice(1)
    expect(infos.every((info) => tronque.some((entree) => entree.name === info.name))).toBe(false)
  })
})

describe("route /opencodev2/commands — refus", () => {
  test("jeton absent ou invalide => 401", () => {
    const absent = listeLocale({ request: requete({ [GIT_TOKEN_HEADER]: "" }), jeton, infos })
    expect(absent.status).toBe(401)
    expect((absent.corps as { code: string }).code).toBe("NON_AUTHENTIFIE")

    const invalide = listeLocale({ request: requete({ [GIT_TOKEN_HEADER]: "mauvais" }), jeton, infos })
    expect(invalide.status).toBe(401)
  })

  test("hôte externe => 403 (DNS rebinding)", () => {
    const externe = listeLocale({ request: requete({ host: "evil.com" }), jeton, infos })
    expect(externe.status).toBe(403)
    expect((externe.corps as { code: string }).code).toBe("HOTE_EXTERNE")
  })

  test("contrôle d'accès partagé : jeton valide + hôte local", () => {
    expect(controleAcces(requete(), jeton).ok).toBe(true)
    expect(controleAcces(requete({ host: "evil.com" }), jeton).ok).toBe(false)
  })
})

describe("route /opencodev2/commands/execute — refus et exécution", () => {
  test("nom inconnu => 404 NOM_INCONNU", () => {
    const prepare = preparerExecution({ request: requete(), jeton, infos, corps: { name: "inconnu" } })
    expect("refus" in prepare).toBe(true)
    if ("refus" in prepare) {
      expect(prepare.refus.status).toBe(404)
      expect((prepare.refus.corps as { code: string }).code).toBe("NOM_INCONNU")
    }
  })

  test("jeton absent sur l'exécution => 401 avant lecture du corps", () => {
    const prepare = preparerExecution({
      request: requete({ [GIT_TOKEN_HEADER]: "" }),
      jeton,
      infos,
      corps: { name: "mon-skill" },
    })
    expect("refus" in prepare).toBe(true)
    if ("refus" in prepare) expect(prepare.refus.status).toBe(401)
  })

  test("injection dans les arguments => 400 ARGUMENT_INVALIDE", () => {
    const prepare = preparerExecution({
      request: requete(),
      jeton,
      infos,
      corps: { name: "mcp/analyse", arguments: { $1: "; rm -rf /" } },
    })
    expect("refus" in prepare).toBe(true)
    if ("refus" in prepare) {
      expect(prepare.refus.status).toBe(400)
      expect((prepare.refus.corps as { code: string }).code).toBe("ARGUMENT_INVALIDE")
    }
  })

  test("commande intégrée non exécutable par cette route => 400", () => {
    const prepare = preparerExecution({ request: requete(), jeton, infos, corps: { name: "init" } })
    expect("refus" in prepare).toBe(true)
    if ("refus" in prepare) expect((prepare.refus.corps as { code: string }).code).toBe("TYPE_NON_EXECUTABLE")
  })

  test("skill exécuté avec ses arguments, sans shell", () => {
    const prepare = preparerExecution({
      request: requete(),
      jeton,
      infos,
      corps: { name: "mon-skill", arguments: { $ARGUMENTS: "analyse ceci" } },
    })
    expect("entree" in prepare).toBe(true)
    if (!("entree" in prepare)) return
    const reponse = reponseExecution(prepare.entree, prepare.args, "Fais $ARGUMENTS")
    expect(reponse.status).toBe(200)
    expect(reponse.corps).toEqual({
      name: "mon-skill",
      type: "skill",
      arguments: { $ARGUMENTS: "analyse ceci" },
      prompt: "Fais analyse ceci",
    })
  })
})
