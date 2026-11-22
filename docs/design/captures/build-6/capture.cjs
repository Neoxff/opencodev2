/*
 * Captures Build 6 — 1920×1080, comparables à la maquette.
 *
 * Deux sources : la maquette statique (référence visuelle) et la webui réelle branchée sur le
 * serveur local (port 4096) via le proxy Vite (port 4206). Aucune donnée de démonstration :
 * les commandes, fichiers et sessions affichés viennent du serveur.
 *
 *   node docs/design/captures/build-6/capture.cjs
 */
const { chromium } = require("/home/joachim/.bun/install/cache/playwright-core@1.55.0@@@1/index.js")
const path = require("path")

const ROOT = path.resolve(__dirname, "../../../..")
const OUT = __dirname
const MAQUETTE = `file://${path.join(ROOT, "docs/design/maquette-opencodev2-ui.html")}`
const WEBUI = "http://127.0.0.1:4206/"
const VIEWPORT = { width: 1920, height: 1080 }

const shot = (page, name) => page.screenshot({ path: path.join(OUT, name) })

async function main() {
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] })
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 })
  const report = []

  try {
    // ---------- 1. La maquette : les trois états de référence ----------
    const maquette = await context.newPage()
    await maquette.goto(MAQUETTE, { waitUntil: "load" })
    await maquette.waitForTimeout(1400) // animation d'entrée de l'application
    await shot(maquette, "01-maquette-accueil.png")
    report.push("maquette accueil : OK")

    await maquette.click("#hint")
    await maquette.waitForSelector("#menu.on .mi")
    await shot(maquette, "02-maquette-slash.png")
    report.push(`maquette slash : ${await maquette.locator("#menu .mi").count()} lignes`)

    await maquette.locator("#ta").fill("/")
    await maquette.waitForTimeout(100)
    await shot(maquette, "03-maquette-slash-filtre.png")
    report.push("maquette filtre : OK")

    await maquette.locator("#ta").fill("@")
    await maquette.waitForTimeout(100)
    await shot(maquette, "04-maquette-at.png")
    report.push("maquette @ : OK")

    await maquette.click("#pal")
    await maquette.waitForSelector("#ov.on #pl .mi")
    await shot(maquette, "05-maquette-palette.png")
    report.push(`maquette palette : ${await maquette.locator("#pl .mi").count()} lignes`)
    await maquette.close()

    // ---------- 2. La webui réelle ----------
    const ui = await context.newPage()
    const errors = []
    ui.on("pageerror", (error) => errors.push(String(error)))
    ui.on("console", (message) => {
      if (message.type() === "error") errors.push(`console: ${message.text()}`)
    })
    // `networkidle` n'arrive jamais : la webui garde un flux SSE ouvert en permanence.
    await ui.goto(WEBUI, { waitUntil: "domcontentloaded" })
    await ui.waitForSelector(".composer-input")
    await shot(ui, "06-webui-accueil.png")
    report.push("webui accueil : OK")

    // Le `/` dans le compositeur d'accueil : la liste se remplit depuis GET /command.
    const composer = ui.locator(".home-composer .composer-input")
    await composer.click()
    await composer.fill("/")
    await ui.waitForSelector(".oc-menu .oc-menu-row", { timeout: 20000 })
    await shot(ui, "07-webui-slash.png")
    report.push(`webui slash : ${await ui.locator(".oc-menu-row").count()} lignes (registre réel)`)

    // Flèche bas puis filtre — la ligne active suit le clavier, le filtre réduit la liste.
    await composer.press("ArrowDown")
    await shot(ui, "08-webui-slash-clavier.png")
    report.push("webui slash clavier : OK")

    await composer.fill("/human")
    await ui.waitForTimeout(200)
    await shot(ui, "09-webui-slash-filtre.png")
    report.push(`webui filtre "human" : ${await ui.locator(".oc-menu-row").count()} lignes`)

    // Le `@` : fichiers du dossier + sessions du serveur.
    await composer.fill("@")
    await ui.waitForTimeout(1200)
    await shot(ui, "10-webui-at.png")
    report.push(`webui @ : ${await ui.locator(".oc-menu-row").count()} lignes`)

    // La palette globale ctrl+p.
    await composer.fill("")
    await ui.keyboard.press("Control+p")
    await ui.waitForSelector(".oc-palette .oc-menu-row", { timeout: 20000 })
    await shot(ui, "11-webui-palette.png")
    report.push(`webui palette : ${await ui.locator(".oc-palette .oc-menu-row").count()} lignes`)

    await ui.locator(".oc-palette-input").fill("human")
    await ui.waitForTimeout(200)
    await shot(ui, "12-webui-palette-filtre.png")
    report.push(`webui palette filtre : ${await ui.locator(".oc-palette .oc-menu-row").count()} lignes`)

    await ui.keyboard.press("Escape")
    await ui.waitForTimeout(100)
    const paletteClosed = (await ui.locator(".oc-palette").count()) === 0
    report.push(`webui palette Échap : ${paletteClosed ? "fermée" : "ENCECORE OUVERTE"}`)

    // Commande inconnue : le texte reste dans le champ et rien n'est envoyé.
    await composer.fill("/build-6-commande-qui-nexiste-pas")
    await composer.press("Enter")
    await ui.waitForTimeout(500)
    const errorText = await ui.locator(".home-composer .error").allTextContents()
    report.push(`webui commande inconnue : ${JSON.stringify(errorText)}`)

    report.push(`erreurs console/page : ${errors.length === 0 ? "aucune" : JSON.stringify(errors.slice(0, 5))}`)
    await ui.close()
  } finally {
    await browser.close()
  }

  console.log(report.join("\n"))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
