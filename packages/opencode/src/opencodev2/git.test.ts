import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  cheminSansRisque,
  classerErreur,
  GitError,
  gitBranch,
  gitCommit,
  gitFetch,
  gitPull,
  gitPush,
  gitStatus,
  repoDepuisRemote,
  verifierListeNoire,
} from "./git"

let temp: string
let remote: string
let local: string
let second: string

function sh(cwd: string, args: string[]) {
  const p = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe", stdin: "ignore" })
  return p.exited.then(async (code) => {
    const stderr = await new Response(p.stderr).text()
    if (code !== 0) throw new Error(stderr)
  })
}

beforeAll(async () => {
  temp = mkdtempSync(path.join(tmpdir(), "ov2-git-"))
  remote = path.join(temp, "remote.git")
  local = path.join(temp, "local")
  second = path.join(temp, "second")
  await sh(temp, ["init", "--bare", "--initial-branch=main", remote])
  await sh(temp, ["clone", remote, local])
  await sh(local, ["config", "user.name", "Test"])
  await sh(local, ["config", "user.email", "test@local.invalid"])
  writeFileSync(path.join(local, "README.md"), "initial\n")
  await sh(local, ["add", "README.md"])
  await sh(local, ["commit", "-m", "initial"])
  await sh(local, ["push", "-u", "origin", "main"])
  await sh(temp, ["clone", remote, second])
  await sh(second, ["config", "user.name", "Test"])
  await sh(second, ["config", "user.email", "test@local.invalid"])
})

afterAll(() => {
  try {
    rmSync(temp, { recursive: true, force: true })
  } catch {}
})

describe("sécurité des chemins et de la liste noire", () => {
  test("refuse un chemin absolu et un '..'", () => {
    expect(() => cheminSansRisque(local, "/etc/passwd")).toThrow(GitError)
    expect(() => cheminSansRisque(local, "../hors")).toThrow(GitError)
  })
  test("accepte un chemin relatif dans le dépôt", () => {
    expect(cheminSansRisque(local, "src/fichier.ts")).toBe("src/fichier.ts")
  })
  test("refuse les fichiers de secrets", () => {
    for (const f of ["auth.json", ".env", ".env.local", "clé.pem", "data.sqlite", "credentials", "token", "secrets/x"]) {
      expect(() => verifierListeNoire(f)).toThrow(GitError)
    }
    expect(() => verifierListeNoire("src/index.ts")).not.toThrow()
  })
  test("refuse une injection dans le message ou le nom de branche", async () => {
    expect(gitCommit(local, "ok; rm -rf /", ["README.md"])).rejects.toBeDefined()
    expect(gitBranch(local, "feat; touch /tmp/x")).rejects.toThrow(GitError)
  })
})

describe("parseur du dépôt GitHub", () => {
  test("reconnaît les URL HTTPS et SSH", () => {
    expect(repoDepuisRemote("https://github.com/Neoxff/opencodev2.git")).toBe("Neoxff/opencodev2")
    expect(repoDepuisRemote("git@github.com:Neoxff/opencodev2.git")).toBe("Neoxff/opencodev2")
  })
  test("retourne null pour un remote local", () => {
    expect(repoDepuisRemote("/tmp/remote.git")).toBeNull()
  })
})

describe("opérations git réelles", () => {
  test("status lit dépôt, branche et dernier commit", async () => {
    const s = await gitStatus(local)
    expect(s.branch).toBe("main")
    expect(s.repo).toBeNull() // remote de test local, pas une URL GitHub
    expect(s.lastCommit?.subject).toBe("initial")
    expect(s.dirty).toBe(false)
  })

  test("commit avec liste explicite, puis fetch et pull ff", async () => {
    writeFileSync(path.join(local, "a.txt"), "a\n")
    const { sha } = await gitCommit(local, "feat: ajout a", ["a.txt"])
    expect(sha).toMatch(/^[0-9a-f]{40}$/)
    await gitPush(local, "main")
    await gitFetch(second)
    const pulled = await gitPull(second)
    expect(pulled.sha).toBe(sha)
  })

  test("refuse un commit de fichier interdit", async () => {
    writeFileSync(path.join(local, "auth.json"), "fake")
    expect(gitCommit(local, "commit secret", ["auth.json"])).rejects.toMatchObject({ code: "FICHIER_INTERDIT" })
  })

  test("pull refuse un dépôt sale", async () => {
    writeFileSync(path.join(local, "sale.txt"), "sale\n")
    expect(gitPull(local)).rejects.toMatchObject({ code: "DEPOT_SALE" })
  })

  test("push refusé en non-fast-forward", async () => {
    // divergence : commit local sur second sans push, puis push amont depuis local
    await sh(second, ["reset", "--hard", "HEAD~1"])
    writeFileSync(path.join(second, "divergent.txt"), "d\n")
    await sh(second, ["add", "divergent.txt"])
    await sh(second, ["commit", "-m", "divergent"])
    writeFileSync(path.join(local, "autre.txt"), "x\n")
    await sh(local, ["add", "autre.txt"])
    await sh(local, ["commit", "-m", "autre"])
    await gitPush(local, "main")
    expect(gitPush(second, "main")).rejects.toMatchObject({ code: "NON_FAST_FORWARD" })
  })

  test("crée une branche", async () => {
    const r = await gitBranch(local, "feat/test-branche")
    expect(r.name).toBe("feat/test-branche")
  })
})

