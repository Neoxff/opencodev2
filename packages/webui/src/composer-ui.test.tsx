import { describe, expect, test, vi } from "vitest"
import { render } from "solid-js/web"
import { COMPOSER_PLACEHOLDER, ComposerControls, ComposerStatusBar } from "./composer-ui"
import { modelVariantCatalog, preferredVariant, type Choice } from "./settings"
import type { SessionStats } from "./view-model"

function mount(component: () => unknown): { html: string; container: HTMLElement; dispose: () => void } {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const dispose = render(component as never, container)
  return { html: container.innerHTML, container, dispose }
}

const models: Choice[] = [
  { value: "opencode/deepseek-v4.1-flash-free", label: "DeepSeek V4.1 Flash Free", group: "OpenCode" },
  { value: "opencode/hy4-flash-free", label: "Hy4 Flash Free", group: "OpenCode" },
]
const agents: Choice[] = [
  { value: "orchestrator", label: "orchestrator" },
  { value: "lean", label: "lean" },
]
const variants: Choice[] = [
  { value: "max", label: "max" },
  { value: "high", label: "high" },
]

const stats: SessionStats = {
  turns: 3,
  steps: 7,
  actions: 12,
  durationMs: 10_000,
  tokens: 900_000,
  cost: 0.42,
  perStep: [],
  output: 520,
  input: 634_000,
  cacheRead: 0,
  cacheWrite: 0,
  contextTokens: 634_000,
}

describe("ComposerControls", () => {
  test("le placeholder est exactement celui de la maquette", () => {
    expect(COMPOSER_PLACEHOLDER).toBe("Describe what you want to build. / commands, @ files or sessions")
  })

  test("au repos, l'envoi est un submit et les trois sélecteurs portent les valeurs réelles", () => {
    const onAgentChange = vi.fn()
    const onVariantChange = vi.fn()
    const onModelChange = vi.fn()
    const onOpenAgents = vi.fn()
    const onOpenModels = vi.fn()
    const attached = mount(() => (
      <ComposerControls
        agents={agents}
        agent="orchestrator"
        onAgentChange={onAgentChange}
        onOpenAgents={onOpenAgents}
        models={models}
        model="opencode/deepseek-v4.1-flash-free"
        onModelChange={onModelChange}
        onOpenModels={onOpenModels}
        variants={variants}
        variant="max"
        onVariantChange={onVariantChange}
        working={false}
        canSend
        onAttach={() => {}}
        onInterrupt={() => {}}
      />
    ))
    try {
      const send = attached.container.querySelector<HTMLButtonElement>(".cv-send")!
      expect(send.type).toBe("submit")
      expect(send.getAttribute("aria-label")).toBe("Send")
      expect(send.querySelector(".cv-square")).toBeNull()
      expect(send.querySelector(".glyph")).not.toBeNull()
      expect(send.disabled).toBe(false)

      const triggers = [...attached.container.querySelectorAll<HTMLButtonElement>(".pick-trigger")]
      expect(triggers.map((trigger) => trigger.textContent)).toEqual([
        "orchestrator",
        "max",
        "DeepSeek V4.1 Flash Free",
      ])
      expect(attached.container.querySelector(".cv-select-agent .pick-icon .glyph")).not.toBeNull()
      expect(attached.container.querySelector<HTMLButtonElement>(".cv-mic")?.disabled).toBe(true)
      expect(attached.container.querySelector<HTMLInputElement>('input[type="file"]')?.multiple).toBe(true)

      triggers[0]!.click()
      triggers[2]!.click()
      expect(onOpenAgents).toHaveBeenCalledTimes(1)
      expect(onOpenModels).toHaveBeenCalledTimes(1)
    } finally {
      attached.dispose()
    }
  })

  test("pendant le travail, le bouton rond devient Interrupt", () => {
    const onInterrupt = vi.fn()
    const attached = mount(() => (
      <ComposerControls
        agents={agents}
        agent="orchestrator"
        onAgentChange={() => {}}
        onOpenAgents={() => {}}
        models={models}
        model=""
        onModelChange={() => {}}
        onOpenModels={() => {}}
        variants={variants}
        variant="max"
        onVariantChange={() => {}}
        working
        canSend={false}
        onAttach={() => {}}
        onInterrupt={onInterrupt}
      />
    ))
    try {
      const send = attached.container.querySelector<HTMLButtonElement>(".cv-send")!
      expect(send.type).toBe("button")
      expect(send.getAttribute("aria-label")).toBe("Interrupt")
      expect(send.classList.contains("is-working")).toBe(true)
      expect(send.disabled).toBe(false)
      send.click()
      expect(onInterrupt).toHaveBeenCalledTimes(1)
    } finally {
      attached.dispose()
    }
  })

  test("un sélecteur ouvre la liste fournie et propage le choix", async () => {
    const onAgentChange = vi.fn()
    const attached = mount(() => (
      <ComposerControls
        agents={agents}
        agent="orchestrator"
        onAgentChange={onAgentChange}
        onOpenAgents={() => {}}
        models={models}
        model=""
        onModelChange={() => {}}
        onOpenModels={() => {}}
        variants={variants}
        variant=""
        onVariantChange={() => {}}
        working={false}
        canSend
        onAttach={() => {}}
        onInterrupt={() => {}}
      />
    ))
    try {
      attached.container.querySelector<HTMLButtonElement>(".cv-select-agent .pick-trigger")!.click()
      await Promise.resolve()
      const rows = [...attached.container.querySelectorAll<HTMLElement>(".cv-select-agent .pick-row")]
      expect(rows.map((row) => row.textContent)).toEqual(["orchestrator", "lean"])
      rows[1]!.click()
      expect(onAgentChange).toHaveBeenCalledWith("lean")
    } finally {
      attached.dispose()
    }
  })

  test("une pièce jointe est transmise au parent", () => {
    const onAttach = vi.fn()
    const attached = mount(() => (
      <ComposerControls
        agents={agents}
        agent=""
        onAgentChange={() => {}}
        onOpenAgents={() => {}}
        models={models}
        model=""
        onModelChange={() => {}}
        onOpenModels={() => {}}
        variants={variants}
        variant=""
        onVariantChange={() => {}}
        working={false}
        canSend={false}
        onAttach={onAttach}
        onInterrupt={() => {}}
      />
    ))
    try {
      const file = attached.container.querySelector<HTMLInputElement>('input[type="file"]')!
      file.dispatchEvent(new Event("change", { bubbles: true }))
      expect(onAttach).toHaveBeenCalledTimes(1)
    } finally {
      attached.dispose()
    }
  })
})

