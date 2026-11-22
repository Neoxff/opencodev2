import { describe, expect, test, vi } from "vitest"
import { render } from "solid-js/web"
import {
  SidebarActions,
  SidebarFolder,
  SidebarFooter,
  SidebarHistory,
  SidebarLogo,
  SidebarNewSession,
  SidebarReadMore,
  SidebarSession,
  groupLatestTime,
  recentSessions,
  sessionActivityMap,
} from "./sidebar"
import type { SessionSummary } from "./sessions"

function mount(component: () => unknown): { html: string; container: HTMLElement; dispose: () => void } {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const dispose = render(component as never, container)
  return { html: container.innerHTML, container, dispose }
}

const session = (id: string, title: string, updated: number, directory = "/proj"): SessionSummary => ({
  id,
  title,
  directory,
  time: { updated },
})

const group = {
  key: "/proj",
  label: "proj",
  hint: "/proj",
  sessions: [session("s1", "Recent", 20_000), session("s2", "Older", 10_000)],
  current: true,
}

describe("modèle du rail — données réelles uniquement", () => {
  test("l'heure d'un dossier est celle de sa session la plus récente", () => {
    expect(groupLatestTime(group)).toBe(20_000)
    expect(groupLatestTime({ ...group, sessions: [] })).toBeUndefined()
  })

  test("l'historique trie les sessions du serveur du plus récent au plus ancien", () => {
    expect(recentSessions([session("a", "A", 1), session("b", "B", 3)], 8).map((s) => s.id)).toEqual(["b", "a"])
  })

  test("l'activité vient de GET /session/status ; retry compte comme occupé", () => {
    expect(sessionActivityMap({ s1: { type: "busy" }, s2: { type: "retry" }, s3: { type: "idle" } })).toEqual({
      s1: true,
      s2: true,
    })
    expect(sessionActivityMap(undefined)).toEqual({})
  })
})

describe("en-tête du rail", () => {
  test("le logo porte opencode et V2", () => {
    const { container, dispose } = mount(() => <SidebarLogo />)
    expect(container.textContent).toContain("opencode")
    expect(container.querySelector(".side-logo-v2")?.textContent).toBe("V2")
    expect(container.querySelector(".side-logo-mark")).not.toBeNull()
    dispose()
  })

  test("New session appelle l'action", () => {
    const onClick = vi.fn()
    const { container, dispose } = mount(() => <SidebarNewSession onClick={onClick} />)
    expect(container.textContent).toContain("New session")
    container.querySelector("button")?.click()
    expect(onClick).toHaveBeenCalledTimes(1)
    dispose()
  })

  test("Workspaces porte quatre gestes ; le filtre et le chemin n'existent qu'ouverts", () => {
    const onSearch = vi.fn()
    const onQuery = vi.fn()
    const onAddFolder = vi.fn()
    const onHistory = vi.fn()
    const onCollapse = vi.fn()
    const props = {
      query: "",
      headDraft: "",
      searchOpen: false,
      addOpen: false,
      historyOpen: false,
      onQuery,
      onHeadDraft: () => {},
      onSearch,
      onAddFolder,
      onHistory,
      onCollapse,
      onAddSubmit: () => {},
      onEscape: () => {},
    }
    const { container, dispose } = mount(() => <SidebarActions {...props} />)
    const buttons = Array.from(container.querySelectorAll("button"))
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual([
      "Search folders",
      "Add folder",
      "Session history",
      "Collapse sidebar",
    ])
    expect(container.querySelector(".side-filter")).toBeNull()
    buttons[0]?.click()
    buttons[1]?.click()
    buttons[2]?.click()
    buttons[3]?.click()
    expect(onSearch).toHaveBeenCalledTimes(1)
    expect(onAddFolder).toHaveBeenCalledTimes(1)
    expect(onHistory).toHaveBeenCalledTimes(1)
    expect(onCollapse).toHaveBeenCalledTimes(1)
    dispose()

    const open = mount(() => <SidebarActions {...props} searchOpen addOpen />)
    expect(open.container.querySelectorAll(".side-filter")).toHaveLength(2)
    const input = open.container.querySelector<HTMLInputElement>(".side-filter")
    input!.value = "abc"
    input!.dispatchEvent(new Event("input", { bubbles: true }))
    expect(onQuery).toHaveBeenCalledWith("abc")
    open.dispose()
  })
})

