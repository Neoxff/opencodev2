/**
 * Captures Playwright des commandes d'interface — Build 7.
 *
 * Chromium système, 1920×1080, port dédié 4207. Aucune donnée de démonstration : les dialogues
 * sont ouverts sur le serveur réel (backend 4096) et montrent ses vraies valeurs (agents, modèles,
 * sessions, MCP, skills…). Une capture par commande, plus la palette et l'accueil.
 *
 *   bun docs/design/captures/build-7/capture.cjs
 */
const { chromium } = require("/home/joachim/.bun/install/cache/playwright-core@1.55.0@@@1/index.js")
const path = require("path")

const OUT = __dirname
const BASE = "http://127.0.0.1:4207/"

const COMMANDS = [
  "agents", "models", "variants", "decision-model", "vision-model", "themes",
  "thinking", "timestamps", "timeline", "sessions", "status", "help", "skills",
  "subagent", "connect", "diff", "mcps",
]

async function main() {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
    headless: true,
  })
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
  const errors = []
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text())
  })
  page.on("pageerror", (err) => errors.push(String(err)))

  await page.goto(BASE, { waitUntil: "domcontentloaded" })
  await page.waitForSelector(".layout", { timeout: 15000 })
  await page.waitForTimeout(1500)

  // Accueil — l'écran de référence de la maquette.
  await page.screenshot({ path: path.join(OUT, "00-accueil.png") })

  // Palette ctrl+p — la liste des 19 commandes.
  await page.keyboard.press("Control+p")
  await page.waitForSelector('[role="dialog"]', { timeout: 5000 })
  await page.screenshot({ path: path.join(OUT, "01-palette.png") })
  await page.keyboard.press("Escape")

  const results = []
  for (const command of COMMANDS) {
    try {
      await page.keyboard.press("Control+p")
      await page.waitForSelector(".uic-filter", { timeout: 5000 })
      await page.fill(".uic-filter", command)
      await page.waitForTimeout(250)
      await page.keyboard.press("Enter")
      await page.waitForTimeout(
        ["skills", "connect", "diff", "variants"].includes(command) ? 1200 : 350,
      )
      const present = await page.locator('[role="dialog"]').count()
      if (present === 0) {
        // /config et /logs ouvrent un onglet, pas un dialogue.
        await page.screenshot({ path: path.join(OUT, `cmd-${command}.png`) })
        results.push(`${command}: onglet (pas de dialogue)`)
      } else {
        await page.screenshot({ path: path.join(OUT, `cmd-${command}.png`) })
        const title = await page.locator("#uic-title span").first().textContent()
        results.push(`${command}: dialogue « ${title} »`)
        await page.keyboard.press("Escape")
      }
    } catch (err) {
      results.push(`${command}: ERREUR ${err.message}`)
      await page.keyboard.press("Escape").catch(() => {})
    }
  }

  // /config — onglet de configuration (feuille de réglages).
  await page.keyboard.press("Escape")
  await page.evaluate(() => {
    const btn = document.querySelector(".rail-button")
    if (btn instanceof HTMLElement) btn.click()
  })
  await page.waitForTimeout(700)
  await page.screenshot({ path: path.join(OUT, "cmd-config.png") })
  results.push("config: onglet réglages ouvert")

  // /logs — vue journaux / trajectoire.
  await page.keyboard.press("Escape")
  await page.evaluate(() => {
    const view = document.querySelector(".view-item:nth-child(2)")
    if (view instanceof HTMLElement) view.click()
  })
  await page.waitForTimeout(700)
  await page.screenshot({ path: path.join(OUT, "cmd-logs.png") })
  results.push("logs: vue journaux ouverte")

  console.log("=== Captures ===")
  console.log(results.join("\n"))
  console.log("=== Erreurs console ===")
  console.log(errors.length ? errors.slice(0, 20).join("\n") : "(aucune)")
  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
