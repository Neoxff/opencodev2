import { describe, expect, test } from "vitest"
import {
  SESSION_COMMANDS,
  activityText,
  commandSpec,
  createTransport,
  lastUserMessageID,
  loadChoices,
  localShareURL,
  parseCommandLine,
  resolveSource,
  runCommandLine,
  transcriptToMarkdown,
} from "../public/ui/session-commands.js"
import type {
  ActivityStatus,
  CommandActivity,
  RunContext,
  SessionCommandHost,
  SessionCommandTransport,
} from "../public/ui/session-commands.js"

/** Réponse serveur minimale, relevée sur `GET /session/{id}/message`. */
const sampleMessages = [
  { info: { id: "msg_1", role: "user" }, parts: [{ type: "text", text: "Bonjour" }] },
  { info: { id: "msg_2", role: "assistant" }, parts: [{ type: "text", text: "Bonsoir" }] },
]

type HostLog = {
  notices: string[]
  errors: string[]
  selected: string[]
  reloaded: number
  cleared: number
  renamed: string[]
  editor: number
  activities: CommandActivity[]
  statuses: Array<{ id: string; status: ActivityStatus }>
  clipboard: string[]
  downloads: Array<{ filename: string; content: string }>
  confirmed: number
}

function newLog(): HostLog {
  return {
    notices: [],
    errors: [],
    selected: [],
    reloaded: 0,
    cleared: 0,
    renamed: [],
    editor: 0,
    activities: [],
    statuses: [],
    clipboard: [],
    downloads: [],
    confirmed: 0,
  }
}

function fakeTransport(overrides: Partial<SessionCommandTransport> = {}): SessionCommandTransport {
  return {
    create: async () => ({ id: "ses_new" }),
    update: async () => ({}),
    remove: async () => ({}),
    fork: async () => ({ id: "ses_fork" }),
    revert: async () => ({}),
    summarize: async () => ({}),
    init: async () => ({}),
    command: async () => ({}),
    messages: async () => sampleMessages,
    ...overrides,
  }
}

function fakeHost(log: HostLog, overrides: Partial<SessionCommandHost> = {}): SessionCommandHost {
  return {
    origin: "http://127.0.0.1:4097",
    pathname: "/ui/",
    clipboard: async (text) => {
      log.clipboard.push(text)
      return true
    },
    download: (filename, content) => log.downloads.push({ filename, content }),
    notice: (message) => log.notices.push(message),
    error: (message) => log.errors.push(message),
    selectSession: (id) => log.selected.push(id),
    reload: () => {
      log.reloaded++
    },
    clearSession: () => {
      log.cleared++
    },
    rename: (id) => log.renamed.push(id),
    openEditor: () => {
      log.editor++
    },
    confirm: async () => {
      log.confirmed++
      return true
    },
    addActivity: (activity) => log.activities.push(activity),
    updateActivity: (id, status) => log.statuses.push({ id, status }),
    ...overrides,
  }
}

function context(
  log: HostLog,
  transport: SessionCommandTransport = fakeTransport(),
  hostOverrides: Partial<SessionCommandHost> = {},
  sessionID: string | null = "ses_active",
  choices: Array<{ name: string; source?: string }> = [],
): RunContext {
  // `null` explicite = pas de session (évite le défaut de paramètre).
  return { sessionID: sessionID ?? undefined, choices, transport, host: fakeHost(log, hostOverrides) }
}

/** Style `ui-data.test.ts` : une table de routes, plus un enregistrement des appels. */
function fakeFetch(routes: Record<string, unknown>) {
  return (async (input: string | URL | Request) => {
    const path = typeof input === "string" ? input : String(input)
    const body = routes[path]
    if (body === undefined) return { ok: false, status: 404, json: async () => ({}) } as Response
    return { ok: true, status: 200, json: async () => body } as Response
  }) as unknown as typeof fetch
}

type Call = { path: string; method?: string; body?: Record<string, unknown> }
function recordingFetch(routes: Record<string, unknown>) {
  const calls: Call[] = []
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const path = typeof input === "string" ? input : String(input)
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined
    calls.push({ path, method: init?.method, body })
    const payload = routes[path]
    if (payload === undefined) return { ok: false, status: 404, json: async () => ({}) } as Response
    return { ok: true, status: 200, json: async () => payload } as Response
  }) as unknown as typeof fetch
  return { impl, calls }
}

