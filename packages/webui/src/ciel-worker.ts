/**
 * Worker de calcul du ciel étoilé.
 *
 * Fait tourner le moteur `ciel-moteur` dans sa propre boucle d'animation et
 * pousse l'état à dessiner vers le composant via `postMessage`.
 *
 * Aucun accès au DOM. Le composant reste maître du rendu (CanvasRenderingContext2D
 * sur le canevas principal) afin de garder le code testable et de fonctionner
 * sans OffscreenCanvas.
 *
 * Spécification : docs/design/20-ciel-etoile.md
 */

import {
  étatInitial,
  frame,
  type ÉtatCiel,
  type ModeCiel,
} from "./ciel-moteur"

let état: ÉtatCiel | null = null
let largeur = 0
let hauteur = 0
let mode: ModeCiel = "activé"
let saisieEnCours = false
let offsetX = 0
let offsetY = 0
let t0 = performance.now()
let tDernier = t0
let running = false
let id: ReturnType<typeof requestAnimationFrame> | null = null

function loop() {
  if (!état || !running) {
    id = null
    return
  }
  const t = performance.now() - t0
  const delta = t - tDernier
  tDernier = t
  état = frame(
    état,
    t,
    largeur,
    hauteur,
    offsetX,
    offsetY,
    mode,
    saisieEnCours,
    delta,
  )
  self.postMessage({
    type: "frame",
    payload: {
      etoiles: état.etoiles,
      filantes: état.filantes,
      voieLactee: état.voieLactee,
    },
  })
  id = requestAnimationFrame(loop)
}

self.addEventListener(
  "message",
  (e: MessageEvent) => {
    const { type, payload } = e.data as {
      type: string
      payload: Record<string, unknown>
    }
    switch (type) {
      case "init":
        largeur = Number((payload as { largeur: unknown }).largeur)
        hauteur = Number((payload as { hauteur: unknown }).hauteur)
        mode = (payload as { mode: ModeCiel }).mode
        offsetX = Number((payload as { offsetX: unknown }).offsetX ?? 0)
        offsetY = Number((payload as { offsetY: unknown }).offsetY ?? 0)
        état = étatInitial(
          Number((payload as { graine: unknown }).graine),
          largeur,
          hauteur,
          mode,
        )
        t0 = performance.now()
        tDernier = t0
        if (!running) {
          running = true
          id = requestAnimationFrame(loop)
        }
        break
      case "resize":
        largeur = Number((payload as { largeur: unknown }).largeur)
        hauteur = Number((payload as { hauteur: unknown }).hauteur)
        if (état) {
          état = étatInitial(état._graine, largeur, hauteur, mode)
        }
        break
      case "mode":
        mode = (payload as { mode: ModeCiel }).mode
        if (état) {
          état = étatInitial(état._graine, largeur, hauteur, mode)
        }
        break
      case "saisie":
        saisieEnCours = Boolean(
          (payload as { saisieEnCours: unknown }).saisieEnCours,
        )
        break
      case "offset":
        offsetX = Number((payload as { x: unknown }).x ?? 0)
        offsetY = Number((payload as { y: unknown }).y ?? 0)
        break
      case "pause":
        running = false
        if (id !== null) {
          cancelAnimationFrame(id)
          id = null
        }
        break
      case "resume":
        if (!running && état) {
          running = true
          t0 = performance.now()
          tDernier = t0
          id = requestAnimationFrame(loop)
        }
        break
    }
  },
  { once: false },
)