describe("navigation du rail", () => {
  test("un dossier repliable affiche son heure et ses gestes", () => {
    const onToggle = vi.fn()
    const onNew = vi.fn()
    const onMenu = vi.fn()
    const { container, dispose } = mount(() => (
      <SidebarFolder
        label="proj"
        hint="/proj"
        time="5m"
        open={false}
        onToggle={onToggle}
        onNew={onNew}
        onMenu={onMenu}
        onRename={() => {}}
      />
    ))
    expect(container.textContent).toContain("proj")
    expect(container.textContent).toContain("5m")
    expect(container.querySelector(".side-folder")?.className).not.toContain("open")
    const buttons = Array.from(container.querySelectorAll("button"))
    buttons[0]?.click() // repli
    buttons.find((b) => b.getAttribute("aria-label") === "New session in this folder")?.click()
    buttons.find((b) => b.getAttribute("aria-label") === "Folder actions")?.click()
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onNew).toHaveBeenCalledTimes(1)
    expect(onMenu).toHaveBeenCalledTimes(1)
    dispose()
  })

  test("une session s'ouvre au clic, porte le dégradé et l'indicateur d'activité", () => {
    const onSelect = vi.fn()
    const { container, dispose } = mount(() => (
      <SidebarSession
        title="Correctif dépôt divergent"
        hint="Correctif dépôt divergent\nagent : build"
        time="5m"
        active
        busy
        onSelect={onSelect}
      />
    ))
    const row = container.querySelector(".side-session")!
    expect(row.className).toContain("active")
    expect(container.querySelector(".sess-title")?.textContent).toBe("Correctif dépôt divergent")
    expect(container.querySelector(".sess-busy")).not.toBeNull()
    container.querySelector<HTMLElement>(".side-session")!.click()
    expect(onSelect).toHaveBeenCalledTimes(1)
    dispose()

    const idle = mount(() => (
      <SidebarSession title="x" hint="x" time="1d" onSelect={() => {}} />
    ))
    expect(idle.container.querySelector(".sess-busy")).toBeNull()
    idle.dispose()
  })

  test("l'historique liste les sessions reçues et navigue", () => {
    const onSelect = vi.fn()
    const { container, dispose } = mount(() => (
      <SidebarHistory sessions={recentSessions([session("s1", "A", 1), session("s2", "B", 2)])} now={3} onSelect={onSelect} />
    ))
    expect(container.querySelectorAll(".side-hist")).toHaveLength(2)
    expect(container.textContent).toContain("B")
    container.querySelector<HTMLElement>(".side-hist")!.click()
    expect(onSelect).toHaveBeenCalledWith("s2")
    dispose()
  })

  test("« read more (n) » annonce le nombre réel de sessions cachées", () => {
    const onToggle = vi.fn()
    const { container, dispose } = mount(() => <SidebarReadMore hidden={30} expanded={false} onToggle={onToggle} />)
    expect(container.textContent).toBe("read more (30)")
    container.querySelector("button")?.click()
    expect(onToggle).toHaveBeenCalledTimes(1)
    dispose()
  })

  test("le pied porte les touches, Archived et Server", () => {
    const onArchived = vi.fn()
    const onServer = vi.fn()
    const { container, dispose } = mount(() => (
      <SidebarFooter archivedOpen={false} archivedCount={2} onArchived={onArchived} onServer={onServer} />
    ))
    expect(container.textContent).toContain("alt+n")
    expect(container.textContent).toContain("ctrl+d")
    expect(container.textContent).toContain("ctrl+r")
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>(".side-fold"))
    expect(buttons.map((b) => b.textContent)).toEqual(["Archived2", "Server"])
    buttons[0]?.click()
    buttons[1]?.click()
    expect(onArchived).toHaveBeenCalledTimes(1)
    expect(onServer).toHaveBeenCalledTimes(1)
    dispose()
  })
})