const rejects = async () => {
  throw new Error("server 500")
}

describe("analyse de la ligne de commande", () => {
  test("isole le nom et les arguments", () => {
    expect(parseCommandLine("/rename Mon titre")).toEqual({ name: "rename", arguments: "Mon titre" })
    expect(parseCommandLine("/compact")).toEqual({ name: "compact", arguments: "" })
  })

  test("une ligne libre ou une ligne suivante n'est pas un argument", () => {
    expect(parseCommandLine("bonjour /rename")).toBeUndefined()
    expect(parseCommandLine("/review\ndevient un prompt")).toEqual({ name: "review", arguments: "" })
  })

  test("le catalogue porte exactement les douze commandes attendues", () => {
    expect(SESSION_COMMANDS.map((c) => c.name)).toEqual([
      "new",
      "rename",
      "fork",
      "undo",
      "compact",
      "copy",
      "export",
      "share",
      "init",
      "review",
      "editor",
      "exit",
    ])
    expect(commandSpec("exit")?.needsConfirmation).toBe(true)
    expect(commandSpec("new")?.needsSession).toBe(false)
  })

  test("la provenance skill / mcp vient du catalogue du serveur, pas d'une devinette", async () => {
    const choices = await loadChoices(
      fakeFetch({
        "/command": [
          { name: "humanizer", source: "skill", description: "Humanize text" },
          { name: "git:git_wrapup:mcp", source: "mcp" },
          { name: "review", source: "command" },
        ],
        "/skill": [{ name: "extra-skill", description: "Extra" }],
      }),
    )
    expect(resolveSource("humanizer", choices)).toBe("skill")
    expect(resolveSource("git:git_wrapup:mcp", choices)).toBe("mcp")
    expect(resolveSource("review", choices)).toBe("command")
    // Sans catalogue, on ne devine jamais une provenance : c'est une commande ordinaire.
    expect(resolveSource("humanizer", [])).toBe("command")
  })

  test("le transcript est du Markdown réel, et /undo cible le dernier message utilisateur", () => {
    expect(transcriptToMarkdown(sampleMessages)).toBe("## You\n\nBonjour\n\n## Assistant\n\nBonsoir")
    expect(transcriptToMarkdown([])).toBe("")
    expect(lastUserMessageID(sampleMessages)).toBe("msg_1")
  })

  test("/share ne produit qu'une URL locale — aucun service externe", () => {
    const url = localShareURL("http://127.0.0.1:4097", "/ui/", "ses active")
    expect(url).toBe("http://127.0.0.1:4097/ui/?session=ses%20active")
    expect(url.startsWith("/")).toBe(false)
    expect(url).not.toMatch(/^https?:\/\/(?!127\.0\.0\.1)/)
  })
})

