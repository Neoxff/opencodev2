/**
 * Composant « ciel étoilé » — plein écran derrière l'interface.
 *
 * - 3 couches d'étoiles (lointaine, moyenne, proche) avec dérive, scintillement,
 *   halo sur la couche proche, touches ambrées rares.
 * - Voie lactée pré-calculée (opacité ≤ 12 %).
 * - Étoiles filantes rares (une toutes les 20-40 s, jamais pendant la saisie).
 * - Vignettage sur les bords.
 * - Calcul dans un Web Worker quand disponible, repli automatique sur le thread
 *   principal sinon (même rendu).
 * - `document.hidden` arrête complètement la boucle d'animation.
 * - `pointer-events: none` et `z-index` le plus bas : le ciel ne bloque rien.
 *
 * Spécification : docs/design/20-ciel-etoile.md
 */

import { createSignal, onCleanup, onMount } from "solid-js"
import {
  étatInitial,
  frame,
  type ÉtatCiel,
  type ModeCiel,
} from "./ciel-moteur"

const COULEURS: Record<string, string> = {
  0: "#e0e7ff", // blanc froid
  1: "#fff3d6", // blanc chaud
  2: "#cdd8ff", // bleu pâle
  3: "#fde68a", // ambré
}

export type PropsCiel = {
  /** Mode actuellement actif (défaut "activé", corrigé par prefers-reduced-motion si besoin). */
  mode?: ModeCiel
  /** Vrai quand l'utilisateur saisit dans le compositeur (pas de filante pendant).
   *  Optionnel : le composant le déduit lui-même via `document.activeElement` si omis. */
  saisieEnCoursExterne?: boolean
}

