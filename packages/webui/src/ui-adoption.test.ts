import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"

const ROOT = join(__dirname, "..")
const UI_DIR = join(ROOT, "public", "ui")
const SOURCE = join(ROOT, "..", "..", "docs", "design", "maquette-opencodev2-ui.html")
const CSS_MARKER = "<!--OPENCODEV2_UI_CSS-->"
const JS_MARKER = "<!--OPENCODEV2_UI_JS-->"
const SOURCE_SHA256 = "5f14d53ec7245299cfcec6dab56fc3a4d940d303a38cd2012404941fef898dcb"

function sourceParts() {
  const source = readFileSync(SOURCE, "utf8")
  const styleOpen = "<style>\n"
  const styleClose = "</style>"
  const scriptOpen = "<script>\n"
  const scriptClose = "</script>"
  const cssStart = source.indexOf(styleOpen) + styleOpen.length
  const cssEnd = source.indexOf(styleClose, cssStart)
  const jsStart = source.indexOf(scriptOpen, cssEnd) + scriptOpen.length
  const jsEnd = source.indexOf(scriptClose, jsStart)
  const css = source.slice(cssStart, cssEnd)
  const skeleton = source.slice(0, cssStart) + CSS_MARKER + source.slice(cssEnd, jsStart) + JS_MARKER + source.slice(jsEnd)
  return { source, css, skeleton }
}

describe("ui adoption — maquette découpée sans altération visuelle", () => {
  test("la source validée reste octet pour octet", () => {
    const source = readFileSync(SOURCE)
    expect(createHash("sha256").update(source).digest("hex")).toBe(SOURCE_SHA256)
  })

  test("le HTML et le CSS de la maquette sont conservés exactement", () => {
    const { css, skeleton } = sourceParts()
    expect(readFileSync(join(UI_DIR, "ui.html"), "utf8")).toBe(skeleton)
    expect(readFileSync(join(UI_DIR, "ui.css"), "utf8")).toBe(css)
  })

  test("le script garde les marqueurs visuels et le mode démo inchangé", () => {
    const js = readFileSync(join(UI_DIR, "ui.js"), "utf8")
    expect(js).toContain('new URLSearchParams(location.search).has("demo")')
    expect(js).toContain("vision-model")
    expect(js).toContain("kubernetes:k8s-diagnose:mcp")
    expect(js).not.toContain("shooting-star")
    expect(js).toContain("Correctif dépôt divergent")
    expect(js).toContain("Tidepool Alpha Free")
    expect(js).toContain("Resume · Correctif dépôt divergent")
  })

  test("le script ajoute uniquement le branchement aux données réelles", () => {
    const js = readFileSync(join(UI_DIR, "ui.js"), "utf8")
    expect(js).toContain("import('/ui/data.js')")
    expect(js).toContain("loadSidebarData")
    expect(js).toContain("openRealSession")
    expect(js).toContain("bientôt")
  })
})
