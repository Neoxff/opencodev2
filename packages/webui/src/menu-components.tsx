/**
 * Les composants des menus — la liste défilante du `/` et du `@`, et la palette `ctrl+p`.
 *
 * Ils ne décident rien : les lignes viennent de `menus.ts`, l'état et les actions viennent de
 * l'application. Ce découpage est volontaire — il permet de tester le clavier et le filtrage
 * sans monter l'application entière, et de changer l'apparence sans toucher aux décisions.
 *
 * Le CSS est **isolé** dans `menus.css` : toutes les classes sont préfixées `oc-`, et les
 * variables de couleur sont déclarées sur les composants eux-mêmes. Aucune rule globale, aucun
 * jeton modifié ailleurs — le reste de la webui garde son apparence.
 */

import { createEffect, For, Show } from "solid-js"
import type { MenuRow } from "./menus"
import "./menus.css"

/**
 * La liste défilante, au-dessus du champ.
 *
 * C'est la même liste pour `/`, `@` et la palette : un seul composant, donc un seul comportement
 * clavier et un seul rendu. La hauteur est bornée en CSS (352 px, comme la maquette) — avec 430
 * commandes dans le registre réel, une liste qui pousse la page rendrait le champ inutilisable.
 */
export function SuggestMenu(props: {
  rows: MenuRow[]
  active: number
  label: string
  onHover: (index: number) => void
  onPick: (row: MenuRow) => void
}) {
  let list: HTMLDivElement | undefined

  // La ligne active suit le clavier, y compris quand elle sort de la fenêtre de la liste.
  // `scrollIntoView` n'existe pas en jsdom : son absence ne casse pas le composant.
  createEffect(() => {
    const index = props.active
    list?.querySelector(`[data-i="${index}"]`)?.scrollIntoView?.({ block: "nearest" })
  })

  return (
    <div class="oc-menu" ref={list} role="listbox" aria-label={props.label}>
      <Show when={props.rows.length > 0} fallback={<div class="oc-menu-empty">No matching command.</div>}>
        <For each={props.rows}>
          {(row, index) => (
            <button
              type="button"
              class="oc-menu-row"
              classList={{ "is-active": props.active === index() }}
              data-i={index()}
              role="option"
              aria-selected={props.active === index()}
              /* Le clavier est piloté par le champ (ou par le champ de la palette) : les lignes ne
                 doivent pas voler le focus ni polluer l'ordre de tabulation. Elles restent des
                 `<button>` — une action est un bouton, pas un `<div onClick>`. */
              tabindex="-1"
              onMouseEnter={() => props.onHover(index())}
              onClick={() => props.onPick(row)}
            >
              <span class="oc-menu-name">{row.name}</span>
              <Show when={row.detail}>{(detail) => <span class="oc-menu-detail">{detail()}</span>}</Show>
              <Show when={row.tag}>
                {(tag) => (
                  <span class="oc-menu-tag" classList={{ "is-mcp": tag() === "mcp" }}>
                    {tag() === "mcp" ? "MCP" : "Skill"}
                  </span>
                )}
              </Show>
            </button>
          )}
        </For>
      </Show>
    </div>
  )
}

/**
 * La palette `ctrl+p` — les mêmes commandes, dans une boîte de dialogue.
 *
 * Elle a son propre champ de filtre, qui prend le focus à l'ouverture : c'est le premier geste
 * utile, et un dialogues qui s'ouvre sans focus oblige à cliquer avant de taper.
 * `Échap` et un clic sur le fond la ferment — une boîte modale qui ne s'ouvre qu'au clavier ne
 * doit pas rester ouverte sans moyen clavier de sortir.
 */
export function CommandPalette(props: {
  rows: MenuRow[]
  query: string
  active: number
  onQuery: (value: string) => void
  onActive: (index: number) => void
  onMove: (key: string) => void
  onPick: (row: MenuRow) => void
  onClose: () => void
}) {
  let field: HTMLInputElement | undefined
  // Le focus se pose **après** le rendu : une `ref` est appelée avant l'insertion dans le
  // document, et `focus()` sur un nœud détaché ne fait rien (défaut mesuré sur le `Picker`).
  queueMicrotask(() => field?.focus())

  const pickActive = () => {
    const row = props.rows[props.active]
    if (row) props.onPick(row)
  }

  return (
    <div
      class="oc-palette-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) props.onClose()
      }}
    >
      <div class="oc-palette" role="dialog" aria-modal="true" aria-label="Commands">
        <div class="oc-palette-head">
          <h2>Commands</h2>
          <kbd>ctrl+p</kbd>
        </div>
        <input
          class="oc-palette-input"
          type="text"
          placeholder="Search commands…"
          aria-label="Search commands"
          value={props.query}
          ref={(element) => (field = element)}
          onInput={(event) => props.onQuery(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
              event.preventDefault()
              props.onMove(event.key)
            } else if (event.key === "Enter" || event.key === "Tab") {
              // `Tab` complète ici aussi : c'est le même geste que dans le `/`.
              event.preventDefault()
              pickActive()
            } else if (event.key === "Escape") {
              event.preventDefault()
              props.onClose()
            }
          }}
        />
        <SuggestMenu
          rows={props.rows}
          active={props.active}
          label="commands"
          onHover={props.onActive}
          onPick={props.onPick}
        />
      </div>
    </div>
  )
}
