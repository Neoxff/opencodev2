import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { render } from "solid-js/web"
import { GitPanel } from "./git-panel"
import { ErreurGitApi, gitApi, type GitStatus } from "./git-client"

vi.mock("./git-client", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>
  return {
    ...original,
    gitApi: {
      status: vi.fn(),
      fetch: vi.fn(),
      pull: vi.fn(),
      commit: vi.fn(),
      push: vi.fn(),
      branch: vi.fn(),
    },
  }
})

const statut: GitStatus = {
  repo: "Neoxff/opencodev2",
  branch: "main",
  ahead: 2,
  behind: 1,
  modified: ["src/a.ts", "src/b.ts"],
  lastCommit: { sha: "abcdef123", subject: "feat: panneau dépôt", date: "2026-11-17T20:00:00.000Z" },
  lastPush: null,
  dirty: true,
}

function mount(): { html: () => string; container: HTMLElement; dispose: () => void } {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const dispose = render(() => GitPanel(), container)
  return { html: () => container.innerHTML, container, dispose }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  vi.mocked(gitApi.status).mockResolvedValue(statut)
})

afterEach(() => {
  document.body.innerHTML = ""
  vi.clearAllMocks()
})

describe("GitPanel", () => {
  test("affiche dépôt, branche, compteurs et dernier commit", async () => {
    const { html, dispose } = mount()
    await flush()
    expect(html()).toContain("Neoxff/opencodev2")
    expect(html()).toContain("main")
    expect(html()).toContain("↑2")
    expect(html()).toContain("↓1")
    expect(html()).toContain("feat: panneau dépôt")
    expect(html()).toContain("2 modifiés")
    dispose()
  })

  test("quatre boutons ronds avec info-bulles, sans libellé écrit", async () => {
    const { container, dispose } = mount()
    await flush()
    const boutons = container.querySelectorAll("button.git-bouton")
    expect(boutons).toHaveLength(4)
    const titres = Array.from(boutons).map((b) => b.getAttribute("title"))
    expect(titres.join(" ")).toContain("Récupérer")
    expect(titres.join(" ")).toContain("Mettre à jour")
    expect(titres.join(" ")).toContain("Commit")
    expect(titres.join(" ")).toContain("Pousser")
    for (const b of boutons) expect((b.textContent ?? "").trim().length).toBeLessThanOrEqual(2)
    dispose()
  })

  test("confirmation avant commit, puis appel avec fichiers explicites", async () => {
    vi.mocked(gitApi.commit).mockResolvedValue({ sha: "x" })
    const { container, dispose } = mount()
    await flush()
    const commit = container.querySelector('button[aria-label="Commit"]') as HTMLButtonElement
    commit.click()
    await flush()
    expect(container.querySelector(".git-message")).not.toBeNull()
    expect(vi.mocked(gitApi.commit)).not.toHaveBeenCalled()
    const input = container.querySelector(".git-message") as HTMLInputElement
    input.value = "feat: message"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await flush()
    commit.click()
    await flush()
    expect(vi.mocked(gitApi.commit)).toHaveBeenCalledWith("feat: message", ["src/a.ts", "src/b.ts"])
    dispose()
  })

  test("confirmation avant push, jamais de force", async () => {
    vi.mocked(gitApi.push).mockResolvedValue({ ok: true })
    const { container, dispose } = mount()
    await flush()
    const push = container.querySelector('button[aria-label="Pousser"]') as HTMLButtonElement
    push.click()
    await flush()
    expect(container.textContent).toContain("Pousser vers origin ?")
    expect(vi.mocked(gitApi.push)).not.toHaveBeenCalled()
    push.click()
    await flush()
    expect(vi.mocked(gitApi.push)).toHaveBeenCalledTimes(1)
    dispose()
  })

  test("état hors ligne quand le status échoue", async () => {
    vi.mocked(gitApi.status).mockRejectedValue(Object.assign(new Error("x"), { code: "PAS_DE_RESEAU" }))
    const { container, dispose } = mount()
    await flush()
    expect(container.querySelector(".git-panel")?.getAttribute("data-etat")).toBe("hors-ligne")
    dispose()
  })

  test("état divergent après un pull refusé, avec message court et action", async () => {
    vi.mocked(gitApi.pull).mockRejectedValue(new ErreurGitApi("NON_FAST_FORWARD", "branches divergentes", 409))
    const { container, dispose } = mount()
    await flush()
    const maj = container.querySelector('button[aria-label="Mettre à jour"]') as HTMLButtonElement
    maj.click()
    await flush()
    expect(container.querySelector(".git-panel")?.getAttribute("data-etat")).toBe("divergent")
    expect(container.textContent).toContain("Branches divergentes : fusion manuelle nécessaire.")
    expect(container.querySelector('button[aria-label="Réessayer"]')).not.toBeNull()
    expect(container.textContent).not.toContain("hint:")
    dispose()
  })

  test("Échap annule la confirmation en cours", async () => {
    const { container, dispose } = mount()
    await flush()
    container.querySelector('button[aria-label="Commit"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    await flush()
    expect(container.querySelector(".git-confirm")).not.toBeNull()
    container.querySelector(".git-panel")?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    await flush()
    expect(container.querySelector(".git-confirm")).toBeNull()
    dispose()
  })

  test("Échap ferme la section Automatisme", async () => {
    const { container, dispose } = mount()
    await flush()
    const auto = container.querySelector(".git-auto-titre") as HTMLButtonElement
    auto?.click()
    await flush()
    expect(auto?.getAttribute("aria-expanded")).toBe("true")
    container.querySelector(".git-panel")?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    await flush()
    expect(auto?.getAttribute("aria-expanded")).toBe("false")
    dispose()
  })

  test("libellés EN complets quand la langue est anglaise", async () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const dispose = render(() => GitPanel({ lang: "en" }), container)
    await flush()
    expect(container.textContent).toContain("Repository")
    // Le statut de test a behind:1 → état « Behind » (pas « Up to date »).
    expect(container.textContent).toContain("Behind")
    expect(container.querySelector('button[aria-label="Fetch"]')).not.toBeNull()
    expect(container.textContent).not.toContain("Dépôt Git lié")
    dispose()
  })
})
