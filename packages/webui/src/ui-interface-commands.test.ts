import { describe, expect, test } from "vitest"
import {
  commandConfigPatch,
  configPairs,
  decisionRows,
  diffFiles,
  HELP_KEYS,
  loadAgents,
  loadConfig,
  loadDecisionModels,
  loadDiff,
  loadLogView,
  loadMcpStatus,
  loadModels,
  loadProviders,
  loadSessions,
  loadSkills,
  loadStatus,
  loadSubagents,
  loadTimeline,
  loadVariants,
  loadVisionModels,
  mcpRows,
  providerOauthUrl,
  providerRows,
  readViewState,
  statusPairs,
  themeValue,
  timelineRows,
  toggleMcp,
  VIEW_STATE_KEYS,
  writeDecisionModel,
  writeModelConfig,
  writeViewState,
  writeVisionModel,
} from "../public/ui/interface-commands.js"

type Call = { url: string; method?: string; body?: string | null }
const jsonResponse = (body: unknown, ok = true, status = 200) =>
  ({ ok, status, json: async () => body }) as unknown as Response

function recorder(routes: Record<string, unknown>, fail: string[] = []) {
  const calls: Call[] = []
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, method: init?.method, body: (init?.body as string | null) ?? null })
    if (fail.includes(url)) return jsonResponse({}, false, 500)
    if (Object.prototype.hasOwnProperty.call(routes, url)) return jsonResponse(routes[url])
    if (url.includes("/oauth/authorize")) return jsonResponse({ url: "https://auth.example.test/authorize" })
    if (url.startsWith("/mcp/")) return jsonResponse({})
    return jsonResponse({}, false, 404)
  }) as unknown as typeof fetch
  return { fetchImpl, calls }
}

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => (data.has(key) ? (data.get(key) as string) : null),
    setItem: (key: string, value: string) => void data.set(key, value),
    data,
  }
}

