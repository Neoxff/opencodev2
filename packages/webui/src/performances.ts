/**
 * Compteur FPS et détection des longues taches (> 50 ms), opt-in.
 *
 * Tant qu'il n'est pas active, aucun `requestAnimationFrame` n'est planifie et
 * aucun observateur n'est instancie : le cout est strictement nul.
 */
export const SEUIL_TACHE_LONGUE_MS = 50

export type MesureFps = {
  actif: boolean
  images: number
  fps: number
  longuesTaches: number
  pireTacheMs: number
}

export type Horloge = {
  maintenant: () => number
  demanderImage: (callback: (temps: number) => void) => number
  annulerImage: (id: number) => void
}

const horlogeNavigateur: Horloge = {
  maintenant: () => performance.now(),
  demanderImage: (callback) => requestAnimationFrame(callback),
  annulerImage: (id) => cancelAnimationFrame(id),
}

export function createCompteurFps(horloge: Horloge = horlogeNavigateur) {
  let actif = false
  let image: number | undefined
  let images = 0
  let debut = 0
  let fps = 0
  let longuesTaches = 0
  let pireTacheMs = 0
  let observateur: { disconnect(): void } | undefined

  const boucle = (temps: number) => {
    if (!actif) return
    if (debut === 0) debut = temps
    images += 1
    const ecoule = temps - debut
    if (ecoule >= 1000) {
      fps = Math.round((images * 1000) / ecoule)
      images = 0
      debut = temps
    }
    image = horloge.demanderImage(boucle)
  }

  const observerTaches = () => {
    const Observation = (globalThis as Record<string, unknown>).PerformanceObserver
    if (typeof Observation !== "function") return
    try {
      const o = new (Observation as new (cb: (liste: { getEntries(): Array<{ duration: number }> }) => void) => {
        observe(options: object): void
        disconnect(): void
      })((liste) => {
        for (const entree of liste.getEntries()) {
          if (entree.duration >= SEUIL_TACHE_LONGUE_MS) {
            longuesTaches += 1
            pireTacheMs = Math.max(pireTacheMs, entree.duration)
          }
        }
      })
      o.observe({ entryTypes: ["longtask"] })
      observateur = o
    } catch {
      // PerformanceObserver ou "longtask" non pris en charge : sans effet.
    }
  }

  return {
    activer() {
      if (actif) return
      actif = true
      images = 0
      debut = 0
      fps = 0
      observerTaches()
      image = horloge.demanderImage(boucle)
    },
    desactiver() {
      actif = false
      if (image !== undefined) horloge.annulerImage(image)
      image = undefined
      observateur?.disconnect()
      observateur = undefined
    },
    lire(): MesureFps {
      return { actif, images, fps, longuesTaches, pireTacheMs: Math.round(pireTacheMs * 10) / 10 }
    },
  }
}
