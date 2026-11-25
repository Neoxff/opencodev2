/**
 * Conversion du flux réel d'événements de session en lignes de la maquette /ui.
 *
 * Ce module est purement fonctionnel : il ne touche ni au DOM ni au CSS. Le rendu
 * reprend exactement les classes et la structure des helpers R.* de `ui.js`.
 */

import { queuedUserIDs as deliveryQueued, isHiddenSteer } from "./session-delivery.js"

const EDIT_TOOLS = new Set(["edit", "write", "apply_patch", "multiedit", "patch"])
const DELEGATE_TOOLS = new Set(["task", "subagent", "delegate", "agent", "fork"])

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/** Texte assistant : le code entre backticks passe dans <code> (vert via la CSS de la maquette). */
export function inlineCode(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\n/g, "<br>")
}

export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return ""
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  const total = Math.floor(ms / 1000)
  return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, "0")}s`
}

function countDiff(diff) {
  if (!Array.isArray(diff)) return { a: 0, d: 0 }
  let a = 0
  let d = 0
  let declared = false
  for (const entry of diff) {
    if (!entry || typeof entry !== "object") continue
    if (Number.isFinite(entry.additions) || Number.isFinite(entry.deletions)) {
      declared = true
      if (Number.isFinite(entry.additions)) a += entry.additions
      if (Number.isFinite(entry.deletions)) d += entry.deletions
    }
  }
  if (declared) return { a, d }
  for (const entry of diff) {
    if (typeof entry?.patch !== "string") continue
    for (const line of entry.patch.split("\n")) {
      if (line.startsWith("+++") || line.startsWith("---")) continue
      if (line.startsWith("+")) a += 1
      else if (line.startsWith("-")) d += 1
    }
  }
  return { a, d }
}

function patchCounts(text) {
  if (typeof text !== "string") return { a: 0, d: 0 }
  return countDiff([{ patch: text }])
}

function partPath(part) {
  const input = part?.state?.input ?? {}
  const state = part?.state ?? {}
  return (
    input.file_path ||
    input.filePath ||
    input.path ||
    input.filename ||
    state.title ||
    (typeof state.output === "string" ? state.output.split("\n")[0] : "") ||
    part?.tool ||
    "fichier"
  )
}

function partTitle(part) {
  const input = part?.state?.input ?? {}
  const state = part?.state ?? {}
  return state.title || input.description || input.prompt || input.command || part?.description || part?.tool || "exécution"
}

/**
 * Convertit un événement du bus ( forme {type, properties} ) en zéro ou plusieurs lignes.
 * Les événements enregistrés utilisés par les tests suivent exactement les formes v2.
 */
export function eventToLines(event, ctx = {}) {
  if (!event || typeof event !== "object") return []
  const type = event.type
  const props = event.properties && typeof event.properties === "object" ? event.properties : {}
  const sessionID = props.sessionID || ctx.sessionID || ""
  const eventTime = Number.isFinite(props.time) ? props.time : undefined

  if (type === "session.diff") {
    const diff = Array.isArray(props.diff) ? props.diff : []
    return diff.map((entry, index) => {
      const counts = countDiff([entry])
      return {
        key: `diff:${sessionID}:${entry?.file ?? index}`,
        kind: "edit",
        path: entry?.file || "fichier",
        a: `+${counts.a}`,
        d: `-${counts.d}`,
        t: "done",
        ts: eventTime,
      }
    })
  }

  if (type === "file.edited") {
    return [
      {
        key: `file:${props.file ?? ""}`,
        kind: "edit",
        path: props.file || "fichier",
        a: "+1",
        d: "-1",
        t: "done",
        ts: eventTime,
      },
    ]
  }

  if (type === "message.part.updated") {
    return partToLines(props.part, { ...ctx, sessionID, eventTime, roleByMessage: ctx.roles ?? ctx.roleByMessage })
  }

  if (type === "message.updated") {
    const info = props.info ?? {}
    if (ctx.roles && info.id) ctx.roles[info.id] = info.role
    return []
  }

  if (type === "session.updated") {
    return []
  }

  if (type === "todo.updated") {
    return []
  }

  return []
}

function partToLines(part, ctx) {
  if (!part || typeof part !== "object" || part.ignored || part.synthetic) return []
  // Une consigne steer n'est jamais affichée dans la conversation : elle est injectée au modèle.
  if (part.type === "text" && part?.metadata?.steer === true) return []
  const id = part.id || ctx.eventTime || "part"
  const start = part.time?.start ?? part.state?.time?.start ?? ctx.eventTime
  const end = part.state?.time?.end ?? part.time?.end
  const base = { key: `part:${ctx.sessionID}:${id}`, i: 0, ts: start }

  if (part.type === "reasoning") {
    const text = String(part.text ?? "")
    const duration = end && start ? formatDuration(end - start) : ""
    return [{ ...base, kind: "th", s: duration, c: String(text.length), x: text }]
  }

  if (part.type === "text") {
    const text = String(part.text ?? "")
    if (!text.trim()) return []
    const role = ctx.roleByMessage?.[part.messageID] || (part.role === "user" ? "user" : "assistant")
    if (role === "user") {
      const queued = Boolean(ctx.queued?.[part.messageID] || part.metadata?.queued)
      return [{ ...base, kind: "me", text, queued, messageID: part.messageID }]
    }
    return [{ ...base, kind: "p", html: inlineCode(text) }]
  }

  if (part.type === "subtask") {
    return [
      {
        ...base,
        kind: "del",
        title: part.description || part.prompt || part.agent || "delegate",
        run: true,
        s0: start ?? Date.now(),
      },
    ]
  }

  if (part.type === "tool") {
    const tool = String(part.tool ?? "")
    const state = part.state ?? {}
    const running = state.status === "running" || state.status === "pending"
    const duration = start && end ? formatDuration(end - start) : ""
    const title = partTitle(part)

    if (EDIT_TOOLS.has(tool)) {
      const counts = state.metadata?.diff ? countDiff(state.metadata.diff) : patchCounts(state.output)
      return [
        {
          ...base,
          kind: "edit",
          path: partPath(part),
          a: `+${counts.a}`,
          d: `-${counts.d}`,
          t: running ? "running" : duration || "done",
        },
      ]
    }

    if (DELEGATE_TOOLS.has(tool)) {
      if (running) return [{ ...base, kind: "del", title, run: true, s0: state.time?.start ?? start ?? Date.now() }]
      return [{ ...base, kind: "del", title, run: false, t: duration || "done" }]
    }

    return [
      {
        ...base,
        kind: "run",
        title,
        t: running ? "running" : duration || "done",
        o: typeof state.output === "string" ? state.output : state.status === "error" ? String(state.error ?? "") : "",
      },
    ]
  }

  return []
}

/** Déplie l'enveloppe /global/event ; ignore les doublons sync et les battements. */
export function unwrapGlobalEvent(data) {
  if (!data || typeof data !== "object") return undefined
  const payload = data.payload
  if (!payload || typeof payload !== "object") return undefined
  if (payload.type === "sync" || typeof payload.type !== "string") return undefined
  const properties = payload.properties && typeof payload.properties === "object" ? payload.properties : {}
  return {
    id: typeof payload.id === "string" ? payload.id : undefined,
    type: payload.type,
    properties,
  }
}

export function statusFromEvent(event) {
  if (event?.type !== "session.status") return undefined
  const status = event.properties?.status
  if (!status || typeof status !== "object") return undefined
  return status.type !== "idle"
}

/** Marque le dernier prompt utilisateur sans réponse comme « queued » pendant un tour actif. */
export function queuedUserIDs(messages, busy) {
  return deliveryQueued(messages, busy)
}

export function goalFromSession(session, todos) {
  const goalState = session?.goalState
  const list = Array.isArray(todos) ? todos : []
  const status =
    goalState?.status ||
    (list.some((t) => t.status === "in_progress") ? "in progress" : list.length ? "pending" : "pending")
  const recorded = Array.isArray(goalState?.dod)
    ? goalState.dod.map((x) => (typeof x === "string" ? x : x?.content || String(x)))
    : list.map((t) => t.content)
  const dod = recorded.length ? recorded : [session?.title || session?.slug || "Session courante"]
  const oos = Array.isArray(goalState?.oos)
    ? goalState.oos
    : Array.isArray(goalState?.outOfScope)
      ? goalState.outOfScope
      : []
  return { st: status, dod, oos }
}

/** Construit les lignes historiques à partir des messages et du diff persistés. */
export function buildConversation(messages, diffs, ctx = {}) {
  const list = Array.isArray(messages) ? messages : []
  const roles = ctx.roles ?? {}
  for (const message of list) {
    if (message?.info?.id && message?.info?.role) roles[message.info.id] = message.info.role
  }
  const queued = ctx.queued ?? queuedUserIDs(list, ctx.busy)
  const lines = []

  const diffList = Array.isArray(diffs) ? diffs : []
  for (const entry of diffList) {
    lines.push(
      ...eventToLines(
        { type: "session.diff", properties: { sessionID: ctx.sessionID, diff: [entry] } },
        { roles, queued },
      ),
    )
  }

  for (const message of list) {
    if (isHiddenSteer(message)) continue
    const parts = Array.isArray(message?.parts) ? message.parts : []
    for (const part of parts) {
      lines.push(
        ...partToLines(
          { ...part, messageID: part?.messageID || message?.info?.id, role: message?.info?.role },
          {
            ...ctx,
            roles,
            queued,
            roleByMessage: roles,
            sessionID: ctx.sessionID,
            eventTime: message?.info?.time?.created,
          },
        ),
      )
    }
  }

  return lines.map((line, index) => ({ ...line, i: index }))
}

/** Rendu d'une ligne avec les mêmes classes que les helpers R.* de la maquette. */
export function renderLine(line, ctx = {}) {
  const i = Number.isFinite(line?.i) ? line.i : 0
  const stamp = ctx.stamp || ((n) => String(n).padStart(2, "0"))
  const icon = ctx.icon || (() => "")
  const late = line?.late ? " late" : ""
  const attrs = `data-ts="${stamp(i)}" data-line="${escapeHtml(line?.key ?? "")}" data-kind="${line?.kind ?? ""}" style="--i:${i}"`
  switch (line?.kind) {
    case "edit":
      return `<div class="row${late}" ${attrs}><span class="ico">${icon("pencil", "s")}</span><span class="vb">edits</span><span class="nm">${escapeHtml(line.path)}</span><span class="rt"><span class="add">${escapeHtml(line.a)}</span><span class="del">${escapeHtml(line.d)}</span><span>done</span><span class="x">${escapeHtml(line.t)}</span></span></div>`
    case "th":
      return `<div class="row th${late}" ${attrs}><span class="ico">${icon("brain", "s")}</span><span class="vb">Thought<small>${escapeHtml(line.s)}</small></span><span class="rt"><span>${escapeHtml(line.c)} characters</span></span></div><div class="tt">${escapeHtml(line.x)}</div>`
    case "run":
      return `<div class="row run${late}" ${attrs}><span class="ico">${icon("term", "s")}</span><span class="vb">runs</span><span class="nm sans">${escapeHtml(line.title)}</span><span class="rt"><span>done</span><span class="x">${escapeHtml(line.t)}</span></span></div><div class="out">${escapeHtml(line.o)}<i>Click to collapse</i></div>`
    case "del":
      return `<div class="row${late}" ${attrs}><span class="ico">${icon("box", "s")}</span><span class="vb">delegates</span><span class="nm sans">${escapeHtml(line.title)}</span><span class="rt">${line.run ? `<span class="live" data-s="${Number(line.s0) || Date.now()}">running</span>` : `<span>done</span><span>${escapeHtml(line.t)}</span>`}</span></div>`
    case "p":
      return `<div class="p${late}" ${attrs}>${line.html}</div>`
    case "me":
      return `<div class="me${late}" ${attrs}>${escapeHtml(line.text)}${line.queued ? '<span class="q">queued</span>' : ""}</div>`
    default:
      return ""
  }
}
