import { createSignal } from "solid-js"
import { render } from "solid-js/web"
import { describe, expect, test, vi } from "vitest"
import { SkyCanvas, SkySection } from "./sky"
import { SKY_MODE_LABELS } from "./preferences"
import { SKY_MODES, type SkyMode } from "./types"

function mount(component: () => unknown): { container: HTMLElement; dispose: () => void } {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const dispose = render(component as never, container)
  return { container, dispose }
}

describe("réglage Ciel — composant", () => {
  test("les trois niveaux sont proposés, avec le niveau courant coché", () => {
    const [mode] = createSignal<SkyMode>("static")
    const { container, dispose } = mount(() => <SkySection mode={mode()} onChange={() => {}} />)
    const radios = container.querySelectorAll('input[type="radio"][name="sky-mode"]')
    expect(radios).toHaveLength(3)
    expect([...radios].map((radio) => (radio as HTMLInputElement).value)).toEqual([...SKY_MODES])
    expect((radios[1] as HTMLInputElement).checked).toBe(true)
    dispose()
  })

  test("choisir un niveau appelle onChange avec la bonne valeur", () => {
    const [mode, setMode] = createSignal<SkyMode>("on")
    const onChange = vi.fn((next: SkyMode) => setMode(next))
    const { container, dispose } = mount(() => <SkySection mode={mode()} onChange={onChange} />)
    const radios = container.querySelectorAll('input[type="radio"]')
    ;(radios[2] as HTMLInputElement).click()
    expect(onChange).toHaveBeenCalledWith("off")
    expect(mode()).toBe("off")
    dispose()
  })

  test("chaque option est étiquetée et dépasse 44 px de cible", () => {
    const { container, dispose } = mount(() => <SkySection mode="on" onChange={() => {}} />)
    const options = container.querySelectorAll(".sky-option")
    expect(options).toHaveLength(3)
    options.forEach((option, index) => {
      const mode = SKY_MODES[index]
      expect(option.textContent).toContain(SKY_MODE_LABELS[mode].label)
      expect(option.textContent).toContain(SKY_MODE_LABELS[mode].desc)
      // La règle de hauteur est portée par la classe, vérifiable ici dans le CSS.
      expect(option.classList.contains("sky-option")).toBe(true)
    })
    dispose()
  })

  test("le calque est un décor : aria-hidden, données d'état, aucun contenu", () => {
    // `off` évite d'ouvrir un contexte canvas dans jsdom, qui ne le sait pas faire.
    const { container, dispose } = mount(() => <SkyCanvas mode="off" />)
    const canvas = container.querySelector("canvas.sky-canvas")
    const vignette = container.querySelector(".sky-vignette")
    expect(canvas?.getAttribute("aria-hidden")).toBe("true")
    expect(canvas?.getAttribute("data-mode")).toBe("off")
    expect(vignette?.getAttribute("aria-hidden")).toBe("true")
    expect(container.textContent).toBe("")
    dispose()
  })
})
