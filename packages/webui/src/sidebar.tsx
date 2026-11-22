/**
 * Barre latérale de la maquette validée, branchée sur les données du serveur.
 *
 * Ce module est **présentationnel** : il ne connaît ni le réseau ni le store de l'application.
 * Il reçoit des groupes calculés par `groupByWorkspace` (eux-mêmes issus de `GET /session` et
 * `GET /project`) et des sessions, donc aucune donnée de démonstration n'est inventée ici.
 */
import { For, Show } from "solid-js"
import {
  ArchiveIcon,
  ChevronIcon,
  ClockIcon,
  CollapseIcon,
  CrossIcon,
  FolderIcon,
  FolderPlusIcon,
  NewSessionIcon,
  PlusIcon,
  SearchIcon,
  ServerIcon,
} from "./icons"
import type { SessionSummary, WorkspaceGroup as WorkspaceGrouping } from "./sessions"
import { relativeTime, sessionTimestamp } from "./time"

/** L'horodatage le plus récent d'un dossier — l'heure affichée sur sa ligne. */
export function groupLatestTime(group: WorkspaceGrouping): number | undefined {
  let latest: number | undefined
  for (const session of group.sessions) {
    const at = sessionTimestamp(session)
    if (at !== undefined && (latest === undefined || at > latest)) latest = at
  }
  return latest
}

/** Carte `sessionID -> occupé`, lue sur `GET /session/status` (`retry` compte comme occupé). */
export function sessionActivityMap(statuses: unknown): Record<string, boolean> {
  if (!statuses || typeof statuses !== "object") return {}
  const result: Record<string, boolean> = {}
  for (const [id, info] of Object.entries(statuses as Record<string, { type?: unknown } | undefined>)) {
    if (info && typeof info === "object" && info.type !== "idle") result[id] = true
  }
  return result
}

/** Sessions récentes, triées par horodatage décroissant — la source est `GET /session`. */
export function recentSessions(sessions: SessionSummary[], limit = 8): SessionSummary[] {
  return [...sessions]
    .sort((a, b) => (sessionTimestamp(b) ?? 0) - (sessionTimestamp(a) ?? 0))
    .slice(0, limit)
}

export function SidebarLogo() {
  return (
    <div class="side-logo">
      <span class="side-logo-mark" aria-hidden="true" />
      <b>opencode</b>
      <span class="side-logo-v2">V2</span>
    </div>
  )
}

export function SidebarNewSession(props: { onClick: () => void }) {
  return (
    <button class="side-new" aria-label="New session" onClick={() => props.onClick()}>
      <NewSessionIcon size={16} />
      <span>New session</span>
    </button>
  )
}

/**
 * Ligne « Workspaces » et ses quatre gestes : chercher, ajouter, historique, réduire.
 * Le champ de filtre et le champ de chemin ne vivent que le temps de l'action.
 */
export function SidebarActions(props: {
  query: string
  headDraft: string
  searchOpen: boolean
  addOpen: boolean
  historyOpen: boolean
  onQuery: (value: string) => void
  onHeadDraft: (value: string) => void
  onSearch: () => void
  onAddFolder: () => void
  onHistory: () => void
  onCollapse: () => void
  onAddSubmit: () => void
  onEscape: () => void
}) {
  return (
    <>
      <div class="side-actions-head">
        <span class="side-label">Workspaces</span>
        <span class="side-icons">
          <button
            class="side-icon"
            classList={{ active: props.searchOpen }}
            title="Search folders"
            aria-label="Search folders"
            onClick={() => props.onSearch()}
          >
            <Show when={props.searchOpen} fallback={<SearchIcon size={14} />}>
              <CrossIcon size={14} />
            </Show>
          </button>
          <button
            class="side-icon"
            classList={{ active: props.addOpen }}
            title="Add folder"
            aria-label="Add folder"
            onClick={() => props.onAddFolder()}
          >
            <Show when={props.addOpen} fallback={<FolderPlusIcon size={14} />}>
              <CrossIcon size={14} />
            </Show>
          </button>
          <button
            class="side-icon"
            classList={{ active: props.historyOpen }}
            title="Session history"
            aria-label="Session history"
            onClick={() => props.onHistory()}
          >
            <ClockIcon size={14} />
          </button>
          <button class="side-icon" title="Collapse sidebar" aria-label="Collapse sidebar" onClick={() => props.onCollapse()}>
            <CollapseIcon size={14} />
          </button>
        </span>
      </div>
      <Show when={props.searchOpen}>
        <input
          class="side-filter"
          autofocus
          placeholder="Search folders"
          aria-label="Search folders"
          value={props.query}
          onInput={(event) => props.onQuery(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") props.onEscape()
          }}
        />
      </Show>
      <Show when={props.addOpen}>
        <input
          class="side-filter"
          autofocus
          placeholder="path to a project folder"
          aria-label="path to a project folder"
          value={props.headDraft}
          onInput={(event) => props.onHeadDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") props.onAddSubmit()
            if (event.key === "Escape") props.onEscape()
          }}
        />
      </Show>
    </>
  )
}

