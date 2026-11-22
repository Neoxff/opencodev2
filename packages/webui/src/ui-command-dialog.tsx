import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js"
import {
  buildView,
  filterRows,
  trapKey,
  type CommandData,
  type DiffFile,
  type Row,
  type View,
  type ViewId,
} from "./ui-commands"
import "./ui-commands.css"

/**
 * L'hôte des dialogues de commandes.
 *
 * Un seul nœud rend toutes les vues : le titre, le corps et les événements clavier sont les mêmes
 * pour `/agents` et pour `/mcps`. Ce qui change vient de `buildView` (ui-commands.ts) — données
 * réelles, jamais codées en dur ici. Le composant ne fait que deux choses que la fonction pure ne
 * peut pas faire : rendre le DOM et tenir le focus.
 *
 * Trois règles d'accessibilité, chacune pour un défaut constaté sur un dialogue sans focus :
 *   1. à l'ouverture le focus va dans le dialogue (sur le filtre s'il existe, sinon la première
 *      ligne) — sinon le clavier continue de piloter le composeur derrière l'overlay ;
 *   2. `Tab` reste dans le dialogue (piège), et `Échap` ferme en rendant le focus à ce qui
 *      l'a ouvert — un dialogue qu'on ouvre au clavier doit se fermer au clavier ;
 *   3. `role="dialog"`, `aria-modal="true"` et un titre relié par `aria-labelledby` : sans cela,
 *      un lecteur d'écran annonce une page sans dialogue.
 */
