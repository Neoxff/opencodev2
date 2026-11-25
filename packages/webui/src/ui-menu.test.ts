import { describe, expect, test } from "vitest"
import {
  filterChoices,
  foldText,
  isPrimaryAgent,
  moveActive,
  orderAgents,
  orderAllAgents,
  primaryAgentsOrFallback,
} from "../public/ui/composer.js"

/** Copie exacte des 40 entrées observées sur GET /agent (port 4196). */
const GET_AGENT = [
  { name: "lean", mode: "primary", hidden: null, description: "Agent principal léger et rapide." },
  { name: "api-designer", mode: "subagent", hidden: null, description: "" },
  { name: "autonome", mode: "all", hidden: null, description: "Agent principal autonome." },
  { name: "binary-re", mode: "subagent", hidden: null, description: "" },
  { name: "build", mode: "primary", hidden: null, description: "The default agent." },
  { name: "coding-orchestrator", mode: "primary", hidden: null, description: "Workflow de codage agentic." },
  { name: "compaction", mode: "primary", hidden: true, description: "" },
  { name: "crypto-audit", mode: "subagent", hidden: null, description: "" },
  { name: "data-ai", mode: "subagent", hidden: null, description: "" },
  { name: "database", mode: "subagent", hidden: null, description: "" },
  { name: "designer", mode: "primary", hidden: null, description: "Agent principal designer." },
  { name: "devops", mode: "subagent", hidden: null, description: "" },
  { name: "docs", mode: "subagent", hidden: null, description: "" },
  { name: "duplicate-pr", mode: "primary", hidden: true, description: null },
  { name: "eval-runner", mode: "primary", hidden: true, description: "" },
  { name: "explore", mode: "subagent", hidden: null, description: "" },
  { name: "fuzzer", mode: "subagent", hidden: null, description: "" },
  { name: "general", mode: "subagent", hidden: null, description: "" },
  { name: "hacker", mode: "subagent", hidden: null, description: "" },
  { name: "migration", mode: "subagent", hidden: null, description: "" },
  { name: "mobile-dev", mode: "subagent", hidden: null, description: "" },
  { name: "network", mode: "subagent", hidden: null, description: "" },
  { name: "observability", mode: "subagent", hidden: null, description: "" },
  { name: "orchestrator", mode: "primary", hidden: null, description: "Agent orchestrateur principal." },
  { name: "osint", mode: "subagent", hidden: null, description: "" },
  { name: "pentest", mode: "subagent", hidden: null, description: "" },
  { name: "perf", mode: "subagent", hidden: null, description: "" },
  { name: "plan", mode: "primary", hidden: null, description: "Plan mode." },
  { name: "product-manager", mode: "primary", hidden: null, description: "Agent principal product manager." },
  { name: "qa-tester", mode: "subagent", hidden: null, description: "" },
  { name: "release", mode: "primary", hidden: null, description: "Produit l'APK Android." },
  { name: "researcher", mode: "subagent", hidden: null, description: "" },
  { name: "security", mode: "subagent", hidden: null, description: "" },
  { name: "security-manager", mode: "all", hidden: null, description: "Gardien de la sécurité." },
  { name: "summary", mode: "primary", hidden: true, description: "" },
  { name: "swarm", mode: "all", hidden: null, description: "Agent Swarm mode." },
  { name: "swarm-worker", mode: "subagent", hidden: null, description: "" },
  { name: "title", mode: "primary", hidden: true, description: "" },
  { name: "triage", mode: "primary", hidden: true, description: null },
  { name: "web-developer", mode: "subagent", hidden: null, description: "" },
]

const EXPECTED_11 = [
  "lean",
  "build",
  "coding-orchestrator",
  "designer",
  "orchestrator",
  "plan",
  "product-manager",
  "release",
  "autonome",
  "security-manager",
  "swarm",
]

