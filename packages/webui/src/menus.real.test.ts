import { describe, expect, test } from "vitest"
import { commandChoices } from "./composer-keys"
import { commandRows, isKnownCommand, moveMenuIndex, paletteRows, unknownCommand } from "./menus"

/**
 * Le vrai registre CLI, pas une donnée de démonstration.
 *
 * Le binaire `opencode` n'est pas dans le PATH de cette machine, mais le serveur local expose
 * **le même registre** que le CLI par `GET /command` (430 entrées mesurées : 420 `skill`,
 * 8 `command`, 2 `mcp`). Le test est donc désactivé par défaut — une suite unitaire ne doit pas
 * dépendre d'un serveur — et s'active explicitement avec :
 *
 *   OPENCODE_TEST_REAL=1 bun run --cwd packages/webui test
 *
 * Le résultat de ce passage est consigné dans docs/design/captures/build-6-rapport.md.
 */
const enabled = process.env.OPENCODE_TEST_REAL === "1"
const port = process.env.OPENCODE_SERVER_PORT ?? "4096"

describe.skipIf(!enabled)("registre CLI réel — clavier et filtrage sur les vraies commandes", () => {
  test("le registre vivant se projette en lignes de menu, avec ses étiquettes", async () => {
    const response = await fetch(`http://127.0.0.1:${port}/command`)
    expect(response.ok).toBe(true)
    const payload: unknown = await response.json()
    const commands = commandChoices(payload)
    expect(commands.length).toBeGreaterThan(0)

    const rows = commandRows(commands)
    expect(rows).toHaveLength(commands.length)
    // Les étiquettes viennent du `source` réel du serveur, pas d'une liste écrite à la main.
    expect(rows.filter((row) => row.tag === "mcp").length).toBeGreaterThan(0)
    expect(rows.filter((row) => row.tag === "skill").length).toBeGreaterThan(0)
    expect(rows.every((row) => row.name.startsWith("/"))).toBe(true)
    expect(rows.every((row) => row.completion.endsWith(" "))).toBe(true)
  }, 30_000)

  test("le filtre et la palette marchent sur le vrai registre", async () => {
    const payload: unknown = await (await fetch(`http://127.0.0.1:${port}/command`)).json()
    const commands = commandChoices(payload)
    const rows = commandRows(commands)

    // Un nom réellement présent dans le registre est trouvé par le filtre.
    const first = commands[0]!
    expect(commandRows(commands, first.name).map((row) => row.command)).toContain(first.name)
    // La palette affiche exactement les mêmes lignes que le `/`.
    expect(paletteRows(commands, first.name)).toEqual(commandRows(commands, first.name))
    // Le cl boucle sur la vraie longueur : le dernier + 1 revient au premier.
    expect(moveMenuIndex(0, rows.length, "ArrowUp")).toBe(rows.length - 1)
    expect(moveMenuIndex(rows.length - 1, rows.length, "ArrowDown")).toBe(0)
  }, 30_000)

  test("une commande absente du vrai registre n'est jamais envoyée au modèle", async () => {
    const payload: unknown = await (await fetch(`http://127.0.0.1:${port}/command`)).json()
    const commands = commandChoices(payload)
    const forbidden = "build-6-commande-qui-nexiste-pas"
    expect(isKnownCommand(forbidden, commands)).toBe(false)
    expect(unknownCommand(`/${forbidden} argument`, commands)).toBe(forbidden)
    // Et une commande réellement publiée passe le garde-fou.
    const known = commands[0]!.name
    expect(unknownCommand(`/${known} argument`, commands)).toBeUndefined()
  }, 30_000)
})
