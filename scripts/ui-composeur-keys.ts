/**
 * Parcours clavier réel du composeur /ui, avec réseau d'envoi intercepté.
 * Le serveur local doit répondre sur http://127.0.0.1:4096.
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { chromium } from "playwright-core"

const BASE = "http://127.0.0.1:4096"
const OUT = join(process.cwd(), "docs/design/captures/ui-composeur")

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
  const prompts: Array<Record<string, unknown>> = []
  const aborts: string[] = []
  let simulateBusy = false
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1"],
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
    await page.route("**/session/*/prompt_async", async (route) => {
      const body = JSON.parse(route.request().postData() || "{}")
      prompts.push(body)
      simulateBusy = true
      await route.fulfill({ status: 204, body: "" })
    })
    await page.route("**/session/*/abort", async (route) => {
      aborts.push(route.request().url())
      simulateBusy = false
      await route.fulfill({ status: 200, contentType: "application/json", body: "true" })
    })
    await page.route("**/session/status", async (route) => {
      const body = simulateBusy ? { [sessionID]: { type: "running" } } : {}
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
    })

    await page.goto(`${BASE}/ui?session=${encodeURIComponent(sessionID)}`, { waitUntil: "load" })
    await page.waitForFunction(() => {
      const status = document.querySelector("#status")?.textContent || ""
      return document.querySelectorAll("#popA .mi").length > 8 && status.includes(" / ")
    }, null, { timeout: 20_000 })

    const typeAndPress = async (text: string, key: string) => {
      await page.click("#ta")
      await page.fill("#ta", text)
      await page.keyboard.press(key)
      await page.waitForTimeout(250)
    }

    await typeAndPress("test clavier", "Enter")
    await page.waitForFunction(() => document.querySelector("#send")?.classList.contains("run") === true, null, { timeout: 10_000 })
    await typeAndPress("test file", "Enter")
    await page.waitForFunction(() => {
      const queued = [...document.querySelectorAll("#col .me .q")].some((node) => node.textContent === "queued")
      return queued && document.querySelector("#status")?.textContent?.includes("enter")
    }, null, { timeout: 10_000 })
    await page.keyboard.press("Escape")
    await page.waitForFunction(() => document.querySelector("#send")?.classList.contains("run") === false, null, { timeout: 10_000 })

    await typeAndPress("test reprise", "Enter")
    await page.waitForFunction(() => document.querySelector("#send")?.classList.contains("run") === true, null, { timeout: 10_000 })
    await typeAndPress("test steer", "Alt+s")
    await page.waitForFunction(() => {
      const steer = [...document.querySelectorAll("#col .me .q")].some((node) => node.textContent === "steer")
      return steer && document.querySelector("#status")?.textContent?.includes("alt+s")
    }, null, { timeout: 10_000 })
    await page.keyboard.press("Escape")
    await page.waitForTimeout(250)

    const summary = {
      sessionID,
      prompts: prompts.length,
      aborts: aborts.length,
      firstText: prompts[0]?.parts?.[0]?.text || "",
      queuedText: prompts[1]?.parts?.[0]?.text || "",
      steerText: prompts[3]?.parts?.[0]?.text || "",
      steerMetadata: prompts[3]?.parts?.[0]?.metadata || null,
      sendClass: (await page.getAttribute("#send", "class")) || "",
      status: ((await page.textContent("#status")) || "").replace(/\s+/g, " ").trim(),
    }
    if (summary.prompts < 4 || summary.aborts < 2 || summary.firstText !== "test clavier" || summary.queuedText !== "test file" || summary.steerText !== "test steer") {
      throw new Error(`Parcours clavier incomplet: ${JSON.stringify(summary)}`)
    }
    if (!summary.steerMetadata || summary.steerMetadata.steer !== true) {
      throw new Error(`Steer non transmis: ${JSON.stringify(summary)}`)
    }
    writeFileSync(join(OUT, "keys.json"), `${JSON.stringify(summary, null, 2)}\n`)
    console.log(JSON.stringify(summary, null, 2))
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
