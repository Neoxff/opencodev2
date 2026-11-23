import { describe, expect, test } from "vitest"
import {
  abortSession,
  buildPromptPayload,
  buttonAction,
  keyboardDecision,
  loadComposerConfig,
  loadSessionState,
  orderAgents,
  sanitizeModels,
  selectionFromSession,
  sendPrompt,
  sessionMetrics,
  steerSupported,
  statusParts,
  submitMode,
  variantsFor,
} from "../public/ui/composer.js"

function fakeFetch(routes: Record<string, unknown>) {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const path = typeof input === "string" ? input : String(input)
    const body = routes[path]
    if (body === undefined) return { ok: false, status: 404, json: async () => ({}) } as Response
    return { ok: true, status: 200, json: async () => body } as Response
  }) as unknown as typeof fetch
}

const RECORDED_AGENTS = [
  { name: "lean", description: "Budgets et mesures", mode: "primary", hidden: false },
  { name: "orchestrator", description: "Coordonne les autres agents", mode: "primary", hidden: false },
  { name: "build", description: "Écrit le code", mode: "primary", hidden: false },
  { name: "secret-agent", description: "Masqué", mode: "primary", hidden: true },
]

const RECORDED_PROVIDERS = {
  connected: ["opencode"],
  all: [
    {
      id: "opencode",
      name: "OpenCode",
      key: "ne-pas-exposer",
      options: { apiKey: "ne-pas-exposer" },
      models: {
        "hy4-flash-free": {
          id: "hy4-flash-free",
          providerID: "opencode",
          name: "Hy4 flash Free",
          limit: { context: 1_048_576, output: 65_536 },
          variants: { low: {}, medium: {}, high: {} },
          status: "active",
          options: { apiKey: "ne-pas-exposer" },
        },
      },
    },
    {
      id: "autre",
      name: "Autre",
      options: {},
      models: { "model-a": { id: "model-a", providerID: "autre", name: "A", variants: {}, limit: { context: 1000 } } },
    },
  ],
}

const RECORDED_DOC = {
  components: { schemas: { TextPartInput: { properties: { metadata: { type: "object" } } } } },
}

describe("ui composeur — agents, modèles et variantes réels", () => {
  test("orderAgents met orchestrator en premier et cache les agents masqués", () => {
    const agents = orderAgents(RECORDED_AGENTS)
    expect(agents.map((agent) => agent.name)).toEqual(["orchestrator", "lean", "build"])
    expect(agents[0].description).toBe("Coordonne les autres agents")
  })

  test("sanitizeModels garde les modèles connectés et écarte les secrets", () => {
    const models = sanitizeModels(RECORDED_PROVIDERS)
    expect(models.map((model) => model.id)).toEqual(["hy4-flash-free"])
    expect(models[0]).toMatchObject({
      providerID: "opencode",
      name: "Hy4 flash Free",
      variants: ["low", "medium", "high"],
      limit: { context: 1_048_576, output: 65_536 },
    })
    expect(JSON.stringify(models)).not.toContain("ne-pas-exposer")
    expect(JSON.stringify(models)).not.toContain("apiKey")
  })

  test("variantsFor et selectionFromSession suivent la session réelle", () => {
    const models = sanitizeModels(RECORDED_PROVIDERS)
    const agents = orderAgents(RECORDED_AGENTS)
    expect(variantsFor(models, "hy4-flash-free")).toEqual(["low", "medium", "high"])
    expect(variantsFor(models, "inconnu")).toEqual(["default"])
    expect(selectionFromSession(models, agents, null)).toMatchObject({
      agent: "orchestrator",
      modelID: "hy4-flash-free",
      providerID: "opencode",
      variant: "low",
    })
    expect(
      selectionFromSession(models, agents, {
        agent: "lean",
        model: { id: "hy4-flash-free", providerID: "opencode", variant: "high" },
      }),
    ).toMatchObject({ agent: "lean", variant: "high" })
  })

  test("buildPromptPayload envoie agent, modèle, variante et steer uniquement si demandé", () => {
    const selection = {
      agent: "orchestrator",
      modelID: "hy4-flash-free",
      providerID: "opencode",
      modelName: "Hy4 flash Free",
      variant: "high",
    }
    expect(buildPromptPayload("bonjour", selection)).toEqual({
      agent: "orchestrator",
      model: { providerID: "opencode", modelID: "hy4-flash-free" },
      variant: "high",
      parts: [{ type: "text", text: "bonjour" }],
    })
    expect(buildPromptPayload("bonjour", selection, "steer").parts[0]).toMatchObject({
      metadata: { steer: true },
    })
  })
})