describe("transport construit depuis un fetch injecté", () => {
  test("POST /session et PATCH /session/:id portent les bons payloads", async () => {
    const { impl, calls } = recordingFetch({ "/session": { id: "ses_new" }, "/session/ses_active": {} })
    const transport = createTransport(impl)
    expect(await transport.create()).toMatchObject({ id: "ses_new" })
    await transport.update("ses_active", "Nouveau titre")
    expect(calls[0]).toMatchObject({ path: "/session", method: "POST", body: {} })
    expect(calls[1]).toMatchObject({ path: "/session/ses_active", method: "PATCH", body: { title: "Nouveau titre" } })
  })

  test("/compact et /init envoient providerID/modelID (et messageID pour init)", async () => {
    const { impl, calls } = recordingFetch({
      "/session/ses_active/summarize": true,
      "/session/ses_active/init": true,
    })
    const selection = { providerID: "anthropic", modelID: "claude-x", messageID: "msg_init" }
    const transport = createTransport(impl, selection)
    await transport.summarize("ses_active")
    await transport.init("ses_active")
    expect(calls[0]).toMatchObject({
      path: "/session/ses_active/summarize",
      method: "POST",
      body: { providerID: "anthropic", modelID: "claude-x", auto: false },
    })
    expect(calls[1]).toMatchObject({
      path: "/session/ses_active/init",
      method: "POST",
      body: { providerID: "anthropic", modelID: "claude-x", messageID: "msg_init" },
    })
  })

  test("skill/MCP : POST /session/:id/command porte le nom réel et les arguments", async () => {
    const { impl, calls } = recordingFetch({ "/session/ses_active/command": {} })
    const transport = createTransport(impl, {
      providerID: "anthropic",
      modelID: "claude-x",
      agent: "orchestrator",
      variant: "max",
    })
    await transport.command("ses_active", "git:git_wrapup:mcp", "cible=main")
    expect(calls[0]).toMatchObject({
      path: "/session/ses_active/command",
      method: "POST",
      body: {
        command: "git:git_wrapup:mcp",
        arguments: "cible=main",
        agent: "orchestrator",
        model: "anthropic/claude-x",
        variant: "max",
      },
    })
  })

  test("/undo : POST /session/:id/revert utilise le dernier message utilisateur", async () => {
    const { impl, calls } = recordingFetch({
      "/session/ses_active/message": sampleMessages,
      "/session/ses_active/revert": {},
    })
    const transport = createTransport(impl)
    await transport.revert("ses_active")
    expect(calls.map((c) => c.path)).toEqual([
      "/session/ses_active/message",
      "/session/ses_active/revert",
    ])
    expect(calls[1].body).toEqual({ sessionID: "ses_active", messageID: "msg_1" })
  })

  test("une erreur HTTP du serveur est explicite", async () => {
    const transport = createTransport(fakeFetch({}))
    await expect(transport.messages("ses_active")).rejects.toThrow("GET /session/ses_active/message -> HTTP 404")
  })

  test("/revert sans message utilisateur échoue sans appeler la route", async () => {
    const { impl, calls } = recordingFetch({ "/session/ses_active/message": [] })
    const transport = createTransport(impl)
    await expect(transport.revert("ses_active")).rejects.toThrow("No message to revert")
    expect(calls).toHaveLength(1)
  })
})

