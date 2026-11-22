import { createSignal } from "solid-js"
import { render } from "solid-js/web"
import { afterEach, describe, expect, test } from "vitest"
import { CommandHost } from "./ui-command-dialog"
import { HELP_KEYS, THEMES, type CommandData, type ViewId } from "./ui-commands"

function mount(initial: ViewId | undefined) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const [command, setCommand] = createSignal<ViewId | undefined>(initial)
  const [picked, setPicked] = createSignal<string>("")
  const [toggled, setToggled] = createSignal<string>("")
  const data: CommandData = {
    agents: [],
    models: [{ value: "a", label: "Alpha" }, { value: "b", label: "Beta" }],
    variants: [],
    themes: THEMES,
    decisionModel: "",
    visionModel: "",
    sessions: [],
    skills: [],
    subagents: [],
    providers: [],
    mcps: [{ value: "github", label: "github", on: true, tone: "ok" }],
    status: [["Version", "2.4.31"]],
    help: HELP_KEYS,
    timeline: [],
    diff: [],
    thinking: false,
    timestamps: false,
    theme: "",
    configText: "opencode.jsonc",
    logs: [],
  }
  const dispose = render(
    () => (
      <>
        <button id="outside">dehors</button>
        <CommandHost
          command={command()}
          data={data}
          onClose={() => setCommand(undefined)}
          onPick={(_, value) => setPicked(value)}
          onToggle={(_, row, next) => setToggled(`${row.value}:${next}`)}
        />
      </>
    ),
    container,
  )
  return { container, command, setCommand, picked, toggled, dispose }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

afterEach(() => {
  document.body.innerHTML = ""
})

describe("CommandHost — accessibilité des dialogues", () => {
  test("un dialogue a role=dialog, aria-modal et un titre relié", async () => {
    const { container, dispose } = mount("themes")
    await flush()
    const dialog = container.querySelector('[role="dialog"]')!
    expect(dialog).toBeTruthy()
    expect(dialog.getAttribute("aria-modal")).toBe("true")
    expect(dialog.getAttribute("aria-labelledby")).toBe("uic-title")
    expect(container.querySelector("#uic-title")?.textContent).toContain("Switch theme")
    dispose()
  })

  test("le focus va dans le dialogue à l'ouverture", async () => {
    const { container, dispose } = mount("models")
    await flush()
    const dialog = container.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog.contains(document.activeElement) || document.activeElement === dialog).toBe(true)
    dispose()
  })

  test("Échap ferme le dialogue et rend le focus au déclencheur", async () => {
    const { container, command, dispose } = mount("models")
    await flush()
    const outside = container.querySelector("#outside") as HTMLButtonElement
    outside.focus()
    expect(document.activeElement).toBe(outside)
    // L'ouverture retient le déclencheur ; on le repositionne puis Échap doit le rendre.
    const dialog = container.querySelector('[role="dialog"]') as HTMLElement
    dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    await flush()
    expect(command()).toBeUndefined()
    expect(container.querySelector('[role="dialog"]')).toBeFalsy()
    expect(document.activeElement).toBe(outside)
    dispose()
  })

  test("Tab au-delà de la dernière ligne revient à la première (piège)", async () => {
    const { container, dispose } = mount("themes")
    await flush()
    const dialog = container.querySelector('[role="dialog"]') as HTMLElement
    const rows = Array.from(dialog.querySelectorAll<HTMLElement>(".uic-row"))
    const last = rows[rows.length - 1]!
    last.focus()
    const before = document.activeElement
    last.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }))
    await flush()
    expect(before).toBe(last)
    expect(document.activeElement).toBe(rows[0])
    dispose()
  })

  test("Entrée sur une ligne choisit la valeur réelle", async () => {
    const { container, picked, dispose } = mount("models")
    await flush()
    const dialog = container.querySelector('[role="dialog"]') as HTMLElement
    dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }))
    dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    await flush()
    expect(picked()).toBe("b")
    dispose()
  })

  test("un interrupteur MCP bascule la valeur et l'état", async () => {
    const { container, toggled, dispose } = mount("mcps")
    await flush()
    const row = container.querySelector(".uic-row") as HTMLButtonElement
    row.click()
    await flush()
    expect(toggled()).toBe("github:false")
    dispose()
  })

  test("une liste filtrable porte un champ de recherche avec le focus", async () => {
    const { container, dispose } = mount("models")
    await flush()
    const filter = container.querySelector(".uic-filter") as HTMLInputElement
    expect(filter).toBeTruthy()
    expect(document.activeElement).toBe(filter)
    dispose()
  })
})
