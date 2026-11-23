/**
 * Capture du composeur réel dans /ui, avec agents/modèles/variantes/style réels.
 * Le serveur local doit répondre sur http://127.0.0.1:4096.
 */
import { mkdirSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { chromium } from "playwright-core"

const BASE = "http://127.0.0.1:4096"
const OUT = join(process.cwd(), "docs/design/captures/ui-composeur")
const VIEWPORT = { width: 1920, height: 1080 }

async function findSessionWithMessages() {
  const sessions = (await (await fetch(`${BASE}/session`)).json()) as Array<{ id: string }>
  for (const session of sessions) {
    const messages = await (await fetch(`${BASE}/session/${encodeURIComponent(session.id)}/message`)).json()
    if (Array.isArray(messages) && messages.length > 0) return session.id
  }
  throw new Error("Aucune session réelle avec messages")
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  const sessionID = process.env.UI_SESSION || (await findSessionWithMessages())
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
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      colorScheme: "dark",
      reducedMotion: "reduce",
      locale: "fr-FR",
      timezoneId: "UTC",
    })
    const page = await context.newPage()
    await page.goto(`${BASE}/ui?session=${encodeURIComponent(sessionID)}`, { waitUntil: "load" })
    await page.evaluate(() => document.fonts.ready)
    await page.waitForFunction(() => {
      const agents = document.querySelectorAll<HTMLElement>("#popA .mi").length
      const models = document.querySelectorAll<HTMLElement>("#popM .mi").length
      const variants = document.querySelectorAll<HTMLElement>("#popV .mi").length
      const status = document.querySelector("#status")?.textContent || ""
      return agents > 8 && models > 3 && variants > 1 && status.includes(" / ")
    }, null, { timeout: 20_000 })
    await page.waitForTimeout(500)
    await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>("#sky")
      if (canvas) canvas.style.display = "none"
    })

    const summary = await page.evaluate(() => {
      const text = (selector: string) => (document.querySelector(selector)?.textContent || "").replace(/\s+/g, " ").trim()
      return {
        title: text("#title"),
        agent: text("#vA"),
        model: text("#vM"),
        variant: text("#vV"),
        status: text("#status"),
        agents: document.querySelectorAll("#popA .mi").length,
        models: document.querySelectorAll("#popM .mi").length,
        variants: document.querySelectorAll("#popV .mi").length,
        sendClass: document.querySelector("#send")?.className || "",
        working: getComputedStyle(document.querySelector("#work")!).display,
      }
    })

    if (!summary.agent || !summary.model || !summary.variant || summary.agents < 9 || summary.models < 4) {
      throw new Error(`Composeur réel incomplet: ${JSON.stringify(summary)}`)
    }

    const png = join(OUT, "session.png")
    await page.screenshot({ path: png, animations: "disabled", caret: "hide" })
    const bytes = statSync(png).size
    writeFileSync(join(OUT, "session.json"), `${JSON.stringify({ sessionID, ...summary, bytes }, null, 2)}\n`)

    console.log(`session=${sessionID}`)
    console.log(`title=${summary.title}`)
    console.log(`agent=${summary.agent} model=${summary.model} variant=${summary.variant}`)
    console.log(`status=${summary.status}`)
    console.log(`selectors=${summary.agents} agents / ${summary.models} models / ${summary.variants} variants`)
    console.log(`send=${summary.sendClass} working=${summary.working}`)
    console.log(`capture=${png} (${bytes} octets)`)
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