export function CommandHost(props: {
  command: ViewId | undefined
  data: CommandData
  onClose: () => void
  /** Choisir une ligne : la valeur est celle du serveur, pas le libellé affiché. */
  onPick: (command: ViewId, value: string) => void
  /** Basculer un interrupteur (MCP, thinking, timestamps). */
  onToggle: (command: ViewId, row: Row, next: boolean) => void
}) {
  const [query, setQuery] = createSignal("")
  const [active, setActive] = createSignal(0)
  let dialog: HTMLDivElement | undefined
  let filter: HTMLInputElement | undefined
  /** L'élément qui avait le focus avant l'ouverture — rendu à la fermeture. */
  let previous: HTMLElement | undefined

  const view = createMemo<View | undefined>(() => (props.command ? buildView(props.command, props.data) : undefined))
  const searchable = () => view()?.kind === "list" && (view() as { filterable?: boolean }).filterable === true
  const rows = createMemo<Row[]>(() => {
    const current = view()
    if (!current || (current.kind !== "list" && current.kind !== "toggles")) return []
    const list = searchable() ? filterRows(current.rows, query()) : current.rows
    return list
  })

  createEffect(() => {
    const command = props.command
    if (!command) return
    previous = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
    setQuery("")
    setActive(0)
    // Le focus se pose après insertion dans le document : une ref Solid est appelée avant que le
    // nœud y soit, et `focus()` sur un élément détaché ne fait rien (défaut mesuré sur le Picker).
    queueMicrotask(() => (searchable() ? filter : dialog)?.focus())
    onCleanup(() => previous?.focus())
  })

  /** Le clavier du dialogue : navigation, validation, fermeture, piège. */
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault()
      event.stopPropagation()
      props.onClose()
      return
    }
    if (event.key === "Tab") {
      const focusables = Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'input, button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      )
      const index = focusables.indexOf(document.activeElement as HTMLElement)
      const edge = trapKey(event.key, event.shiftKey, index, focusables.length)
      if (edge === "first") {
        event.preventDefault()
        focusables[0]?.focus()
      } else if (edge === "last") {
        event.preventDefault()
        focusables[focusables.length - 1]?.focus()
      }
      return
    }
    const current = view()
    if (!current || (current.kind !== "list" && current.kind !== "toggles")) return
    const list = rows()
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActive((value) => Math.min(value + 1, list.length - 1))
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setActive((value) => Math.max(value - 1, 0))
    } else if (event.key === "Home") {
      event.preventDefault()
      setActive(0)
    } else if (event.key === "End") {
      event.preventDefault()
      setActive(Math.max(0, list.length - 1))
    } else if (event.key === "Enter") {
      event.preventDefault()
      const row = list[active()]
      if (row) activate(row)
    }
  }

  const activate = (row: Row) => {
    const current = view()
    if (!current) return
    if (current.kind === "toggles") {
      props.onToggle(props.command as ViewId, row, !row.on)
      return
    }
    props.onPick(props.command as ViewId, row.value)
  }

  const pickFromPalette = (value: string) => {
    // La palette ne choisit pas une valeur : elle ouvre une autre commande.
    props.onPick("palette", value)
  }

  return (
    <Show when={view()}>
      {(current) => (
        <div
          class="uic-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) props.onClose()
          }}
        >
          <div
            class="uic-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="uic-title"
            tabIndex={-1}
            ref={(element) => (dialog = element)}
            onKeyDown={onKey}
          >
            <h3 class="uic-head" id="uic-title">
              <span>{current().title}</span>
              <kbd>{current().hint ?? "Esc"}</kbd>
            </h3>

            <Show when={searchable()}>
              <input
                class="uic-filter"
                type="text"
                placeholder="Search…"
                aria-label={`Filter ${current().title}`}
                value={query()}
                ref={(element) => (filter = element)}
                onInput={(event) => {
                  setQuery(event.currentTarget.value)
                  setActive(0)
                }}
              />
            </Show>

            <Show when={current().kind === "list" || current().kind === "toggles"}>
              <div class="uic-list" role="listbox" aria-label={current().title}>
                <Show when={rows().length === 0} fallback={<For each={rows()}>{(row, index) => <UicRow row={row} index={index()} active={active() === index()} command={current()} onActivate={() => (props.command === "palette" ? pickFromPalette(row.value) : activate(row))} onHover={() => setActive(index())} />}</For>}>
                  <p class="uic-empty">{(current() as { empty?: string }).empty ?? "Nothing here."}</p>
                </Show>
              </div>
            </Show>

            <Show when={current().kind === "info"}>
              <div class="uic-pairs">
                <For each={(current() as { pairs: Array<readonly [string, string]> }).pairs}>
                  {(pair) => (
                    <div class="uic-pair">
                      <span>{pair[0]}</span>
                      <b>{pair[1]}</b>
                    </div>
                  )}
                </For>
              </div>
            </Show>

            <Show when={current().kind === "keys"}>
              <div class="uic-pairs">
                <For each={(current() as { keys: Array<readonly [string, string]> }).keys}>
                  {(key) => (
                    <div class="uic-pair">
                      <span>{key[1]}</span>
                      <kbd>{key[0]}</kbd>
                    </div>
                  )}
                </For>
              </div>
            </Show>

            <Show when={current().kind === "diff"}>
              <Show
                when={(current() as { files: DiffFile[] }).files.length > 0}
                fallback={<p class="uic-empty">{(current() as { empty: string }).empty}</p>}
              >
                <div class="uic-diff">
                  <For each={(current() as { files: DiffFile[] }).files}>
                    {(file) => (
                      <div class="uic-file">
                        <div class="uic-file-name">{file.name}</div>
                        <For each={file.lines}>
                          {(line) => <div class={`uic-line uic-${line.kind}`}>{line.text}</div>}
                        </For>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </Show>
          </div>
        </div>
      )}
    </Show>
  )
}

/** Une ligne de liste : un vrai `<button>`, jamais un `<div onClick>`. */
function UicRow(props: {
  row: Row
  index: number
  active: boolean
  command: View
  onActivate: () => void
  onHover: () => void
}) {
  return (
    <button
      type="button"
      class="uic-row"
      classList={{ "uic-active": props.active, "uic-current": props.row.current === true }}
      role="option"
      aria-selected={props.row.current === true}
      data-i={props.index}
      onClick={props.onActivate}
      onMouseEnter={props.onHover}
    >
      <b>{props.row.label}</b>
      <Show when={props.row.detail}>{(detail) => <span class="uic-detail">{detail()}</span>}</Show>
      <Show when={props.row.on !== undefined}>
        <span class="uic-switch" classList={{ on: props.row.on === true }} aria-hidden="true" />
      </Show>
      <Show when={props.row.on === undefined && props.row.current === true}>
        <span class="uic-check" aria-hidden="true">
          ✓
        </span>
      </Show>
    </button>
  )
}
