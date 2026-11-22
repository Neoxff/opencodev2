import { describe, expect, test } from "vitest"
import {
  commandRows,
  commandToken,
  filterMenuRows,
  isKnownCommand,
  mentionRows,
  moveMenuIndex,
  paletteRows,
  unknownCommand,
  type CommandLike,
  type MentionSession,
} from "./menus"

/**
 * Registre simulé — volontairement petit et **représentatif du vrai** : une commande ordinaire,
 * une skill, un prompt MCP et une commande sans description. Les faits mesurés sur le serveur
 * vivant (430 entrées : 420 skill, 8 command, 2 mcp) sont vérifiés dans `menus.real.test.ts`.
 */
const registry: CommandLike[] = [
  { name: "init", description: "guided AGENTS.md setup", source: "command" },
  { name: "humanizer", description: "Humanize AI-sounding text so it reads like a person wrote it", source: "skill" },
  { name: "kubernetes:k8s-diagnose:mcp", description: "Diagnose Kubernetes Resources.", source: "mcp" },
  { name: "review", description: "review changes [commit|branch|pr], defaults to uncommitted" },
]

const sessions: MentionSession[] = [
  { id: "ses_1", title: "Ciel étoilé, Worker et canvas", when: "33m" },
  { id: "ses_2", title: "Correctif dépôt divergent", when: "5m" },
]

describe("commandRows — le nom en mono, la description grisée, l'étiquette MCP / Skill", () => {
  test("le nom porte le `/`, et la complétion se termine par un espace", () => {
    const rows = commandRows(registry)
    expect(rows[0]?.name).toBe("/init")
    expect(rows[0]?.completion).toBe("/init ")
    expect(rows[0]?.command).toBe("init")
  })

  test("l'étiquette vient du `source` du serveur, pas d'une devinette sur le nom", () => {
    const rows = commandRows(registry)
    expect(rows.find((row) => row.command === "humanizer")?.tag).toBe("skill")
    expect(rows.find((row) => row.command?.includes(":mcp"))?.tag).toBe("mcp")
    // Une commande ordinaire n'a **pas** d'étiquette.
    expect(rows.find((row) => row.command === "init")?.tag).toBeUndefined()
  })

  test("la description est portée telle quelle, et manque proprement", () => {
    const rows = commandRows([{ name: "bare" }])
    expect(rows[0]?.detail).toBeUndefined()
    expect(rows[0]?.name).toBe("/bare")
  })

  test("la palette affiche exactement les mêmes lignes que le `/`", () => {
    expect(paletteRows(registry, "human")).toEqual(commandRows(registry, "human"))
  })
})

describe("filterMenuRows — le nom d'abord, la description ensuite", () => {
  test("sans requête, la liste entière", () => {
    expect(filterMenuRows(commandRows(registry), "")).toHaveLength(registry.length)
  })

  test("le nom se cherche, sans tenir compte de la casse ni du `/`", () => {
    const rows = filterMenuRows(commandRows(registry), "HUMAN")
    expect(rows.map((row) => row.command)).toEqual(["humanizer"])
  })

  test("la description se cherche aussi — on ne connaît pas toujours le nom", () => {
    const rows = filterMenuRows(commandRows(registry), "kubernetes")
    expect(rows.map((row) => row.command)).toEqual(["kubernetes:k8s-diagnose:mcp"])
  })

  test("rien ne correspond : une liste vide, pas une erreur", () => {
    expect(filterMenuRows(commandRows(registry), "inconnu-xyz")).toEqual([])
  })
})

describe("mentionRows — les fichiers du dossier et les sessions", () => {
  test("les fichiers viennent en premier, les sessions ensuite", () => {
    const rows = mentionRows(["packages/webui/src/app.tsx"], sessions)
    expect(rows.map((row) => row.kind)).toEqual(["file", "session", "session"])
    expect(rows[0]?.name).toBe("@packages/webui/src/app.tsx")
    expect(rows[0]?.detail).toBe("file")
    expect(rows[0]?.completion).toBe("packages/webui/src/app.tsx ")
  })

  test("une session porte son titre et son âge relatif dans le détail", () => {
    const row = mentionRows([], sessions)[0]
    expect(row?.name).toBe("@Ciel étoilé, Worker et canvas")
    expect(row?.detail).toBe("session · 33m")
    expect(row?.sessionID).toBe("ses_1")
    expect(row?.completion).toBe("@Ciel étoilé, Worker et canvas ")
  })

  test("le filtre porte sur le titre de la session et sur le chemin du fichier", () => {
    expect(mentionRows(["src/app.tsx"], sessions, "canvas").map((row) => row.sessionID)).toEqual(["ses_1"])
    expect(mentionRows(["src/app.tsx"], sessions, "app.tsx").map((row) => row.kind)).toEqual(["file"])
  })

  test("les sessions sont bornées à douze : une liste plus longue ne se parcourt pas", () => {
    const many = Array.from({ length: 40 }, (_, index) => ({ id: `s${index}`, title: `session ${index}`, when: "1d" }))
    expect(mentionRows([], many)).toHaveLength(12)
  })
})

describe("moveMenuIndex — les flèches bouclent, Home/End vont aux extrémités", () => {
  test("flèche bas, puis retour en haut après la dernière ligne", () => {
    expect(moveMenuIndex(0, 4, "ArrowDown")).toBe(1)
    expect(moveMenuIndex(3, 4, "ArrowDown")).toBe(0)
  })

  test("flèche haut, puis saut en bas depuis la première ligne", () => {
    expect(moveMenuIndex(2, 4, "ArrowUp")).toBe(1)
    expect(moveMenuIndex(0, 4, "ArrowUp")).toBe(3)
  })

  test("Home et End", () => {
    expect(moveMenuIndex(2, 4, "Home")).toBe(0)
    expect(moveMenuIndex(1, 4, "End")).toBe(3)
  })

  test("une autre touche ne déplace pas la sélection", () => {
    expect(moveMenuIndex(2, 4, "Enter")).toBeUndefined()
    expect(moveMenuIndex(2, 4, "Tab")).toBeUndefined()
    expect(moveMenuIndex(2, 4, "Escape")).toBeUndefined()
  })

  test("une liste vide ne se déplace pas", () => {
    expect(moveMenuIndex(0, 0, "ArrowDown")).toBeUndefined()
  })
})

describe("commandToken — le nom de commande en tête du texte", () => {
  test("les arguments ne font pas partie du nom", () => {
    expect(commandToken("/review changes")).toBe("review")
  })

  test("un `/` seul n'est pas encore une commande", () => {
    expect(commandToken("/")).toBeUndefined()
  })

  test("un texte ordinaire n'ouvre aucune commande", () => {
    expect(commandToken("voir /init")).toBeUndefined()
  })
})

describe("unknownCommand — une commande inconnue n'est jamais envoyée au modèle", () => {
  test("un nom du registre peut partir", () => {
    expect(unknownCommand("/init now", registry)).toBeUndefined()
    expect(isKnownCommand("init", registry)).toBe(true)
  })

  test("un nom absent du registre est bloqué", () => {
    expect(unknownCommand("/initt now", registry)).toBe("initt")
    expect(unknownCommand("/inconnu-xyz", registry)).toBe("inconnu-xyz")
  })

  test("un registre encore vide bloque aussi : ne pas savoir n'autorise pas à envoyer", () => {
    expect(unknownCommand("/init", [])).toBe("init")
  })

  test("un texte qui ne commence pas par `/` n'est pas une commande", () => {
    expect(unknownCommand("explique /init", registry)).toBeUndefined()
  })
})
