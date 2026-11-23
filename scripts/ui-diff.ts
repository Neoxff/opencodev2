/**
 * ui:diff — comparaison visuelle déterministe entre la maquette source et /ui.
 * Zones exigées : barre latérale, en-tête, conversation, composeur, panneau droit, écran d'ouverture.
 * Règle : échec si une zone dépasse 0,5 % de pixels différents.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { chromium, type Browser, type Page } from "playwright-core"
import pixelmatch from "pixelmatch"
import { PNG } from "pngjs"

const ROOT = process.cwd()
const REFERENCE = join(ROOT, "docs/design/maquette-opencodev2-ui.html")
const SERVED = "http://127.0.0.1:4096/ui"
const OUT = join(ROOT, "docs/design/captures/ui-diff")
const VIEWPORT = { width: 1920, height: 1080 }
const THRESHOLD = 0.005
const FROZEN_TIME = Date.UTC(2026, 10, 23, 12, 0, 0)

const ZONES = [
  { name: "barre latérale", selector: ".side" },
  { name: "en-tête", selector: ".head" },
  { name: "conversation", selector: "#scroll" },
  { name: "composeur", selector: "#dock" },
  { name: "panneau de droite", selector: "#rpanel" },
  { name: "écran d'ouverture", selector: "#welcome", welcomeOnly: true },
] as const

const FREEZE = () => {
  const RealDate = Date
  const fixed = new RealDate("2026-11-23T12:00:00Z").getTime()
  class FrozenDate extends RealDate {
    constructor(...args: any[]) {
      if (args.length === 0) super(fixed)
      else super(...(args as [any]))
    }
    static now() {
      return fixed
    }
  }
  ;(globalThis as any).Date = FrozenDate
  let seed = 0x4f1bbcdc
  ;(Math as any).random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 0x100000000
  }
  try {
    localStorage.clear()
  } catch {}
}

async function newPage(browser: Browser) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    colorScheme: "dark",
    reducedMotion: "reduce",
    locale: "fr-FR",
    timezoneId: "UTC",
  })
  await context.addInitScript(FREEZE)
  const page = await context.newPage()
  await page.goto("about:blank")
  await page.addInitScript(FREEZE)
  return { context, page }
}

async function loadState(page: Page, url: string, state: "welcome" | "session") {
  await page.goto(url, { waitUntil: "load" })
  await page.evaluate(() => document.fonts.ready)
  // Ciel coupé, animation d'entrée terminée, état figé.
  await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("#sky")
    if (canvas) canvas.style.display = "none"
    const app = document.querySelector<HTMLElement>("#app")
    if (app) {
      app.style.opacity = "1"
      app.style.transform = "none"
    }
  })
  await page.waitForTimeout(300)

  if (state === "session") {
    await page.locator('.chip[data-a="res"]').click()
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(300)
  }
}

async function screenshot(page: Page, file: string) {
  await page.screenshot({ path: file, animations: "disabled", caret: "hide" })
  return PNG.sync.read(readFileSync(file))
}

async function crop(png: PNG, box: { x: number; y: number; width: number; height: number }) {
  const x = Math.max(0, Math.round(box.x))
  const y = Math.max(0, Math.round(box.y))
  const width = Math.max(1, Math.min(png.width - x, Math.round(box.width)))
  const height = Math.max(1, Math.min(png.height - y, Math.round(box.height)))
  const out = new PNG({ width, height })
  for (let row = 0; row < height; row++) {
    const from = ((y + row) * png.width + x) * 4
    const to = row * width * 4
    png.data.copy(out.data, to, from, from + width * 4)
  }
  return out
}

async function boxFor(page: Page, selector: string) {
  const locator = page.locator(selector).first()
  await locator.waitFor({ state: "visible" })
  const box = await locator.boundingBox()
  if (!box) throw new Error(`Zone introuvable: ${selector}`)
  return box
}

async function compareZone(name: string, ref: PNG, got: PNG, box: { x: number; y: number; width: number; height: number }) {
  const a = await crop(ref, box)
  const b = await crop(got, box)
  const diff = new PNG({ width: a.width, height: a.height })
  const different = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1, includeAA: false })
  const total = a.width * a.height
  const percent = (different / total) * 100
  writeFileSync(join(OUT, `${name.replace(/\s+/g, "-")}.png`), PNG.sync.write(diff))
  console.log(`${name.padEnd(20)} ${percent.toFixed(3)}% (${different}/${total} px)`)
  return percent
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      "--disable-font-subpixel-positioning",
      "--disable-lcd-text",
      "--force-color-profile=srgb",
    ],
  })

  try {
    const refCtx = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      colorScheme: "dark",
      reducedMotion: "reduce",
      locale: "fr-FR",
      timezoneId: "UTC",
    })
    await refCtx.addInitScript(FREEZE)
    const refPage = await refCtx.newPage()

    const gotCtx = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      colorScheme: "dark",
      reducedMotion: "reduce",
      locale: "fr-FR",
      timezoneId: "UTC",
    })
    await gotCtx.addInitScript(FREEZE)
    const gotPage = await gotCtx.newPage()

    await loadState(refPage, `file://${REFERENCE}`, "welcome")
    await loadState(gotPage, SERVED, "welcome")
    const welcomeRef = await screenshot(refPage, join(OUT, "reference-welcome.png"))
    const welcomeGot = await screenshot(gotPage, join(OUT, "served-welcome.png"))

    const boxes: Record<string, { x: number; y: number; width: number; height: number }> = {}
    for (const zone of ZONES) {
      if ("welcomeOnly" in zone && zone.welcomeOnly) {
        boxes[zone.name] = await boxFor(refPage, zone.selector)
      }
    }

    await loadState(refPage, `file://${REFERENCE}`, "session")
    await loadState(gotPage, SERVED, "session")
    const sessionRef = await screenshot(refPage, join(OUT, "reference-session.png"))
    const sessionGot = await screenshot(gotPage, join(OUT, "served-session.png"))
    for (const zone of ZONES) {
      if (!("welcomeOnly" in zone && zone.welcomeOnly)) {
        boxes[zone.name] = await boxFor(refPage, zone.selector)
      }
    }

    let failed = false
    let maxPercent = 0
    for (const zone of ZONES) {
      const welcomeOnly = "welcomeOnly" in zone && zone.welcomeOnly
      const ref = welcomeOnly ? welcomeRef : sessionRef
      const got = welcomeOnly ? welcomeGot : sessionGot
      const percent = await compareZone(zone.name, ref, got, boxes[zone.name])
      maxPercent = Math.max(maxPercent, percent)
      if (percent > THRESHOLD * 100) failed = true
    }

    // Capture côte à côte demandée.
    const side = new PNG({ width: VIEWPORT.width * 2, height: VIEWPORT.height })
    PNG.bitblt(sessionRef, side, 0, 0, sessionRef.width, sessionRef.height, 0, 0)
    PNG.bitblt(sessionGot, side, 0, 0, sessionGot.width, sessionGot.height, VIEWPORT.width, 0)
    writeFileSync(join(OUT, "cote-a-cote.png"), PNG.sync.write(side))

    if (failed) {
      console.error(`ÉCHEC : au moins une zone dépasse ${(THRESHOLD * 100).toFixed(1)} %`)
      process.exit(1)
    }
    if (maxPercent === 0) console.log("OK : toutes les zones sont à 0,000 %")
    else console.log(`OK : écart maximal ${maxPercent.toFixed(3)} % (≤ 0,500 %)`)
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