describe("erreurs git indépendantes de la locale", () => {
  let tempL: string
  let remoteL: string
  let aL: string
  let bL: string

  async function shCapture(cwd: string, args: string[]) {
    const p = Bun.spawn(["git", ...args], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
      env: { ...process.env, LC_ALL: "C", LANG: "C" },
    })
    const [code, stdout, stderr] = await Promise.all([
      p.exited,
      new Response(p.stdout).text(),
      new Response(p.stderr).text(),
    ])
    return { code, stdout, stderr }
  }

  beforeAll(async () => {
    tempL = mkdtempSync(path.join(tmpdir(), "ov2-locale-"))
    remoteL = path.join(tempL, "remote.git")
    aL = path.join(tempL, "a")
    bL = path.join(tempL, "b")
    await sh(tempL, ["init", "--bare", "--initial-branch=main", remoteL])
    await sh(tempL, ["clone", remoteL, aL])
    await sh(aL, ["config", "user.name", "Test"])
    await sh(aL, ["config", "user.email", "test@local.invalid"])
    writeFileSync(path.join(aL, "f.txt"), "base\n")
    await sh(aL, ["add", "f.txt"])
    await sh(aL, ["commit", "-m", "base"])
    await sh(aL, ["push", "-u", "origin", "main"])
    await sh(tempL, ["clone", remoteL, bL])
    await sh(bL, ["config", "user.name", "Test"])
    await sh(bL, ["config", "user.email", "test@local.invalid"])
  })

  afterAll(() => {
    try {
      rmSync(tempL, { recursive: true, force: true })
    } catch {}
  })

  async function diverger() {
    writeFileSync(path.join(aL, "f.txt"), "depuis a\n")
    await sh(aL, ["add", "f.txt"])
    await sh(aL, ["commit", "-m", "depuis a"])
    await sh(aL, ["push"])
    writeFileSync(path.join(bL, "f.txt"), "depuis b\n")
    await sh(bL, ["add", "f.txt"])
    await sh(bL, ["commit", "-m", "depuis b"])
    await gitFetch(bL)
  }

  test("pull --ff-only sur branches divergentes donne NON_FAST_FORWARD", async () => {
    await diverger()
    await expect(gitPull(bL)).rejects.toMatchObject({ code: "NON_FAST_FORWARD" })
  })

  test("même code avec une locale française forcée dans l'environnement du test", async () => {
    const avant = { LANG: process.env.LANG, LC_ALL: process.env.LC_ALL, LC_MESSAGES: process.env.LC_MESSAGES }
    process.env.LANG = "fr_FR.UTF-8"
    process.env.LC_ALL = "fr_FR.UTF-8"
    process.env.LC_MESSAGES = "fr_FR.UTF-8"
    try {
      await expect(gitPull(bL)).rejects.toMatchObject({ code: "NON_FAST_FORWARD" })
    } finally {
      for (const [k, v] of Object.entries(avant)) {
        if (v === undefined) delete process.env[k]
        else process.env[k] = v
      }
    }
  })

  test("un vrai conflit de fusion est classé CONFLIT", async () => {
    // Dépôt dédié : une vraie fusion conflictuelle salit l'arbre, ce qui ferait
    // échouer les tests suivants sur DEPOT_SALE. bL reste intact pour eux.
    const cL = path.join(tempL, "c")
    await sh(tempL, ["clone", remoteL, cL])
    await sh(cL, ["config", "user.name", "Test"])
    await sh(cL, ["config", "user.email", "test@local.invalid"])
    // remoteL porte déjà "depuis a" : on revient à la base pour diverger depuis celle-ci.
    await sh(cL, ["reset", "--hard", "HEAD~1"])
    writeFileSync(path.join(cL, "f.txt"), "depuis c\n")
    await sh(cL, ["add", "f.txt"])
    await sh(cL, ["commit", "-m", "depuis c"])
    const r = await shCapture(cL, ["merge", "origin/main"])
    expect(r.code).not.toBe(0)
    const sortie = `${r.stdout}\n${r.stderr}`.toLowerCase()
    expect(sortie).toContain("conflict")
    expect(classerErreur(sortie, r.code)).toBe("CONFLIT")
    expect(existsSync(path.join(cL, ".git", "MERGE_HEAD"))).toBe(true)
  })

  test("le message d'erreur typé ne contient aucun chemin absolu", async () => {
    try {
      await gitPull(bL)
      throw new Error("pull aurait dû échouer")
    } catch (e) {
      expect(e).toBeInstanceOf(GitError)
      const err = e as GitError
      expect(err.code).toBe("NON_FAST_FORWARD")
      expect(err.message).not.toContain(tempL)
      expect(err.message).not.toContain("/tmp/")
    }
  })

  test("le dépôt n'est pas laissé en état de fusion après un pull ff-only refusé", async () => {
    await expect(gitPull(bL)).rejects.toMatchObject({ code: "NON_FAST_FORWARD" })
    expect(existsSync(path.join(bL, ".git", "MERGE_HEAD"))).toBe(false)
  })
})
