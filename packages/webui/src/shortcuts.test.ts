import { describe, expect, test } from "vitest"
import {
  SHORTCUTS,
  deliveryNotice,
  keyState,
  matchShortcut,
  partMetadata,
  shortcut,
  submitMode,
  type KeyState,
  type ShortcutId,
} from "./shortcuts"

/** Une frappe complète, plutôt que des objets partiels : les modificateurs oubliés sont un bug. */
const press = (
  key: string,
  mods: Partial<Pick<KeyState, "code" | "ctrlKey" | "altKey" | "metaKey" | "shiftKey">> = {},
): KeyState => ({
  key,
  code: mods.code,
  ctrlKey: mods.ctrlKey ?? false,
  altKey: mods.altKey ?? false,
  metaKey: mods.metaKey ?? false,
  shiftKey: mods.shiftKey ?? false,
})

const id = (state: KeyState, scope: "global" | "composer" = "global"): ShortcutId | undefined =>
  matchShortcut(state, scope)?.id

describe("le registre — une fiche par action, un sens par frappe", () => {
  test("les sept raccourcis de la maquette sont présents", () => {
    expect(SHORTCUTS.map((spec) => spec.id)).toEqual([
      "palette",
      "newSession",
      "renameSession",
      "deleteSession",
      "interrupt",
      "queue",
      "steer",
    ])
  })

  test("aucune frappe et aucune id en double", () => {
    expect(new Set(SHORTCUTS.map((spec) => spec.keys)).size).toBe(SHORTCUTS.length)
    expect(new Set(SHORTCUTS.map((spec) => spec.id)).size).toBe(SHORTCUTS.length)
  })

  test("chaque conflit navigateur est documenté avec son preventDefault", () => {
    for (const spec of SHORTCUTS) {
      expect(spec.reason.length).toBeGreaterThan(0)
      if (spec.browserConflict) expect(spec.preventDefault).toBe(true)
    }
  })

  test("shortcut(j) refuse une id inconnue au lieu de renvoyer une fiche bidon", () => {
    expect(() => shortcut("inconnu" as ShortcutId)).toThrow("Raccourci inconnu")
  })
})

describe("matchShortcut — les vraies frappes, portée globale", () => {
  test("ctrl+p ouvre la palette", () => {
    expect(id(press("p", { ctrlKey: true }))).toBe("palette")
  })

  test("alt+n crée une session", () => {
    expect(id(press("n", { altKey: true }))).toBe("newSession")
  })

  test("ctrl+r renomme", () => {
    expect(id(press("r", { ctrlKey: true }))).toBe("renameSession")
  })

  test("ctrl+d demande la confirmation de suppression", () => {
    expect(id(press("d", { ctrlKey: true }))).toBe("deleteSession")
  })

  test("Échap interrompt", () => {
    expect(id(press("Escape"))).toBe("interrupt")
  })

  test("alt+s injecte la consigne", () => {
    expect(id(press("s", { altKey: true }))).toBe("steer")
  })

  test("une touche sans modificateur n'est pas un raccourci global", () => {
    expect(id(press("p"))).toBeUndefined()
    expect(id(press("n"))).toBeUndefined()
    expect(id(press("s"))).toBeUndefined()
  })

  test("Entrée n'est pas intercepté globalement : il garde son sens dans les boutons et champs", () => {
    expect(id(press("Enter"))).toBeUndefined()
  })
})

describe("matchShortcut — les lettres transformées par Alt", () => {
  test("Alt+N sur un clavier français qui produit « ˜ » est reconnu par le code physique", () => {
    expect(id(press("˜", { altKey: true, code: "KeyN" }))).toBe("newSession")
  })

  test("Alt+S qui produit « ß » est reconnu par le code physique", () => {
    expect(id(press("ß", { altKey: true, code: "KeyS" }))).toBe("steer")
  })

  test("le code physique sert de repli même quand la touche est transformée", () => {
    expect(id(press("x", { ctrlKey: true, code: "KeyP" }))).toBe("palette")
  })
})

