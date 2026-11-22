/**
 * Panneau droit — reproducton du panneau du CLI maquetté (`docs/design/maquette-opencodev2-ui.html`).
 *
 * Cinq sections repliables, toutes alimentées par les signaux réels de l'application : aucune
 * donnée de démonstration n'est fabriquée ici. Le CSS est isolé et chargé après `styles.css`
 * par l'import ci-dessous.
 */

import { For, Show, createMemo, createSignal, type JSX } from "solid-js"
import type { McpState } from "./config"
import { addItem, cleanList, draftFrom, setItem, type ContractDraft, type ContractView, type TodoView } from "./plan"
import type { SessionStats } from "./view-model"
import "./right-panel.css"

export type GoalAction = "approve" | "edit" | "generate" | "regenerate" | "skip"

type SectionId = "goal" | "ctx" | "mcp" | "lsp" | "todo"

const GOAL_ACTIONS: Array<{ id: GoalAction; label: string }> = [
  { id: "approve", label: "Approve" },
  { id: "edit", label: "Edit" },
  { id: "generate", label: "Generate" },
  { id: "regenerate", label: "Regenerate" },
  { id: "skip", label: "Skip" },
]

const EMPTY_CONTRACT: ContractView = { goal: "", dod: [], outOfScope: [] }

/** Un todo est rendu avec la même sémantique visuelle que la maquette. */
function todoClass(status: TodoView["status"]): string {
  if (status === "in_progress") return "ip"
  if (status === "completed" || status === "cancelled") return "dn"
  return ""
}

function todoLabel(status: TodoView["status"]): string {
  switch (status) {
    case "in_progress":
      return "in progress"
    case "completed":
      return "done"
    case "cancelled":
      return "cancelled"
    default:
      return "pending"
  }
}

function compact(value: number): string {
  // Un chiffre décimal sous 10 000 : 4500 doit se lire « 4.5k », pas « 5k » (11 % d'erreur).
  if (value >= 10_000) return `${Math.round(value / 1000)}k`
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
  return String(value)
}

