import { describe, expect, test } from "vitest"
import {
  SECRET_MASK,
  buildConfigPatch,
  configSource,
  formatLogTime,
  isSecretKey,
  logLevel,
  logRow,
  logSource,
  maskConfig,
  parseConfigText,
  redactText,
  validateConfig,
  type JsonObject,
} from "./config-editor"

describe("secret masking", () => {
  test("les clés de fournisseur ne jamais sortir en clair", () => {
    const raw = {
      model: "opencode-go/deepseek-v4.1-flash",
      provider: {
        openai: { key: "sk-abc123def456ghi789jkl", options: { apiKey: "sk-zzz-yyy-xxx-www" } },
      },
    }
    const masked = maskConfig(raw) as JsonObject
    const text = JSON.stringify(masked)
    expect(text).not.toContain("sk-abc123def456ghi789jkl")
    expect(text).not.toContain("sk-zzz-yyy-xxx-www")
    expect(text).toContain(SECRET_MASK)
  })

  test("un jeton glissé dans un message de journal est masqué", () => {
    const line = logRow(
      { at: 1_700_000_000_000, type: "mcp.github.connected", note: "key sk-abcdefghijklmnopqrstuvwxyz" },
      0,
    )
    expect(line.message).not.toContain("sk-abcdefghijklmnopqrstuvwxyz")
    expect(line.message).toContain(SECRET_MASK)
  })

  test("la source éditable ne contient aucun secret", () => {
    const text = configSource({ provider: { openai: { apiKey: "sk-secretsecretsecret1234" } } })
    expect(text).not.toContain("sk-secretsecretsecret1234")
    expect(JSON.parse(text).provider.openai.apiKey).toBe(SECRET_MASK)
  })

  test("les clés secrètes sont reconnues, y compris apiKey et accessToken", () => {
    expect(isSecretKey("key")).toBe(true)
    expect(isSecretKey("apiKey")).toBe(true)
    expect(isSecretKey("accessToken")).toBe(true)
    expect(isSecretKey("model")).toBe(false)
  })

  test("redactText couvre les motifs de jetons courants", () => {
    expect(redactText("ghp_abcdefghijklmnopqrstuvwxyz0123456789")).not.toContain("ghp_abcde")
    expect(redactText("token=eyJabc.def.ghi.jkl")).not.toContain("eyJabc")
  })
})

describe("validation — valeur invalide", () => {
  test("un port hors bornes est refusé", () => {
    const issues = validateConfig({ port: 70000 })
    expect(issues).toEqual([{ path: "port", message: "entier entre 1 et 65535" }])
  })

  test("un dépôt mal formé est refusé", () => {
    expect(validateConfig({ repo: "pas-un-depot" }).some((issue) => issue.path === "repo")).toBe(true)
  })

  test("une branche avec '..' est refusée", () => {
    expect(validateConfig({ defaultBranch: "a..b" }).some((issue) => issue.path === "defaultBranch")).toBe(true)
    expect(validateConfig({ defaultBranch: "feat/valide" }).some((issue) => issue.path === "defaultBranch")).toBe(false)
  })

  test("un workspace absolu est refusé", () => {
    expect(validateConfig({ workspace: "/etc" }).some((issue) => issue.path === "workspace")).toBe(true)
    expect(validateConfig({ workspace: "." }).some((issue) => issue.path === "workspace")).toBe(false)
  })

  test("max_sessions doit être un entier positif", () => {
    expect(validateConfig({ mcp: { max_sessions: 0 } }).some((issue) => issue.path === "mcp.max_sessions")).toBe(true)
    expect(validateConfig({ mcp: { max_sessions: 1 } }).some((issue) => issue.path === "mcp.max_sessions")).toBe(false)
  })

  test("un JSON invalide est signalé sans exception", () => {
    expect(parseConfigText("{ invalide").error).toBeTruthy()
    expect(parseConfigText("[]").error).toContain("objet")
    expect(parseConfigText("").value).toEqual({})
  })

  test("une valeur secrète saisie à la main est refusée", () => {
    const issues = validateConfig({ key: "sk-abcdefghijklmnop" })
    expect(issues.some((issue) => issue.path === "key")).toBe(true)
  })
})

describe("patch — écriture sûre", () => {
  test("ne écrit que ce qui a changé, jamais un secret ni le masque", () => {
    const original: JsonObject = { port: 4096, provider: { openai: { apiKey: "sk-reelle" } } }
    const draft: JsonObject = {
      port: 4213,
      provider: { openai: { apiKey: SECRET_MASK } },
      key: "sk-saisie",
      model: "opencode-go/deepseek-v4.1-flash",
    }
    const { patch, skipped } = buildConfigPatch(draft, original)
    expect(patch).toEqual({ port: 4213, model: "opencode-go/deepseek-v4.1-flash" })
    expect(skipped).toContain("key")
    expect(JSON.stringify(patch)).not.toContain("sk-")
  })
})

describe("journal — projection des événements réels", () => {
  test("niveau, source et horodatage viennent de l'événement", () => {
    expect(logLevel("session.error")).toBe("error")
    expect(logLevel("permission.asked")).toBe("warn")
    expect(logLevel("message.part.updated")).toBe("debug")
    expect(logLevel("session.created")).toBe("info")
    expect(logSource("mcp.github.status")).toBe("mcp")
    expect(formatLogTime(Date.parse("2026-01-01T12:03:24.000Z"))).toBe("12:03:24")
  })

  test("une ligne d'événement garde les champs niveau/source/message", () => {
    const row = logRow({ at: Date.parse("2026-01-01T12:03:24.000Z"), type: "session.error", note: "failed" }, 0)
    expect(row).toMatchObject({ level: "error", source: "session", time: "12:03:24", message: "session.error · failed" })
  })
})
