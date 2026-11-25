import { describe, expect, test } from "vitest"
import {
  filterArchived,
  loadArchivedSessions,
  toArchivedRows,
  unarchiveSession,
} from "../public/ui/archived-ui.js"
import {
  activeSessions,
  buildServerSnapshot,
  loadServerSnapshot,
  sanitizeMcp,
} from "../public/ui/server-ui.js"
import { basename, buildFilePart, fileSizeLabel, validateFile } from "../public/ui/attachments-ui.js"

function fakeFetch(routes: Record<string, unknown>, calls: Array<{ url: string; init?: RequestInit }> = []) {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : String(input)
    calls.push({ url, init })
    const body = routes[url]
    if (body === undefined) return { ok: false, status: 404, json: async () => ({}) } as Response
    return { ok: true, status: 200, json: async () => body } as Response
  }) as unknown as typeof fetch
}

describe("ui menu-bas — Archived", () => {
  const raw = [
    { id: "s1", title: "Café, été", directory: "/secret/projet", time: { archived: 1_800_000_000_000 } },
    { id: "s2", slug: "Sans titre", time: { archived: 1_700_000_000_000 } },
    { title: "sans id" },
  ]

  test("ne garde que id, titre et date lisible", () => {
    const rows = toArchivedRows(raw)
    expect(rows).toEqual([
      { id: "s1", title: "Café, été", date: "2027-01-15" },
      { id: "s2", title: "New session", date: "2023-11-14" },
    ])
  })

  test("recherche insensible à la casse et aux accents", () => {
    const rows = toArchivedRows(raw)
    expect(filterArchived(rows, "cafe").map((r) => r.id)).toEqual(["s1"])
    expect(filterArchived(rows, "ETE").map((r) => r.id)).toEqual(["s1"])
    expect(filterArchived(rows, "inconnu")).toEqual([])
  })

  test("charge la route archivée et désarchive avec null", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const rows = await loadArchivedSessions(fakeFetch({ "/experimental/session?archived=true": raw }, calls))
    expect(rows.map((r) => r.id)).toEqual(["s1", "s2"])
    await unarchiveSession("s 1", fakeFetch({ "/session/s%201": {} }, calls))
    expect(calls[1]?.init?.method).toBe("PATCH")
    expect(calls[1]?.init?.body).toBe(JSON.stringify({ time: { archived: null } }))
  })
})

describe("ui menu-bas — Server", () => {
  test("ne laisse sortir ni secret ni erreur MCP", () => {
    const snapshot = buildServerSnapshot({
      health: { healthy: true, version: "2.4.31-sk-abcdefghijklmnopqrstuvwxyz" },
      origin: "http://127.0.0.1:4198",
      statuses: { a: { type: "busy" }, b: { type: "idle" }, c: { type: "retry" } },
      mcp: {
        git: { status: "connected" },
        bad: { status: "failed", error: "token=ghp_abcdefghijklmnopqrstuvwxyz" },
      },
      streamConnected: true,
    })
    expect(snapshot.state).toBe("healthy")
    expect(snapshot.port).toBe("4198")
    expect(snapshot.sessions).toBe(2)
    expect(snapshot.stream).toBe("connected")
    expect(snapshot.mcpConnected).toBe(1)
    expect(snapshot.mcp).toEqual([
      { name: "bad", status: "failed" },
      { name: "git", status: "connected" },
    ])
    expect(JSON.stringify(snapshot)).not.toContain("ghp_")
    expect(JSON.stringify(snapshot)).not.toContain("sk-abcdef")
  })

  test("compte les sessions et charge les trois routes", async () => {
    expect(activeSessions({ a: { type: "busy" }, b: { type: "idle" } })).toBe(1)
    expect(sanitizeMcp({ ok: { status: "connected" }, nope: { status: "x" } })).toEqual([
      { name: "ok", status: "connected" },
    ])
    const calls: Array<{ url: string }> = []
    const snapshot = await loadServerSnapshot(
      fakeFetch(
        {
          "/global/health": { healthy: true, version: "2.4.31" },
          "/session/status": { a: { type: "busy" } },
          "/mcp": { git: { status: "connected" } },
        },
        calls,
      ),
      "http://127.0.0.1:4198",
      true,
    )
    expect(calls.map((c) => c.url)).toEqual(["/global/health", "/session/status", "/mcp"])
    expect(snapshot.version).toBe("2.4.31")
  })
})

describe("ui menu-bas — pièces jointes", () => {
  test("nom de base, tailles et refus visibles", () => {
    expect(basename("C:\\Users\\jo\\secret.txt")).toBe("secret.txt")
    expect(fileSizeLabel(1536)).toBe("1.5 kB")
    expect(validateFile({ name: "/home/jo/install.exe", type: "application/x-msdownload", size: 10 })).toContain(
      "Type refusé",
    )
    expect(validateFile({ name: "big.txt", type: "text/plain", size: 2 * 1024 * 1024 })).toContain("dépasse")
    expect(validateFile({ name: "ok.txt", type: "text/plain", size: 10 })).toBeUndefined()
  })

  test("partie file sans chemin absolu", () => {
    expect(
      buildFilePart({
        name: "/home/jo/secret.txt",
        mime: "text/plain",
        dataUrl: "data:text/plain;base64,aGk=",
      }),
    ).toEqual({
      type: "file",
      mime: "text/plain",
      filename: "secret.txt",
      url: "data:text/plain;base64,aGk=",
    })
  })
})
