import { describe, expect, test, vi } from "vitest"
import { render } from "solid-js/web"
import { CommandPalette, SuggestMenu } from "./menu-components"
import { commandRows, type CommandLike } from "./menus"

/** Registre simulé — les faits mesurés sur le serveur vivant sont dans `menus.real.test.ts`. */
const registry: CommandLike[] = [
  { name: "init", description: "guided AGENTS.md setup", source: "command" },
  { name: "humanizer", description: "Humanize AI-sounding text", source: "skill" },
  { name: "kubernetes:k8s-diagnose:mcp", description: "Diagnose Kubernetes Resources.", source: "mcp" },
]

function mount(component: () => unknown): { html: string; container: HTMLElement; dispose: () => void } {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const dispose = render(component as never, container)
  return { html: container.innerHTML, container, dispose }
}

const key = (element: Element, name: string) =>
  element.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }))

describe("SuggestMenu — rendu et clavier sur un registre simulé", () => {
  const rows = commandRows(registry)

  test("le nom est en mono, la description grisée, et l'étiquette MCP / Skill est rendue", () => {
    const { html, dispose } = mount(() => (
      <SuggestMenu rows={rows} active={1} label="commands" onHover={() => {}} onPick={() => {}} />
    ))
    expect(html).toContain("oc-menu-name")
    expect(html).toContain("/humanizer")
    expect(html).toContain("oc-menu-detail")
    expect(html).toContain("Humanize AI-sounding text")
    expect(html).toContain("Skill")
    expect(html).toContain("MCP")
    expect(html).toContain("is-mcp")
    dispose()
  })

  test("la ligne active porte la classe et `aria-selected`", () => {
    const { container, dispose } = mount(() => (
      <SuggestMenu rows={rows} active={1} label="commands" onHover={() => {}} onPick={() => {}} />
    ))
    expect(container.querySelectorAll(".oc-menu-row.is-active")).toHaveLength(1)
    expect(container.querySelectorAll('[role="option"][aria-selected="true"]')).toHaveLength(1)
    expect(container.querySelector(".oc-menu-row.is-active")?.textContent).toContain("/humanizer")
    dispose()
  })

  test("une liste vide le dit au lieu de laisser croire à une panne", () => {
    const { html, dispose } = mount(() => (
      <SuggestMenu rows={[]} active={0} label="commands" onHover={() => {}} onPick={() => {}} />
    ))
    expect(html).toContain("No matching command.")
    dispose()
  })

  test("un clic sur une ligne rend la ligne choisie", () => {
    const onPick = vi.fn()
    const { container, dispose } = mount(() => (
      <SuggestMenu rows={rows} active={0} label="commands" onHover={() => {}} onPick={onPick} />
    ))
    const line = container.querySelectorAll(".oc-menu-row")[2]
    expect(line).not.toBeUndefined()
    ;(line as HTMLElement).click()
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick.mock.calls[0]?.[0]).toMatchObject({ command: "kubernetes:k8s-diagnose:mcp", tag: "mcp" })
    dispose()
  })

  test("le survol change la ligne active", () => {
    const onHover = vi.fn()
    const { container, dispose } = mount(() => (
      <SuggestMenu rows={rows} active={0} label="commands" onHover={onHover} onPick={() => {}} />
    ))
    const line = container.querySelectorAll(".oc-menu-row")[1] as HTMLElement
    line.dispatchEvent(new MouseEvent("mouseenter"))
    expect(onHover).toHaveBeenCalledWith(1)
    dispose()
  })
})

describe("CommandPalette — filtre et navigation clavier sur un registre simulé", () => {
  const rows = commandRows(registry)

  test("elle ouvre un dialogue avec son champ de filtre et les mêmes commandes", () => {
    const { html, container, dispose } = mount(() => (
      <CommandPalette
        rows={rows}
        query="human"
        active={0}
        onQuery={() => {}}
        onActive={() => {}}
        onMove={() => {}}
        onPick={() => {}}
        onClose={() => {}}
      />
    ))
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-label="Search commands"')
    // Solid pose `value` comme propriété, pas comme attribut : c'est la propriété qu'on lit.
    expect((container.querySelector("input") as HTMLInputElement).value).toBe("human")
    expect(html).toContain("/humanizer")
    expect(html).toContain("ctrl+p")
    dispose()
  })

  test("les flèches et Home/End remontent à l'application, qui boucle l'index", () => {
    const onMove = vi.fn()
    const { container, dispose } = mount(() => (
      <CommandPalette
        rows={rows}
        query=""
        active={0}
        onQuery={() => {}}
        onActive={() => {}}
        onMove={onMove}
        onPick={() => {}}
        onClose={() => {}}
      />
    ))
    const input = container.querySelector("input") as HTMLElement
    key(input, "ArrowDown")
    key(input, "ArrowUp")
    key(input, "Home")
    key(input, "End")
    expect(onMove.mock.calls.map((call) => call[0])).toEqual(["ArrowDown", "ArrowUp", "Home", "End"])
    dispose()
  })

  test("Entrée et Tab exécutent la ligne active", () => {
    const onPick = vi.fn()
    const { container, dispose } = mount(() => (
      <CommandPalette
        rows={rows}
        query=""
        active={2}
        onQuery={() => {}}
        onActive={() => {}}
        onMove={() => {}}
        onPick={onPick}
        onClose={() => {}}
      />
    ))
    const input = container.querySelector("input") as HTMLElement
    key(input, "Enter")
    key(input, "Tab")
    expect(onPick).toHaveBeenCalledTimes(2)
    expect(onPick.mock.calls[0]?.[0]).toMatchObject({ command: "kubernetes:k8s-diagnose:mcp" })
    dispose()
  })

  test("Échap ferme la palette", () => {
    const onClose = vi.fn()
    const { container, dispose } = mount(() => (
      <CommandPalette
        rows={rows}
        query=""
        active={0}
        onQuery={() => {}}
        onActive={() => {}}
        onMove={() => {}}
        onPick={() => {}}
        onClose={onClose}
      />
    ))
    key(container.querySelector("input") as HTMLElement, "Escape")
    expect(onClose).toHaveBeenCalledTimes(1)
    dispose()
  })

  test("la frappe dans le champ renvoie la requête de filtre à l'application", () => {
    const onQuery = vi.fn()
    const { container, dispose } = mount(() => (
      <CommandPalette
        rows={rows}
        query=""
        active={0}
        onQuery={onQuery}
        onActive={() => {}}
        onMove={() => {}}
        onPick={() => {}}
        onClose={() => {}}
      />
    ))
    const input = container.querySelector("input") as HTMLInputElement
    input.value = "init"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    expect(onQuery).toHaveBeenCalledWith("init")
    dispose()
  })
})
