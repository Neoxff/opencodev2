/**
 * Parcours clavier réel des raccourcis Build 5, avec effets de bord réseau interceptés.
 * Le serveur local doit répondre sur http://127.0.0.1:4096.
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { chromium } from "playwright-core"

const BASE = "http://127.0.0.1:4096"
const OUT = join(process.cwd(), "docs/design/captures/ui-config-logs")

async function main() {
  mkdirSync(OUT, { recursive: true })
  const prompts: Array<Record<string, unknown>> = []
  const aborts: string[] = []
  const patches: Array<{ url: string; body: unknown }> = []
  const deletes: string[] = []
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
    await page.route("**/session/*", async (route) => {
      const method = route.request().method()
      if (method === "PATCH") {
        patches.push({ url: route.request().url(), body: JSON.parse(route.request().postData() || "{}") })
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ title: "Renamed" }) })
        return
      }
      if (method === "DELETE") {
        deletes.push(route.request().url())
        await route.fulfill({ status: 200, contentType: "application/json", body: "true" })
        return
      }
      await route.continue()
    })
    await page.route("**/session/*/prompt_async", async (route) => {
      prompts.push(JSON.parse(route.request().postData() || "{}"))
      await route.fulfill({ status: 204, body: "" })
    })
    await page.route("**/session/*/abort", async (route) => {
      aborts.push(route.request().url())
      await route.fulfill({ status: 200, contentType: "application/json", body: "true" })
    })
    await page.route("**/session/status", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" })
    })
    await page.route("**/global/health", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ healthy: true, version: "2.4.31" }) })
    })

    await page.goto(`${BASE}/ui`, { waitUntil: "load" })
    await page.waitForFunction(() => document.querySelectorAll(".sess").length > 0, null, { timeout: 20_000 })
    await page.click(".sess")
    await page.waitForFunction(() => document.querySelector("#status")?.textContent?.includes(" · "), null, { timeout: 20_000 })

    // ctrl+p : palette
    await page.keyboard.press("Control+p")
    await page.waitForFunction(() => document.querySelector("#dlg")?.textContent?.includes("Commands"), null, { timeout: 10_000 })
    const palette = (await page.textContent("#dlg")) || ""
    await page.keyboard.press("Escape")

    // enter : envoi réel puis mise en file pendant le travail
    await page.click("#ta")
    await page.fill("#ta", "premier message")
    await page.keyboard.press("Enter")
    await page.waitForFunction(() => document.querySelector("#send")?.classList.contains("run") === true, null, { timeout: 10_000 })
    await page.fill("#ta", "second message")
    await page.keyboard.press("Enter")
    await page.waitForFunction(() => {
      return [...document.querySelectorAll("#col .me .q")].some((el) => el.textContent === "queued")
    }, null, { timeout: 10_000 })

    // alt+s : steer seulement si le serveur le permet
    await page.fill("#ta", "message steer")
    await page.keyboard.press("Alt+s")
    await page.waitForFunction(() => {
      return [...document.querySelectorAll("#col .me .q")].some((el) => el.textContent === "steer")
    }, null, { timeout: 10_000 })

    // esc : interruption réelle
    await page.keyboard.press("Escape")
    await page.waitForFunction(() => document.querySelector("#send")?.classList.contains("run") === false, null, { timeout: 10_000 })

    // ctrl+r : renommage réel
    await page.keyboard.press("Control+r")
    await page.waitForFunction(() => Boolean(document.querySelector("#rn")), null, { timeout: 10_000 })
    await page.fill("#rn", "Session renommée")
    await page.keyboard.press("Enter")
    await page.waitForFunction(() => window.__patchCount === undefined || true, null, { timeout: 1000 })

    // ctrl+d : confirmation puis suppression réelle
    await page.keyboard.press("Control+d")
    await page.waitForFunction(() => Boolean(document.querySelector("#dyes")), null, { timeout: 10_000 })
    const confirmText = (await page.textContent("#dlg")) || ""
    await page.click("#dyes")
    await page.waitForTimeout(300)

    const summary = {
      paletteOpened: palette.includes("ctrl+p"),
      prompts: prompts.map((p) => (p.parts as Array<{ text?: string; metadata?: unknown }>)[0]?.text),
      steerMetadata: (prompts[2]?.parts as Array<{ metadata?: unknown }> | undefined)?.[0]?.metadata || null,
      aborts: aborts.length,
      renamed: patches.some((p) => (p.body as { title?: string })?.title === "Session renommée"),
      deleteConfirmed: confirmText.includes("Delete"),
      deletes: deletes.length,
      sendClass: (await page.getAttribute("#send", "class")) || "",
    }
    if (!summary.paletteOpened || summary.prompts.length < 3 || summary.aborts < 1 || !summary.renamed || !summary.deleteConfirmed || summary.deletes < 1) {
      throw new Error(`Parcours clavier incomplet: ${JSON.stringify(summary)}`)
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
