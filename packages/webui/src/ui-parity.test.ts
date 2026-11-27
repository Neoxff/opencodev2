import { describe, expect, test } from "vitest"
import {
  buildDirectoryWorkspaces,
  buildPanelView,
  buildServerSnapshot,
  loadParitySnapshot,
  mcpCommands,
  mcpCounts,
  mcpRows,
  redact,
  toggleMcp,
} from "../public/ui/parity.js"

const LABELS: Record<string, string> = {
  connected: "Connected",
  disabled: "Disabled",
  failed: "Failed",
  needs_auth: "Needs auth",
  needs_client_registration: "Needs client ID",
}

function assertParity(statuses: Record<string, unknown>) {
  const rows = mcpRows(statuses)
  const responseNames = Object.keys(statuses).sort()
  expect(rows.map((row) => row.name).sort()).toEqual(responseNames)
  for (const row of rows) {
    const source: any = statuses[row.name]
    expect(LABELS[source.status]).toBeTruthy()
    expect(row.status).toBe(source.status)
    expect(row.label).toBe(LABELS[source.status])
    if (typeof source.error === "string" && !["connected", "disabled"].includes(source.status)) {
      expect(row.error).toBe(redact(source.error))
    } else {
      expect(row.error).toBe("")
    }
  }
  const counts = mcpCounts(rows)
  expect(counts.total).toBe(responseNames.length)
  expect(counts.connected).toBe(rows.filter((row) => row.status === "connected").length)
  expect(counts.bad).toBe(rows.filter((row) => !["connected", "disabled"].includes(row.status)).length)
}

function fakeFetch(routes: Record<string, unknown>, calls: Array<{ url: string; init?: RequestInit }> = []) {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : String(input)
    calls.push({ url, init })
    const body = routes[url]
    if (body === undefined) return { ok: false, status: 404, json: async () => ({}) } as Response
    return { ok: true, status: 200, json: async () => body } as Response
  }) as unknown as typeof fetch
}

describe("parité MCP — chaque valeur affichée existe dans la réponse et réciproquement", () => {
  test("0 MCP", () => {
    assertParity({})
    expect(mcpRows({})).toEqual([])
    expect(mcpCounts([])).toEqual({ connected: 0, total: 0, bad: 0 })
  })

  test("4 MCP comme le TUI de l'utilisateur", () => {
    const statuses = {
      "file-system": { status: "disabled" },
      git: { status: "disabled" },
      github: { status: "disabled" },
      "web-browser": { status: "disabled" },
    }
    assertParity(statuses)
    expect(mcpRows(statuses).map((r) => r.name)).toEqual(["file-system", "git", "github", "web-browser"])
  })

  test("19 MCP", () => {
    const statuses: Record<string, unknown> = {}
    for (let i = 0; i < 19; i += 1) statuses[`mcp-${String(i).padStart(2, "0")}`] = { status: i % 2 ? "connected" : "disabled" }
    assertParity(statuses)
    expect(mcpRows(statuses)).toHaveLength(19)
  })

  test("failed avec erreur", () => {
    assertParity({ git: { status: "failed", error: "handshake failed" } })
    expect(mcpRows({ git: { status: "failed", error: "handshake failed" } })[0]?.error).toBe("handshake failed")
  })

  test("needs_auth", () => {
    assertParity({ github: { status: "needs_auth" } })
  })

  test("needs_client_registration avec erreur", () => {
    assertParity({ oauth: { status: "needs_client_registration", error: "client id missing" } })
  })

  test("les secrets dans une erreur sont masqués", () => {
    const valeur = `erreur ${"ghp_"}${"a".repeat(24)}`
    const row = mcpRows({ git: { status: "failed", error: valeur } })[0]
    expect(row?.error).toBe(`erreur [REDACTED]`)
    expect(JSON.stringify(row)).not.toContain("ghp_")
  })

  test("les commandes slash MCP suivent les serveurs actifs", () => {
    const rows = mcpRows({ git: { status: "connected" }, github: { status: "disabled" } })
    const commands = [
      { name: "git:git_wrapup:mcp", source: "mcp", description: "Wrap-up git" },
      { name: "github:issue:mcp", source: "mcp", description: "Issues" },
      { name: "disparu:action:mcp", source: "mcp", description: "Ancien serveur" },
      { name: "humanizer", source: "skill", description: "Skill" },
    ]
    const displayed = mcpCommands(commands, rows)
    expect(displayed.map((c) => c.n)).toEqual(["/git:git_wrapup:mcp", "/github:issue:mcp"])
    expect(displayed.every((c) => c.tag === "mcp")).toBe(true)
    expect(displayed.every((c) => commands.includes(commands.find((x) => x.name === c.k)!))).toBe(true)
  })

  test("la feuille Server et le snapshot ne laissent pas sortir de secret", () => {
    const snapshot = buildServerSnapshot({
      health: { healthy: true, version: "2.4.31" },
      origin: "http://127.0.0.1:4201",
      statuses: { a: { type: "busy" }, b: { type: "idle" } },
      rows: mcpRows({ git: { status: "failed", error: "erreur sensible" } }),
    })
    expect(snapshot.mcp).toEqual({ connected: 0, total: 1, bad: 1 })
    expect(snapshot.sessions).toBe(1)
    expect(snapshot.rows[0]?.error).toBe("erreur sensible")
    expect(JSON.stringify(snapshot)).not.toContain("secret")
  })
})

