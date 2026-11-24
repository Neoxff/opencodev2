import { describe, expect, test, vi } from "vitest"
import { render } from "solid-js/web"

vi.mock("./git-panel", () => ({ GitPanel: () => <div data-panel="depot" /> }))
vi.mock("./ressources-panel", () => ({ default: () => <div data-panel="ressources" /> }))

import { ServerSheet } from "./server-sheet"

function mount(open: boolean, onClose = vi.fn()) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const dispose = render(() => <ServerSheet open={open} onClose={onClose} />, container)
  return { container, dispose, onClose }
}

describe("ServerSheet", () => {
  test("fermée : aucun conteneur dans le DOM", () => {
    const { container, dispose } = mount(false)
    expect(container.querySelector(".server-sheet")).toBeNull()
    dispose()
  })

  test("ouverte : montre les deux panneaux existants dans une feuille noire", () => {
    const { container, dispose } = mount(true)
    const sheet = container.querySelector(".server-sheet") as HTMLElement
    expect(sheet.getAttribute("role")).toBe("dialog")
    expect(sheet.getAttribute("aria-label")).toBe("Server")
    expect(sheet.textContent).toContain("Server")
    expect(sheet.querySelector('[data-panel="depot"]')).not.toBeNull()
    expect(sheet.querySelector('[data-panel="ressources"]')).not.toBeNull()
    expect(container.querySelector(".server-sheet-scrim")).not.toBeNull()
    dispose()
  })

  test("clic sur le fond et sur Fermer appellent onClose", () => {
    const { container, dispose, onClose } = mount(true)
    ;(container.querySelector(".server-sheet-scrim") as HTMLElement).click()
    ;(container.querySelector(".server-sheet-close") as HTMLElement).click()
    expect(onClose).toHaveBeenCalledTimes(2)
    dispose()
  })
})
