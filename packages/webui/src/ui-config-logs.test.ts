import { describe, expect, test } from "vitest"
import {
  abortSession,
  buildPromptPayload,
  configToJson,
  deleteSession,
  formatLogLines,
  keyboardDecision,
  loadCapabilities,
  loadConfig,
  loadSessionLog,
  redactSecrets,
  renameSession,
  sanitizeConfig,
  sendPrompt,
  steerSupported,
  updateConfig,
  validateConfigPatch,
} from "../public/ui/config-logs.js"

const jsonResponse = (body: unknown, ok = true, status = 200) =>
  ({ ok, status, json: async () => body }) as unknown as Response

describe("ui config — validation et secret", () => {
  test("sanitizeConfig ne garde que les champs sûrs et masque les secrets", () => {
    const safe = sanitizeConfig({
      shell: "/bin/bash",
      logLevel: "INFO",
      apiKey: "FAKE",
      provider: { openai: { apiKey: "FAKE" } },
      mcp: { github: { headers: { Authorization: "Bearer REDACTED12" } } },
      jev: { key: "secret DO_NOT_SHOW_1234567890" },
      model: "opencode/hy4-flash-free",
    })
    expect(safe).toEqual({ shell: "/bin/bash", logLevel: "INFO", model: "opencode/hy4-flash-free" })
    const rendered = configToJson(safe)
    expect(rendered).not.toContain("FAKE")
    expect(rendered).not.toContain("apiKey")
    expect(rendered).not.toContain("provider")
  })

  test("validateConfigPatch refuse une valeur invalide et une clé secrète", () => {
    expect(validateConfigPatch('{"logLevel":"VERBOSE"}')).toMatchObject({ ok: false })
    expect(validateConfigPatch('{"snapshot":"yes"}')).toMatchObject({ ok: false })
    expect(validateConfigPatch('{"apiKey":"x"}')).toMatchObject({ ok: false, error: "Clé non autorisée : apiKey" })
    expect(validateConfigPatch("not json")).toMatchObject({ ok: false, error: "JSON invalide" })
    expect(validateConfigPatch('{"logLevel":"WARN","snapshot":true}')).toMatchObject({
      ok: true,
      value: { logLevel: "WARN", snapshot: true },
    })
  })

  test("redactSecrets masque jetons et affectations sensibles", () => {
    const text =
      "apiKey: \"FAKE\" Authorization: Bearer REDACTED12"
    const out = String(redactSecrets(text))
    expect(out).not.toContain("FAKE")
    expect(out).not.toContain("Bearer REDACTED12")
    expect(out).toContain("[REDACTED]")
  })

  test("loadConfig et updateConfig passent par les routes réelles", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const fakeFetch = async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      if (init?.method === "PATCH") return jsonResponse({ logLevel: "ERROR" })
      return jsonResponse({ logLevel: "INFO", apiKey: "secret" })
    }
    expect(await loadConfig(fakeFetch as unknown as typeof fetch)).toEqual({ logLevel: "INFO" })
    expect(await updateConfig({ logLevel: "ERROR" }, fakeFetch as unknown as typeof fetch)).toEqual({ logLevel: "ERROR" })
    expect(calls.map((c) => c.url)).toEqual(["/config", "/config"])
    expect(calls[1].init?.method).toBe("PATCH")
    expect(calls[1].init?.body).toBe('{"logLevel":"ERROR"}')
  })

  test("updateConfig refuse un patch invalide sans appel réseau", async () => {
    let called = false
    const fakeFetch = async () => {
      called = true
      return jsonResponse({})
    }
    await expect(updateConfig({ logLevel: "BOGUS" }, fakeFetch as unknown as typeof fetch)).rejects.toThrow("logLevel")
    expect(called).toBe(false)
  })
})

describe("ui logs — journal réel sans secret", () => {
  test("formatLogLines injecte le statut et masque les secrets des messages", () => {
    const lines = formatLogLines(
      [
        {
          info: { role: "user", time: { created: 1763892000000 } },
          parts: [{ type: "text", text: "clé apiKey: \"FAKE\"" }],
        },
        { info: { role: "assistant", time: { created: 1763892001000 } }, parts: [{ type: "text", text: "réponse" }] },
      ],
      { ses_test: { type: "retry" } },
      "ses_test",
      1763892002000,
    )
    expect(lines[0]).toContain("status retry")
    expect(lines.join("\n")).not.toContain("FAKE")
    expect(lines.join("\n")).toContain("[REDACTED]")
    expect(lines.join("\n")).toContain("réponse")
  })

  test("loadSessionLog lit les messages et le statut réels", async () => {
    const calls: string[] = []
    const fakeFetch = async (url: string) => {
      calls.push(url)
      if (url.includes("/message")) return jsonResponse([{ info: { role: "user" }, parts: [{ type: "text", text: "salut" }] }])
      if (url === "/session/status") return jsonResponse({ ses_x: { type: "idle" } })
      return jsonResponse({})
    }
    const lines = await loadSessionLog("ses_x", fakeFetch as unknown as typeof fetch)
    expect(calls).toEqual(["/session/ses_x/message", "/session/status"])
    expect(lines.join("\n")).toContain("salut")
  })
})