describe("parité panneau droit et sessions", () => {
  test("les valeurs du panneau proviennent des réponses serveur", () => {
    const view = buildPanelView({
      session: {
        title: "Session de parité",
        cost: 0.012345,
        tokens: { input: 10, output: 20, reasoning: 0, cache: { read: 5, write: 2 } },
        goalState: { status: "pending", dod: ["Faire A"], outOfScope: ["Ne pas faire B"] },
        directory: "/home/joachim/Documents/opencodev2/projet",
      },
      todos: [{ content: "Faire A", status: "in_progress" }],
      lsp: [{ id: "tsgo", name: "TypeScript", root: "/projet", status: "connected" }],
      vcs: { branch: "feat/ui-parite-tui" },
      path: { directory: "/home/joachim/Documents/opencodev2/projet" },
      health: { version: "2.4.31" },
    })
    const json = JSON.stringify(view)
    for (const value of [
      "Session de parité",
      "Faire A",
      "Ne pas faire B",
      "TypeScript",
      "in_progress",
      "projet",
      "feat/ui-parite-tui",
      "2.4.31",
    ]) {
      expect(json).toContain(value)
    }
    expect(view.context.used).toBe(37)
    expect(view.context.limit).toBe(1_048_576)
    expect(view.context.percent).toBe(0)
    expect(view.context.costText).toBe("$0.012345 (estimated)")
  })

  test("les sessions sont regroupées par dossier avec compteur et Read more", () => {
    const now = Date.UTC(2026, 10, 27, 12, 0, 0)
    const sessions = Array.from({ length: 5 }, (_, i) => ({
      id: `s${i}`,
      title: `Session ${i}`,
      directory: i < 3 ? "/projet/a" : "/projet/b",
      time: { updated: now - i * 60_000 },
    }))
    const groups = buildDirectoryWorkspaces([], sessions, {}, now, 2)
    expect(groups.map((g) => g.n).sort()).toEqual(["a", "b"])
    const a = groups.find((g) => g.n === "a")!
    expect(a.c).toBe(3)
    expect(a.s).toHaveLength(2)
    expect(a.more).toBe(1)
    const b = groups.find((g) => g.n === "b")!
    expect(b.c).toBe(2)
    expect(b.more).toBe(0)
  })

  test("le snapshot combiné charge les cinq routes et applique le filtre MCP", async () => {
    const calls: Array<{ url: string }> = []
    const fetchImpl = fakeFetch(
      {
        "/mcp": { git: { status: "connected" } },
        "/command": [
          { name: "git:wrap:mcp", source: "mcp", description: "Wrap" },
          { name: "gone:action:mcp", source: "mcp", description: "Gone" },
        ],
        "/session": [{ id: "s", title: "T", directory: "/projet/a", time: { updated: Date.now() } }],
        "/project": [],
        "/session/status": {},
      },
      calls,
    )
    const snapshot = await loadParitySnapshot(fetchImpl, 2)
    expect(calls.map((c) => c.url)).toEqual(["/mcp", "/command", "/session", "/project", "/session/status"])
    expect(snapshot.mcp.map((r) => r.name)).toEqual(["git"])
    expect(snapshot.commands.map((c) => c.k)).toEqual(["git:wrap:mcp"])
    expect(snapshot.workspaces[0]?.c).toBe(1)
  })

  test("l'interrupteur appelle réellement connect/disconnect puis relit /mcp", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const fetchImpl = fakeFetch(
      {
        "/mcp/git/connect": true,
        "/mcp/git/disconnect": true,
        "/mcp": { git: { status: "connected" } },
      },
      calls,
    )
    const on = await toggleMcp("git", true, fetchImpl)
    expect(on.ok).toBe(true)
    expect(on.rows[0]?.status).toBe("connected")
    expect(calls[0]?.init?.method).toBe("POST")
    expect(calls[0]?.init?.body).toBe("{}")
    expect(calls[0]?.url).toBe("/mcp/git/connect")
    await toggleMcp("git", false, fetchImpl)
    expect(calls[2]?.url).toBe("/mcp/git/disconnect")
  })
})
