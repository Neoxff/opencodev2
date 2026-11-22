/**
 * Conversation de la maquette validée, alimentée par les parties du flux serveur.
 *
 * Ce module est présentationnel : il reçoit des `Part`, `ToolState` et durées déjà calculées
 * dans `app.tsx` à partir de `GET /session/messages` et des événements SSE. Aucune ligne n'est
 * inventée ici.
 */
import { Show } from "solid-js"
import { Markdown } from "./components"
import { BackIcon, RefreshIcon, TargetIcon, ToolIcon, ThinkIcon } from "./icons"
import { formatDuration, type ToolState } from "./view-model"

export type ConversationView = "chat" | "logs"

export function ConversationHeader(props: {
  title: string
  view: ConversationView
  working: boolean
  onBack: () => void
  onGoal: () => void
  onView: (view: ConversationView) => void
  onConfig: () => void
}) {
  return (
    <div class="conv-head">
      <button class="conv-back" aria-label="Back" title="Back" onClick={() => props.onBack()}>
        <BackIcon size={16} />
      </button>
      <h1 class="conv-title">{props.title}</h1>
      <button class="conv-goal" title="Goal definition" onClick={() => props.onGoal()}>
        <TargetIcon size={14} />
        <span>Goal definition</span>
      </button>
      <div class="conv-tabs">
        <button class="conv-tab" classList={{ on: props.view === "chat" }} onClick={() => props.onView("chat")}>
          Conversation
        </button>
        <button class="conv-tab" onClick={() => props.onConfig()}>
          Config
        </button>
        <button class="conv-tab" classList={{ on: props.view === "logs" }} onClick={() => props.onView("logs")}>
          Logs
        </button>
        <Show when={props.working}>
          <span class="conv-working">
            Working...
            <RefreshIcon size={13} />
          </span>
        </Show>
      </div>
    </div>
  )
}

/** Durée d'un outil, bornée à la fin du serveur ou au battement courant si l'outil travaille. */
export function toolDuration(state: ToolState, tick: number): string | undefined {
  const start = "time" in state && typeof state.time.start === "number" ? state.time.start : undefined
  if (start === undefined) return undefined
  const end =
    state.status === "completed" || state.status === "error" ? state.time.end : state.status === "running" ? tick : undefined
  return formatDuration(typeof end === "number" && end > start ? end - start : undefined)
}

/** Ligne `edits` — le ± lignes vient de `metadata.filediff`, jamais d'une estimation. */
export function EditRow(props: {
  file: string
  additions: number
  deletions: number
  done: boolean
  duration?: string
}) {
  return (
    <div class="cv-row edit">
      <span class="cv-ico"><ToolIcon tool="edit" size={14} /></span>
      <span class="cv-verb">edits</span>
      <span class="cv-name">{props.file}</span>
      <span class="cv-right">
        <span class="cv-add">+{props.additions}</span>
        <span class="cv-del">−{props.deletions}</span>
        <span>{props.done ? "done" : "running"}</span>
        <Show when={props.duration}>{(value) => <span>{value()}</span>}</Show>
      </span>
    </div>
  )
}

/** Ligne `Thought` : orange, durée, nombre de caractères, texte repliable. */
export function ThoughtRow(props: {
  duration?: string
  chars: number
  text: string
  open: boolean
  onToggle: () => void
}) {
  return (
    <>
      <button class="cv-row thought" aria-expanded={props.open} onClick={() => props.onToggle()}>
        <span class="cv-ico"><ThinkIcon /></span>
        <span class="cv-verb">Thought<small>{props.duration ?? "—"}</small></span>
        <span class="cv-right"><span>{props.chars} characters</span></span>
      </button>
      <Show when={props.open}>
        <p class="cv-thought-text open">{props.text}</p>
      </Show>
    </>
  )
}

/** Ligne `runs` : repliable, sortie en bloc noir, « Click to collapse » une fois ouvert. */
export function RunRow(props: {
  name: string
  status: string
  output: string
  duration?: string
  open: boolean
  onToggle: () => void
}) {
  return (
    <>
      <button class="cv-row run" onClick={() => props.onToggle()}>
        <span class="cv-ico"><ToolIcon tool="shell" size={14} /></span>
        <span class="cv-verb">runs</span>
        <span class="cv-name sans">{props.name}</span>
        <span class="cv-right">
          <span>{props.status}</span>
          <Show when={props.duration}>{(value) => <span>{value()}</span>}</Show>
        </span>
      </button>
      <Show when={props.open && props.output}>
        <pre class="cv-out open">{props.output}<i>Click to collapse</i></pre>
      </Show>
    </>
  )
}

/** Ligne `delegates` : un sous-agent, avec chrono qui avance tant qu'il tourne. */
export function DelegateRow(props: { name: string; running: boolean; duration?: string }) {
  return (
    <div class="cv-row delegate">
      <span class="cv-ico"><ToolIcon tool="subagent" size={14} /></span>
      <span class="cv-verb">delegates</span>
      <span class="cv-name sans">{props.name}</span>
      <span class="cv-right">
        <Show when={props.running} fallback={<><span>done</span><Show when={props.duration}>{(value) => <span>{value()}</span>}</Show></>}>
          <span class="cv-live">running {props.duration ?? ""}</span>
        </Show>
      </span>
    </div>
  )
}

/** Paragraphe de l'agent — le code en vert vient de `.cv-prose code`. */
export function ConversationParagraph(props: { text: string; synthetic?: boolean; ignored?: boolean }) {
  return (
    <div class="cv-prose" classList={{ tagged: Boolean(props.synthetic || props.ignored) }}>
      <Show when={props.synthetic}><span class="cv-tag">injected</span></Show>
      <Show when={props.ignored}><span class="cv-tag">not sent</span></Show>
      <Markdown text={props.text} />
    </div>
  )
}

/** Message utilisateur — la mention `queued` dit que le tour attendait la fin d'un autre. */
export function ConversationUserMessage(props: { text: string; queued?: boolean }) {
  return (
    <div class="cv-user">
      <Markdown text={props.text} />
      <Show when={props.queued}><span class="cv-queued">queued</span></Show>
    </div>
  )
}

/** Curseur à trois points et flèche haute du défilement. */
export function ScrollChrome(props: { up: boolean; thumb: boolean; progress: number; onUp: () => void }) {
  return (
    <Show when={props.up || props.thumb}>
      <button class="conv-up" classList={{ on: props.up }} aria-label="Scroll to top" onClick={() => props.onUp()}>
        ↑
      </button>
      <Show when={props.thumb}>
        <span class="conv-thumb" style={{ top: `${8 + props.progress * 80}%` }}>
          <i /><i /><i />
        </span>
      </Show>
    </Show>
  )
}
