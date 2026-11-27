import { describe, expect, test } from "vitest"
import {
  buildWorkspaces,
  createSession,
  fetchFolders,
  loadSession,
  loadSidebarData,
  relativeTime,
  sessionActivityMap,
} from "../public/ui/data.js"

const NOW = Date.UTC(2026, 10, 23, 12, 0, 0)

const projects = [
  {
    id: "p1",
    worktree: "/proj/opencodev2web",
    time: { created: NOW - 86_400_000, updated: NOW - 300_000 },
  },
  {
    id: "p2",
    worktree: "/proj/music-player",
    time: { created: NOW - 259_200_000, updated: NOW - 172_800_000 },
  },
]

const sessions = [
  {
    id: "s1",
    projectID: "p2",
    title: "B-Music3",
    directory: "/proj/music-player",
    time: { created: NOW - 1_200_000, updated: NOW - 1_200_000 },
  },
  {
    id: "s2",
    projectID: "p1",
    title: "Correctif dépôt divergent",
    directory: "/proj/opencodev2web",
    time: { created: NOW - 300_000, updated: NOW - 300_000 },
  },
  {
    id: "s3",
    projectID: "p1",
    title: "Ciel étoilé",
    directory: "/proj/opencodev2web",
    time: { created: NOW - 1_980_000, updated: NOW - 1_980_000 },
  },
  {
    id: "s4",
    projectID: "p1",
    title: "Verre sobre",
    directory: "/proj/opencodev2web",
    time: { created: NOW - 3_600_000, updated: NOW - 3_600_000 },
  },
]

const statuses = { s2: { type: "busy" }, s3: { type: "retry" }, s4: { type: "idle" } }

function fakeFetch(routes: Record<string, unknown>) {
  return (async (input: string | URL | Request) => {
    const path = typeof input === "string" ? input : String(input)
    const body = routes[path]
    if (body === undefined) return { ok: false, status: 404, json: async () => ({}) } as Response
    return { ok: true, status: 200, json: async () => body } as Response
  }) as unknown as typeof fetch
}

describe("ui data access", () => {
  test("relativeTime garde le format de la maquette", () => {
    expect(relativeTime(NOW, NOW)).toBe("now")
    expect(relativeTime(NOW - 300_000, NOW)).toBe("5m")
    expect(relativeTime(NOW - 3_600_000, NOW)).toBe("1h")
    expect(relativeTime(NOW - 259_200_000, NOW)).toBe("3d")
  })

  test("busy inclut retry mais pas idle", () => {
    expect(sessionActivityMap(statuses)).toEqual({ s2: true, s3: true })
  })

  test("buildWorkspaces expose la forme WS avec temps relatif et activité", () => {
    const ws = buildWorkspaces(projects, sessions, statuses, NOW, 9)
    expect(ws.map((w) => w.n)).toEqual(["opencodev2web", "music-player"])
    expect(ws[0].t).toBe("5m")
    expect(ws[0].open).toBe(true)
    expect(ws[0].s.map((s) => s.t)).toEqual(["Correctif dépôt divergent", "Ciel étoilé", "Verre sobre"])
    expect(ws[0].s.map((s) => s.m)).toEqual(["5m", "33m", "1h"])
    expect(ws[0].s.map((s) => s.busy)).toEqual([1, 1, 0])
    expect(ws[1].s[0]).toMatchObject({ id: "s1", t: "B-Music3", m: "20m", busy: 0 })
    expect(ws.every((w) => "more" in w)).toBe(true)
  })

  test("loadSidebarData consulte /project, /session et /session/status", async () => {
    const calls: string[] = []
    const fetchImpl = fakeFetch({
      "/project": projects,
      "/session": sessions,
      "/session/status": statuses,
    })
    const wrapped = ((input: string | URL | Request) => {
      calls.push(String(input))
      return fetchImpl(input)
    }) as typeof fetch
    const ws = await loadSidebarData(wrapped, NOW, 9)
    expect(calls).toEqual(["/project", "/session", "/session/status"])
    expect(ws[0].s[0].t).toBe("Correctif dépôt divergent")
  })

  test("createSession POST /session et loadSession lit les messages utiles", async () => {
    const created = { id: "new-session", title: "New session" }
    const createFetch = (async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe("/session")
      expect(init?.method).toBe("POST")
      return { ok: true, status: 200, json: async () => created } as Response
    }) as unknown as typeof fetch
    expect(await createSession(createFetch)).toEqual(created)

    const messages = [
      {
        info: { role: "user" },
        parts: [
          { type: "text", text: "salut" },
          { type: "text", text: "injection", ignored: true },
        ],
      },
      { info: { role: "assistant" }, parts: [{ type: "text", text: "bonjour" }] },
    ]
    const readFetch = fakeFetch({
      "/session/s1": { id: "s1", title: "Correctif dépôt divergent" },
      "/session/s1/message": messages,
    })
    const loaded = await loadSession("s1", readFetch)
    expect(loaded.session).toMatchObject({ id: "s1" })
    expect(loaded.messages).toEqual([
      { role: "user", text: "salut" },
      { role: "assistant", text: "bonjour" },
    ])
  })

  test("createSession transmet le dossier choisi a POST /session", async () => {
    const calls: string[] = []
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : String(input)
      calls.push(url)
      return { ok: true, status: 200, json: async () => ({ id: "nouvelle", directory: "/proj/choisi" }) } as Response
    }) as unknown as typeof fetch
    const created = await createSession(fetchImpl, {}, "/proj/choisi")
    expect(created).toMatchObject({ id: "nouvelle" })
    expect(calls).toEqual(["/session?directory=%2Fproj%2Fchoisi"])
  })

  test("createSession sans dossier garde l'URL d'origine", async () => {
    const calls: string[] = []
    const fetchImpl = (async (input: string | URL | Request) => {
      calls.push(typeof input === "string" ? input : String(input))
      return { ok: true, status: 200, json: async () => ({}) } as Response
    }) as unknown as typeof fetch
    await createSession(fetchImpl)
    expect(calls).toEqual(["/session"])
  })

  test("fetchFolders parcourt un chemin et dit le refus", async () => {
    const listing = { path: "/proj", parent: "/", entries: [{ name: "choisi", path: "/proj/choisi" }] }
    const readFetch = fakeFetch({ "/folder?path=%2Fproj": listing })
    expect(await fetchFolders("/proj", readFetch)).toEqual(listing)
    const badFetch = (async () => ({
      ok: false,
      status: 404,
      json: async () => ({ reason: "path not found" }),
    })) as unknown as typeof fetch
    await expect(fetchFolders("/nope", badFetch)).rejects.toThrow("path not found")
  })
})
