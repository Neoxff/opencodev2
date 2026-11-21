import { describe, expect, test, vi, afterEach, beforeEach } from "bun:test"
import * as fs from "node:fs"
import * as fsPromises from "node:fs/promises"
import {
  etatDemon,
  estProcessusOpencodev2,
  champPid,
  verifieHost,
  listeProcessusOpencodev2,
} from "./health-routes"
import { readPidFile, isProcessRunning } from "@/daemon/paths"

// ---- Mocks ---------------------------------------------------------------
const mockReadFileSync = vi.fn()
const mockReadFile = vi.fn()
const mockReaddir = vi.fn()
const mockReadPidFile: any = vi.fn().mockReturnValue("")
const mockIsProcessRunning: any = vi.fn().mockReturnValue(false)

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(fs, "readFileSync").mockImplementation(mockReadFileSync)
  vi.spyOn(fsPromises, "readFile").mockImplementation(mockReadFile)
  vi.spyOn(fsPromises, "readdir").mockImplementation(mockReaddir)
  vi.spyOn(require("@/daemon/paths"), "readPidFile").mockImplementation(mockReadPidFile)
  vi.spyOn(require("@/daemon/paths"), "isProcessRunning").mockImplementation(mockIsProcessRunning)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("champPid", () => {
  test("accepte un entier positif", () => {
    expect(champPid("1234")).toBe(1234)
    expect(champPid(5678)).toBe(5678)
  })

  test("rejette 0, négatif, non-entier, non-numérique", () => {
    expect(() => champPid("0")).toThrow()
    expect(() => champPid("-1")).toThrow()
    expect(() => champPid("1.5")).toThrow()
    expect(() => champPid("abc")).toThrow()
    expect(() => champPid("")).toThrow()
    expect(() => champPid(null as unknown as string)).toThrow()
  })

  test("rejette une injection", () => {
    expect(() => champPid("1234; rm -rf /")).toThrow()
    expect(() => champPid("../../../etc/passwd")).toThrow()
  })
})

describe("verifieHost", () => {
  const request = (host: string) =>
    ({ headers: { host } } as unknown as import("effect/unstable/http").HttpServerRequest.HttpServerRequest)

  test("accepte localhost", () => {
    expect(verifieHost(request("localhost"))).toBe(true)
    expect(verifieHost(request("localhost:4096"))).toBe(true)
  })

  test("accepte 127.0.0.1 et ::1", () => {
    expect(verifieHost(request("127.0.0.1"))).toBe(true)
    expect(verifieHost(request("[::1]"))).toBe(true)
    expect(verifieHost(request("127.0.0.1:4096"))).toBe(true)
  })

  test("rejette un host externe (DNS rebinding)", () => {
    expect(verifieHost(request("evil.com"))).toBe(false)
    expect(verifieHost(request("192.168.1.1"))).toBe(false)
    expect(verifieHost(request(""))).toBe(false)
  })
})

describe("etatDemon", () => {
  test("retourne enMarche=false quand aucun PID", () => {
    mockReadPidFile.mockReturnValue("")
    const etat = etatDemon()
    expect(etat.enMarche).toBe(false)
    expect(etat.pid).toBeNull()
  })

  test("retourne enMarche=true quand le processus tourne", () => {
    mockReadPidFile.mockReturnValue("12345")
    mockIsProcessRunning.mockReturnValue(true)
    mockReadFileSync.mockImplementation((p: string) => {
      if (String(p).endsWith("/proc/12345/stat"))
        return "12345 (opencode) S 1 1 1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 100 200 300 400 500 600"
      if (String(p).endsWith("/proc/uptime")) return "1000.0 2000.0"
      return ""
    })
    vi.spyOn(process, "kill").mockImplementation(() => undefined as any)
    const etat = etatDemon()
    expect(etat.enMarche).toBe(true)
    expect(Number(etat.pid)).toBe(12345)
  })
})

describe("estProcessusOpencodev2", () => {
  test("retourne true pour un processus opencode", () => {
    mockReadFileSync.mockReturnValue("1234 (opencode) S 1 1 1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 100 200 300 400 500 600")
    expect(estProcessusOpencodev2(1234)).toBe(true)
  })

  test("retourne false pour un processus non-opencode", () => {
    mockReadFileSync.mockReturnValue("5678 (bash) S 1 1 1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 100 200 300 400 500 600")
    expect(estProcessusOpencodev2(5678)).toBe(false)
  })

  test("retourne false si le processus n'existe plus", () => {
    mockReadFileSync.mockImplementation(() => { throw new Error("no such file") })
    expect(estProcessusOpencodev2(99999)).toBe(false)
  })
})

describe("listeProcessusOpencodev2", () => {
  test("retourne une liste réduite triée par RAM, sans ligne de commande", async () => {
    mockReaddir.mockResolvedValue(["1000", "2000", "3000", "notapid"])
    mockReadFile.mockImplementation(async (p: string) => {
      if (String(p).includes("/proc/uptime")) return "1000.0 2000.0\n"
      if (String(p).includes("/proc/1000/stat"))
        return "1000 (opencode) S 1 1 1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 100 200 300 400 500 600"
      if (String(p).includes("/proc/2000/stat"))
        return "2000 (opencode démon) S 1 1 1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 200 300 400 500 600"
      if (String(p).includes("/proc/3000/stat"))
        return "3000 (firefox) S 1 1 1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 100 200 300 400 500 600"
      return ""
    })
    const resultat = await listeProcessusOpencodev2()
    expect(resultat.length).toBeLessThanOrEqual(5)
    const noms = resultat.map((p) => p.nom)
    expect(noms).toContain("opencode")
    expect(noms.length).toBeGreaterThanOrEqual(2)
    expect(noms.every((n) => n.includes("opencode"))).toBe(true)
    for (const p of resultat) {
      expect(p.nom).not.toContain("/")
      expect(p.nom).not.toMatch(/\s-.+/)
    }
  })
})
