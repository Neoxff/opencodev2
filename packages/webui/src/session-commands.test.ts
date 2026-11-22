import { describe, expect, test } from "vitest"
import {
  parseCommandLine,
  commandSpec,
  resolveSource,
  transcriptToMarkdown,
  runCommandLine,
  activityText,
  SESSION_COMMANDS,
  type SessionCommandTransport,
  type SessionCommandHost,
  type RunContext,
  type CommandActivity,
  type ActivityStatus,
} from "./session-commands"
import type { Message } from "./view-model"

/** Une réponse serveur minimale, relevée sur `GET /session/{id}/message`. */
const sampleMessage: Message = {
  info: { id: "msg_1", role: "user" },
  parts: [{ id: "part_1", type: "text", text: "Bonjour" }],
}

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
}

function fakeTransport(overrides: Partial<SessionCommandTransport> = {}): SessionCommandTransport {
  return {
    create: async () => ({ id: "ses_new" }),
    update: async () => ({}),
    remove: async () => ({}),
    fork: async () => ({ id: "ses_fork" }),
    revert: async () => ({}),
    summarize: async () => ({}),
    share: async () => ({ url: "https://share.example/s/abc" }),
    unshare: async () => ({}),
    init: async () => ({}),
    command: async () => ({}),
    messages: async () => [sampleMessage],
    ...overrides,
  }
}

function fakeHost(log: HostLog, overrides: Partial<SessionCommandHost> = {}): SessionCommandHost {
  return {
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
    confirm: async () => true,
    addActivity: (activity) => log.activities.push(activity),
    updateActivity: (id, status) => log.statuses.push({ id, status }),
    ...overrides,
  }
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
  }
}

function context(
  log: HostLog,
  transport: SessionCommandTransport = fakeTransport(),
  hostOverrides: Partial<SessionCommandHost> = {},
  sessionID: string | null = "ses_active",
  choices: Array<{ name: string; source?: string }> = [],
): RunContext {
  // Un argument explicite `undefined` déclencherait la valeur par défaut : `null` dit « pas de session ».
  return { sessionID: sessionID ?? undefined, choices, transport, host: fakeHost(log, hostOverrides) }
}

const rejects = async () => {
  throw new Error("server 500")
}

