import { describe, expect, test } from "bun:test"
import {
  contientInjection,
  project,
  resoudreTemplate,
  validerArguments,
  validerNom,
  validerTypeExecutable,
  type RegistryEntry,
} from "./command-registry"
import type { Command } from "@/command"

/** Entrées au format réel de Command.Info (source du CLI). */
const infos: Command.Info[] = [
  {
    name: "init",
    description: "guided AGENTS.md setup",
    source: "command",
    template: "configure",
    hints: ["$ARGUMENTS"],
  },
  {
    name: "review",
    description: "review changes",
    source: "command",
    template: "review $1",
    hints: ["$1"],
  },
  {
    name: "mon-skill",
    description: "un skill local",
    source: "skill",
    template: "Skill $ARGUMENTS",
    hints: [],
  },
  {
    name: "mcp/analyse",
    description: "un prompt MCP",
    source: "mcp",
    template: "Analyse $1 puis $2",
    hints: ["$1", "$2"],
  },
]

function entrees(): RegistryEntry[] {
  return project(infos)
}

describe("registre — projection du CLI", () => {
  test("une entrée par commande du CLI, avec nom, description, type et arguments", () => {
    const web = entrees()
    expect(web).toHaveLength(infos.length)
    for (const info of infos) {
      const trouvee = web.find((entree) => entree.name === info.name)
      expect(trouvee).toBeDefined()
      expect(trouvee!.description).toBe(info.description)
      expect(trouvee!.type).toBe(info.source ?? "command")
      expect(trouvee!.arguments).toEqual([...info.hints])
    }
  })

  test("aucune donnée de démonstration : retirer une commande CLI la retire du web", () => {
    const sansSkill = project(infos.filter((info) => info.source !== "skill"))
    expect(sansSkill).toHaveLength(infos.length - 1)
    expect(sansSkill.some((entree) => entree.type === "skill")).toBe(false)
  })

  test("les trois types du CLI sont conservés", () => {
    expect(new Set(entrees().map((entree) => entree.type))).toEqual(new Set(["command", "mcp", "skill"]))
  })
})

describe("registre — refus sur le nom", () => {
  test("nom inconnu refusé", () => {
    const resultat = validerNom("nope", entrees())
    expect(resultat.ok).toBe(false)
    if (!resultat.ok) expect(resultat.code).toBe("NOM_INCONNU")
  })

  test("nom invalide (vide, nombre, injection) refusé", () => {
    for (const nom of ["", 12, ";rm -rf /", "../../etc/passwd", "a\nb"]) {
      expect(validerNom(nom, entrees()).ok).toBe(false)
    }
  })

  test("nom exact accepté, y compris namespaced", () => {
    expect(validerNom("mcp/analyse", entrees()).ok).toBe(true)
  })
})

describe("registre — refus sur les arguments", () => {
  const mcp = entrees().find((entree) => entree.name === "mcp/analyse")!

  test("injection shell refusée", () => {
    for (const valeur of ["; rm -rf /", "$(whoami)", "`id`", "a && b", "a | b", "../secret", "ligne\nsuivante"]) {
      const resultat = validerArguments({ $1: valeur }, mcp)
      expect(resultat.ok).toBe(false)
      if (!resultat.ok) expect(resultat.code).toBe("ARGUMENT_INVALIDE")
    }
  })

  test("argument non déclaré refusé", () => {
    const resultat = validerArguments({ $9: "valeur" }, mcp)
    expect(resultat.ok).toBe(false)
    if (!resultat.ok) expect(resultat.code).toBe("ARGUMENT_INCONNU")
  })

  test("valeur non-chaîne refusée", () => {
    expect(validerArguments({ $1: 42 }, mcp).ok).toBe(false)
  })

  test("arguments valides acceptés", () => {
    const resultat = validerArguments({ $1: "premier", $2: "deuxième" }, mcp)
    expect(resultat.ok).toBe(true)
    if (resultat.ok) expect(resultat.value).toEqual({ $1: "premier", $2: "deuxième" })
  })

  test("contientInjection couvre NUL et guillemet arrière", () => {
    expect(contientInjection("a\u0000b")).toBe(true)
    expect(contientInjection("a`b")).toBe(true)
    expect(contientInjection("texte simple")).toBe(false)
  })
})

describe("registre — exécution bornée", () => {
  test("seuls mcp et skill sont exécutables", () => {
    expect(validerTypeExecutable(entrees().find((e) => e.type === "mcp")!).ok).toBe(true)
    expect(validerTypeExecutable(entrees().find((e) => e.type === "skill")!).ok).toBe(true)
    const commande = validerTypeExecutable(entrees().find((e) => e.type === "command")!)
    expect(commande.ok).toBe(false)
    if (!commande.ok) expect(commande.code).toBe("TYPE_NON_EXECUTABLE")
  })

  test("substitution positionnelle comme le CLI, sans shell", () => {
    expect(resoudreTemplate("Analyse $1 puis $2", { $1: "A", $2: "B" })).toBe("Analyse A puis B")
    expect(resoudreTemplate("Fais $ARGUMENTS", { $ARGUMENTS: "x" })).toBe("Fais x")
    expect(resoudreTemplate("$1 et $10", { $1: "un", $10: "dix" })).toBe("un et dix")
  })
})