describe("menu agent — règle primary|all et !hidden", () => {
  test("GET /agent : exactement les 11 agents principaux attendus", () => {
    const names = orderAgents(GET_AGENT).map((a) => a.name).sort()
    expect(names).toEqual([...EXPECTED_11].sort())
    expect(names).toHaveLength(11)
  })

  test("les sous-agents et les agents hidden sont exclus du menu", () => {
    const shown = orderAgents(GET_AGENT).map((a) => a.name)
    for (const hidden of ["compaction", "duplicate-pr", "eval-runner", "summary", "title", "triage"]) {
      expect(shown).not.toContain(hidden)
    }
    for (const sub of ["api-designer", "binary-re", "security", "swarm-worker"]) {
      expect(shown).not.toContain(sub)
    }
  })

  test("orchestrator reste en premier et les sous-agents restent dans /subagent", () => {
    expect(orderAgents(GET_AGENT)[0].name).toBe("orchestrator")
    const all = orderAllAgents(GET_AGENT)
    expect(all.length).toBe(34)
    expect(all.some((a) => a.name === "security" || a.name === "swarm-worker")).toBe(true)
  })

  test("isPrimaryAgent et repli si le serveur n'expose pas mode", () => {
    expect(isPrimaryAgent({ name: "autonome", mode: "all", hidden: null })).toBe(true)
    expect(isPrimaryAgent({ name: "security", mode: "subagent", hidden: null })).toBe(false)
    expect(isPrimaryAgent({ name: "compaction", mode: "primary", hidden: true })).toBe(false)
    const noMode = [{ name: "lean", description: "", hidden: false }, { name: "build", description: "", hidden: false }]
    expect(primaryAgentsOrFallback(noMode).map((a) => a.name)).toEqual(["lean", "build"])
  })
})

describe("recherche des menus agent / modèle / variante et slash", () => {
  const agents30 = [
    ...EXPECTED_11.map((name, i) => [name, `Description ${i} ${name}`]),
    ...Array.from({ length: 19 }, (_, i) => [`sub-${i}`, `Sous-agent ${i}`]),
  ]

  test("30 agents : recherche « lea » ramène lean (et release, sous-chaîne)", () => {
    const found = filterChoices(agents30, "lea").map((x) => x[0])
    expect(found).toContain("lean")
    // « lea » est aussi sous-chaîne de « release » : le filtre nom+description est intentionnellement large.
    expect(found).toContain("release")
    expect(found).not.toContain("build")
  })

  test("recherche sans résultat renvoie une liste vide", () => {
    expect(filterChoices(agents30, "zzzzz")).toEqual([])
  })

  test("recherche insensible casse et accents sur nom ET description", () => {
    expect(filterChoices([["Équipe", "agent principal"]], "equipe").length).toBe(1)
    expect(filterChoices([["swarm", "Orchestrateur ÉQUIPE"]], "equipe").length).toBe(1)
    expect(foldText("Éléphant")).toBe("elephant")
  })

  test("navigation clavier : bas, haut, bouclage", () => {
    expect(moveActive("ArrowDown", 0, 3)).toBe(1)
    expect(moveActive("ArrowUp", 0, 3)).toBe(2)
    expect(moveActive("ArrowDown", 2, 3)).toBe(0)
  })

  test("menu '/' : 44+ entrées filtrées par « git », MCP et skills inclus", () => {
    type Cmd = { n: string; d: string; k: string | null; tag?: string }
    const CMD: Cmd[] = Array.from({ length: 46 }, (_, i) => ({ n: `cmd-${i}`, d: `description ${i}`, k: null }))
    CMD[7] = { n: "git-status", d: "Voir l'état du dépôt", k: "git" }
    CMD[20] = { n: "gh-review", d: "Revue de PR", k: "revue", tag: "mcp" }
    CMD[33] = { n: "skill-gitflow", d: "Skill git flow", k: "skill", tag: "skill" }
    expect(CMD.length).toBeGreaterThan(44)
    const git = filterChoices(CMD, "git")
    expect(git.map((x) => x.n)).toEqual(["git-status", "skill-gitflow"])
    expect(git.some((x) => x.tag === "mcp" || x.tag === "skill")).toBe(true)
  })
})