export default function CielEtoile(props: PropsCiel) {
  let canvasEl: HTMLCanvasElement | null = null
  const [etat, setEtat] = createSignal<ÉtatCiel | null>(null)
  const [dimensions, setDimensions] = createSignal({ largeur: 0, hauteur: 0 })
  const [saisieEnCours, setSaisieEnCours] = createSignal(false)

  let worker: Worker | null = null
  let etatFallback: ÉtatCiel | null = null
  let t0 = performance.now()
  let tDernier = t0
  let running = false
  let id: ReturnType<typeof requestAnimationFrame> | null = null

  /** Mode effectif : « statique » forcé sous prefers-reduced-motion. */
  const modeEffectif = (): ModeCiel => {
    const mode = props.mode ?? "activé"
    if (
      typeof matchMedia !== "undefined" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return "statique"
    }
    return mode
  }

  /** Détection de la saisie : focus dans un champ de saisie ou le compositeur. */
  const verifierSaisie = () => {
    const el = document.activeElement
    const dansSaisie =
      el instanceof HTMLElement &&
      (el.tagName === "TEXTAREA" ||
        el.tagName === "INPUT" ||
        el.closest(".composer") !== null)
    setSaisieEnCours(dansSaisie)
  }

  /** Dessine l'état courant sur le canvas. */
  const dessiner = () => {
    const canvas = canvasEl
    const e = etat()
    if (!canvas || !e) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const { largeur, hauteur } = dimensions()
    if (largeur <= 0 || hauteur <= 0) return

    ctx.clearRect(0, 0, largeur, hauteur)

    // Fond sombre du ciel (le body porte déjà --bg-0 ; on renforce légèrement).
    ctx.fillStyle = "#0f111a"
    ctx.fillRect(0, 0, largeur, hauteur)

    // Voie lactée : bandes précalculées, opacité douce (≤ 12 %).
    for (const b of e.voieLactee) {
      const grad = ctx.createRadialGradient(
        b.x + b.w / 2,
        b.y + b.h / 2,
        0,
        b.x + b.w / 2,
        b.y + b.h / 2,
        Math.max(b.w, b.h),
      )
      grad.addColorStop(0, `rgba(255, 255, 255, ${b.alpha})`)
      grad.addColorStop(1, "rgba(255, 255, 255, 0)")
      ctx.fillStyle = grad
      ctx.fillRect(b.x, b.y, b.w, b.h)
    }

    // Étoiles : cercles, taille, couleur, alpha (scintillement déjà appliqué par le moteur).
    for (const e2 of e.etoiles) {
      ctx.fillStyle = COULEURS[String(e2.couleur)]
      ctx.globalAlpha = e2.alpha
      ctx.beginPath()
      ctx.arc(e2.x, e2.y, e2.taille, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1

    // Filantes : traînée dégradée.
    for (const f of e.filantes) {
      if (f.finie) continue
      const finX = f.x - Math.cos(f.angle) * f.longueur
      const finY = f.y - Math.sin(f.angle) * f.longueur
      const grad = ctx.createLinearGradient(f.x, f.y, finX, finY)
      grad.addColorStop(0, "rgba(255, 255, 255, 1)")
      grad.addColorStop(1, "rgba(255, 255, 255, 0)")
      ctx.strokeStyle = grad
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(f.x, f.y)
      ctx.lineTo(finX, finY)
      ctx.stroke()
    }

    // Vignettage sur les bords.
    const vignette = ctx.createRadialGradient(
      largeur / 2,
      hauteur / 2,
      0,
      largeur / 2,
      hauteur / 2,
      Math.max(largeur, hauteur),
    )
    vignette.addColorStop(0, "rgba(0, 0, 0, 0)")
    vignette.addColorStop(1, "rgba(0, 0, 0, 0.45)")
    ctx.fillStyle = vignette
    ctx.fillRect(0, 0, largeur, hauteur)
  }

  /** Lance le worker ou le repli thread principal. */
  const lancer = () => {
    const canvas = canvasEl
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    setDimensions({ largeur: rect.width, hauteur: rect.height })

    const mode = modeEffectif()
    if (mode === "désactivé") return

    const graine = Date.now()

    if (typeof Worker !== "undefined") {
      try {
        worker = new Worker(new URL("./ciel-worker.ts", import.meta.url), {
          type: "module",
        })
        worker.onmessage = (e: MessageEvent) => {
          if (e.data.type === "frame") {
            setEtat(e.data.payload as ÉtatCiel)
          }
        }
        worker.postMessage({
          type: "init",
          graine,
          largeur: rect.width,
          hauteur: rect.height,
          mode,
          offsetX: 0,
          offsetY: 0,
        })
        running = true
      } catch {
        worker = null
        lancerFallback(graine, rect.width, rect.height, mode)
      }
    } else {
      lancerFallback(graine, rect.width, rect.height, mode)
    }
  }

  /** Repli thread principal : le moteur tourne dans la boucle rAF du composant. */
  const lancerFallback = (graine: number, largeur: number, hauteur: number, mode: ModeCiel) => {
    etatFallback = étatInitial(graine, largeur, hauteur, mode)
    running = true
  }

  /** Boucle d'affichage unifiée : calcule (fallback) et dessine. */
  const boucle = (t: number) => {
    if (!running) return
    const mode = modeEffectif()
    if (mode === "désactivé") {
      running = false
      return
    }
    const delta = t - tDernier
    tDernier = t

    if (!worker && etatFallback) {
      etatFallback = frame(
        etatFallback,
        t,
        dimensions().largeur,
        dimensions().hauteur,
        0,
        0,
        mode,
        saisieEnCours(),
        delta,
      )
      setEtat({
        etoiles: etatFallback.etoiles,
        filantes: etatFallback.filantes,
        voieLactee: etatFallback.voieLactee,
        _graine: etatFallback._graine,
        _derniereFilante: etatFallback._derniereFilante,
        _prochaineCadence: etatFallback._prochaineCadence,
      })
    }

    dessiner()
    id = requestAnimationFrame(boucle)
  }

  const gererVisibilite = () => {
    if (document.hidden) {
      running = false
      if (id !== null) {
        cancelAnimationFrame(id)
        id = null
      }
      if (worker) worker.postMessage({ type: "pause" })
    } else {
      running = true
      if (worker) worker.postMessage({ type: "resume" })
      else {
        t0 = performance.now()
        tDernier = t0
        id = requestAnimationFrame(boucle)
      }
    }
  }

  onMount(() => {
    lancer()
    t0 = performance.now()
    tDernier = t0
    id = requestAnimationFrame(boucle)

    if (canvasEl) {
      const rect = canvasEl.getBoundingClientRect()
      setDimensions({ largeur: rect.width, hauteur: rect.height })
    }

    window.addEventListener("resize", () => {
      const c = canvasEl
      if (!c) return
      const rect = c.getBoundingClientRect()
      setDimensions({ largeur: rect.width, hauteur: rect.height })
      if (worker) {
        worker.postMessage({ type: "resize", largeur: rect.width, hauteur: rect.height })
      }
    })
    window.addEventListener("focusin", verifierSaisie)
    window.addEventListener("focusout", verifierSaisie)
    document.addEventListener("visibilitychange", gererVisibilite)
    verifierSaisie()
    return
  })

  onCleanup(() => {
    running = false
    if (id !== null) {
      cancelAnimationFrame(id)
      id = null
    }
    if (worker) {
      worker.postMessage({ type: "pause" })
      worker.terminate()
      worker = null
    }
    window.removeEventListener("resize", verifierSaisie)
    window.removeEventListener("focusin", verifierSaisie)
    window.removeEventListener("focusout", verifierSaisie)
    document.removeEventListener("visibilitychange", gererVisibilite)
  })

  if (modeEffectif() === "désactivé") return null

  return (
    <canvas
      ref={(el: HTMLCanvasElement | null) => {
        canvasEl = el
      }}
      class="ciel"
      aria-hidden="true"
      style={{ width: "100vw", height: "100vh", display: "block" }}
    />
  )
}
