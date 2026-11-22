import { afterEach, describe, expect, test, vi } from "vitest"
import { render } from "solid-js/web"
import { RightPanel, type GoalAction } from "./right-panel"
import type { ContractView, TodoView } from "./plan"
import type { SessionStats } from "./view-model"

const stats: SessionStats = {
  turns: 2,
  steps: 4,
  actions: 3,
  durationMs: 1000,
  tokens: 12_345,
  cost: 0.42,
  perStep: [],
  output: 100,
  input: 200,
  cacheRead: 0,
  cacheWrite: 0,
  contextTokens: 4500,
}

const contract: ContractView = {
  goal: "Implémenter le panneau droit",
  dod: ["Composant + CSS isolé", "Intégration dans app.tsx"],
  outOfScope: ["Données de démonstration"],
  status: "pending",
}

const todos: TodoView[] = [
  { content: "Écrire le composant", status: "completed" },
  { content: "Câbler les actions", status: "in_progress" },
  { content: "Captures Playwright", status: "pending" },
]

type Props = Parameters<typeof RightPanel>[0]

function mount(overrides: Partial<Props> = {}) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const onGoalAction = vi.fn<Props["onGoalAction"]>().mockResolvedValue(true)
  const onSaveContract = vi.fn<Props["onSaveContract"]>().mockResolvedValue(true)
  const dispose = render(() =>
    RightPanel({
      open: true,
      contract,
      stats,
      contextLimit: 10_000,
      mcp: { git: { status: "connected" }, postgres: { status: "disabled" } },
      lsp: undefined,
      todos,
      folder: "opencodev2",
      branch: "feat/ui-panneau-droit",
      version: "2.4.31",
      onGoalAction,
      onSaveContract,
      ...overrides,
    }),
  container)
  return { container, dispose, onGoalAction, onSaveContract, html: () => container.innerHTML }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

afterEach(() => {
  document.body.innerHTML = ""
})

