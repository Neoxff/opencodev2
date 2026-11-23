/**
 * Capture d'une vraie session dans /ui, sans données simulées.
 * Le serveur local doit répondre sur http://127.0.0.1:4096.
 */
import { mkdirSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { chromium } from "playwright-core"

const BASE = "http://127.0.0.1:4096"
const OUT = join(process.cwd(), "docs/design/captures/ui-conversation")
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
    await page.waitForFunction(() => document.querySelectorAll("#col [data-kind]").length >= 3, null, { timeout: 15_000 })
    await page.waitForTimeout(500)
    await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>("#sky")
      if (canvas) canvas.style.display = "none"
    })

    const summary = await page.evaluate(() => {
      const lines = [...document.querySelectorAll<HTMLElement>("#col [data-kind]")]
      const counts: Record<string, number> = {}
      for (const line of lines) counts[line.dataset.kind || "inconnu"] = (counts[line.dataset.kind || "inconnu"] ?? 0) + 1
      const goal = document.querySelector("#rpanel .rs[data-id='goal']")?.textContent || ""
      return {
        title: document.querySelector("#title")?.textContent || "",
        mode: document.querySelector("html")?.dataset?.ui || "",
        lineCount: lines.length,
        counts,
        goal: goal.replace(/\s+/g, " ").trim().slice(0, 300),
        working: getComputedStyle(document.querySelector("#work")!).display,
      }
    })

    if (!summary.lineCount || !summary.counts.th || !summary.counts.p || !summary.counts.me) {
      throw new Error(`Conversation réelle incomplète: ${JSON.stringify(summary)}`)
    }

    const png = join(OUT, "session.png")
    await page.screenshot({ path: png, animations: "disabled", caret: "hide" })
    const bytes = statSync(png).size
    writeFileSync(join(OUT, "session.json"), `${JSON.stringify({ sessionID, ...summary, bytes }, null, 2)}\n`)

    console.log(`session=${sessionID}`)
    console.log(`title=${summary.title}`)
    console.log(`lines=${summary.lineCount} ${JSON.stringify(summary.counts)}`)
    console.log(`goal=${summary.goal}`)
    console.log(`working=${summary.working}`)
    console.log(`capture=${png} (${bytes} octets)`)
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
