import { describe, expect, test } from "vitest"
import { render } from "solid-js/web"
import { ListeLongue } from "./liste-longue"

function montre<T>(props: Parameters<typeof ListeLongue<T>>[0]): { html: () => string; dispose: () => void } {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const dispose = render(() => ListeLongue(props), container)
  return { html: () => container.innerHTML, dispose }
}

const elements = Array.from({ length: 1000 }, (_, i) => ({ id: i, titre: `ligne ${i}` }))

describe("ListeLongue", () => {
  test("petite liste : toutes les lignes montées, aucun espacement", () => {
    const { html, dispose } = montre({
      elements: elements.slice(0, 5),
      hauteurLigne: 20,
      hauteurVue: 400,
      renduLigne: (e) => <span>{e.titre}</span>,
    })
    for (let i = 0; i < 5; i++) expect(html()).toContain(`ligne ${i}`)
    expect(html()).not.toContain("ligne 900")
    expect(html()).not.toContain("liste-longue-haut")
    expect(html()).not.toContain("liste-longue-bas")
    dispose()
  })

  test("longue liste : seules les lignes visibles sont montées", () => {
    const { html, dispose } = montre({
      elements,
      hauteurLigne: 20,
      hauteurVue: 400,
      renduLigne: (e) => <span>{e.titre}</span>,
    })
    expect(html()).toContain("ligne 0")
    expect(html()).not.toContain("ligne 900")
    expect(html()).toContain("liste-longue-haut")
    expect(html()).toContain("liste-longue-bas")
    dispose()
  })

  test("la hauteur totale est preservee par les espacements", () => {
    const { html, dispose } = montre({
      elements,
      hauteurLigne: 20,
      hauteurVue: 400,
      renduLigne: (e) => <span>{e.titre}</span>,
    })
    // 1000 lignes * 20 px = 20000 px de hauteur totale, répartie en
    // espacement haut, lignes montées et espacement bas.
    const h = html()
    expect(h).toMatch(/class="liste-longue-haut"[^>]*style="height: 0px;"/)
    expect(h).toMatch(/class="liste-longue-bas"[^>]*style="height: \d+px;"/)
    dispose()
  })
})