describe("ui composeur — clavier", () => {
  test("submitMode : Enter envoie au repos, file pendant le travail", () => {
    expect(submitMode({ key: "Enter", running: false })).toBe("send")
    expect(submitMode({ key: "Enter", running: true })).toBe("queue")
  })

  test("submitMode : alt+s steer seulement si le serveur le permet", () => {
    expect(submitMode({ key: "s", altKey: true, running: true, canSteer: true })).toBe("steer")
    expect(submitMode({ key: "s", altKey: true, running: true, canSteer: false })).toBe("unsupported")
    expect(submitMode({ key: "s", altKey: true, running: false, canSteer: true })).toBe("send")
  })

  test("submitMode : Escape interrompt seulement pendant le travail", () => {
    expect(submitMode({ key: "Escape", running: true })).toBe("interrupt")
    expect(submitMode({ key: "Escape", running: false })).toBe("ignore")
  })

  test("keyboardDecision traduit un KeyboardEvent-like", () => {
    expect(keyboardDecision({ key: "Enter" }, { running: true })).toBe("queue")
    expect(keyboardDecision({ key: "s", altKey: true }, { running: true, canSteer: false })).toBe("unsupported")
    expect(keyboardDecision({ key: "Escape" }, { running: true })).toBe("interrupt")
    expect(keyboardDecision({ key: "a" }, { running: true })).toBe("ignore")
  })

  test("buttonAction : flèche au repos, carré pour interrompre", () => {
    expect(buttonAction(false)).toBe("send")
    expect(buttonAction(true)).toBe("interrupt")
  })

  test("steerSupported exige metadata et une version serveur récente", () => {
    expect(steerSupported(RECORDED_DOC, { version: "2.4.31" })).toBe(true)
    expect(steerSupported(RECORDED_DOC, { healthy: true, version: "local" })).toBe(true)
    expect(steerSupported(RECORDED_DOC, { version: "2.3.0" })).toBe(false)
    expect(steerSupported({}, { version: "2.4.31" })).toBe(false)
  })
})

describe("ui composeur — barre d'état et HTTP", () => {
  test("sessionMetrics et statusParts affichent jetons, limite et tok/s réels", () => {
    const messages = [
      {
        info: { role: "user" },
        parts: [{ type: "text", text: "bonjour", time: { start: 1000, end: 1010 } }],
      },
      {
        info: {
          role: "assistant",
          tokens: { input: 100, output: 82, reasoning: 682, cache: { read: 0, write: 0 } },
        },
        parts: [
          { type: "reasoning", text: "raisonnement", time: { start: 2000, end: 2100 } },
          { type: "text", text: "réponse", time: { start: 2200, end: 3600 } },
          { type: "tool", time: { start: 3800, end: 4000 } },
        ],
      },
    ]
    const model = { id: "hy4-flash-free", limit: { context: 1_048_576 } }
    const metrics = sessionMetrics({ tokens: { input: 100, output: 82, reasoning: 682 } }, messages, model)
    expect(metrics.used).toBe(864)
    expect(metrics.limit).toBe(1_048_576)
    expect(metrics.tps).toBeCloseTo(764 / 1.7, 1)
    const parts = statusParts(metrics, {
      agent: "orchestrator",
      modelID: "hy4-flash-free",
      providerID: "opencode",
      modelName: "Hy4 flash Free",
      variant: "medium",
    })
    expect(parts.agent).toBe("orchestrator")
    expect(parts.model).toBe("Hy4 flash Free")
    expect(parts.variant).toBe("medium")
    expect(parts.tokens).toContain("1.0M")
  })

  test("loadComposerConfig lit les routes réelles sans exposer les secrets", async () => {
    const calls: string[] = []
    const base = fakeFetch({
      "/agent": RECORDED_AGENTS,
      "/provider": RECORDED_PROVIDERS,
      "/global/health": { healthy: true, version: "2.4.31" },
      "/doc": RECORDED_DOC,
    })
    const wrapped = ((input: string | URL | Request) => {
      calls.push(String(input))
      return base(input)
    }) as typeof fetch
    const config = await loadComposerConfig(wrapped)
    expect(calls).toEqual(["/agent", "/provider", "/global/health", "/doc"])
    expect(config.agents[0].name).toBe("orchestrator")
    expect(config.models[0].id).toBe("hy4-flash-free")
    expect(config.canSteer).toBe(true)
    expect(JSON.stringify(config)).not.toContain("ne-pas-exposer")
  })

  test("loadSessionState lit session, messages et statut", async () => {
    const fetchImpl = fakeFetch({
      "/session/s1": { id: "s1", agent: "lean", model: { id: "hy4-flash-free", variant: "medium" } },
      "/session/s1/message": [{ info: { role: "user" }, parts: [{ type: "text", text: "salut" }] }],
      "/session/status": { s1: { type: "busy" } },
    })
    const loaded = await loadSessionState("s1", fetchImpl)
    expect(loaded.session).toMatchObject({ id: "s1", agent: "lean" })
    expect(loaded.messages).toHaveLength(1)
    expect(loaded.busy).toBe(true)
  })

  test("sendPrompt et abortSession appellent les routes avec le bon verbe", async () => {
    const calls: Array<[string, RequestInit | undefined]> = []
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push([String(input), init])
      return { ok: true, status: 204, json: async () => ({}) } as Response
    }) as unknown as typeof fetch
    await sendPrompt("s1", { parts: [{ type: "text", text: "x" }] }, fetchImpl)
    await abortSession("s1", fetchImpl)
    expect(calls.map(([path]) => path)).toEqual([
      "/session/s1/prompt_async",
      "/session/s1/abort",
    ])
    expect(calls[0][1]?.method).toBe("POST")
    expect(calls[0][1]?.body).toContain("parts")
    expect(calls[1][1]?.method).toBe("POST")
  })
})
