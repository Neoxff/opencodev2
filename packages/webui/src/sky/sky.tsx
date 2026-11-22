/**
 * Composants du ciel — un calque de fond et son réglage, deux responsabilités
 * distinctes : `SkyCanvas` pilote le rendu, `SkySection` pilote la préférence.
 *
 * Le niveau est reçu en prop (state local dans la feuille de réglages), jamais
 * lu depuis un store global : c'est une préférence de navigateur, pas une
 * donnée de session.
 */

import { createEffect, For, onCleanup, onMount } from "solid-js"
import { SkyController, browserSkyDeps } from "./controller"
import { SKY_MODE_LABELS } from "./preferences"
import { SKY_MODES, type SkyMode } from "./types"
import "./sky.css"

/**
 * Le fond : un canvas plein écran derrière la charpente, plus un vignettage
 * CSS statique. `aria-hidden` : c'est un décor, aucun contenu n'est perdu pour
 * les technologies d'assistance.
 */
export function SkyCanvas(props: { mode: SkyMode }) {
  let canvas: HTMLCanvasElement | undefined
  let controller: SkyController | undefined

  onMount(() => {
    if (!canvas) return
    controller = new SkyController(canvas, props.mode, browserSkyDeps())
    controller.start(window.innerWidth, window.innerHeight)
    controller.setHidden(document.hidden)

    const onResize = () => controller?.resize(window.innerWidth, window.innerHeight)
    const onVisibility = () => controller?.setHidden(document.hidden)
    window.addEventListener("resize", onResize)
    document.addEventListener("visibilitychange", onVisibility)

    onCleanup(() => {
      window.removeEventListener("resize", onResize)
      document.removeEventListener("visibilitychange", onVisibility)
      controller?.destroy()
      controller = undefined
    })
  })

  // Un changement de niveau est appliqué sans recréer le contrôleur : le
  // worker reçoit un message, le repli change sa boucle — jamais de fuite.
  createEffect(() => {
    controller?.setMode(props.mode)
  })

  return (
    <>
      <canvas ref={canvas} class="sky-canvas" data-mode={props.mode} aria-hidden="true" />
      <div class="sky-vignette" data-mode={props.mode} aria-hidden="true" />
    </>
  )
}

/** Les trois niveaux, en boutons radio natifs : clavier et focus offerts. */
export function SkySection(props: { mode: SkyMode; onChange: (mode: SkyMode) => void }) {
  return (
    <fieldset class="sky-options">
      <legend class="sky-legend">Background</legend>
      <For each={SKY_MODES}>
        {(mode) => (
          <label class="sky-option">
            <input
              type="radio"
              name="sky-mode"
              value={mode}
              checked={props.mode === mode}
              onChange={() => props.onChange(mode)}
            />
            <span class="sky-option-text">
              <span class="sky-option-label">{SKY_MODE_LABELS[mode].label}</span>
              <span class="sky-option-desc">{SKY_MODE_LABELS[mode].desc}</span>
            </span>
          </label>
        )}
      </For>
    </fieldset>
  )
}