describe("ui raccourcis — décisions pures", () => {
  test("palette, nouveau, renommage et suppression avec confirmation", () => {
    expect(keyboardDecision({ key: "p", ctrlKey: true }, {})).toBe("palette")
    expect(keyboardDecision({ key: "n", altKey: true }, {})).toBe("new")
    expect(keyboardDecision({ key: "r", ctrlKey: true }, { hasSelection: true })).toBe("rename")
    expect(keyboardDecision({ key: "r", ctrlKey: true }, {})).toBe("ignore")
    expect(keyboardDecision({ key: "d", ctrlKey: true }, { hasSelection: true })).toBe("delete")
    expect(keyboardDecision({ key: "d", ctrlKey: true }, {})).toBe("ignore")
  })

  test("esc, enter en file, alt+s conditionnel et sauvegarde config", () => {
    expect(keyboardDecision({ key: "Escape" }, { running: true })).toBe("interrupt")
    expect(keyboardDecision({ key: "Escape" }, { running: false })).toBe("ignore")
    expect(keyboardDecision({ key: "Enter" }, { running: true })).toBe("queue")
    expect(keyboardDecision({ key: "Enter" }, { running: false })).toBe("send")
    expect(keyboardDecision({ key: "s", altKey: true }, { running: true, canSteer: true })).toBe("steer")
    expect(keyboardDecision({ key: "s", altKey: true }, { running: true, canSteer: false })).toBe("unsupported")
    expect(keyboardDecision({ key: "s", ctrlKey: true }, { configEditing: true })).toBe("save-config")
  })

  test("steerSupported exige metadata et version 2.4+", () => {
    const doc = { components: { schemas: { TextPartInput: { properties: { metadata: { type: "object" } } } } } }
    expect(steerSupported(doc, { version: "2.4.31", healthy: true })).toBe(true)
    expect(steerSupported(doc, { version: "2.3.9", healthy: true })).toBe(false)
    expect(steerSupported({}, { version: "2.4.31", healthy: true })).toBe(false)
  })

  test("loadCapabilities lit /doc et /global/health", async () => {
    const doc = { components: { schemas: { TextPartInput: { properties: { metadata: { type: "object" } } } } } }
    const fakeFetch = async (url: string) => (url === "/doc" ? jsonResponse(doc) : jsonResponse({ version: "2.4.31" }))
    expect(await loadCapabilities(fakeFetch as unknown as typeof fetch)).toEqual({ canSteer: true })
  })
})

describe("ui session — actions réelles", () => {
  test("buildPromptPayload porte le metadata steer", () => {
    expect(buildPromptPayload("aller", { steer: true })).toEqual({
      parts: [{ type: "text", text: "aller", metadata: { steer: true } }],
    })
    expect(buildPromptPayload("aller")).toEqual({ parts: [{ type: "text", text: "aller" }] })
  })

  test("sendPrompt, renameSession, deleteSession et abortSession appellent les bonnes routes", async () => {
    const calls: Array<{ url: string; method?: string; body?: string | null }> = []
    const fakeFetch = async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method, body: init?.body as string | null | undefined })
      return jsonResponse({ ok: true })
    }
    await sendPrompt("ses_a", { parts: [] }, fakeFetch as unknown as typeof fetch)
    await renameSession("ses_a", "Nouveau titre", fakeFetch as unknown as typeof fetch)
    await deleteSession("ses_a", fakeFetch as unknown as typeof fetch)
    await abortSession("ses_a", fakeFetch as unknown as typeof fetch)
    expect(calls.map((c) => [c.url, c.method])).toEqual([
      ["/session/ses_a/prompt_async", "POST"],
      ["/session/ses_a", "PATCH"],
      ["/session/ses_a", "DELETE"],
      ["/session/ses_a/abort", "POST"],
    ])
    expect(calls[1].body).toBe('{"title":"Nouveau titre"}')
  })

  test("les actions refusent un sessionID inconnu", async () => {
    const fakeFetch = async (_url: string, _init?: RequestInit) => jsonResponse({}, false, 404)
    await expect(sendPrompt("", { parts: [] }, fakeFetch as unknown as typeof fetch)).rejects.toThrow("HTTP 404")
    await expect(deleteSession("", fakeFetch as unknown as typeof fetch)).rejects.toThrow("HTTP 404")
  })
})
