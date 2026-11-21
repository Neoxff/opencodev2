/**
 * Liste longue virtualisée — ne monte que les lignes visibles.
 *
 * Le composant garde la hauteur totale d'une liste complète grâce à deux
 * espacements, donc le défilement et le rendu visible sont identiques à une
 * liste ordinaire. En dessous du seuil, toutes les lignes sont montées : aucun
 * changement pour les petites listes.
 */
import { createSignal, For, Show, type JSX } from "solid-js"
import { doitVirtualiser, fenetreVisible } from "./listes"
import "./liste-longue.css"

export type ListeLongueProps<T> = {
  elements: readonly T[]
  hauteurLigne: number
  hauteurVue: number
  renduLigne: (element: T, index: number) => JSX.Element
  survol?: number
  seuil?: number
  class?: string
}

export function ListeLongue<T>(props: ListeLongueProps<T>) {
  const [scrollTop, setScrollTop] = createSignal(0)

  const virtualise = () => doitVirtualiser(props.elements.length, props.seuil)

  const fenetre = () =>
    virtualise()
      ? fenetreVisible({
          nombre: props.elements.length,
          scrollTop: scrollTop(),
          hauteurVue: props.hauteurVue,
          hauteurLigne: props.hauteurLigne,
          survol: props.survol,
        })
      : { debut: 0, fin: props.elements.length, margeHaut: 0, margeBas: 0 }

  const visibles = () => props.elements.slice(fenetre().debut, fenetre().fin)

  return (
    <div
      class={`liste-longue ${props.class ?? ""}`.trim()}
      style={virtualise() ? { "max-height": `${props.hauteurVue}px` } : undefined}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <Show when={virtualise()}>
        <div class="liste-longue-haut" style={{ height: `${fenetre().margeHaut}px` }} aria-hidden="true" />
      </Show>
      <For each={visibles()}>
        {(element, index) => props.renduLigne(element, fenetre().debut + index())}
      </For>
      <Show when={virtualise()}>
        <div class="liste-longue-bas" style={{ height: `${fenetre().margeBas}px` }} aria-hidden="true" />
      </Show>
    </div>
  )
}
