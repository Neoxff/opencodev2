import { describe, expect, test } from "vitest"
import {
  COMMAND_IDS,
  THEMES,
  commandMeta,
  buildView,
  filterRows,
  trapKey,
  type CommandData,
} from "./ui-commands"
import {
  choiceRows,
  diffFiles,
  mcpRows,
  providerRows,
  sessionRows,
  skillRows,
  subagentRows,
  timelineRows,
  variantRows,
  variantsForModel,
} from "./ui-commands-data"

/**
 * Les fixtures ci-dessous ne sont PAS des données de démonstration : ce sont des extraits des
 * payloads réellement servis par `http://127.0.0.1:4096` (agents, modèles, MCP, skills, sessions),
 * réduits au champ que chaque projection lit. Les tests vérifient le branchement, pas l'invention.
 */
const MODELS = [
  { value: "opencode/go-claude", label: "Claude 4", group: "OpenCode" },
  { value: "opencode-go/deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash", group: "OpenCode Go" },
]
const AGENTS = [
  { value: "build", label: "build" },
  { value: "orchestrator", label: "orchestrator" },
]

const data = (over: Partial<CommandData> = {}): CommandData => ({
  agents: choiceRows(AGENTS, "build"),
  models: choiceRows(MODELS, ""),
  variants: variantRows(["low", "medium", "high"], "medium"),
  themes: THEMES,
  decisionModel: "opencode/go-claude",
  visionModel: "opencode-go/deepseek-v4.1-flash",
  sessions: sessionRows([{ id: "ses_1", title: "Correctif dépôt divergent", directory: "/home/joachim/opencodev2web" }], "ses_1"),
  skills: skillRows([{ name: "humanizer", description: "Humanize AI text" }]),
  subagents: subagentRows([
    { name: "plan", mode: "subagent", description: "Lecture seule, enquête et plan" },
    { name: "build", mode: "primary" },
  ]),
  providers: providerRows({ anthropic: [{ type: "api" }], openai: [{ type: "api" }] }),
  mcps: mcpRows({
    github: { status: "connected" },
    puppeteer: { status: "disabled" },
    context7: { status: "failed", error: "timeout" },
  }),
  status: [["Version", "2.4.31"]],
  help: [["ctrl+p", "command palette"]],
  timeline: timelineRows([{ value: "0", label: "Corrige le dépôt", detail: "#1" }]),
  diff: diffFiles([{ file: "packages/webui/src/git-panel.tsx", patch: "@@ -1 +1 @@\n-old\n+new", additions: 1, deletions: 1 }]),
  thinking: false,
  timestamps: false,
  theme: "",
  configText: "opencode.jsonc",
  logs: ["12:03:41 mcp github connected"],
  ...over,
})

describe("registre des commandes", () => {
  test("les 19 commandes de la maquette sont enregistrées", () => {
    expect(COMMAND_IDS).toHaveLength(19)
    for (const id of COMMAND_IDS) expect(commandMeta[id].name).toBe(`/${id}`)
  })
})

