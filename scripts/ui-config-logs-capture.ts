/**
 * Capture réelle des onglets Config et Logs de /ui, sans HTML/CSS modifié.
 * Le serveur local doit répondre sur http://127.0.0.1:4096.
 */
import { mkdirSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { chromium } from "playwright-core"

const BASE = "http://127.0.0.1:4096"
const OUT = join(process.cwd(), "docs/design/captures/ui-config-logs")

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
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
      colorScheme: "dark",
      reducedMotion: "reduce",
      locale: "fr-FR",
      timezoneId: "UTC",
    })
    const page = await context.newPage()
    await page.goto(`${BASE}/ui`, { waitUntil: "load" })
    await page.evaluate(() => document.fonts.ready)
    await page.waitForFunction(() => document.querySelectorAll(".sess").length > 0, null, { timeout: 20_000 })
    await page.click(".sess")
    await page.waitForFunction(() => document.querySelector("#status")?.textContent?.includes(" · "), null, { timeout: 20_000 })

    await page.click('.tab[data-t="config"]')
    await page.waitForFunction(() => {
      const el = document.querySelector("#cfgEdit")
      return el && (el.textContent || "").trim().startsWith("{")
    }, null, { timeout: 20_000 })
    await page.waitForTimeout(400)
    await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>("#sky")
      if (canvas) canvas.style.display = "none"
    })
    const configText = ((await page.textContent("#cfgEdit")) || "").trim()
    const forbidden = ["ghp_", "github_pat_", "sk-", "Bearer ", "apiKey", "password", "secret"]
    for (const needle of forbidden) {
      if (configText.toLowerCase().includes(needle.toLowerCase())) throw new Error(`Secret dans Config : ${needle}`)
    }
    const configPng = join(OUT, "config.png")
    await page.screenshot({ path: configPng, animations: "disabled", caret: "hide" })

    await page.click('.tab[data-t="logs"]')
    await page.waitForFunction(() => {
      const el = document.querySelector("#logView")
      return el && (el.textContent || "").includes("session")
    }, null, { timeout: 20_000 })
    await page.waitForTimeout(400)
    const logText = ((await page.textContent("#logView")) || "").trim()
    for (const needle of ["ghp_", "github_pat_", "sk-", "Bearer "]) {
      if (logText.toLowerCase().includes(needle.toLowerCase())) throw new Error(`Secret dans Logs : ${needle}`)
    }
    const logsPng = join(OUT, "logs.png")
    await page.screenshot({ path: logsPng, animations: "disabled", caret: "hide" })

    const summary = {
      sessionID,
      config: { chars: configText.length, firstLine: configText.split("\n")[0] || "", bytes: statSync(configPng).size },
      logs: { lines: logText.split("\n").length, firstLine: logText.split("\n")[0] || "", bytes: statSync(logsPng).size },
      configPath: configPng,
      logsPath: logsPng,
    }
    writeFileSync(join(OUT, "capture.json"), `${JSON.stringify(summary, null, 2)}\n`)
    console.log(JSON.stringify(summary, null, 2))
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
