import { describe, expect, test, vi } from "vitest"
import { createCompteurFps, SEUIL_TACHE_LONGUE_MS } from "./performances"

/** Horloge deterministe : l'appel teste decide quand l'image suivante est jouee. */
function horlogeFausse() {
  let temps = 0
  let id = 0
  let enAttente: ((t: number) => void) | undefined
  const demanderImage = vi.fn((callback: (t: number) => void) => {
    enAttente = callback
    return ++id
  })
  const annulerImage = vi.fn((_: number) => {
    enAttente = undefined
  })
  return {
    horloge: {
      maintenant: () => temps,
      demanderImage,
      annulerImage,
    },
    avancer(ms: number) {
      temps += ms
      const callback = enAttente
      enAttente = undefined
      callback?.(temps)
    },
    demanderImage,
    annulerImage,
  }
}

describe("createCompteurFps", () => {
  test("desactive : aucune image demandee, aucun cout", () => {
    const h = horlogeFausse()
    const compteur = createCompteurFps(h.horloge)
    expect(compteur.lire()).toEqual({ actif: false, images: 0, fps: 0, longuesTaches: 0, pireTacheMs: 0 })
    expect(h.demanderImage).not.toHaveBeenCalled()
  })

  test("activer demande une image", () => {
    const h = horlogeFausse()
    const compteur = createCompteurFps(h.horloge)
    compteur.activer()
    expect(h.demanderImage).toHaveBeenCalledTimes(1)
    expect(compteur.lire().actif).toBe(true)
  })

  test("compte les images sur une seconde", () => {
    const h = horlogeFausse()
    const compteur = createCompteurFps(h.horloge)
    compteur.activer()
    h.avancer(500)
    h.avancer(500)
    h.avancer(500) // nouvelle image apres le premier calcul
    expect(compteur.lire().fps).toBeGreaterThan(0)
  })

  test("desactiver annule l'image et arrete la boucle", () => {
    const h = horlogeFausse()
    const compteur = createCompteurFps(h.horloge)
    compteur.activer()
    compteur.desactiver()
    const appels = h.demanderImage.mock.calls.length
    h.avancer(2000)
    expect(h.demanderImage).toHaveBeenCalledTimes(appels)
    expect(h.annulerImage).toHaveBeenCalledTimes(1)
    expect(compteur.lire().actif).toBe(false)
  })

  test("activer deux fois ne double pas la boucle", () => {
    const h = horlogeFausse()
    const compteur = createCompteurFps(h.horloge)
    compteur.activer()
    compteur.activer()
    expect(h.demanderImage).toHaveBeenCalledTimes(1)
  })

  test("seuil de longue tache a 50 ms", () => {
    expect(SEUIL_TACHE_LONGUE_MS).toBe(50)
  })
})
