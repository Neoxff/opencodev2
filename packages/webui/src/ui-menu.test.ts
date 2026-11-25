import { describe, expect, test } from "vitest"
import {
  defaultModelId,
  filterChoices,
  foldText,
  isChatModel,
  isPrimaryAgent,
  moveActive,
  orderAgents,
  orderAllAgents,
  orderModels,
  primaryAgentsOrFallback,
  sanitizeModels,
  selectionFromSession,
} from "../public/ui/composer.js"

/** Copie des 40 entrées observées sur GET /agent (port 4196). */
const GET_AGENT = [
  ["lean", "primary", false],
  ["api-designer", "subagent", false],
  ["autonome", "all", false],
  ["binary-re", "subagent", false],
  ["build", "primary", false],
  ["coding-orchestrator", "primary", false],
  ["compaction", "primary", true],
  ["crypto-audit", "subagent", false],
  ["data-ai", "subagent", false],
  ["database", "subagent", false],
  ["designer", "primary", false],
  ["devops", "subagent", false],
  ["docs", "subagent", false],
  ["duplicate-pr", "primary", true],
  ["eval-runner", "primary", true],
  ["explore", "subagent", false],
  ["fuzzer", "subagent", false],
  ["general", "subagent", false],
  ["hacker", "subagent", false],
  ["migration", "subagent", false],
  ["mobile-dev", "subagent", false],
  ["network", "subagent", false],
  ["observability", "subagent", false],
  ["orchestrator", "primary", false],
  ["osint", "subagent", false],
  ["pentest", "subagent", false],
  ["perf", "subagent", false],
  ["plan", "primary", false],
  ["product-manager", "primary", false],
  ["qa-tester", "subagent", false],
  ["release", "primary", false],
  ["researcher", "subagent", false],
  ["security", "subagent", false],
  ["security-manager", "all", false],
  ["summary", "primary", true],
  ["swarm", "all", false],
  ["swarm-worker", "subagent", false],
  ["title", "primary", true],
  ["triage", "primary", true],
  ["web-developer", "subagent", false],
].map(([name, mode, hidden]) => ({ name, mode, hidden, description: `${name} description` }))

const EXPECTED_11 = [
  "lean", "build", "coding-orchestrator", "designer", "orchestrator", "plan",
  "product-manager", "release", "autonome", "security-manager", "swarm",
]

describe("agents — règle primary|all et !hidden", () => {
  test("exactement les 11 agents attendus", () => {
    const names = orderAgents(GET_AGENT).map((a) => a.name).sort()
    expect(names).toEqual([...EXPECTED_11].sort())
    expect(names).toHaveLength(11)
  })

  test("sous-agents et hidden exclus du menu, gardés dans /subagent", () => {
    const shown = orderAgents(GET_AGENT).map((a) => a.name)
    for (const x of ["compaction", "duplicate-pr", "eval-runner", "summary", "title", "triage"]) expect(shown).not.toContain(x)
    for (const x of ["api-designer", "security", "swarm-worker"]) expect(shown).not.toContain(x)
    expect(orderAllAgents(GET_AGENT)).toHaveLength(34)
    expect(orderAllAgents(GET_AGENT).some((a) => a.name === "security")).toBe(true)
  })

  test("orchestrator premier, repli si pas de mode", () => {
    expect(orderAgents(GET_AGENT)[0].name).toBe("orchestrator")
    expect(isPrimaryAgent({ name: "autonome", mode: "all", hidden: false })).toBe(true)
    expect(isPrimaryAgent({ name: "security", mode: "subagent", hidden: false })).toBe(false)
    expect(primaryAgentsOrFallback([{ name: "lean", description: "", hidden: false }]).map((a) => a.name)).toEqual(["lean"])
  })
})