describe("ComposerStatusBar", () => {
  test("au repos, elle affiche les vraies valeurs et les deux gestes", () => {
    const onTagFiles = vi.fn()
    const onCommands = vi.fn()
    const attached = mount(() => (
      <ComposerStatusBar
        agent="orchestrator"
        model="DeepSeek V4.1 Flash Free"
        variant="max"
        stats={stats}
        contextLimit={1_000_000}
        working={false}
        onInterrupt={() => {}}
        onTagFiles={onTagFiles}
        onCommands={onCommands}
      />
    ))
    try {
      const text = attached.container.textContent ?? ""
      expect(text).toContain("orchestrator · DeepSeek V4.1 Flash Free · max")
      expect(text).toContain("634k / 1M (63%)")
      expect(text).toContain("52 tok/s")
      expect(text).toContain("@ tag files")
      expect(text).toContain("ctrl+p commands")
      const buttons = [...attached.container.querySelectorAll<HTMLButtonElement>(".cv-status-button")]
      buttons[0]!.click()
      buttons[1]!.click()
      expect(onTagFiles).toHaveBeenCalledTimes(1)
      expect(onCommands).toHaveBeenCalledTimes(1)
    } finally {
      attached.dispose()
    }
  })

  test("en travail, elle affiche les trois raccourcis et Interrupt est actionnable", () => {
    const onInterrupt = vi.fn()
    const attached = mount(() => (
      <ComposerStatusBar
        agent="orchestrator"
        model="DeepSeek V4.1 Flash Free"
        variant="max"
        stats={stats}
        contextLimit={1_000_000}
        working
        onInterrupt={onInterrupt}
        onTagFiles={() => {}}
        onCommands={() => {}}
      />
    ))
    try {
      const text = attached.container.textContent ?? ""
      expect(text).toContain("interrupt")
      expect(text).toContain("queue")
      expect(text).toContain("steer")
      expect(text).not.toContain("orchestrator ·")
      attached.container.querySelector<HTMLButtonElement>(".cv-status-hint")!.click()
      expect(onInterrupt).toHaveBeenCalledTimes(1)
    } finally {
      attached.dispose()
    }
  })

  test("quand la mesure manque, elle affiche un tiret plutôt qu'un zéro", () => {
    const empty: SessionStats = { ...stats, contextTokens: undefined, output: 0, durationMs: undefined }
    const attached = mount(() => (
      <ComposerStatusBar
        agent="orchestrator"
        model=""
        variant=""
        stats={empty}
        working={false}
        onInterrupt={() => {}}
        onTagFiles={() => {}}
        onCommands={() => {}}
      />
    ))
    try {
      const text = attached.container.textContent ?? ""
      expect(text).toContain("— / — (—%)")
      expect(text).toContain("— tok/s")
      expect(text).toContain("default model")
      expect(text).toContain("default variant")
    } finally {
      attached.dispose()
    }
  })
})

describe("variantes réelles", () => {
  test("le catalogue ne garde que les variantes actives, dans l'ordre de la maquette", () => {
    const catalog = modelVariantCatalog({
      providers: [
        {
          id: "opencode",
          models: {
            demo: {
              variants: {
                low: {},
                max: { reasoningEffort: "max" },
                hidden: { disabled: true },
                high: {},
                medium: {},
              },
            },
          },
        },
      ],
    })
    expect(catalog["opencode/demo"]?.map((choice) => choice.value)).toEqual(["max", "high", "medium", "low"])
    expect(preferredVariant(catalog["opencode/demo"] ?? [])).toBe("max")
    expect(preferredVariant([])).toBe("")
  })
})
