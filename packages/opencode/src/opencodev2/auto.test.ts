import { afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  annulerLocal,
  autoCommitAgent,
  autoFetchAuDemarrage,
  autoPushAgent,
  brancheAgent,
  ecrireReglagesAuto,
  lireJournal,
  lireReglagesAuto,
  REGLAGES_PAR_DEFAUT,
  refuserMain,
  type ReglagesAuto,
} from "./auto"

let temp: string
let remote: string
let local: string
let config: string
const XDG_AVANT = process.env.XDG_CONFIG_HOME

async function sh(cwd: string, args: string[]) {
  const p = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe", stdin: "ignore" })
  const code = await p.exited
  const stderr = await new Response(p.stderr).text()
  if (code !== 0) throw new Error(stderr)
  return new Response(p.stdout).text()
}

beforeAll(async () => {
  temp = mkdtempSync(path.join(tmpdir(), "ov2-auto-"))
  remote = path.join(temp, "remote.git")
  local = path.join(temp, "local")
  config = path.join(temp, "config")
  await sh(temp, ["init", "--bare", "--initial-branch=main", remote])
  await sh(temp, ["clone", remote, local])
  await sh(local, ["config", "user.name", "Test"])
  await sh(local, ["config", "user.email", "test@local.invalid"])
  writeFileSync(path.join(local, "README.md"), "initial\n")
  await sh(local, ["add", "README.md"])
  await sh(local, ["commit", "-m", "initial"])
  await sh(local, ["push", "-u", "origin", "main"])
})

beforeEach(() => {
  process.env.XDG_CONFIG_HOME = config
  ecrireReglagesAuto({ ...REGLAGES_PAR_DEFAUT })
  rmSync(path.join(config, "opencodev2", "auto-journal.jsonl"), { force: true })
})

afterEach(() => {
  if (XDG_AVANT === undefined) delete process.env.XDG_CONFIG_HOME
  else process.env.XDG_CONFIG_HOME = XDG_AVANT
})

const TOUT: ReglagesAuto = { fetchAuDemarrage: true, commitAuto: true, pushAuto: true }

describe("réglages — désactivés par défaut", () => {
  test("les trois valeurs sont fausse au départ", () => {
    expect(REGLAGES_PAR_DEFAUT).toEqual({ fetchAuDemarrage: false, commitAuto: false, pushAuto: false })
    expect(lireReglagesAuto()).toEqual(REGLAGES_PAR_DEFAUT)
  })
  test("écriture puis relecture", () => {
    ecrireReglagesAuto(TOUT)
    expect(lireReglagesAuto()).toEqual(TOUT)
  })
  test("un JSON corrompu retombe sur les défauts", () => {
    writeFileSync(path.join(config, "opencodev2", "auto.json"), "{ pas json")
    expect(lireReglagesAuto()).toEqual(REGLAGES_PAR_DEFAUT)
  })
})

describe("garde absolue — jamais sur main", () => {
  test("refuserMain rejette main, master et une branche non-agent", () => {
    expect(() => refuserMain("main")).toThrow()
    expect(() => refuserMain("master")).toThrow()
    expect(() => refuserMain("feat/x")).toThrow()
  })
  test("refuserMain accepte une branche agent/", () => {
    expect(() => refuserMain("agent/ses_123")).not.toThrow()
  })
  test("brancheAgent valide et refuse une injection", () => {
    expect(brancheAgent("ses_123")).toBe("agent/ses_123")
    expect(() => brancheAgent("x; touch /tmp/y")).toThrow()
  })
})

describe("actions automatiques", () => {
  test("désactivées : aucune action, aucun journal", async () => {
    expect(await autoFetchAuDemarrage(local)).toBeUndefined()
    expect(await autoCommitAgent(local, "ses_001", ["README.md"])).toBeUndefined()
    expect(await autoPushAgent(local, "ses_001")).toBeUndefined()
    expect(lireJournal()).toEqual([])
  })

  test("fetch journalisé quand activé", async () => {
    ecrireReglagesAuto(TOUT)
    const e = await autoFetchAuDemarrage(local)
    expect(e?.action).toBe("fetch")
    expect(e?.statut).toBe("ok")
    expect(lireJournal().length).toBe(1)
  })

  test("commit dans agent/<session> sans toucher main", async () => {
    ecrireReglagesAuto(TOUT)
    writeFileSync(path.join(local, "auto.txt"), "x\n")
    const e = await autoCommitAgent(local, "ses_002", ["auto.txt"])
    expect(e?.action).toBe("commit")
    expect(e?.branche).toBe("agent/ses_002")
    expect(e?.statut).toBe("ok")
    expect((await sh(local, ["rev-parse", "--abbrev-ref", "HEAD"])).trim()).toBe("agent/ses_002")
    const mainSha = (await sh(local, ["rev-parse", "main"])).trim()
    const mainApres = (await sh(local, ["rev-list", "-n", "1", "main"])).trim()
    expect(mainApres).toBe(mainSha) // main inchangée
  })

  test("depuis main, bascule sur agent/ sans jamais committer sur main", async () => {
    ecrireReglagesAuto(TOUT)
    await sh(local, ["switch", "main"])
    const mainAvant = (await sh(local, ["rev-parse", "main"])).trim()
    writeFileSync(path.join(local, "depuis-main.txt"), "d\n")
    const e = await autoCommitAgent(local, "ses_003", ["depuis-main.txt"])
    expect(e?.statut).toBe("ok")
    expect(e?.branche).toBe("agent/ses_003")
    expect((await sh(local, ["rev-parse", "--abbrev-ref", "HEAD"])).trim()).toBe("agent/ses_003")
    expect((await sh(local, ["rev-parse", "main"])).trim()).toBe(mainAvant)
  })

  test("push de la branche agent vers origin, sans force", async () => {
    ecrireReglagesAuto(TOUT)
    writeFileSync(path.join(local, "push.txt"), "p\n")
    await autoCommitAgent(local, "ses_004", ["push.txt"])
    const e = await autoPushAgent(local, "ses_004")
    expect(e?.action).toBe("push")
    expect(e?.statut).toBe("ok")
    const distantes = await sh(remote, ["branch", "--list", "agent/ses_004"])
    expect(distantes).toContain("agent/ses_004")
    const mainDistant = (await sh(remote, ["rev-parse", "main"])).trim()
    expect(mainDistant).toBe((await sh(local, ["rev-parse", "main"])).trim())
  })

  test("annulation locale par revert", async () => {
    ecrireReglagesAuto(TOUT)
    writeFileSync(path.join(local, "annuler.txt"), "a\n")
    const c = await autoCommitAgent(local, "ses_005", ["annuler.txt"])
    expect(c?.sha).toBeTruthy()
    const a = await annulerLocal(local, c!.id)
    expect(a.action).toBe("annulation")
    expect(a.statut).toBe("ok")
  })
})
