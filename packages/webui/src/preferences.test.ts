import { beforeEach, describe, expect, test } from "vitest"
import {
  afficherDepot,
  basculerDepot,
  choisirLangue,
  langueInterface,
  setAfficherDepot,
  setLangueInterface,
} from "./preferences"

describe("préférences d'interface (localStorage)", () => {
  beforeEach(() => {
    localStorage.clear()
    setAfficherDepot(true)
    setLangueInterface("fr")
  })

  test("défauts : panneau affiché, langue française", () => {
    expect(afficherDepot()).toBe(true)
    expect(langueInterface()).toBe("fr")
  })

  test("basculer le panneau écrit puis relit la préférence", () => {
    basculerDepot()
    expect(afficherDepot()).toBe(false)
    expect(localStorage.getItem("oc.webui.afficher_depot")).toBeNull()
    basculerDepot()
    expect(afficherDepot()).toBe(true)
    expect(localStorage.getItem("oc.webui.afficher_depot")).toBe("1")
  })

  test("choisir la langue écrit la valeur", () => {
    choisirLangue("en")
    expect(langueInterface()).toBe("en")
    expect(localStorage.getItem("oc.webui.langue")).toBe("en")
    choisirLangue("fr")
    expect(localStorage.getItem("oc.webui.langue")).toBeNull()
  })

  test("une valeur stockée invalide retombe sur le défaut", () => {
    localStorage.setItem("oc.webui.langue", "zz")
    setLangueInterface(localStorage.getItem("oc.webui.langue") === "en" ? "en" : "fr")
    expect(langueInterface()).toBe("fr")
  })
})