describe("interface — 19 commandes hors DEMO", () => {
  test("/agents — GET /agent, lignes réelles et échec serveur", async () => {
    const ok = recorder({ "/agent": [{ name: "build", mode: "primary", description: "Écrit le code" }, { name: "plan", mode: "subagent" }] })
    const rows = await loadAgents(ok.fetchImpl)
    expect(ok.calls).toEqual([{ url: "/agent", method: undefined, body: null }])
    expect(rows.map((r) => r.value)).toEqual(["build"])
    expect(rows[0].detail).toBe("Écrit le code")
    const bad = recorder({}, ["/agent"])
    await expect(loadAgents(bad.fetchImpl)).rejects.toThrow("/agent -> HTTP 500")
  })

  test("/models — GET /provider, identifiants provider/model", async () => {
    const { fetchImpl, calls } = recorder({
      "/provider": { all: [{ id: "opencode", name: "OpenCode", models: { alpha: { name: "Alpha" }, beta: {} } }] },
    })
    const rows = await loadModels(fetchImpl)
    expect(calls.map((c) => c.url)).toEqual(["/provider"])
    expect(rows.map((r) => r.value)).toEqual(["opencode/alpha", "opencode/beta"])
    expect(rows[0].detail).toBe("Alpha")
  })

  test("/variants — GET /provider et variantes réelles du modèle", async () => {
    const payload = {
      all: [{ id: "opencode", models: { alpha: { variants: { low: {}, high: {} } } } }],
    }
    const { fetchImpl, calls } = recorder({ "/provider": payload })
    const rows = await loadVariants("opencode/alpha", fetchImpl)
    expect(calls.map((c) => c.url)).toEqual(["/provider"])
    expect(rows.map((r) => r.value)).toEqual(["high", "low"])
    expect(rows[1].current).toBe(false)
  })

  test("/decision-model — GET /global/jev/models + écriture sûre de jev.decision_model", async () => {
    const { fetchImpl, calls } = recorder({
      "/global/jev/models": { provider: "openjev", models: [{ id: "openjev-latest", name: "System One" }] },
      "/config": { jev: { decision_model: "opencode/alpha" } },
    })
    const loaded = await loadDecisionModels(fetchImpl)
    expect(calls.map((c) => c.url)).toEqual(["/global/jev/models", "/config"])
    expect(loaded.current).toBe("opencode/alpha")
    expect(decisionRows(loaded.catalog)[0].label).toBe("openjev-latest")
    expect(decisionRows(loaded.catalog)[0].detail).toContain("lecture seule")
    await writeDecisionModel("opencode/beta", fetchImpl)
    expect(calls[2]).toMatchObject({ url: "/config", method: "PATCH" })
    expect(JSON.parse(calls[2].body as string)).toEqual({ jev: { decision_model: "opencode/beta" } })
  })

  test("/vision-model — champ documenté attachment.image.vision_model, pas small_model", async () => {
    const { fetchImpl, calls } = recorder({
      "/provider": { all: [{ id: "opencode", models: { alpha: {} } }] },
      "/config": { attachment: { image: { vision_model: "opencode/alpha" } }, small_model: "opencode/small" },
    })
    const loaded = await loadVisionModels(fetchImpl)
    expect(calls.map((c) => c.url)).toEqual(["/provider", "/config"])
    expect(loaded.current).toBe("opencode/alpha")
    await writeVisionModel("opencode/beta", fetchImpl)
    const patch = JSON.parse(calls[2].body as string)
    expect(patch).toEqual({ attachment: { image: { vision_model: "opencode/beta" } } })
    expect(JSON.stringify(patch)).not.toContain("small_model")
  })

  test("/themes — état de vue noir persistant sans DOM", () => {
    expect(themeValue("Noir contraste élevé")).toBe("contrast")
    expect(themeValue("Noir chaud")).toBe("warm")
    expect(themeValue("Noir pur")).toBe("")
    const storage = memoryStorage()
    writeViewState(storage, "theme", "warm")
    expect(readViewState(storage, "theme", "")).toBe("warm")
    expect(storage.data.get(VIEW_STATE_KEYS.theme)).toBe("warm")
  })

  test("/thinking — bascule persistée en localStorage", () => {
    const storage = memoryStorage()
    expect(readViewState(storage, "thinking", false)).toBe(false)
    writeViewState(storage, "thinking", true)
    expect(readViewState(storage, "thinking", false)).toBe(true)
    expect(storage.data.get("oc2.thinking")).toBe("1")
    writeViewState(storage, "thinking", false)
    expect(storage.data.get("oc2.thinking")).toBe("0")
  })

  test("/timestamps — clé distincte de /thinking", () => {
    const storage = memoryStorage()
    writeViewState(storage, "timestamps", true)
    expect(readViewState(storage, "timestamps", false)).toBe(true)
    expect(readViewState(storage, "thinking", false)).toBe(false)
    expect(VIEW_STATE_KEYS.timestamps).not.toBe(VIEW_STATE_KEYS.thinking)
  })

  test("/timeline — GET /session/:id/message, prompts réels seulement", async () => {
    const messages = [
      { info: { role: "user" }, parts: [{ type: "text", text: "premier prompt" }] },
      { info: { role: "assistant" }, parts: [{ type: "text", text: "réponse" }] },
      { info: { role: "user" }, parts: [{ type: "text", text: "ignoré", ignored: true }] },
    ]
    const { fetchImpl, calls } = recorder({
      "/session/s1/message": messages,
      "/session/s%201/message": messages,
    })
    const rows = await loadTimeline("s 1", fetchImpl)
    expect(calls.map((c) => c.url)).toEqual(["/session/s%201/message"])
    expect(rows).toEqual([{ value: "0", label: "premier prompt", detail: "#1" }])
    expect(timelineRows(messages)).toHaveLength(1)
  })

  test("/sessions — GET /session, titres réels et session courante", async () => {
    const { fetchImpl, calls } = recorder({
      "/session": [{ id: "s1", title: "Correctif", directory: "/projet/opencodev2web" }],
    })
    const rows = await loadSessions(fetchImpl)
    expect(calls.map((c) => c.url)).toEqual(["/session"])
    expect(rows[0]).toMatchObject({ value: "s1", label: "Correctif", detail: "opencodev2web" })
  })

  test("/status — GET /global/health et /mcp, état serveur et non pas une version codée", async () => {
    const { fetchImpl, calls } = recorder({
      "/global/health": { healthy: true, version: "9.9.9" },
      "/mcp": { git: { status: "connected" }, puppeteer: { status: "disabled" } },
    })
    const loaded = await loadStatus(fetchImpl, "http://serveur.test")
    expect(calls.map((c) => c.url)).toEqual(["/global/health", "/mcp"])
    expect(statusPairs({ ...loaded, agent: "build", model: "opencode/alpha" })).toEqual([
      ["Version", "9.9.9"],
      ["Server", "http://serveur.test"],
      ["Agent", "build"],
      ["Model", "opencode/alpha"],
      ["MCP", "1/2 connected"],
      ["LSP", "disabled"],
    ])
  })

  test("/help — raccourcis de la maquette, catalogue local explicite", () => {
    expect(HELP_KEYS).toContainEqual(["/", "commands"])
    expect(HELP_KEYS).toContainEqual(["ctrl+p", "command palette"])
    expect(HELP_KEYS).toHaveLength(9)
  })

  test("/skills — GET /skill, catalogue réel et échec serveur", async () => {
    const { fetchImpl, calls } = recorder({
      "/skill": [{ name: "humanizer", description: "  Texte  humain ", location: "x", content: "SECRET" }],
    })
    const rows = await loadSkills(fetchImpl)
    expect(calls.map((c) => c.url)).toEqual(["/skill"])
    expect(rows).toEqual([{ value: "humanizer", label: "humanizer", detail: "Texte humain" }])
    const bad = recorder({}, ["/skill"])
    await expect(loadSkills(bad.fetchImpl)).rejects.toThrow("/skill -> HTTP 500")
  })

  test("/subagent — GET /agent, filtre mode=subagent", async () => {
    const { fetchImpl, calls } = recorder({
      "/agent": [
        { name: "build", mode: "primary" },
        { name: "explore", mode: "subagent", description: "Lecture rapide" },
      ],
    })
    const rows = await loadSubagents(fetchImpl)
    expect(calls.map((c) => c.url)).toEqual(["/agent"])
    expect(rows.map((r) => r.value)).toEqual(["explore"])
  })

  test("/connect — GET /provider/auth + /provider, OAuth réel ou état connecté", async () => {
    const auth = { github: [{ type: "oauth" }], openai: [{ type: "apikey" }] }
    const { fetchImpl, calls } = recorder({ "/provider/auth": auth, "/provider": { connected: ["openai"] } })
    const loaded = await loadProviders(fetchImpl)
    expect(calls.map((c) => c.url)).toEqual(["/provider/auth", "/provider"])
    expect(providerRows(auth, ["openai"])).toMatchObject([
      { value: "github", detail: "OAuth available", method: 0, on: false },
      { value: "openai", detail: "Connected", on: true },
    ])
    expect(loaded.rows).toHaveLength(2)
    const url = await providerOauthUrl("github", 0, fetchImpl)
    expect(calls[2]).toMatchObject({ url: "/provider/github/oauth/authorize", method: "POST" })
    expect(JSON.parse(calls[2].body as string)).toEqual({ method: 0 })
    expect(url).toBe("https://auth.example.test/authorize")
  })

  test("/config — GET /config, paires sûres seulement", async () => {
    const { fetchImpl, calls } = recorder({
      "/config": { model: "opencode/alpha", apiKey: "SECRET", mcp: { github: { apiKey: "SECRET" } } },
    })
    const loaded = await loadConfig(fetchImpl)
    expect(calls.map((c) => c.url)).toEqual(["/config"])
    expect(configPairs(loaded.config)).toContainEqual(["model", "opencode/alpha"])
    expect(JSON.stringify(loaded.pairs)).not.toContain("SECRET")
    expect(JSON.stringify(loaded.pairs)).not.toContain("apiKey")
    expect(JSON.stringify(loaded.pairs)).not.toContain("mcp")
  })

  test("/logs — GET /session/:id/message + /session/status, journal sans secret", async () => {
    const { fetchImpl, calls } = recorder({
      "/session/s1/message": [{ info: { role: "user", time: { created: 1763892000000 } }, parts: [{ type: "text", text: "salut" }] }],
      "/session/status": { s1: { type: "retry" } },
    })
    const lines = await loadLogView("s1", fetchImpl)
    expect(calls.map((c) => c.url)).toEqual(["/session/s1/message", "/session/status"])
    expect(lines[0]).toContain("status retry")
    expect(lines.join("\n")).toContain("salut")
  })

  test("/diff — GET /session/:id/diff, patch parsé sans conservation du brut", async () => {
    const { fetchImpl, calls } = recorder({
      "/session/s1/diff": [{ file: "a.ts", patch: "@@ -1 +1 @@\n-old\n+new", additions: 1, deletions: 1 }],
    })
    const files = await loadDiff("s1", fetchImpl)
    expect(calls.map((c) => c.url)).toEqual(["/session/s1/diff"])
    expect(files[0].lines.map((l) => l.kind)).toEqual(["hunk", "del", "add"])
    expect(diffFiles([])).toEqual([])
  })

  test("/mcps — GET /mcp puis POST connect/disconnect, état et rendu pilotés par le serveur", async () => {
    const status = { git: { status: "disabled" }, memory: { status: "connected" } }
    const { fetchImpl, calls } = recorder({ "/mcp": status })
    const rows = await loadMcpStatus(fetchImpl)
    expect(rows).toEqual([
      { n: "git", on: false, detail: "Disabled" },
      { n: "memory", on: true, detail: "Connected" },
    ])
    await toggleMcp("git", true, fetchImpl)
    await toggleMcp("memory", false, fetchImpl)
    expect(calls.map((c) => [c.url, c.method])).toEqual([
      ["/mcp", undefined],
      ["/mcp/git/connect", "POST"],
      ["/mcp/memory/disconnect", "POST"],
    ])
    expect(mcpRows({ github: { status: "failed" } })[0]).toMatchObject({ on: false, detail: "failed" })
  })
})