describe("RightPanel", () => {
  test("rend les cinq sections avec leurs notes et le pied réels", () => {
    const { container, dispose } = mount()
    const ids = Array.from(container.querySelectorAll(".rp-rs")).map((node) => node.getAttribute("data-id"))
    expect(ids).toEqual(["goal", "ctx", "mcp", "lsp", "todo"])
    expect(container.textContent).toContain("Goal definition")
    expect(container.textContent).toContain("DOD(2)")
    expect(container.textContent).toContain("OOS(1)")
    expect(container.textContent).toContain("1/2") // MCP connectés
    expect(container.textContent).toContain("1/3") // todos terminées
    expect(container.textContent).toContain("Implémenter le panneau droit")
    expect(container.textContent).toContain("opencodev2:feat/ui-panneau-droit")
    expect(container.textContent).toContain("Opencodev2 2.4.31")
    dispose()
  })

  test("chaque section se replie et se déplie sans perdre son contenu", () => {
    const { container, dispose } = mount()
    const goal = container.querySelector('[data-id="goal"]') as HTMLElement
    const header = goal.querySelector(".rp-rh") as HTMLButtonElement
    expect(header.tagName).toBe("BUTTON")
    expect(header.getAttribute("aria-expanded")).toBe("true")
    expect(goal.classList.contains("shut")).toBe(false)
    header.click()
    expect(goal.classList.contains("shut")).toBe(true)
    expect(header.getAttribute("aria-expanded")).toBe("false")
    header.click()
    expect(goal.classList.contains("shut")).toBe(false)
    expect(container.querySelectorAll(".rp-rs.shut")).toHaveLength(0)
    dispose()
  })

  test("l'état de repli est indépendant d'une section à l'autre", () => {
    const { container, dispose } = mount()
    const headers = Array.from(container.querySelectorAll(".rp-rh")) as HTMLButtonElement[]
    headers[0]!.click()
    headers[2]!.click()
    const sections = Array.from(container.querySelectorAll(".rp-rs")) as HTMLElement[]
    expect(sections.map((node) => node.classList.contains("shut"))).toEqual([true, false, true, false, false])
    dispose()
  })

  test("les boutons Goal appellent les vraies actions, 'edit' ouvrant l'éditeur", async () => {
    const { container, dispose, onGoalAction } = mount()
    const actions = Array.from(container.querySelectorAll("[data-g]")) as HTMLButtonElement[]
    expect(actions.map((node) => node.getAttribute("data-g"))).toEqual([
      "approve",
      "edit",
      "generate",
      "regenerate",
      "skip",
    ])
    actions[0]!.click()
    actions[2]!.click()
    actions[3]!.click()
    actions[4]!.click()
    await flush()
    expect(onGoalAction.mock.calls.map((call) => call[0] as GoalAction)).toEqual([
      "approve",
      "generate",
      "regenerate",
      "skip",
    ])
    expect(container.querySelector(".rp-editor")).toBeNull()
    actions[1]!.click()
    expect(container.querySelector(".rp-editor")).not.toBeNull()
    expect(onGoalAction).toHaveBeenCalledTimes(4)
    dispose()
  })

  test("l'éditeur refuse un objectif vide et sauvegarde une liste nettoyée", async () => {
    const { container, dispose, onSaveContract } = mount()
    ;(container.querySelector('[data-g="edit"]') as HTMLButtonElement).click()
    const goal = container.querySelector(".rp-editor textarea") as HTMLTextAreaElement
    goal.value = "   "
    goal.dispatchEvent(new Event("input", { bubbles: true }))
    const save = container.querySelector(".rp-editor-actions .rp-gb") as HTMLButtonElement
    save.click()
    await flush()
    expect(onSaveContract).not.toHaveBeenCalled()
    expect(container.querySelector(".rp-error")?.textContent).toContain("Goal cannot be empty")
    goal.value = "Nouvel objectif"
    goal.dispatchEvent(new Event("input", { bubbles: true }))
    save.click()
    await flush()
    expect(onSaveContract).toHaveBeenCalledTimes(1)
    expect(onSaveContract.mock.calls[0]![0]).toEqual({
      goal: "Nouvel objectif",
      dod: ["Composant + CSS isolé", "Intégration dans app.tsx"],
      outOfScope: ["Données de démonstration"],
    })
    dispose()
  })

  test("le contexte affiche jetons, pourcentage et coût réels", () => {
    const { container, dispose } = mount()
    expect(container.textContent).toContain("4.5k tokens")
    expect(container.textContent).toContain("45% used")
    expect(container.textContent).toContain("$0.42 (estimated)")
    dispose()
  })

  test("les états vides sont explicites, sans donnée inventée", () => {
    const { container, dispose } = mount({
      contract: undefined,
      mcp: {},
      todos: [],
      contextLimit: undefined,
      version: undefined,
    })
    expect(container.textContent).toContain("No definition of done yet.")
    expect(container.textContent).toContain("No MCP server reported.")
    expect(container.textContent).toContain("LSPs are disabled")
    expect(container.textContent).toContain("No todo yet.")
    expect(container.textContent).toContain("limit unknown")
    expect(container.textContent).toContain("Opencodev2 —")
    dispose()
  })

  test("la bascule d'ouverture pilote aria-hidden et la classe is-open", () => {
    const shown = mount({ open: true })
    expect(shown.container.querySelector(".rpanel")?.classList.contains("is-open")).toBe(true)
    expect(shown.container.querySelector(".rpanel")?.getAttribute("aria-hidden")).toBe("false")
    shown.dispose()

    const hidden = mount({ open: false })
    expect(hidden.container.querySelector(".rpanel")?.classList.contains("is-open")).toBe(false)
    expect(hidden.container.querySelector(".rpanel")?.getAttribute("aria-hidden")).toBe("true")
    hidden.dispose()
  })
})
