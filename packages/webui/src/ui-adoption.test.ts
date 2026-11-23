import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"

const ROOT = join(__dirname, "..")
const UI_DIR = join(ROOT, "public", "ui")
const CSS_MARKER = "<!--OPENCODEV2_UI_CSS-->"
const JS_MARKER = "<!--OPENCODEV2_UI_JS-->"
const SOURCE_SHA256 = "5f14d53ec7245299cfcec6dab56fc3a4d940d303a38cd2012404941fef898dcb"

function reassemble() {
  const html = readFileSync(join(UI_DIR, "ui.html"), "utf8")
  const css = readFileSync(join(UI_DIR, "ui.css"), "utf8")
  const js = readFileSync(join(UI_DIR, "ui.js"), "utf8")
  expect(html).toContain(CSS_MARKER)
  expect(html).toContain(JS_MARKER)
  return html.replace(CSS_MARKER, css).replace(JS_MARKER, js)
}

describe("ui adoption — maquette découpée sans altération", () => {
  test("les trois fichiers se réassemblent en octets exacts (sha256)", () => {
    const body = reassemble()
    expect(createHash("sha256").update(Buffer.from(body, "utf8")).digest("hex")).toBe(SOURCE_SHA256)
  })

  test("la maquette réassemblée garde les marqueurs de la source validée", () => {
    const body = reassemble()
    expect(body).toContain("vision-model")
    expect(body).toContain("kubernetes:k8s-diagnose:mcp")
    expect(body).toContain("--bg:#000")
    expect(body).not.toContain("shooting-star")
  })
})
