/**
 * Onglet Logs — journal de la session en temps réel.
 *
 * La donnée vient du flux SSE already souscrit par l'application (`logEntries`) : aucun appel réseau
 * propre ici, donc aucun doublon de connexion. Chaque ligne porte niveau, source et message. Le
 * message est redacté dans la couche pure (`logRow`) : une clé ou un jeton.glisse dans une note
 * d'événement ne jamais atteindre le DOM.
 *
 * Trois états : chargement (flux pas encore connecté), vide (connecté sans événement), erreur
 * (connexion perdue) — plus la liste courante. Le filtrage est local : peu de lignes, pas de
 * virtualisation nécessaire (la source est déjà plafonnée à 200 événements).
 */

import { createMemo, createSignal, For, Show } from "solid-js"
import { logRow, type LogEntry, type LogLevel } from "./config-editor"
import "./config-logs.css"

export type LogsTabProps = {
  entries: LogEntry[]
  connected: boolean
  reconnects: number
  lastError?: string
  onClear: () => void
}

const LEVELS: Array<LogLevel | "all"> = ["all", "info", "warn", "error", "debug"]

export function LogsTab(props: LogsTabProps) {
  const [level, setLevel] = createSignal<LogLevel | "all">("all")
  const [query, setQuery] = createSignal("")

  const rows = createMemo(() => props.entries.map(logRow))
  const shown = createMemo(() => {
    const needle = query().trim().toLowerCase()
    return rows().filter((row) => {
      if (level() !== "all" && row.level !== level()) return false
      if (!needle) return true
      return `${row.time} ${row.level} ${row.source} ${row.message}`.toLowerCase().includes(needle)
    })
  })

  return (
    <section class="cl-logs" aria-labelledby="cl-logs-title">
      <header class="cl-head">
        <div class="cl-head-text">
          <h2 id="cl-logs-title" class="cl-title">
            Session log
          </h2>
          <p class="cl-sub" classList={{ "cl-live": props.connected }}>
            <span class="cl-dot" aria-hidden="true" />
            {props.connected ? "live" : "disconnected"} · {rows().length} events
            {props.reconnects > 0 ? ` · ${props.reconnects} reconnects` : ""}
          </p>
        </div>
        <div class="cl-head-actions">
          <button type="button" class="cl-btn" onClick={props.onClear} disabled={rows().length === 0}>
            Clear
          </button>
        </div>
      </header>

      <Show when={props.lastError}>
        {(message) => (
          <p class="cl-alert cl-alert-error" role="alert">
            {message()} — retrying…
          </p>
        )}
      </Show>

      <div class="cl-filters">
        <label class="cl-sr-only" for="cl-log-query">
          Filter log lines
        </label>
        <input
          id="cl-log-query"
          class="cl-input"
          type="search"
          placeholder="Filter level, source, message…"
          value={query()}
          onInput={(event) => setQuery(event.currentTarget.value)}
        />
        <div class="cl-levels" role="group" aria-label="Log level">
          <For each={LEVELS}>
            {(item) => (
              <button
                type="button"
                class="cl-chip"
                classList={{ active: level() === item }}
                aria-pressed={level() === item}
                onClick={() => setLevel(item)}
              >
                {item}
              </button>
            )}
          </For>
        </div>
      </div>

      <Show when={props.connected || rows().length > 0} fallback={
        <p class="cl-empty" aria-busy="true">Connecting to the event stream…</p>
      }>
        <Show when={shown().length > 0} fallback={
          <p class="cl-empty">
            {rows().length === 0 ? "No events received yet." : "No line matches this filter."}
          </p>
        }>
          <ol class="cl-lines" aria-label="Session log lines">
            <For each={shown()}>
              {(row) => (
                <li class="cl-line">
                  <time class="cl-time" dateTime={`${row.time}Z`}>
                    {row.time}
                  </time>
                  <span class={`cl-level cl-level-${row.level}`}>{row.level}</span>
                  <span class="cl-source">{row.source}</span>
                  <span class="cl-message">{row.message}</span>
                </li>
              )}
            </For>
          </ol>
        </Show>
      </Show>
    </section>
  )
}
