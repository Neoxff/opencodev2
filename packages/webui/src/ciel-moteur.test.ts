import { describe, expect, test } from "vitest"
import { étatInitial, frame, nbÉtoilesParCouche, type ÉtatCiel } from "./ciel-moteur"

const LARGEUR = 1200
const HAUTEUR = 800

function sérialiser(état: ÉtatCiel) {
  // Compare les données dessinables, sans les champs internes de génération.
  return JSON.stringify({
    etoiles: état.etoiles.map((e) => ({
      id: e.id,
      couche: e.couche,
      x: Math.round(e.x),
      y: Math.round(e.y),
      taille: e.taille,
      couleur: e.couleur,
      alpha: Math.round(e.alpha * 100),
    })),
    filantes: état.filantes.length,
  })
}

describe("ciel étoilé — moteur", () => {
  test("budget : 2 000 étoiles en mode activé", () => {
    const { lointaine, moyenne, proche } = nbÉtoilesParCouche("activé")
    expect(lointaine + moyenne + proche).toBe(2000)
  })

  test("mode réduit : moitié des étoiles", () => {
    const { lointaine, moyenne, proche } = nbÉtoilesParCouche("réduit")
    expect(lointaine).toBe(650)
    expect(moyenne).toBe(275)
    expect(proche).toBe(75)
    expect(lointaine + moyenne + proche).toBe(1000)
  })

  test("mode désactivé : aucune étoile", () => {
    const { lointaine, moyenne, proche } = nbÉtoilesParCouche("désactivé")
    expect(lointaine).toBe(0)
    expect(moyenne).toBe(0)
    expect(proche).toBe(0)
  })

  test("déterminisme : même graine donne le même ciel", () => {
    const a = étatInitial(42, LARGEUR, HAUTEUR, "activé")
    const b = étatInitial(42, LARGEUR, HAUTEUR, "activé")
    expect(sérialiser(a)).toBe(sérialiser(b))
  })

  test("graines différentes donnent des ciels différents", () => {
    const a = étatInitial(1, LARGEUR, HAUTEUR, "activé")
    const b = étatInitial(2, LARGEUR, HAUTEUR, "activé")
    expect(sérialiser(a)).not.toBe(sérialiser(b))
  })

  test("toutes les étoiles sont dans l'écran", () => {
    const état = étatInitial(7, LARGEUR, HAUTEUR, "activé")
    for (const e of état.etoiles) {
      expect(e.x).toBeGreaterThanOrEqual(0)
      expect(e.x).toBeLessThan(LARGEUR)
      expect(e.y).toBeGreaterThanOrEqual(0)
      expect(e.y).toBeLessThan(HAUTEUR)
    }
  })

  test("toutes les tailles sont dans l'intervalle de leur couche", () => {
    const état = étatInitial(7, LARGEUR, HAUTEUR, "activé")
    const bornes = {
      0: { min: 0.5, max: 0.8 },
      1: { min: 0.8, max: 1.6 },
      2: { min: 1.6, max: 2.5 },
    }
    for (const e of état.etoiles) {
      const b = bornes[e.couche]
      expect(e.taille).toBeGreaterThanOrEqual(b.min)
      expect(e.taille).toBeLessThanOrEqual(b.max)
    }
  })

  test("mode statique : les positions ne bougent pas d'une image à l'autre", () => {
    let état = étatInitial(9, LARGEUR, HAUTEUR, "statique")
    état = frame(état, 1000, LARGEUR, HAUTEUR, 0, 0, "statique", false, 16)
    état = frame(état, 2000, LARGEUR, HAUTEUR, 0, 0, "statique", false, 16)
    // positions identiques à l'état initial
    for (let i = 0; i < état.etoiles.length; i += 1) {
      expect(état.etoiles[i].x).toBe(étatInitial(9, LARGEUR, HAUTEUR, "statique").etoiles[i].x)
      expect(état.etoiles[i].y).toBe(étatInitial(9, LARGEUR, HAUTEUR, "statique").etoiles[i].y)
    }
  })

  test("mode activé : les positions bougent (dérive)", () => {
    const état0 = étatInitial(3, LARGEUR, HAUTEUR, "activé")
    let état = état0
    état = frame(état, 5000, LARGEUR, HAUTEUR, 0, 0, "activé", false, 16)
    const bougent = état.etoiles.some(
      (e, i) => e.x !== état0.etoiles[i].x || e.y !== état0.etoiles[i].y,
    )
    expect(bougent).toBe(true)
  })

  test("jamais plus d'une filante active", () => {
    let état = étatInitial(11, LARGEUR, HAUTEUR, "activé")
    // avance jusqu'à déclencher des filantes (cadence 20-40 s, on couvre 60 s)
    for (let t = 0; t < 60_000; t += 100) {
      état = frame(état, t, LARGEUR, HAUTEUR, 0, 0, "activé", false, 100)
      const actives = état.filantes.filter((f) => !f.finie).length
      expect(actives).toBeLessThanOrEqual(1)
    }
  })

  test("filantes gelées pendant la saisie", () => {
    let état = étatInitial(13, LARGEUR, HAUTEUR, "activé")
    // force une filante : on avance jusqu'à ce qu'une soit active, puis on gèle
    let active: Filante | undefined
    for (let t = 0; t < 300_000; t += 16) {
      état = frame(état, t, LARGEUR, HAUTEUR, 0, 0, "activé", false, 16)
      const f = état.filantes.find((x) => !x.finie)
      if (f) { active = f; break }
    }
    expect(active).toBeDefined()
    const tActif = active!.t
    // gel pendant la saisie
    for (let t = 0; t < 10_000; t += 16) {
      état = frame(état, t, LARGEUR, HAUTEUR, 0, 0, "activé", true, 16)
    }
    const encoreGelé = état.filantes.find((x) => !x.finie)
    expect(encoreGelé?.t).toBe(tActif)
  })

  test("voie lactée : opacité ≤ 12 %", () => {
    const état = étatInitial(17, LARGEUR, HAUTEUR, "activé")
    for (const b of état.voieLactee) {
      expect(b.alpha).toBeLessThanOrEqual(0.12)
    }
  })
})

interface Filante {
  t: number
  finie: boolean
}