export function RightPanel(props: {
  open: boolean
  contract?: ContractView
  stats: SessionStats
  contextLimit?: number
  mcp: Record<string, McpState>
  lsp?: Record<string, unknown>
  todos: TodoView[]
  folder: string
  branch: string
  version?: string
  onGoalAction: (action: GoalAction) => Promise<boolean>
  onSaveContract: (draft: ContractDraft) => Promise<boolean>
}) {
  const [shut, setShut] = createSignal<Record<SectionId, boolean>>({
    goal: false,
    ctx: false,
    mcp: false,
    lsp: false,
    todo: false,
  })
  const [editing, setEditing] = createSignal(false)
  const [draft, setDraft] = createSignal<ContractDraft>(draftFrom(EMPTY_CONTRACT))
  const [saving, setSaving] = createSignal(false)
  const [failure, setFailure] = createSignal<string | undefined>(undefined)

  const connected = createMemo(
    () => Object.values(props.mcp).filter((entry) => entry?.status === "connected").length,
  )
  const mcpRows = createMemo(() =>
    Object.entries(props.mcp)
      .map(([name, state]) => ({ name, state }))
      .sort((left, right) => left.name.localeCompare(right.name)),
  )

  /** LSP : la maquette affiche « LSPs are disabled ». On ne l'invente pas : on lit la config. */
  const lspRows = createMemo(() => {
    const value = props.lsp
    if (!value || typeof value !== "object") return [] as Array<{ name: string; enabled: boolean }>
    return Object.entries(value).map(([name, raw]) => ({
      name,
      enabled: raw !== false && raw !== null && raw !== undefined,
    }))
  })

  const context = createMemo(() => {
    const used = props.stats.contextTokens ?? props.stats.tokens
    const limit = props.contextLimit
    const ratio = limit && limit > 0 ? Math.min(1, used / limit) : 0
    const percent = limit && limit > 0 ? Math.round(ratio * 100) : undefined
    return { used, ratio, percent }
  })

  const toggleSection = (id: SectionId) =>
    setShut((current) => ({ ...current, [id]: !current[id] }))

  const section = (
    id: SectionId,
    title: string,
    note: JSX.Element | undefined,
    body: () => JSX.Element,
  ): JSX.Element => (
    <div class="rp-rs" classList={{ shut: shut()[id] }} data-id={id}>
      <button
        type="button"
        class="rp-rh"
        aria-expanded={!shut()[id]}
        onClick={() => toggleSection(id)}
      >
        <span class="rp-c" aria-hidden="true">▾</span>
        <b>{title}</b>
        <Show when={note}>
          <span class="rp-n">{note}</span>
        </Show>
      </button>
      <div class="rp-rb">{body()}</div>
    </div>
  )

  const startEdit = () => {
    setDraft(draftFrom(props.contract ?? EMPTY_CONTRACT))
    setFailure(undefined)
    setEditing(true)
  }

  const runAction = async (action: GoalAction) => {
    if (action === "edit") {
      startEdit()
      return
    }
    setFailure(undefined)
    const ok = await props.onGoalAction(action)
    if (!ok) setFailure(`Action ${action} failed.`)
  }

  const saveEdit = async () => {
    const goal = draft().goal.trim()
    if (!goal) {
      setFailure("Goal cannot be empty.")
      return
    }
    setSaving(true)
    setFailure(undefined)
    const ok = await props.onSaveContract({
      goal,
      dod: cleanList(draft().dod),
      outOfScope: cleanList(draft().outOfScope),
    })
    setSaving(false)
    if (!ok) {
      setFailure("The contract could not be saved.")
      return
    }
    setEditing(false)
  }

  const goalBody = (): JSX.Element => (
    <>
      <Show when={props.contract?.goal}>
        {(goal) => <div class="rp-goal">{goal()}</div>}
      </Show>
      <Show when={props.contract?.status}>
        {(status) => (
          <div class="rp-kv">
            <span>Status</span>
            <b>{status()}</b>
          </div>
        )}
      </Show>
      <div class="rp-gh">Definition of done</div>
      <Show
        when={props.contract && props.contract.dod.length > 0}
        fallback={<div class="rp-gl empty">No definition of done yet.</div>}
      >
        <For each={props.contract?.dod ?? []}>{(item) => <div class="rp-gl">{item}</div>}</For>
      </Show>
      <div class="rp-gh">Out of scope</div>
      <Show
        when={props.contract && props.contract.outOfScope.length > 0}
        fallback={<div class="rp-gl empty">Nothing excluded yet.</div>}
      >
        <For each={props.contract?.outOfScope ?? []}>{(item) => <div class="rp-gl">{item}</div>}</For>
      </Show>
      <Show when={failure()}>
        {(message) => (
          <p class="rp-error" role="alert">
            {message()}
          </p>
        )}
      </Show>
      <Show when={editing()}>
        <div class="rp-editor">
          <label class="rp-field">
            <span>Goal</span>
            <textarea
              rows="2"
              value={draft().goal}
              onInput={(event) => setDraft((current) => ({ ...current, goal: event.currentTarget.value }))}
            />
          </label>
          <For each={draft().dod}>
            {(item, index) => (
              <label class="rp-field">
                <span>DOD {index() + 1}</span>
                <input
                  value={item}
                  onInput={(event) =>
                    setDraft((current) => ({ ...current, dod: setItem(current.dod, index(), event.currentTarget.value) }))
                  }
                />
              </label>
            )}
          </For>
          <button class="rp-add" type="button" onClick={() => setDraft((current) => ({ ...current, dod: addItem(current.dod) }))}>
            + Add DOD
          </button>
          <div class="rp-editor-actions">
            <button class="rp-gb" type="button" disabled={saving()} onClick={() => void saveEdit()}>
              Save
            </button>
            <button class="rp-gb" type="button" disabled={saving()} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      </Show>
      <div class="rp-ga">
        <For each={GOAL_ACTIONS}>
          {(action) => (
            <button
              type="button"
              class="rp-gb"
              data-g={action.id}
              onClick={() => void runAction(action.id)}
            >
              {action.label}
            </button>
          )}
        </For>
      </div>
    </>
  )

  const contextBody = (): JSX.Element => (
    <>
      <div class="rp-kv">
        <span>{compact(context().used)} tokens</span>
        <b>{context().percent === undefined ? "limit unknown" : `${context().percent}% used`}</b>
      </div>
      <div class="rp-bar" role="presentation">
        <i style={{ transform: `scaleX(${context().ratio})` }} />
      </div>
      <div class="rp-kv">
        <span>Cost</span>
        <b>${props.stats.cost.toFixed(2)} (estimated)</b>
      </div>
    </>
  )

  const mcpBody = (): JSX.Element => (
    <Show when={mcpRows().length > 0} fallback={<div class="rp-mcpr off">No MCP server reported.</div>}>
      <For each={mcpRows()}>
        {(row) => (
          <div class="rp-mcpr" classList={{ off: row.state?.status !== "connected" }}>
            <span>{row.name}</span>
            <em>{row.state?.status === "connected" ? "Connected" : row.state?.status ?? "Disabled"}</em>
          </div>
        )}
      </For>
    </Show>
  )

  const lspBody = (): JSX.Element => (
    <Show when={lspRows().length > 0} fallback={<div class="rp-mcpr off">LSPs are disabled</div>}>
      <For each={lspRows()}>
        {(row) => (
          <div class="rp-mcpr" classList={{ off: !row.enabled }}>
            <span>{row.name}</span>
            <em>{row.enabled ? "Enabled" : "Disabled"}</em>
          </div>
        )}
      </For>
    </Show>
  )

  const todoBody = (): JSX.Element => (
    <Show when={props.todos.length > 0} fallback={<div class="rp-gl empty">No todo yet.</div>}>
      <For each={props.todos}>
        {(todo) => (
          <div class="rp-todo" classList={{ [todoClass(todo.status)]: true }}>
            <span class="rp-bx" aria-hidden="true" />
            <span>{todo.content}</span>
            <em>{todoLabel(todo.status)}</em>
          </div>
        )}
      </For>
    </Show>
  )

  return (
    <aside
      class="rpanel"
      classList={{ "is-open": props.open }}
      data-open={props.open}
      aria-label="Details panel"
      aria-hidden={!props.open}
    >
      {section(
        "goal",
        "Goal definition",
        <>
          <span class="rp-pill">DOD({props.contract?.dod.length ?? 0})</span>{" "}
          <span class="rp-pill">OOS({props.contract?.outOfScope.length ?? 0})</span>
        </>,
        goalBody,
      )}
      {section("ctx", "Context", undefined, contextBody)}
      {section("mcp", "MCP", <>{connected()}/{mcpRows().length}</>, mcpBody)}
      {section("lsp", "LSP", undefined, lspBody)}
      {section(
        "todo",
        "Todo",
        <>{props.todos.filter((todo) => todo.status === "completed").length}/{props.todos.length}</>,
        todoBody,
      )}
      <div class="rp-rfoot">
        <div>
          <b>{props.folder || "—"}</b>:{props.branch || "—"}
        </div>
        <div>• Opencodev2 {props.version ?? "—"}</div>
      </div>
    </aside>
  )
}