describe("commandes de session nommées", () => {
  test("/new crée et sélectionne la session, même sans session courante", async () => {
    const log = newLog()
    const result = await runCommandLine("/new", context(log, fakeTransport(), {}, null))
    expect(result.ok).toBe(true)
    expect(log.selected).toEqual(["ses_new"])
    expect(log.notices).toContain("New session")
  })

  test("/new : échec si le serveur ne rend pas d'identifiant", async () => {
    const log = newLog()
    const result = await runCommandLine("/new", context(log, fakeTransport({ create: async () => undefined })))
    expect(result.ok).toBe(false)
    expect(log.errors).toContain("Server did not return a new session")
    expect(log.selected).toEqual([])
  })

  test("/rename avec argument écrit le titre ; sans argument ouvre le dialogue", async () => {
    const log = newLog()
    let received: { id: string; title: string } | undefined
    const transport = fakeTransport({
      update: async (id, title) => {
        received = { id, title }
      },
    })
    expect((await runCommandLine("/rename Mon titre", context(log, transport))).ok).toBe(true)
    expect(received).toEqual({ id: "ses_active", title: "Mon titre" })
    expect(log.reloaded).toBe(1)
    expect((await runCommandLine("/rename", context(log))).ok).toBe(true)
    expect(log.renamed).toEqual(["ses_active"])
  })

  test("/rename : échec serveur explicite", async () => {
    const log = newLog()
    const result = await runCommandLine("/rename X", context(log, fakeTransport({ update: rejects })))
    expect(result.ok).toBe(false)
    expect(log.errors).toContain("server 500")
  })

  test("/fork sélectionne le fork ; échec sans identifiant retourné", async () => {
    const ok = newLog()
    expect((await runCommandLine("/fork", context(ok))).ok).toBe(true)
    expect(ok.selected).toEqual(["ses_fork"])
    const bad = newLog()
    const result = await runCommandLine("/fork", context(bad, fakeTransport({ fork: async () => undefined })))
    expect(result.ok).toBe(false)
    expect(bad.errors).toContain("Server did not return a forked session")
  })

  test("/undo appelle revert puis relit le fil ; échec si revert est rejeté", async () => {
    const log = newLog()
    let reverted: string | undefined
    const transport = fakeTransport({
      revert: async (id) => {
        reverted = id
      },
    })
    expect((await runCommandLine("/undo", context(log, transport))).ok).toBe(true)
    expect(reverted).toBe("ses_active")
    expect(log.reloaded).toBe(1)
    const bad = newLog()
    const result = await runCommandLine("/undo", context(bad, fakeTransport({ revert: rejects })))
    expect(result.ok).toBe(false)
    expect(bad.errors).toContain("server 500")
    expect(bad.reloaded).toBe(0)
  })

  test("/compact résume puis relit ; échec si summarize est rejeté", async () => {
    const log = newLog()
    expect((await runCommandLine("/compact", context(log))).ok).toBe(true)
    expect(log.notices).toContain("Session compacted")
    const bad = newLog()
    const result = await runCommandLine("/compact", context(bad, fakeTransport({ summarize: rejects })))
    expect(result.ok).toBe(false)
    expect(bad.errors).toContain("server 500")
  })

  test("/copy copie le transcript réel ; échec si presse-papiers indisponible ou transcript vide", async () => {
    const log = newLog()
    expect((await runCommandLine("/copy", context(log))).ok).toBe(true)
    expect(log.clipboard).toEqual(["## You\n\nBonjour\n\n## Assistant\n\nBonsoir"])
    const bad = newLog()
    const result = await runCommandLine(
      "/copy",
      context(bad, fakeTransport(), { clipboard: async () => false }),
    )
    expect(result.ok).toBe(false)
    expect(bad.errors).toContain("Clipboard unavailable")
    const empty = newLog()
    expect(
      (await runCommandLine("/copy", context(empty, fakeTransport({ messages: async () => [] })))).ok,
    ).toBe(false)
    expect(empty.errors).toContain("No transcript to use")
  })

  test("/export télécharge le Markdown ; échec si le téléchargement lève", async () => {
    const log = newLog()
    expect((await runCommandLine("/export", context(log))).ok).toBe(true)
    expect(log.downloads).toEqual([
      { filename: "ses_active.md", content: "## You\n\nBonjour\n\n## Assistant\n\nBonsoir" },
    ])
    const bad = newLog()
    const result = await runCommandLine(
      "/export",
      context(bad, fakeTransport(), {
        download: () => {
          throw new Error("download blocked")
        },
      }),
    )
    expect(result.ok).toBe(false)
    expect(bad.errors).toContain("download blocked")
  })

  test("/share copie une URL locale et ne POST jamais vers une route de partage", async () => {
    const { impl, calls } = recordingFetch({})
    const log = newLog()
    const ctx = context(log, createTransport(impl))
    // Le transport branché sur fetch ne doit recevoir aucun appel pour /share.
    expect((await runCommandLine("/share", ctx)).ok).toBe(true)
    expect(calls).toEqual([])
    expect(log.clipboard).toEqual(["http://127.0.0.1:4097/ui/?session=ses_active"])
    expect(log.notices).toContain("Local session link copied")
  })

  test("/init initialise puis relit ; échec si init est rejeté", async () => {
    const log = newLog()
    let inited: string | undefined
    const transport = fakeTransport({
      init: async (id) => {
        inited = id
      },
    })
    expect((await runCommandLine("/init", context(log, transport))).ok).toBe(true)
    expect(inited).toBe("ses_active")
    expect(log.reloaded).toBe(1)
    const bad = newLog()
    const result = await runCommandLine("/init", context(bad, fakeTransport({ init: rejects })))
    expect(result.ok).toBe(false)
    expect(bad.errors).toContain("server 500")
  })

  test("/review transmet la commande et ses arguments au serveur", async () => {
    const log = newLog()
    let received: { command: string; args?: string } | undefined
    const transport = fakeTransport({
      command: async (_id, command, args) => {
        received = { command, args }
      },
    })
    expect((await runCommandLine("/review branch", context(log, transport))).ok).toBe(true)
    expect(received).toEqual({ command: "review", args: "branch" })
    const bad = newLog()
    expect((await runCommandLine("/review", context(bad, fakeTransport({ command: rejects })))).ok).toBe(false)
    expect(bad.errors).toContain("server 500")
  })

  test("/editor ouvre l'éditeur intégré, sans shell", async () => {
    const log = newLog()
    expect((await runCommandLine("/editor", context(log))).ok).toBe(true)
    expect(log.editor).toBe(1)
    const bad = newLog()
    const result = await runCommandLine(
      "/editor",
      context(bad, fakeTransport(), {
        openEditor: () => {
          throw new Error("editor unavailable")
        },
      }),
    )
    expect(result.ok).toBe(false)
    expect(bad.errors).toContain("editor unavailable")
  })

  test("/exit confirme avant de fermer ; un refus ne touche à rien", async () => {
    const log = newLog()
    expect((await runCommandLine("/exit", context(log))).ok).toBe(true)
    expect(log.confirmed).toBe(1)
    expect(log.cleared).toBe(1)
    const canceled = newLog()
    const result = await runCommandLine(
      "/exit",
      context(canceled, fakeTransport(), { confirm: async () => false }),
    )
    expect(result.canceled).toBe(true)
    expect(canceled.cleared).toBe(0)
    expect(canceled.errors).toEqual([])
    expect(canceled.notices).toEqual([])
  })
})

