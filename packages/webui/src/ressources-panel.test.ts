import { describe, expect, test } from "vitest"
import {
  formaterOctets,
  pourcentage,
  niveauAlerte,
  messageAlerte,
} from "./ressources-panel"
import {
  creerClientHealth,
  type Transport,
  type Memoire,
  type EtatDemon,
} from "./ressources-client"

/**
 * Tests du panneau Ressources (docs/design/24-ressources.md).
 * Couvre : formatage, seuils aux bornes 79,9 / 80 / 89,9 / 90 %, messages
 * actionnables, états, et client simulé (aucune ligne de commande exposée).
 */

const mem = (pct: number, swap = 0): Memoire => ({
  totale: 10 * 1024 ** 3,
  utilisee: (pct / 100) * 10 * 1024 ** 3,
  disponible: ((100 - pct) / 100) * 10 * 1024 ** 3,
  swapTotale: 8 * 1024 ** 3,
  swapUtilisee: swap * 1024 ** 3,
})
const demonOn: EtatDemon = { enMarche: true, pid: 56822, duree: "2 h 14" }
const demonOff: EtatDemon = { enMarche: false, pid: null }

describe("formaterOctets", () => {
  test("Go et Mo avec virgule décimale", () => {
    expect(formaterOctets(8.4 * 1024 ** 3)).toBe("8,4 Go")
    expect(formaterOctets(480 * 1024 ** 2)).toBe("480 Mo")
  })

  test("valeur invalide", () => {
    expect(formaterOctets(-1)).toBe("—")
    expect(formaterOctets(NaN)).toBe("—")
  })
})

describe("pourcentage", () => {
  test("borne [0, 100]", () => {
    expect(pourcentage(5, 10)).toBe(50)
    expect(pourcentage(0, 0)).toBe(0)
    expect(pourcentage(20, 10)).toBe(100)
  })
})

describe("niveauAlerte — seuils aux bornes", () => {
  test("79,9 % = normal", () => {
    expect(niveauAlerte(mem(79.9), demonOn)).toBe("normal")
  })
  test("80 % = avertissement", () => {
    expect(niveauAlerte(mem(80), demonOn)).toBe("avertissement")
  })
  test("89,9 % = avertissement", () => {
    expect(niveauAlerte(mem(89.9), demonOn)).toBe("avertissement")
  })
  test("90 % = critique", () => {
    expect(niveauAlerte(mem(90), demonOn)).toBe("critique")
  })
  test("swap > 0 = avertissement", () => {
    expect(niveauAlerte(mem(40, 1), demonOn)).toBe("avertissement")
  })
  test("démon arrêté = hors ligne", () => {
    expect(niveauAlerte(mem(40), demonOff)).toBe("hors-ligne")
  })
  test("données manquantes = hors ligne", () => {
    expect(niveauAlerte(undefined, demonOn)).toBe("hors-ligne")
  })
})

describe("messageAlerte — actionnable, sans secret", () => {
  test("avertissement cite la cause mémoire", () => {
    const m = messageAlerte(mem(85), demonOn)
    expect(m).toContain("sessions d'évaluation")
    expect(m).not.toMatch(/\/|token|ghp_/)
  })
  test("critique conseille d'arrêter le démon", () => {
    expect(messageAlerte(mem(92), demonOn)).toContain("Arrêtez le démon")
  })
  test("swap utilisé", () => {
    expect(messageAlerte(mem(40, 1), demonOn)).toContain("swap")
  })
  test("démon arrêté", () => {
    expect(messageAlerte(mem(40), demonOff)).toContain("démon est arrêté")
  })
  test("normal = aucun message", () => {
    expect(messageAlerte(mem(40), demonOn)).toBeUndefined()
  })
})

describe("client simulé — liste réduite, sans ligne de commande", () => {
  test("retourne les champs réduits attendus", async () => {
    const transport: Transport = async (chemin) => {
      if (chemin === "memoire") return mem(85)
      if (chemin === "demon") return demonOn
      if (chemin === "processus")
        return {
          processus: [
            { pid: 56822, nom: "opencode (démon)", rss: 1.2 * 1024 ** 3, duree: "2 h 14" },
            { pid: 2419, nom: "opencode", rss: 480 * 1024 ** 2, duree: "12 min" },
          ],
        }
      return {}
    }
    const api = creerClientHealth(transport)
    const p = await api.processus()
    expect(p.processus).toHaveLength(2)
    for (const proc of p.processus) {
      expect(Object.keys(proc).sort()).toEqual(["duree", "nom", "pid", "rss"])
      expect(proc.nom).not.toMatch(/\/|ghp_|--/)
    }
    expect((await api.memoire()).utilisee).toBeGreaterThan(0)
    expect((await api.demon()).enMarche).toBe(true)
  })

  test("actions passent par le transport avec la bonne cible", async () => {
    const appels: string[] = []
    const transport: Transport = async (chemin, corps) => {
      appels.push(`${chemin}:${corps === undefined ? "" : JSON.stringify(corps)}`)
      return { arrete: true }
    }
    const api = creerClientHealth(transport)
    await api.arreterDemon()
    await api.arreterProcessus(56822)
    expect(appels).toContain("demon/arreter:{}")
    expect(appels).toContain("processus/56822/arreter:{}")
  })
})
