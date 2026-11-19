import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import {
  dateRelative,
  ErreurGitApi,
  etatDepot,
  gitApi,
  lireJeton,
  type GitStatus,
} from "./git-client"

const JETON = "a".repeat(64)
const statut: GitStatus = {
  repo: "Neoxff/opencodev2",
  branch: "main",
  ahead: 0,
  behind: 0,
  modified: [],
  lastCommit: { sha: "abc123", subject: "feat: ajout", date: "2026-11-17T20:00:00.000Z" },
  lastPush: null,
  dirty: false,
}

beforeEach(() => {
  document.head.innerHTML = `<meta name="opencodev2-git-token" content="${JETON}">`
  vi.stubGlobal("fetch", vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("lireJeton", () => {
  test("lit la balise meta quand le jeton est valide", () => {
    expect(lireJeton()).toBe(JETON)
  })
  test("refuse un jeton mal formé", () => {
    document.head.innerHTML = '<meta name="opencodev2-git-token" content="court">'
    expect(lireJeton()).toBeUndefined()
  })
  test("retourne undefined sans balise", () => {
    document.head.innerHTML = ""
    expect(lireJeton()).toBeUndefined()
  })
})

describe("etatDepot", () => {
  test("à jour", () => expect(etatDepot(statut, undefined)).toBe("a-jour"))
  test("en avance", () => expect(etatDepot({ ...statut, ahead: 2 }, undefined)).toBe("en-avance"))
  test("en retard", () => expect(etatDepot({ ...statut, behind: 3 }, undefined)).toBe("en-retard"))
  test("conflit", () => expect(etatDepot(statut, "CONFLIT")).toBe("conflit"))
  test("hors ligne", () => expect(etatDepot(undefined, "PAS_DE_RESEAU")).toBe("hors-ligne"))
})

describe("dateRelative", () => {
  const maintenant = Date.parse("2026-11-17T22:00:00.000Z")
  test("à l'instant", () => expect(dateRelative("2026-11-17T21:59:30.000Z", maintenant)).toBe("à l'instant"))
  test("minutes", () => expect(dateRelative("2026-11-17T21:55:00.000Z", maintenant)).toBe("il y a 5 min"))
  test("jours", () => expect(dateRelative("2026-11-15T22:00:00.000Z", maintenant)).toBe("il y a 2 j"))
  test("jamais", () => expect(dateRelative(null)).toBe("jamais"))
})

describe("gitApi", () => {
  test("status envoie le jeton et parse la réponse", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(statut), { status: 200 }))
    expect(await gitApi.status()).toEqual(statut)
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(url).toBe("/opencodev2/git/status")
    expect((init.headers as Record<string, string>)["x-opencodev2-token"]).toBe(JETON)
  })

  test("push est un POST sans force", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    expect(await gitApi.push()).toEqual({ ok: true })
    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit
    expect(init.method).toBe("POST")
    expect(init.body).toBe("{}")
  })

  test("commit transmet message et fichiers", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ sha: "x" }), { status: 200 }))
    await gitApi.commit("feat: x", ["a.ts"])
    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit
    expect(JSON.parse(init.body as string)).toEqual({ message: "feat: x", files: ["a.ts"] })
  })

  test("erreur typée depuis le corps JSON", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ code: "CONFLIT", message: "conflit" }), { status: 409 }),
    )
    await expect(gitApi.pull()).rejects.toMatchObject({ code: "CONFLIT", status: 409 })
    await expect(gitApi.pull()).rejects.toBeInstanceOf(ErreurGitApi)
  })

  test("sans jeton, aucune requête réseau", async () => {
    document.head.innerHTML = ""
    await expect(gitApi.status()).rejects.toMatchObject({ code: "NON_DISPONIBLE" })
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })
})