/** Liste d'historique — uniquement des sessions renvoyées par le serveur. */
export function SidebarHistory(props: {
  sessions: SessionSummary[]
  now: number
  onSelect: (id: string) => void
}) {
  return (
    <div class="side-history">
      <div class="side-history-head">Recent sessions</div>
      <Show
        when={props.sessions.length > 0}
        fallback={<div class="side-history-empty">No session returned by the server.</div>}
      >
        <For each={props.sessions}>
          {(session) => (
            <button class="side-hist" onClick={() => props.onSelect(session.id)}>
              <span class="sess-title">{session.title || "(untitled)"}</span>
              <span class="sess-time">{relativeTime(sessionTimestamp(session), props.now)}</span>
            </button>
          )}
        </For>
      </Show>
    </div>
  )
}

/** Ligne de dossier repliable, avec chevron, heure et actions. */
export function SidebarFolder(props: {
  label: string
  hint: string
  time: string
  open: boolean
  current?: boolean
  renaming?: boolean
  menuOpen?: boolean
  onToggle: () => void
  onNew: () => void
  onMenu: () => void
  onRename: () => void
  children?: unknown
}) {
  return (
    <div class="side-folder" classList={{ open: props.open, current: Boolean(props.current) }}>
      <button class="side-folder-main" title={props.hint} onClick={() => props.onToggle()}>
        <span class="side-chevron">
          <ChevronIcon size={13} open={props.open} />
        </span>
        <FolderIcon size={15} />
        <Show when={props.renaming} fallback={<b>{props.label}</b>}>
          {props.children as never}
        </Show>
        <em>{props.time}</em>
      </button>
      <button class="side-folder-new" title="New session in this folder" aria-label="New session in this folder" onClick={() => props.onNew()}>
        <PlusIcon size={14} />
      </button>
      <Show when={!props.menuOpen}>
        <button class="side-folder-menu-trigger" title="Folder actions" aria-label="Folder actions" onClick={() => props.onMenu()}>
          …
        </button>
      </Show>
      <Show when={props.menuOpen}>
        <div class="side-folder-menu">
          <button onClick={() => props.onRename()}>Rename</button>
        </div>
      </Show>
    </div>
  )
}

/** Ligne de session : le titre s'estompe en fin de ligne, l'activité est un point animé. */
export function SidebarSession(props: {
  title: string
  hint: string
  time: string
  busy?: boolean
  active?: boolean
  onSelect: () => void
  children?: unknown
}) {
  return (
    <div class="side-session" classList={{ active: Boolean(props.active) }} onClick={() => props.onSelect()}>
      <span class="sess-title" title={props.hint}>
        {props.title}
      </span>
      <Show when={props.busy}>
        <i class="sess-busy" aria-label="active" />
      </Show>
      <span class="sess-time">{props.time}</span>
      {props.children as never}
    </div>
  )
}

export function SidebarReadMore(props: { hidden: number; expanded: boolean; onToggle: () => void }) {
  return (
    <button class="side-more" onClick={() => props.onToggle()}>
      {props.expanded ? "read less" : `read more (${props.hidden})`}
    </button>
  )
}

/** Pied : rappel des touches, Archived et Server. */
export function SidebarFooter(props: {
  archivedOpen: boolean
  archivedCount: number
  onArchived: () => void
  onServer: () => void
  children?: unknown
}) {
  return (
    <div class="side-foot">
      <div class="side-keys">
        <span>
          <kbd>alt+n</kbd> new
        </span>
        <span>
          <kbd>ctrl+d</kbd> del
        </span>
        <span>
          <kbd>ctrl+r</kbd> ren
        </span>
      </div>
      <button class="side-fold" classList={{ open: props.archivedOpen }} onClick={() => props.onArchived()}>
        <ArchiveIcon size={15} />
        <b>Archived</b>
        <Show when={props.archivedCount > 0}>
          <em>{props.archivedCount}</em>
        </Show>
      </button>
      {props.children as never}
      <button class="side-fold" onClick={() => props.onServer()}>
        <ServerIcon size={15} />
        <b>Server</b>
      </button>
    </div>
  )
}