describe("recherche menus agent / modèle / variante et slash", () => {
  const agents30 = [
    ...EXPECTED_11.map((name, i) => [name, `Description ${i} ${name}`]),
    ...Array.from({ length: 19 }, (_, i) => [`sub-${i}`, `Sous-agent ${i}`]),
  ] as Array<[string, string]>

  test("30 agents : recherche 'lea' ramène lean", () => {
    const found = filterChoices(agents30, "lea").map((x) => x[0])
    expect(found).toContain("lean")
    expect(found).not.toContain("build")
  })

  test("sans résultat, casse/accents, navigation clavier", () => {
    expect(filterChoices(agents30, "zzzzz")).toEqual([])
    expect(filterChoices([["Équipe", "agent"]], "equipe")).toHaveLength(1)
    expect(foldText("Éléphant")).toBe("elephant")
    expect(moveActive("ArrowDown", 0, 3)).toBe(1)
    expect(moveActive("ArrowUp", 0, 3)).toBe(2)
  })

  test("menu '/' : 46 commandes filtrées par git, skills/MCP inclus", () => {
    type Cmd = { n: string; d: string; tag?: string }
    const CMD: Cmd[] = Array.from({ length: 46 }, (_, i) => ({ n: `cmd-${i}`, d: `description ${i}` }))
    CMD[7] = { n: "git-status", d: "Voir l'état du dépôt" }
    CMD[20] = { n: "gh-review", d: "Revue git de PR", tag: "mcp" }
    CMD[33] = { n: "skill-gitflow", d: "Skill git flow", tag: "skill" }
    const git = filterChoices(CMD, "git")
    expect(git.map((x) => x.n)).toEqual(["git-status", "gh-review", "skill-gitflow"])
  })
})

describe("modèles — opencode premier, défaut opencode, exclusion non-chat", () => {
  const chat = { capabilities: { toolcall: true, output: { text: true } } }
  const makeProviders = () => {
    const ids = ["opencode", "cedarllm", "nvidia", "fal-ai", "ai21", "morph", "qiniu-ai", "bailling"]
    const all = ids.map((id) => ({ id, models: {} as Record<string, unknown> }))
    for (let i = 0; i < 200; i++) {
      const p = all[i % 8]
      const id = `m${i}`
      p.models[id] = {
        name: `Model ${i}`,
        variants: { default: {} },
        limit: { context: 1000 },
        status: "active",
        capabilities: i === 199
          ? { toolcall: false, output: { text: false, audio: true } } // TTS
          : chat.capabilities,
      }
    }
    all[2].models["nvidia/magpie-tts-zeroshot"] = {
      name: "Magpie TTS",
      variants: {},
      capabilities: { toolcall: false, output: { text: false, audio: true } },
    }
    return { all, connected: ids }
  }

  test("200 modèles / 8 fournisseurs : opencode premier puis groupés, TTS exclus", () => {
    const models = orderModels(sanitizeModels(makeProviders()))
    expect(models.length).toBe(199)
    expect(models[0].providerID).toBe("opencode")
    const groups = [...new Set(models.map((m) => m.providerID))]
    expect(groups[0]).toBe("opencode")
    expect(models.some((m) => m.id.includes("magpie"))).toBe(false)
    expect(models.some((m) => m.id === "m199")).toBe(false)
  })

  test("défaut opencode : dernier utilisé sinon premier modèle de chat", () => {
    const models = orderModels(sanitizeModels(makeProviders()))
    const firstOpencode = models.find((m) => m.providerID === "opencode")!
    expect(defaultModelId(models, null)).toBe(firstOpencode.id)
    const other = models.find((m) => m.providerID !== "opencode")!
    expect(defaultModelId(models, other.id)).toBe(firstOpencode.id)
    const usedOpencode = models.filter((m) => m.providerID === "opencode")[2]
    expect(defaultModelId(models, usedOpencode.id)).toBe(usedOpencode.id)
  })

  test("selectionFromSession ne choisit jamais nvidia/magpie-tts-zeroshot", () => {
    const models = orderModels(sanitizeModels(makeProviders()))
    const sel = selectionFromSession(models, orderAgents(GET_AGENT), { model: { id: "nvidia/magpie-tts-zeroshot" } })
    expect(sel.modelID).not.toContain("magpie")
    expect(models.find((m) => m.id === sel.modelID)?.providerID).toBe("opencode")
  })

  test("isChatModel : règle prudente si capabilities absentes", () => {
    expect(isChatModel({ id: "lean-chat", name: "Lean", capabilities: chat.capabilities })).toBe(true)
    expect(isChatModel({ id: "tts", name: "Speech", capabilities: { toolcall: false, output: { text: false } } })).toBe(false)
    expect(isChatModel({ id: "nvidia/magpie-tts-zeroshot", name: "Magpie" })).toBe(false)
    expect(isChatModel({ id: "plain-chat", name: "Plain" })).toBe(true)
  })
})
