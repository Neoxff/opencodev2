import { describe, expect, test } from "vitest"
import {
  MOTTO_STORAGE_KEY,
  MOTTOS,
  motsDuMotto,
  nextMottoIndex,
  salutation,
  type MottoStorage,
} from "./ouverture"

/** Stockage en mémoire, avec la même signature que `localStorage`. */
function fakeStorage(initial?: string): MottoStorage & { value: string | undefined } {
  return {
    value: initial,
    getItem(): string | null {
      return this.value ?? null
    },
    setItem(_key: string, next: string): void {
      this.value = next
    },
  }
}

/** Stockage qui refuse la lecture, puis un qui refuse l'écriture. */
const brokenRead: MottoStorage = {
  getItem(): string | null {
    throw new Error("SecurityError: storage disabled")
  },
  setItem(): void {},
}
const brokenWrite: MottoStorage = {
  getItem: () => "3",
  setItem(): void {
    throw new Error("QuotaExceededError")
  },
}

describe("MOTTOS", () => {
  test("dix entrées distinctes, chacune avec sa phrase et sa description", () => {
    expect(MOTTOS).toHaveLength(10)
    const phrases = MOTTOS.map((entry) => entry[0])
    expect(new Set(phrases).size).toBe(10)
    for (const [motto, sub] of MOTTOS) {
      expect(motto.trim().length).toBeGreaterThan(0)
      expect(sub.trim().length).toBeGreaterThan(0)
    }
  })
})

describe("nextMottoIndex — rotation", () => {
  test("première ouverture : index 0, mémorisé sous oc2.motto", () => {
    const storage = fakeStorage()
    expect(nextMottoIndex({ storage })).toBe(0)
    expect(storage.value).toBe("0")
    expect(MOTTO_STORAGE_KEY).toBe("oc2.motto")
  })

  test("chaque ouverture avance d'un, puis revient à zéro après la dixième", () => {
    const storage = fakeStorage()
    const seen = Array.from({ length: 12 }, () => nextMottoIndex({ storage }))
    expect(seen).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1])
    expect(storage.value).toBe("1")
  })

  test("un index mémorisé à 9 bascule sur 0", () => {
    expect(nextMottoIndex({ storage: fakeStorage("9") })).toBe(0)
  })

  test("un index mémorisé négatif ne produit pas un index négatif", () => {
    const index = nextMottoIndex({ storage: fakeStorage("-20"), random: () => 0.42 })
    expect(index).toBeGreaterThanOrEqual(0)
    expect(index).toBeLessThan(MOTTOS.length)
  })
})

describe("nextMottoIndex — repli", () => {
  test("stockage illisible : tirage aléatoire", () => {
    expect(nextMottoIndex({ storage: brokenRead, random: () => 0.99 })).toBe(9)
  })

  test("stockage qui refuse l'écriture : tirage aléatoire", () => {
    expect(nextMottoIndex({ storage: brokenWrite, random: () => 0.05 })).toBe(0)
  })

  test("valeur mémorisée invalide : tirage aléatoire", () => {
    expect(nextMottoIndex({ storage: fakeStorage("pas-un-nombre"), random: () => 0.75 })).toBe(7)
  })

  test("tirage aux bornes : toujours dans le tableau", () => {
    expect(nextMottoIndex({ storage: brokenRead, random: () => 1 })).toBe(MOTTOS.length - 1)
    expect(nextMottoIndex({ storage: brokenRead, random: () => 0 })).toBe(0)
  })

  test("le repli ne touche pas au réseau : aucune API réseau n'est appelée", () => {
    const originalFetch = globalThis.fetch
    let calls = 0
    globalThis.fetch = (() => {
      calls += 1
      return Promise.reject(new Error("réseau interdit"))
    }) as unknown as typeof fetch
    try {
      expect(nextMottoIndex({ storage: brokenRead, random: () => 0.5 })).toBe(5)
      expect(calls).toBe(0)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

describe("salutation", () => {
  const at = (day: number, date: number, month: number, hour: number) =>
    salutation(new Date(2026, month, date, hour, 0))

  test("avant 5 h : Bonne nuit", () => {
    expect(at(0, 22, 10, 4)).toContain("Bonne nuit")
  })
  test("de 5 h à 11 h : Bonjour", () => {
    expect(at(0, 22, 10, 5)).toContain("Bonjour")
    expect(at(0, 22, 10, 11)).toContain("Bonjour")
  })
  test("de 12 h à 17 h : Bon après-midi", () => {
    expect(at(0, 22, 10, 12)).toContain("Bon après-midi")
    expect(at(0, 22, 10, 17)).toContain("Bon après-midi")
  })
  test("à partir de 18 h : Bonsoir", () => {
    expect(at(0, 22, 10, 18)).toContain("Bonsoir")
    expect(at(0, 22, 10, 23)).toContain("Bonsoir")
  })
  test("jour et mois en français", () => {
    // 22 novembre 2026 est un dimanche.
    expect(at(0, 22, 10, 9)).toBe("Bonjour · dimanche 22 novembre")
  })
})

describe("motsDuMotto", () => {
  test("découpe sans mot vide et conserve la ponctuation", () => {
    expect(motsDuMotto(MOTTOS[0]![0])).toEqual(["Fais-le", "bien,", "une", "étape", "à", "la", "fois."])
    expect(motsDuMotto("  Fluide,   sobre, précis. ")).toEqual(["Fluide,", "sobre,", "précis."])
  })
})
