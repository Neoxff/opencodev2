import { describe, expect, test } from "vitest"
import {
  applyDelta,
  buildConversation,
  eventToLines,
  formatDuration,
  goalFromSession,
  inlineCode,
  queuedUserIDs,
  renderLine,
  statusFromEvent,
  unwrapGlobalEvent,
  type ConversationLine,
} from "../public/ui/conversation.js"

const NOW = 1_795_311_205_438
const SESSION = "ses_test"

const ICON = () => '<svg class="i"></svg>'
const STAMP = (i: number) => `12:03:${String(24 + i * 9).padStart(2, "0")}`

function rendered(lines: ConversationLine[]) {
  return lines.map((line) => renderLine(line, { icon: ICON, stamp: STAMP })).join("")
}

function partUpdated(part: Record<string, unknown>, time = NOW) {
  return {
    id: `evt_${part.id}`,
    type: "message.part.updated",
    properties: { sessionID: SESSION, part, time },
  }
}

describe("ui conversation — événements enregistrés", () => {
  test("formatDuration et inlineCode gardent les formats de la maquette", () => {
    expect(formatDuration(0)).toBe("0ms")
    expect(formatDuration(1900)).toBe("2s")
    expect(formatDuration(252_000)).toBe("4m 12s")
    expect(inlineCode("État <code>divergent</code> corrigé avec `fetch`")).toContain("<code>fetch</code>")
    expect(inlineCode("<script>")).toBe("&lt;script&gt;")
  })

  test("session.diff devient une ligne edits avec +n et -n", () => {
    const lines = eventToLines(
      {
        id: "evt_diff",
        type: "session.diff",
        properties: {
          sessionID: SESSION,
          time: NOW,
          diff: [{ file: "packages/webui/public/ui/ui.js", additions: 14, deletions: 1, status: "modified" }],
        },
      },
      { sessionID: SESSION },
    )
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ kind: "edit", path: "packages/webui/public/ui/ui.js", a: "+14", d: "-1" })
    const html = rendered(lines)
    expect(html).toContain('class="add">+14')
    expect(html).toContain('class="del">-1')
    expect(html).toContain(">edits<")
  })

  test("file.edited devient aussi une ligne edits", () => {
    const lines = eventToLines({ type: "file.edited", properties: { file: "AGENTS.md", time: NOW } })
    expect(lines[0]).toMatchObject({ kind: "edit", path: "AGENTS.md", a: "+1", d: "-1" })
  })

  test("reasoning devient Thought avec durée, caractères et texte repliable", () => {
    const text = "Je vérifie d’abord l’état réel du dépôt, puis je relis le test qui échoue."
    const lines = eventToLines(
      partUpdated({
        id: "prt_thought",
        messageID: "msg_assistant",
        type: "reasoning",
        text,
        time: { start: NOW - 11_000, end: NOW },
      }),
      { sessionID: SESSION },
    )
    expect(lines[0]).toMatchObject({ kind: "th", s: "11s", c: String(text.length), x: text })
    const html = rendered(lines)
    expect(html).toContain('class="row th')
    expect(html).toContain("<small>11s</small>")
    expect(html).toContain(`<div class="tt">${text}</div>`)
  })

  test("un tool terminé devient run repliable avec sa sortie", () => {
    const output = "$ git status --short\n(clean)"
    const lines = eventToLines(
      partUpdated({
        id: "prt_run",
        messageID: "msg_assistant",
        type: "tool",
        tool: "bash",
        state: {
          status: "completed",
          title: "Vérifie le commit",
          output,
          time: { start: NOW - 15, end: NOW },
        },
      }),
      { sessionID: SESSION },
    )
    expect(lines[0]).toMatchObject({ kind: "run", title: "Vérifie le commit", t: "15ms", o: output })
    const html = rendered(lines)
    expect(html).toContain('class="row run')
    expect(html).toContain('class="out">$ git status --short\n(clean)<i>Click to collapse</i>')
  })

  test("delegate done et running portent le chrono réel", () => {
    const done = eventToLines(
      partUpdated({
        id: "prt_done",
        messageID: "msg_assistant",
        type: "tool",
        tool: "task",
        state: {
          status: "completed",
          title: "Tests du panneau Dépôt",
          time: { start: NOW - 252_000, end: NOW },
        },
      }),
      { sessionID: SESSION },
    )
    expect(done[0]).toMatchObject({ kind: "del", title: "Tests du panneau Dépôt", run: false, t: "4m 12s" })
    expect(rendered(done)).toContain("<span>done</span><span>4m 12s</span>")

    const running = eventToLines(
      partUpdated({
        id: "prt_running",
        messageID: "msg_assistant",
        type: "tool",
        tool: "task",
        state: { status: "running", title: "Corriger la réinitialisation", time: { start: NOW - 455_000 } },
      }),
      { sessionID: SESSION },
    )
    expect(running[0]).toMatchObject({ kind: "del", run: true, s0: NOW - 455_000 })
    expect(rendered(running)).toContain(`class="live" data-s="${NOW - 455_000}"`)
  })

  test("subtask devient delegate running", () => {
    const lines = eventToLines(
      partUpdated({
        id: "prt_subtask",
        messageID: "msg_assistant",
        type: "subtask",
        description: "Relire les tests",
        agent: "qa-tester",
        time: { start: NOW - 4_000 },
      }),
      { sessionID: SESSION },
    )
    expect(lines[0]).toMatchObject({ kind: "del", title: "Relire les tests", run: true, s0: NOW - 4_000 })
  })

  test("texte assistant devient paragraphe avec code vert", () => {
    const lines = eventToLines(
      partUpdated({ id: "prt_text", messageID: "msg_assistant", type: "text", text: "Correctif `5c0793a3e` commité." }),
      { sessionID: SESSION, roles: { msg_assistant: "assistant" } },
    )
    expect(lines[0]).toMatchObject({ kind: "p" })
    expect(rendered(lines)).toContain("<code>5c0793a3e</code>")
  })

  test("texte utilisateur devient me, avec queued quand le tour est actif", () => {
    const event = partUpdated({ id: "prt_user", messageID: "msg_user", type: "text", text: "salut" })
    const plain = eventToLines(event, { sessionID: SESSION, roles: { msg_user: "user" } })
    expect(plain[0]).toMatchObject({ kind: "me", text: "salut", queued: false })
    expect(rendered(plain)).not.toContain('class="q"')

    const queued = eventToLines(event, {
      sessionID: SESSION,
      roles: { msg_user: "user" },
      queued: { msg_user: true },
    })
    expect(queued[0]).toMatchObject({ kind: "me", queued: true })
    expect(rendered(queued)).toContain('<span class="q">queued</span>')
  })

  test("queuedUserIDs marque le dernier prompt sans réponse pendant un tour actif", () => {
    const messages = [
      { info: { id: "u1", role: "user" } },
      { info: { id: "a1", role: "assistant", parentID: "u1", finish: "stop" } },
      { info: { id: "u2", role: "user" } },
    ]
    expect(queuedUserIDs(messages, false)).toEqual({})
    expect(queuedUserIDs(messages, true)).toEqual({ u2: true })
  })

  test("buildConversation ordonne edits, thought, paragraphes et messages", () => {
    const messages = [
      {
        info: { id: "u1", role: "user", time: { created: NOW - 10_000 } },
        parts: [{ id: "p1", type: "text", text: "lis le fichier", time: { start: NOW - 10_000 } }],
      },
      {
        info: { id: "a1", role: "assistant", parentID: "u1", time: { created: NOW } },
        parts: [
          { id: "p2", type: "reasoning", text: "Je vérifie.", time: { start: NOW - 5_000, end: NOW - 3_000 } },
          { id: "p3", type: "text", text: "Fait avec `git`.", time: { start: NOW } },
        ],
      },
    ]
    const diffs = [{ file: "AGENTS.md", additions: 2, deletions: 0, status: "modified" }]
    const lines = buildConversation(messages, diffs, { sessionID: SESSION, busy: false })
    expect(lines.map((line) => line.kind)).toEqual(["edit", "me", "th", "p"])
    expect(lines[1]).toMatchObject({ text: "lis le fichier" })
    expect(lines[3].html).toContain("<code>git</code>")
  })

  test("statusFromEvent et unwrapGlobalEvent lisent le flux /global/event", () => {
    const busyEvent = { id: "evt_status", type: "session.status", properties: { sessionID: SESSION, status: { type: "busy" } } }
    const idleEvent = { id: "evt_idle", type: "session.status", properties: { sessionID: SESSION, status: { type: "idle" } } }
    expect(statusFromEvent(busyEvent)).toBe(true)
    expect(statusFromEvent(idleEvent)).toBe(false)

    const unwrapped = unwrapGlobalEvent({ payload: busyEvent })
    expect(unwrapped).toMatchObject({ type: "session.status", properties: { sessionID: SESSION } })
    expect(unwrapGlobalEvent({ payload: { type: "sync" } })).toBeUndefined()
    expect(unwrapGlobalEvent({ payload: { type: "server.connected" } })).toMatchObject({ type: "server.connected" })
  })

  test("goalFromSession suit les todos réels", () => {
    expect(
      goalFromSession(
        { title: "Session réelle" },
        [
          { content: "Première porte", status: "completed" },
          { content: "Seconde porte", status: "in_progress" },
        ],
      ),
    ).toEqual({ st: "in progress", dod: ["Première porte", "Seconde porte"], oos: [] })
  })

  test("applyDelta accumule le texte progressif sans ecraser les autres parties", () => {
    const messages = [
      { info: { id: "m1", role: "user" }, parts: [{ id: "p0", type: "text", text: "salut" }] },
      { info: { id: "m2", role: "assistant" }, parts: [{ id: "p1", type: "text", text: "" }] },
    ]
    const once = applyDelta(messages, {
      type: "message.part.delta",
      properties: { sessionID: SESSION, messageID: "m2", partID: "p1", field: "text", delta: "bon" },
    }) as typeof messages
    const twice = applyDelta(once, {
      type: "message.part.delta",
      properties: { sessionID: SESSION, messageID: "m2", partID: "p1", field: "text", delta: "jour" },
    }) as typeof messages
    expect(twice[1].parts[0].text).toBe("bonjour")
    expect(twice[0].parts[0].text).toBe("salut")
    expect(messages[1].parts[0].text).toBe("")
  })

  test("applyDelta rend le meme tableau quand la partie est inconnue", () => {
    const messages = [{ info: { id: "m1" }, parts: [{ id: "p0", type: "text", text: "x" }] }]
    expect(
      applyDelta(messages, {
        type: "message.part.delta",
        properties: { messageID: "m1", partID: "inconnu", field: "text", delta: "y" },
      }),
    ).toBe(messages)
    expect(applyDelta(messages, { type: "session.status", properties: {} })).toBe(messages)
  })
})