describe("matchShortcut — les modificateurs sont exacts", () => {
  test("Maj est refusé : Maj+Entrée remained le retour à la ligne", () => {
    expect(id(press("Enter", { shiftKey: true }), "composer")).toBeUndefined()
  })

  test("Ctrl+Maj+P n'est pas Ctrl+P", () => {
    expect(id(press("p", { ctrlKey: true, shiftKey: true }))).toBeUndefined()
  })

  test("Cmd n'est jamais intercepté : les raccourcis système restent au système", () => {
    expect(id(press("p", { metaKey: true }))).toBeUndefined()
    expect(id(press("p", { metaKey: true, ctrlKey: true }))).toBeUndefined()
  })

  test("Ctrl+Alt+N n'est ni « nouveau » ni un raccourci du navigateur", () => {
    expect(id(press("n", { ctrlKey: true, altKey: true }))).toBeUndefined()
  })

  test("Alt+Échap n'interrompt pas : ce n'est pas la frappe de la maquette", () => {
    expect(id(press("Escape", { altKey: true }))).toBeUndefined()
  })
})

describe("matchShortcut — les conflits navigateur ne sont écrasés que si c'est justifié", () => {
  test("ctrl+p, ctrl+r et ctrl+d appellent preventDefault", () => {
    for (const key of ["p", "r", "d"]) {
      expect(matchShortcut(press(key, { ctrlKey: true }), "global")?.preventDefault).toBe(true)
    }
  })

  test("alt+n, Échap et alt+s laissent l'événement intact", () => {
    expect(matchShortcut(press("n", { altKey: true }), "global")?.preventDefault).toBe(false)
    expect(matchShortcut(press("Escape"), "global")?.preventDefault).toBe(false)
    expect(matchShortcut(press("s", { altKey: true }), "global")?.preventDefault).toBe(false)
  })

  test("Entrée dans le champ appelle preventDefault pour ne pas ajouter de ligne", () => {
    expect(matchShortcut(press("Enter"), "composer")?.preventDefault).toBe(true)
  })
})

describe("matchShortcut — portée du champ", () => {
  test("Entrée dans le champ met en file", () => {
    expect(id(press("Enter"), "composer")).toBe("queue")
  })

  test("la portée du champ ne vole pas les raccourcis globaux", () => {
    expect(id(press("p", { ctrlKey: true }), "composer")).toBeUndefined()
  })
})

describe("keyState — la projection d'un vrai KeyboardEvent", () => {
  test("une lettre majuscule est normalisée", () => {
    expect(keyState({ key: "P", code: "KeyP", ctrlKey: true, altKey: false, metaKey: false, shiftKey: false })).toEqual({
      key: "p",
      code: "KeyP",
      ctrlKey: true,
      altKey: false,
      metaKey: false,
      shiftKey: false,
    })
  })

  test("Échap et Entrée gardent leur nom complet", () => {
    expect(keyState({ key: "Escape", ctrlKey: false, altKey: false, metaKey: false, shiftKey: false }).key).toBe("Escape")
    expect(keyState({ key: "Enter", ctrlKey: false, altKey: false, metaKey: false, shiftKey: false }).key).toBe("Enter")
  })
})

describe("submitMode — file, steer et envoi ordinaire", () => {
  test("un steer explicite pendant le travail injecte dans le tour", () => {
    expect(submitMode(true, true)).toBe("steer")
  })

  test("sans tour actif, un steer demandé devient un envoi ordinaire", () => {
    expect(submitMode(true, false)).toBe("send")
  })

  test("un envoi pendant le travail est mis en file", () => {
    expect(submitMode(false, true)).toBe("queue")
  })

  test("un envoi au repos part normalement", () => {
    expect(submitMode(false, false)).toBe("send")
  })
})

describe("partMetadata — le protocole du serveur, pas une simulation", () => {
  test("seul le steer porte metadata.steer = true", () => {
    expect(partMetadata("steer")).toEqual({ metadata: { steer: true } })
  })

  test("la file et l'envoi ordinaire ne portent aucune métadonnée", () => {
    expect(partMetadata("queue")).toEqual({})
    expect(partMetadata("send")).toEqual({})
  })
})

describe("deliveryNotice — ce qu'on montre à l'utilisateur", () => {
  test("la file et le steer se voient", () => {
    expect(deliveryNotice("queue")).toContain("queued")
    expect(deliveryNotice("steer")).toContain("steer")
  })

  test("un envoi ordinaire n'affiche rien", () => {
    expect(deliveryNotice("send")).toBeUndefined()
  })
})
