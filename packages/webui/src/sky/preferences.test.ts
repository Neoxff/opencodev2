import { describe, expect, test } from "vitest"
import { browserStorage, parseSkyMode, readSkyMode, writeSkyMode, SKY_STORAGE_KEY } from "./preferences"
import { SKY_MODES } from "./types"

/** Stockage en mémoire, injecté à la place de `localStorage`. */
function memoryStorage(initial?: string) {
  const values = new Map<string, string>()
  if (initial !== undefined) values.set(SKY_STORAGE_KEY, initial)
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    values,
  }
}

describe("réglage Ciel — persistance", () => {
  test("les trois niveaux, et rien d'autre", () => {
    expect(SKY_MODES).toEqual(["on", "static", "off"])
    expect(parseSkyMode("on")).toBe("on")
    expect(parseSkyMode("static")).toBe("static")
    expect(parseSkyMode("off")).toBe("off")
    expect(parseSkyMode("reduced")).toBeUndefined()
    expect(parseSkyMode("")).toBeUndefined()
    expect(parseSkyMode(null)).toBeUndefined()
  })

  test("une valeur écrite est relue telle quelle", () => {
    const storage = memoryStorage()
    writeSkyMode(storage, "static")
    expect(storage.getItem(SKY_STORAGE_KEY)).toBe("static")
    expect(readSkyMode(storage, false)).toBe("static")
    writeSkyMode(storage, "off")
    expect(readSkyMode(storage, false)).toBe("off")
  })

  test("sans valeur, le mouvement réduit impose statique", () => {
    expect(readSkyMode(memoryStorage(), false)).toBe("on")
    expect(readSkyMode(memoryStorage(), true)).toBe("static")
    expect(readSkyMode(undefined, true)).toBe("static")
  })

  test("une valeur invalide retombe sur le défaut, sans casser l'interface", () => {
    expect(readSkyMode(memoryStorage("garbage"), false)).toBe("on")
    expect(readSkyMode(memoryStorage("garbage"), true)).toBe("static")
  })

  test("un stockage qui échoue ne propage aucune erreur", () => {
    const broken = {
      getItem: () => {
        throw new Error("accès refusé")
      },
      setItem: () => {
        throw new Error("quota dépassé")
      },
    }
    expect(readSkyMode(broken, false)).toBe("on")
    expect(() => writeSkyMode(broken, "off")).not.toThrow()
  })

  test("le stockage navigateur est optional", () => {
    // En environnement de test, localStorage peut exister ou non : la fonction
    // ne doit jamais lever, et renvoie un objet ou undefined.
    expect(() => browserStorage()).not.toThrow()
  })
})
