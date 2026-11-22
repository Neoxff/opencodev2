import { describe, expect, test, vi } from "vitest"
import { render } from "solid-js/web"
import {
  ConversationHeader,
  ConversationUserMessage,
  DelegateRow,
  EditRow,
  RunRow,
  ScrollChrome,
  ThoughtRow,
  toolDuration,
} from "./conversation"
import type { ToolState } from "./view-model"

function mount(component: () => unknown): { container: HTMLElement; dispose: () => void } {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const dispose = render(component as never, container)
  return { container, dispose }
}

const completed: ToolState = {
  status: "completed",
  input: { path: "src/app.tsx" },
  output: "$ git status --short\n(clean)",
  title: "git status --short",
  time: { start: 1000, end: 2450 },
  metadata: { filediff: { file: "src/app.tsx", additions: 14, deletions: 3 } },
}

const running: ToolState = {
  status: "running",
  input: { command: "npm test" },
  title: "Tests du panneau Dépôt",
  time: { start: 1000 },
}

describe("durée des outils — données du serveur", () => {
  test("un outil fini porte sa durée bornée", () => {
    expect(toolDuration(completed, 9000)).toBe("1.4s")
  })

  test("un outil en cours porte le temps écoulé jusqu'au battement", () => {
    expect(toolDuration(running, 5000)).toBe("4.0s")
  })
})

describe("en-tête de conversation", () => {
  test("il porte le retour, le titre, Goal definition et les trois onglets", () => {
    const onBack = vi.fn()
    const onGoal = vi.fn()
    const onView = vi.fn()
    const onConfig = vi.fn()
    const { container, dispose } = mount(() => (
      <ConversationHeader
        title="Correctif dépôt divergent"
        view="chat"
        working={false}
        onBack={onBack}
        onGoal={onGoal}
        onView={onView}
        onConfig={onConfig}
      />
    ))
    expect(container.querySelector(".conv-title")?.textContent).toBe("Correctif dépôt divergent")
    expect(container.querySelector(".conv-goal")?.textContent).toContain("Goal definition")
    const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>(".conv-tab"))
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Conversation", "Config", "Logs"])
    expect(tabs[0]?.className).toContain("on")
    expect(container.querySelector(".conv-working")).toBeNull()
    tabs[0]?.click()
    tabs[1]?.click()
    tabs[2]?.click()
    container.querySelector<HTMLButtonElement>(".conv-back")?.click()
    container.querySelector<HTMLButtonElement>(".conv-goal")?.click()
    expect(onView).toHaveBeenCalledWith("chat")
    expect(onView).toHaveBeenCalledWith("logs")
    expect(onConfig).toHaveBeenCalledTimes(1)
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(onGoal).toHaveBeenCalledTimes(1)
    dispose()
  })

  test("Working... n'existe que pendant le travail", () => {
    const props = {
      title: "x",
      view: "chat" as const,
      working: true,
      onBack: () => {},
      onGoal: () => {},
      onView: () => {},
      onConfig: () => {},
    }
    const active = mount(() => <ConversationHeader {...props} />)
    expect(active.container.textContent).toContain("Working...")
    expect(active.container.querySelector(".conv-working svg")).not.toBeNull()
    active.dispose()
    const idle = mount(() => <ConversationHeader {...props} working={false} />)
    expect(idle.container.querySelector(".conv-working")).toBeNull()
    idle.dispose()
  })
})

describe("lignes du flux", () => {
  test("edits porte le ± lignes, done et la durée", () => {
    const { container, dispose } = mount(() => (
      <EditRow file="src/app.tsx" additions={14} deletions={3} done duration="1.5s" />
    ))
    expect(container.textContent).toContain("edits")
    expect(container.textContent).toContain("+14")
    expect(container.textContent).toContain("−3")
    expect(container.textContent).toContain("done")
    expect(container.textContent).toContain("1.5s")
    dispose()
  })

  test("Thought est repliable et annonce caractères et durée", () => {
    const onToggle = vi.fn()
    const { container, dispose } = mount(() => (
      <ThoughtRow duration="11s" chars={5203} text="Je vérifie l'état du dépôt." open={false} onToggle={onToggle} />
    ))
    expect(container.textContent).toContain("Thought")
    expect(container.textContent).toContain("11s")
    expect(container.textContent).toContain("5203 characters")
    expect(container.querySelector(".cv-thought-text")).toBeNull()
    container.querySelector<HTMLButtonElement>(".cv-row.thought")?.click()
    expect(onToggle).toHaveBeenCalledTimes(1)
    dispose()

    const open = mount(() => (
      <ThoughtRow duration="11s" chars={7} text="Je vérifie." open onToggle={() => {}} />
    ))
    expect(open.container.querySelector(".cv-thought-text")?.textContent).toBe("Je vérifie.")
    open.dispose()
  })

  test("runs est repliable et montre la sortie en bloc noir avec « Click to collapse »", () => {
    const onToggle = vi.fn()
    const { container, dispose } = mount(() => (
      <RunRow name="git status --short" status="done" output="$ git status --short\n(clean)" duration="15ms" open={false} onToggle={onToggle} />
    ))
    expect(container.textContent).toContain("runs")
    expect(container.querySelector(".cv-out")).toBeNull()
    container.querySelector<HTMLButtonElement>(".cv-row.run")?.click()
    expect(onToggle).toHaveBeenCalledTimes(1)
    dispose()

    const open = mount(() => (
      <RunRow name="git log" status="done" output="$ git log\n5c0793a" open onToggle={() => {}} />
    ))
    expect(open.container.querySelector(".cv-out")?.textContent).toContain("5c0793a")
    expect(open.container.textContent).toContain("Click to collapse")
    open.dispose()
  })

  test("delegates dit done ou running avec son chrono", () => {
    const done = mount(() => <DelegateRow name="Tests du panneau Dépôt" running={false} duration="4m12s" />)
    expect(done.container.textContent).toContain("delegates")
    expect(done.container.textContent).toContain("done")
    expect(done.container.textContent).toContain("4m12s")
    done.dispose()
    const live = mount(() => <DelegateRow name="Corriger la réinitialisation" running duration="7m35s" />)
    expect(live.container.textContent).toContain("running 7m35s")
    live.dispose()
  })

  test("le message utilisateur peut porter « queued »", () => {
    const { container, dispose } = mount(() => <ConversationUserMessage text="Corrige le dépôt" queued />)
    expect(container.textContent).toContain("Corrige le dépôt")
    expect(container.querySelector(".cv-queued")?.textContent).toBe("queued")
    dispose()
    const plain = mount(() => <ConversationUserMessage text="Salut" />)
    expect(plain.container.querySelector(".cv-queued")).toBeNull()
    plain.dispose()
  })

  test("le curseur à trois points et la flèche haute n'apparaissent que si le fil défile", () => {
    const onUp = vi.fn()
    const hidden = mount(() => <ScrollChrome up={false} thumb={false} progress={0} onUp={onUp} />)
    expect(hidden.container.querySelector(".conv-thumb")).toBeNull()
    hidden.dispose()
    const shown = mount(() => <ScrollChrome up thumb progress={0.5} onUp={onUp} />)
    expect(shown.container.querySelectorAll(".conv-thumb i")).toHaveLength(3)
    shown.container.querySelector<HTMLButtonElement>(".conv-up")?.click()
    expect(onUp).toHaveBeenCalledTimes(1)
    shown.dispose()
  })
})