describe("interface — refus et échecs réseau", () => {
  test("aucune clé de configuration autre que les deux chemins de modèle n'est writable", () => {
    expect(commandConfigPatch("jev.decision_model", "opencode/alpha")).toEqual({ jev: { decision_model: "opencode/alpha" } })
    expect(commandConfigPatch("attachment.image.vision_model", "opencode/alpha")).toEqual({
      attachment: { image: { vision_model: "opencode/alpha" } },
    })
    expect(() => commandConfigPatch("apiKey", "x")).toThrow("Clé non autorisée : apiKey")
    expect(() => commandConfigPatch("small_model", "x")).toThrow("Clé non autorisée : small_model")
    expect(() => commandConfigPatch("jev.decision_model", "")).toThrow("jev.decision_model")
  })

  test("une écriture refusée ne tente aucun appel réseau", async () => {
    let called = false
    const fetchImpl = (async () => {
      called = true
      return jsonResponse({})
    }) as unknown as typeof fetch
    await expect(writeModelConfig("mcp.github.apiKey", "x", fetchImpl)).rejects.toThrow("non autorisée")
    expect(called).toBe(false)
  })

  test("une bascule MCP en échec est signalée, jamais présentée comme réussie", async () => {
    const { fetchImpl } = recorder({}, ["/mcp/git/connect"])
    await expect(toggleMcp("git", true, fetchImpl)).rejects.toThrow("/mcp/git/connect -> HTTP 500")
  })

  test("/timeline et /diff sans session active ne fabriquent aucune ligne", async () => {
    expect(timelineRows([{ info: { role: "assistant" }, parts: [{ type: "text", text: "x" }] }])).toEqual([])
    expect(diffFiles([{ file: "a.ts" }])[0].lines).toEqual([])
  })

  test("/connect OAuth en échec ne renvoie aucune URL", async () => {
    const { fetchImpl } = recorder({}, ["/provider/github/oauth/authorize"])
    await expect(providerOauthUrl("github", 0, fetchImpl)).rejects.toThrow("HTTP 500")
  })
})
