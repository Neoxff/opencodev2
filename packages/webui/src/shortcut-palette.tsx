/**
 * La palette de commandes (Ctrl+P) — les actions réelles de la webui, rien d'autre.
 *
 * Les commandes sont passées par l'app : ce composant ne connaît ni session ni client, il ne sait
 * que filtrer et exécuter. Une palette qui porterait ses propres actions deviendrait une seconde
 * source de vérité, et afficherait des gestes que l'interface ne fait pas.
 */

import { createSignal, For, onMount, Show } from "solid-js"

export type PaletteCommand = {
  id: string
  label: string
  hint?: string
  keys?: string
  run: () => void
}

export function ShortcutPalette(props: { commands: PaletteCommand[]; onClose: () => void }) {
  const [query, setQuery] = createSignal("")
  const [index, setIndex] = createSignal(0)
  let input: HTMLInputElement | undefined

  onMount(() => input?.focus())

  const filtered = () => {
    const needle = query().trim().toLowerCase()
    if (!needle) return props.commands
    return props.commands.filter(
      (command) =>
        command.label.toLowerCase().includes(needle) ||
        command.id.toLowerCase().includes(needle) ||
        (command.hint ?? "").toLowerCase().includes(needle),
    )
  }

  const choose = (command: PaletteCommand | undefined) => {
    if (!command) return
    props.onClose()
    command.run()
  }

  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      // Le calque se ferme **avant** toute autre interprétation : Échap global interrompt l'agent,
      // ce qui ne doit pas arriver en fermant la palette.
      event.preventDefault()
      event.stopPropagation()
      props.onClose()
      return
    }
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setIndex((current) => Math.min(current + 1, filtered().length - 1))
      return
    }
    if (event.key === "ArrowUp") {
      event.preventDefault()
      setIndex((current) => Math.max(current - 1, 0))
      return
    }
    if (event.key === "Enter") {
      event.preventDefault()
      choose(filtered()[index()])
    }
  }

  return (
    <div
      class="palette-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) props.onClose()
      }}
    >
      <div class="palette" role="dialog" aria-modal="true" aria-label="Palette de commandes" onKeyDown={onKey}>
        <input
          ref={input}
          class="palette-input"
          type="text"
          placeholder="Filtrer les commandes…"
          aria-label="Filtrer les commandes"
          value={query()}
          onInput={(event) => {
            setQuery(event.currentTarget.value)
            setIndex(0)
          }}
        />
        <ul class="palette-list" aria-label="Commandes">
          <For each={filtered()}>
            {(command, position) => (
              <li>
                <button
                  type="button"
                  class="palette-item"
                  classList={{ active: index() === position() }}
                  onClick={() => choose(command)}
                  onMouseEnter={() => setIndex(position())}
                >
                  <span class="palette-label">{command.label}</span>
                  <Show when={command.keys}>
                    <kbd class="palette-keys">{command.keys}</kbd>
                  </Show>
                </button>
              </li>
            )}
          </For>
        </ul>
        <Show when={filtered().length === 0}>
          <p class="palette-empty">Aucune commande ne correspond.</p>
        </Show>
      </div>
    </div>
  )
}