describe("skills et prompts MCP", () => {
  test("skill : nom et arguments réels, activité pending → done, exécution via la commande serveur", async () => {
    const log = newLog()
    let received: { command: string; args?: string } | undefined
    const transport = fakeTransport({
      command: async (_id, command, args) => {
        received = { command, args }
      },
    })
    const result = await runCommandLine(
      "/humanizer ce texte",
      context(log, transport, {}, "ses_active", [{ name: "humanizer", source: "skill" }]),
    )
    expect(result.ok).toBe(true)
    expect(received).toEqual({ command: "humanizer", args: "ce texte" })
    expect(log.activities).toHaveLength(1)
    expect(log.activities[0]).toMatchObject({ kind: "skill", name: "humanizer", arguments: "ce texte" })
    expect(log.activities[0]?.status).toBe("pending")
    expect(log.statuses.map((s) => s.status)).toEqual(["done"])
    expect(activityText(log.activities[0]!)).toBe("humanizer · ce texte")
  })

  test("skill échoué : l'activité passe en error et l'erreur remonte", async () => {
    const log = newLog()
    const result = await runCommandLine(
      "/humanizer",
      context(log, fakeTransport({ command: rejects }), {}, "ses_active", [
        { name: "humanizer", source: "skill" },
      ]),
    )
    expect(result.ok).toBe(false)
    expect(log.statuses.map((s) => s.status)).toEqual(["error"])
    expect(log.errors).toContain("server 500")
    expect(log.reloaded).toBe(0)
  })

  test("mcp : la provenance vient du catalogue, l'activité est taguée mcp", async () => {
    const log = newLog()
    let received: string | undefined
    const transport = fakeTransport({
      command: async (_id, command) => {
        received = command
      },
    })
    const result = await runCommandLine(
      "/git:git_wrapup:mcp cible=main",
      context(log, transport, {}, "ses_active", [{ name: "git:git_wrapup:mcp", source: "mcp" }]),
    )
    expect(result.ok).toBe(true)
    expect(received).toBe("git:git_wrapup:mcp")
    expect(log.activities[0]?.kind).toBe("mcp")
    expect(log.statuses.map((s) => s.status)).toEqual(["done"])
  })
})

describe("garde-fous", () => {
  test("chaque commande nécessitant une session échoue sans session active", async () => {
    const needingSession = SESSION_COMMANDS.filter((c) => c.needsSession).map((c) => c.name)
    expect(needingSession).toHaveLength(11)
    for (const name of needingSession) {
      const log = newLog()
      const result = await runCommandLine(`/${name}`, context(log, fakeTransport(), {}, null))
      expect(result.ok, `/${name}`).toBe(false)
      expect(log.errors, `/${name}`).toContain("No active session")
    }
  })

  test("une commande inconnue échoue sans appeler le serveur", async () => {
    const { impl, calls } = recordingFetch({})
    const log = newLog()
    const result = await runCommandLine("/inconnu", context(log, createTransport(impl)))
    expect(result.ok).toBe(false)
    expect(log.errors).toContain("Unknown command /inconnu")
    expect(calls).toEqual([])
  })

  test("du texte libre n'est ni une commande ni une erreur bruyante", async () => {
    const log = newLog()
    const result = await runCommandLine("bonjour", context(log))
    expect(result.ok).toBe(false)
    expect(log.errors).toEqual([])
  })
})