describe("une commande = un test", () => {
  test("/agents — liste des agents réels", () => {
    const view = buildView("agents", data())
    expect(view.kind).toBe("list")
    expect((view as { rows: Array<{ value: string }> }).rows.map((r) => r.value)).toEqual(["build", "orchestrator"])
  })

  test("/models — liste des modèles réels", () => {
    const view = buildView("models", data())
    expect((view as { rows: Array<{ value: string }> }).rows.map((r) => r.value)).toEqual(MODELS.map((m) => m.value))
  })

  test("/variants — variantes réelles du modèle courant", () => {
    const payload = { providers: [{ id: "opencode", models: { "go-claude": { variants: { high: {}, low: {} } } } }] }
    expect(variantsForModel(payload, "opencode/go-claude")).toEqual(["high", "low"])
    expect(variantsForModel(payload, "")).toEqual([])
    const view = buildView("variants", data())
    expect((view as { rows: Array<{ label: string }> }).rows.map((r) => r.label)).toEqual(["low", "medium", "high"])
  })

  test("/decision-model — le modèle courant est marqué", () => {
    const view = buildView("decision-model", data())
    const rows = (view as { rows: Array<{ value: string; current?: boolean }> }).rows
    expect(rows.find((r) => r.value === "opencode/go-claude")?.current).toBe(true)
  })

  test("/vision-model — le modèle de vision courant est marqué", () => {
    const view = buildView("vision-model", data())
    const rows = (view as { rows: Array<{ value: string; current?: boolean }> }).rows
    expect(rows.find((r) => r.value === "opencode-go/deepseek-v4.1-flash")?.current).toBe(true)
  })

  test("/themes — trois thèmes noirs uniquement", () => {
    const view = buildView("themes", data())
    const rows = (view as { rows: Array<{ value: string; label: string }> }).rows
    expect(rows.map((r) => r.value)).toEqual(["", "contrast", "warm"])
    expect(rows.some((r) => /clair|light/i.test(r.label))).toBe(false)
  })

  test("/thinking — interrupteur reflétant l'état réel", () => {
    const off = buildView("thinking", data()) as { rows: Array<{ on: boolean }> }
    const on = buildView("thinking", data({ thinking: true })) as { rows: Array<{ on: boolean }> }
    expect(off.rows[0].on).toBe(false)
    expect(on.rows[0].on).toBe(true)
  })

  test("/timestamps — interrupteur reflétant l'état réel", () => {
    const on = buildView("timestamps", data({ timestamps: true })) as { rows: Array<{ on: boolean }> }
    expect(on.rows[0].on).toBe(true)
  })

  test("/timeline — saut aux prompts réels de la session", () => {
    const view = buildView("timeline", data()) as { rows: Array<{ value: string; label: string }> }
    expect(view.rows[0].value).toBe("0")
    expect(view.rows[0].label).toBe("Corrige le dépôt")
  })

  test("/sessions — sessions réelles, courante marquée", () => {
    const view = buildView("sessions", data()) as { rows: Array<{ current?: boolean; label: string }> }
    expect(view.rows[0].label).toBe("Correctif dépôt divergent")
    expect(view.rows[0].current).toBe(true)
  })

  test("/status — version réelle du serveur", () => {
    const view = buildView("status", data()) as { pairs: Array<readonly [string, string]> }
    expect(view.pairs[0]).toEqual(["Version", "2.4.31"])
  })

  test("/help — raccourcis clavier réels", () => {
    const view = buildView("help", data()) as { keys: Array<readonly [string, string]> }
    expect(view.keys.some(([key]) => key === "ctrl+p")).toBe(true)
  })

  test("/skills — skills réels du serveur", () => {
    const view = buildView("skills", data()) as { rows: Array<{ value: string }> }
    expect(view.rows[0].value).toBe("humanizer")
  })

  test("/subagent — seuls les agents mode=subagent", () => {
    const view = buildView("subagent", data()) as { rows: Array<{ value: string }> }
    expect(view.rows.map((r) => r.value)).toEqual(["plan"])
  })

  test("/connect — fournisseurs réels de /provider/auth", () => {
    const view = buildView("connect", data()) as { rows: Array<{ value: string }> }
    expect(view.rows.map((r) => r.value)).toEqual(["anthropic", "openai"])
  })

  test("/config — aperçu du fichier de configuration", () => {
    const view = buildView("config", data()) as { pairs: Array<readonly [string, string]> }
    expect(view.pairs[0][1]).toContain("opencode.jsonc")
  })

  test("/logs — événements réellement reçus", () => {
    const view = buildView("logs", data()) as { pairs: Array<readonly [string, string]> }
    expect(view.pairs[0][1]).toContain("github connected")
  })

  test("/diff — visionneuse des fichiers modifiés", () => {
    const view = buildView("diff", data()) as { files: Array<{ name: string; lines: Array<{ kind: string }> }> }
    expect(view.files[0].name).toContain("git-panel.tsx")
    expect(view.files[0].lines.map((l) => l.kind)).toContain("add")
  })

  test("/mcps — statuts réels connecté/désactivé/échec", () => {
    const view = buildView("mcps", data()) as { rows: Array<{ value: string; tone: string }> }
    expect(view.rows.map((r) => [r.value, r.tone])).toEqual([
      ["context7", "bad"], ["github", "ok"], ["puppeteer", "off"],
    ])
  })
})

describe("clavier des dialogues", () => {
  test("le filtre porte sur le libellé et le détail", () => {
    const rows = [
      { value: "1", label: "Claude 4", detail: "OpenCode" },
      { value: "2", label: "DeepSeek", detail: "OpenCode Go" },
    ]
    expect(filterRows(rows, "opencode").map((r) => r.value)).toEqual(["1", "2"])
    expect(filterRows(rows, "deepseek").map((r) => r.value)).toEqual(["2"])
  })

  test("Tab au premier élément avec Shift ramène au dernier", () => {
    expect(trapKey("Tab", true, 0, 3)).toBe("last")
    expect(trapKey("Tab", false, 2, 3)).toBe("first")
    expect(trapKey("Tab", false, 1, 3)).toBeUndefined()
    expect(trapKey("ArrowDown", false, 0, 3)).toBeUndefined()
  })
})

describe("sécurité des projections", () => {
  test("aucune clé d'API ne survit à la projection des variantes", () => {
    const payload = {
      providers: [{
        id: "opencode",
        models: { "go-claude": { name: "Claude 4", variants: { high: {} }, apiKey: "sk-secret" } },
        apiKey: "sk-provider-secret",
      }],
    }
    expect(JSON.stringify(variantsForModel(payload, "opencode/go-claude"))).not.toContain("sk-")
    expect(JSON.stringify(skillRows([{ name: "humanizer", apiKey: "sk-secret" } as never]))).not.toContain("sk-")
  })
})
