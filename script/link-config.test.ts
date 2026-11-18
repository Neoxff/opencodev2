import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  CONFIG_FILENAME,
  LinkConfigError,
  loadLinkConfig,
  parseLinkConfig,
  workspacePath,
} from "./link-config"

const VALIDE = {
  repo: "Neoxff/opencodev2",
  defaultBranch: "main",
  port: 4096,
  workspace: ".",
}

describe("parseLinkConfig", () => {
  test("accepte une configuration valide", () => {
    expect(parseLinkConfig(VALIDE)).toEqual(VALIDE)
  })

  test("accepte une branche avec un slash et un port aux bornes", () => {
    expect(parseLinkConfig({ ...VALIDE, defaultBranch: "feat/liaison-depot", port: 1 })).toBeTruthy()
    expect(parseLinkConfig({ ...VALIDE, port: 65535 }).port).toBe(65535)
  })

  test("rejette une valeur non-objet", () => {
    for (const valeur of [null, [], "x", 42]) {
      expect(() => parseLinkConfig(valeur)).toThrow(LinkConfigError)
    }
  })

  test("rejette une clé inconnue avec un message clair", () => {
    expect(() => parseLinkConfig({ ...VALIDE, motDePasse: "x" })).toThrow(/clé inconnue/)
  })

  test("rejette un dépôt mal formé", () => {
    for (const repo of ["", "opencodev2", "a/b/c", "../x", "a b/c"]) {
      expect(() => parseLinkConfig({ ...VALIDE, repo })).toThrow(/repo/)
    }
  })

  test("rejette une branche invalide", () => {
    for (const defaultBranch of ["", "-main", "a..b", "a b", "a~1", "a:b"]) {
      expect(() => parseLinkConfig({ ...VALIDE, defaultBranch })).toThrow(/defaultBranch/)
    }
  })

  test("rejette un port invalide", () => {
    for (const port of [0, 65536, -1, 4096.5, "4096", null]) {
      expect(() => parseLinkConfig({ ...VALIDE, port })).toThrow(/port/)
    }
  })

  test("rejette un workspace absolu ou traversant", () => {
    for (const workspace of ["/etc", "../hors", "a/../../b", ""]) {
      expect(() => parseLinkConfig({ ...VALIDE, workspace })).toThrow(/workspace/)
    }
  })

  test("accepte un workspace relatif imbriqué", () => {
    expect(parseLinkConfig({ ...VALIDE, workspace: "projets/opencodev2" }).workspace).toBe("projets/opencodev2")
  })
})

describe("loadLinkConfig", () => {
  test("retourne null si le fichier est absent (comportement historique)", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "opencodev2-cfg-"))
    try {
      expect(loadLinkConfig(dir)).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("lit un fichier valide et l'exemple versionné", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "opencodev2-cfg-"))
    try {
      writeFileSync(path.join(dir, CONFIG_FILENAME), JSON.stringify(VALIDE))
      expect(loadLinkConfig(dir)).toEqual(VALIDE)

      const exemple = JSON.parse(
        await Bun.file(path.join(import.meta.dir, "..", "opencodev2.config.example.json")).text(),
      )
      expect(parseLinkConfig(exemple).repo).toBe("mon-compte/opencodev2")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("refuse un JSON invalide avec le nom du fichier", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "opencodev2-cfg-"))
    try {
      writeFileSync(path.join(dir, CONFIG_FILENAME), "{ pas du json")
      expect(() => loadLinkConfig(dir)).toThrow(/JSON invalide/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe("workspacePath", () => {
  test("résout le workspace dans la racine", () => {
    const root = "/tmp/racine"
    expect(workspacePath(root, { ...VALIDE, workspace: "." })).toBe(path.resolve(root))
    expect(workspacePath(root, { ...VALIDE, workspace: "sous/dossier" })).toBe(
      path.join(path.resolve(root), "sous", "dossier"),
    )
  })

  test("refuse de sortir de la racine", () => {
    expect(() => workspacePath("/tmp/racine", { ...VALIDE, workspace: ".." })).toThrow(LinkConfigError)
  })
})