describe("analyse de la ligne de commande", () => {
  test("isole le nom et les arguments", () => {
    expect(parseCommandLine("/rename Mon titre")).toEqual({ name: "rename", arguments: "Mon titre" })
  })

  test("une ligne sans argument a des arguments vides", () => {
    expect(parseCommandLine("/compact")).toEqual({ name: "compact", arguments: "" })
  })

  test("une phrase ordinaire n'est pas une commande", () => {
    expect(parseCommandLine("bonjour /rename")).toBeUndefined()
  })

  test("les lignes suivantes ne deviennent pas des arguments", () => {
    expect(parseCommandLine("/review\ndevient un prompt")).toEqual({ name: "review", arguments: "" })
  })

  test("le catalogue porte les douze commandes", () => {
    expect(SESSION_COMMANDS.map((entry) => entry.name)).toEqual([
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

  test("la provenance skill / mcp vient du catalogue du serveur", () => {
    expect(resolveSource("humanizer", [{ name: "humanizer", source: "skill" }])).toBe("skill")
    expect(resolveSource("git:git_wrapup:mcp", [{ name: "git:git_wrapup:mcp", source: "mcp" }])).toBe("mcp")
    expect(resolveSource("review", [])).toBe("command")
  })

  test("le transcript est du Markdown, sans inventer de message", () => {
    expect(transcriptToMarkdown([sampleMessage])).toBe("## You\n\nBonjour")
    expect(transcriptToMarkdown([])).toBe("")
  })
})

describe("/new", () => {
  test("succès : crée la session et la sélectionne", async () => {
    const log = newLog()
    const result = await runCommandLine("/new", context(log))
    expect(result.ok).toBe(true)
    expect(log.selected).toEqual(["ses_new"])
    expect(log.notices).toContain("New session")
  })

  test("échec : le serveur ne rend pas d'identifiant", async () => {
    const log = newLog()
    const result = await runCommandLine("/new", context(log, fakeTransport({ create: async () => undefined })))
    expect(result.ok).toBe(false)
    expect(log.errors).toContain("Server did not return a new session")
    expect(log.selected).toEqual([])
  })

  test("fonctionne sans session courante", async () => {
    const log = newLog()
    const result = await runCommandLine("/new", context(log, fakeTransport(), {}, null))
    expect(result.ok).toBe(true)
  })
})

describe("/rename", () => {
  test("succès : écrit le titre renseigné", async () => {
    const log = newLog()
    let received: { id: string; title: string } | undefined
    const transport = fakeTransport({
      update: async (id, title) => {
        received = { id, title }
      },
    })
    const result = await runCommandLine("/rename Nouveau titre", context(log, transport))
    expect(result.ok).toBe(true)
    expect(received).toEqual({ id: "ses_active", title: "Nouveau titre" })
    expect(log.reloaded).toBe(1)
  })

  test("sans argument : ouvre le dialogue au lieu d'envoyer un titre vide", async () => {
    const log = newLog()
    const result = await runCommandLine("/rename", context(log))
    expect(result.ok).toBe(true)
    expect(log.renamed).toEqual(["ses_active"])
  })

  test("échec : le serveur refuse la mise à jour", async () => {
    const log = newLog()
    const result = await runCommandLine("/rename X", context(log, fakeTransport({ update: rejects })))
    expect(result.ok).toBe(false)
    expect(log.errors).toContain("server 500")
  })
})

describe("/fork", () => {
  test("succès : sélectionne la session forkée", async () => {
    const log = newLog()
    const result = await runCommandLine("/fork", context(log))
    expect(result.ok).toBe(true)
    expect(log.selected).toEqual(["ses_fork"])
  })

  test("échec : pas de session retournée", async () => {
    const log = newLog()
    const result = await runCommandLine("/fork", context(log, fakeTransport({ fork: async () => undefined })))
    expect(result.ok).toBe(false)
    expect(log.errors).toContain("Server did not return a forked session")
  })
})

describe("/undo", () => {
  test("succès : revert puis relecture du fil", async () => {
    const log = newLog()
    let reverted: string | undefined
    const transport = fakeTransport({
      revert: async (id) => {
        reverted = id
      },
    })
    const result = await runCommandLine("/undo", context(log, transport))
    expect(result.ok).toBe(true)
    expect(reverted).toBe("ses_active")
    expect(log.reloaded).toBe(1)
  })

  test("échec : revert rejeté", async () => {
    const log = newLog()
    const result = await runCommandLine("/undo", context(log, fakeTransport({ revert: rejects })))
    expect(result.ok).toBe(false)
    expect(log.errors).toContain("server 500")
    expect(log.reloaded).toBe(0)
  })
})

describe("/compact", () => {
  test("succès : résumé puis relecture", async () => {
    const log = newLog()
    const result = await runCommandLine("/compact", context(log))
    expect(result.ok).toBe(true)
    expect(log.reloaded).toBe(1)
    expect(log.notices).toContain("Session compacted")
  })

  test("échec : summarize rejeté", async () => {
    const log = newLog()
    const result = await runCommandLine("/compact", context(log, fakeTransport({ summarize: rejects })))
    expect(result.ok).toBe(false)
    expect(log.errors).toContain("server 500")
  })
})

describe("/copy", () => {
  test("succès : copie le transcript réel", async () => {
    const log = newLog()
    const result = await runCommandLine("/copy", context(log))
    expect(result.ok).toBe(true)
    expect(log.clipboard).toEqual(["## You\n\nBonjour"])
  })

  test("échec : presse-papiers indisponible", async () => {
    const log = newLog()
    const result = await runCommandLine("/copy", context(log, fakeTransport(), { clipboard: async () => false }))
    expect(result.ok).toBe(false)
    expect(log.errors).toContain("Clipboard unavailable")
  })

  test("échec : aucun transcript à copier", async () => {
    const log = newLog()
    const result = await runCommandLine("/copy", context(log, fakeTransport({ messages: async () => [] })))
    expect(result.ok).toBe(false)
    expect(log.errors).toContain("No transcript to use")
  })
})

describe("/export", () => {
  test("succès : télécharge le transcript en Markdown", async () => {
    const log = newLog()
    const result = await runCommandLine("/export", context(log))
    expect(result.ok).toBe(true)
    expect(log.downloads).toEqual([{ filename: "ses_active.md", content: "## You\n\nBonjour" }])
  })

  test("échec : aucun transcript à exporter", async () => {
    const log = newLog()
    const result = await runCommandLine("/export", context(log, fakeTransport({ messages: async () => undefined })))
    expect(result.ok).toBe(false)
    expect(log.errors).toContain("No transcript to use")
    expect(log.downloads).toEqual([])
  })
})

describe("/share", () => {
  test("succès : copie le lien rendu par le serveur", async () => {
    const log = newLog()
    const result = await runCommandLine("/share", context(log))
    expect(result.ok).toBe(true)
    expect(log.clipboard).toEqual(["https://share.example/s/abc"])
  })

  test("échec : le serveur ne rend pas de lien", async () => {
    const log = newLog()
    const result = await runCommandLine("/share", context(log, fakeTransport({ share: async () => undefined })))
    expect(result.ok).toBe(false)
    expect(log.errors).toContain("Server did not return a share link")
  })
})

describe("/init", () => {
  test("succès : initialise puis relit la session", async () => {
    const log = newLog()
    let inited: string | undefined
    const transport = fakeTransport({
      init: async (id) => {
        inited = id
      },
    })
    const result = await runCommandLine("/init", context(log, transport))
    expect(result.ok).toBe(true)
    expect(inited).toBe("ses_active")
    expect(log.reloaded).toBe(1)
  })

  test("échec : init rejeté", async () => {
    const log = newLog()
    const result = await runCommandLine("/init", context(log, fakeTransport({ init: rejects })))
    expect(result.ok).toBe(false)
    expect(log.errors).toContain("server 500")
  })
})

describe("/review", () => {
  test("succès : transmet la commande et ses arguments au serveur", async () => {
    const log = newLog()
    let received: { command: string; args?: string } | undefined
    const transport = fakeTransport({
      command: async (_id, command, args) => {
        received = { command, args }
      },
    })
    const result = await runCommandLine("/review branch", context(log, transport))
    expect(result.ok).toBe(true)
    expect(received).toEqual({ command: "review", args: "branch" })
  })

  test("échec : la commande serveur est rejetée", async () => {
    const log = newLog()
    const result = await runCommandLine("/review", context(log, fakeTransport({ command: rejects })))
    expect(result.ok).toBe(false)
    expect(log.errors).toContain("server 500")
  })
})

describe("/editor", () => {
  test("succès : ouvre l'éditeur de l'application, sans shell", async () => {
    const log = newLog()
    const result = await runCommandLine("/editor", context(log))
    expect(result.ok).toBe(true)
    expect(log.editor).toBe(1)
  })

  test("échec : l'éditeur ne peut pas s'ouvrir", async () => {
    const log = newLog()
    const result = await runCommandLine("/editor", context(log, fakeTransport(), { openEditor: () => {
      throw new Error("editor unavailable")
    } }))
    expect(result.ok).toBe(false)
    expect(log.errors).toContain("editor unavailable")
  })
})

describe("/exit", () => {
  test("succès : confirmation acceptée, la vue se ferme", async () => {
    const log = newLog()
    const result = await runCommandLine("/exit", context(log))
    expect(result.ok).toBe(true)
    expect(log.cleared).toBe(1)
  })

  test("refus de confirmation : rien n'est fermé", async () => {
    const log = newLog()
    const result = await runCommandLine("/exit", context(log, fakeTransport(), { confirm: async () => false }))
    expect(result.ok).toBe(false)
    expect(result.canceled).toBe(true)
    expect(log.cleared).toBe(0)
    expect(log.errors).toEqual([])
  })
})

describe("skills et prompts MCP", () => {
  test("skill : la ligne porte le nom réel et les arguments, puis le statut", async () => {
    const log = newLog()
    const result = await runCommandLine("/humanizer ce texte", context(log, fakeTransport(), {}, "ses_active", [
      { name: "humanizer", source: "skill" },
    ]))
    expect(result.ok).toBe(true)
    expect(log.activities).toHaveLength(1)
    expect(log.activities[0]).toMatchObject({ kind: "skill", name: "humanizer", arguments: "ce texte" })
    expect(log.statuses.map((entry) => entry.status)).toEqual(["done"])
    expect(activityText(log.activities[0]!)).toBe("humanizer · ce texte")
  })

  test("skill échoué : la ligne passe en erreur", async () => {
    const log = newLog()
    const result = await runCommandLine("/humanizer", context(log, fakeTransport({ command: rejects }), {}, "ses_active", [
      { name: "humanizer", source: "skill" },
    ]))
    expect(result.ok).toBe(false)
    expect(log.statuses.map((entry) => entry.status)).toEqual(["error"])
    expect(log.errors).toContain("server 500")
  })

  test("mcp : la provenance vient du catalogue, pas d'une devinette", async () => {
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
  })

  test("mcp échoué : erreur remontée et ligne en erreur", async () => {
    const log = newLog()
    const result = await runCommandLine(
      "/git:git_wrapup:mcp",
      context(log, fakeTransport({ command: rejects }), {}, "ses_active", [
        { name: "git:git_wrapup:mcp", source: "mcp" },
      ]),
    )
    expect(result.ok).toBe(false)
    expect(log.errors).toContain("server 500")
    expect(log.statuses.map((entry) => entry.status)).toEqual(["error"])
  })
})

describe("garde-fous", () => {
  test("une commande de session sans session active échoue", async () => {
    const log = newLog()
    const result = await runCommandLine("/compact", context(log, fakeTransport(), {}, null))
    expect(result.ok).toBe(false)
    expect(log.errors).toContain("No active session")
  })

  test("une commande inconnue échoue sans appeler le serveur", async () => {
    const log = newLog()
    const result = await runCommandLine("/inconnu", context(log))
    expect(result.ok).toBe(false)
    expect(log.errors).toContain("Unknown command /inconnu")
  })

  test("du texte libre n'est pas traité comme une commande", async () => {
    const log = newLog()
    const result = await runCommandLine("bonjour", context(log))
    expect(result.ok).toBe(false)
    expect(log.errors).toEqual([])
  })
})
