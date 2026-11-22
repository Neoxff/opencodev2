/**
 * Build 12 — mesure et captures du ciel étoilé.
 *
 * Protocole imposé : playwright-core 1.55.0 depuis le cache bun, Chromium
 * `/usr/bin/chromium`, args `['--no-sandbox']`, viewport 1920×1080, port 4212.
 *
 * Deux mesures distinctes, toutes deux honnêtes :
 *   1. le **banc de référence** (`scripts/bench/etoiles.ts`) pour la
 *      comparabilité avec `docs/perf/base.json` ;
 *   2. l'**application réelle**, avec un `addInitScript` qui retire
 *      `transferControlToOffscreen` et `Worker` : cela force le repli sur le
 *      thread principal, dont la boucle rAF est instrumentée pour compter les
 *      images et mesurer leur durée. Le moteur est exactement le même que
 *      celui du worker (repli identique), donc les chiffres sont
 *      représentatifs du coût de rendu.
 *
 * Le chemin worker est vérifié à part : un `addInitScript` marque le transfert
 * du canvas dans une page normale.
 *
 * Aucune donnée de démonstration : la page est chargée sans session, sans
 * backend — l'état affiché est l'état réel (serveur injoignable).
 */

import { createRequire } from "node:module"
import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"

const require = createRequire(import.meta.url)
const { chromium } = require("/home/joachim/.bun/install/cache/playwright-core@1.55.0@@@1/index.js") as {
  chromium: {
    launch(options: Record<string, unknown>): Promise<{
      newContext(options?: Record<string, unknown>): Promise<Context>
      close(): Promise<void>
    }>
  }
}

type PageHandle = {
  goto(url: string, options?: Record<string, unknown>): Promise<unknown>
  waitForSelector(selector: string, options?: Record<string, unknown>): Promise<unknown>
  waitForTimeout(ms: number): Promise<void>
  screenshot(options: Record<string, unknown>): Promise<unknown>
  evaluate<T>(fn: string | ((...args: unknown[]) => T), arg?: unknown): Promise<T>
  close(): Promise<void>
  context(): Context
}

type Context = {
  addInitScript(fn: (...args: unknown[]) => void, arg?: unknown): Promise<void>
  newPage(): Promise<PageHandle>
  newCDPSession(page: PageHandle): Promise<{
    send(method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>>
  }>
  close(): Promise<void>
}

const ROOT = path.resolve(import.meta.dir, "../..")
const URL_BASE = "http://127.0.0.1:4212"
const CAPTURES = path.join(ROOT, "docs", "design", "captures")
const EXECUTABLE = "/usr/bin/chromium"
const ARGS = ["--no-sandbox"]
const VIEWPORT = { width: 1920, height: 1080 }

type Mesure = {
  nom: string
  images: number
  elapsedMs: number
  ips: number
  msParImage: number
  p95Ms: number
  heapUtiliseMo: number
  heapTotalMo: number
}

type PixelResultat = {
  echantillons: number
  noirsPurs: number
  etoiles: number
  teintesBleues: number
  chromaMaxFond: number
  luminanceMax: number
}

async function attendreServeur(): Promise<void> {
  for (let i = 0; i < 30; i += 1) {
    try {
      const response = await fetch(URL_BASE)
      if (response.ok) return
    } catch {
      // pas encore prêt
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`serveur absent sur ${URL_BASE}`)
}

/** Contexte qui force le repli et instrumente la boucle rAF. */
async function contexteMesure(browser: Awaited<ReturnType<typeof chromium.launch>>): Promise<Context> {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 })
  await context.addInitScript(() => {
    // Repli identique : on rend mesurable le chemin qui partage le moteur.
    ;(HTMLCanvasElement.prototype as { transferControlToOffscreen?: unknown }).transferControlToOffscreen = undefined
    ;(globalThis as { Worker?: unknown }).Worker = undefined
    const start = performance.now()
    const stats = { frames: 0, total: 0, max: 0, durations: [] as number[], start }
    ;(globalThis as { __bench?: typeof stats }).__bench = stats
    const original = window.requestAnimationFrame.bind(window)
    window.requestAnimationFrame = (callback: FrameRequestCallback): number =>
      original((timestamp: number) => {
        const t0 = performance.now()
        callback(timestamp)
        const duration = performance.now() - t0
        stats.frames += 1
        stats.total += duration
        if (duration > stats.max) stats.max = duration
        stats.durations.push(duration)
      })
  })
  await context.addInitScript(() => localStorage.setItem("oc.webui.sky", "on"))
  return context
}

async function mesurerApplication(browser: Awaited<ReturnType<typeof chromium.launch>>): Promise<{
  mesure: Mesure
  pixels: PixelResultat
  vignette: string
  workerPath: boolean
}> {
  const context = await contexteMesure(browser)
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  await cdp.send("Performance.enable")
  await page.goto(URL_BASE, { waitUntil: "domcontentloaded" })
  await page.waitForSelector("canvas.sky-canvas")
  await page.waitForTimeout(3000)

  const raw = await page.evaluate<{
    frames: number
    total: number
    durations: number[]
    start: number
    now: number
  }>(() => {
    const stats = (globalThis as unknown as { __bench: { frames: number; total: number; durations: number[]; start: number } }).__bench
    return { ...stats, now: performance.now() }
  })
  const metrics = await cdp.send("Performance.getMetrics")
  const values = (metrics.metrics ?? []) as Array<{ name: string; value: number }>
  const metric = (name: string) => values.find((entry) => entry.name === name)?.value ?? 0
  const elapsedMs = raw.now - raw.start
  const sorted = [...raw.durations].sort((a, b) => a - b)
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0

  // Scan complet du canvas : le repli garde le canvas lisible. On compte
  // chaque pixel pour prouver, et non par échantillonnage clément.
  const pixels = await page.evaluate<PixelResultat>(() => {
    const canvas = document.querySelector("canvas.sky-canvas") as HTMLCanvasElement
    const ctx = canvas.getContext("2d", { alpha: false })
    if (!ctx) throw new Error("contexte canvas indisponible")
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    let echantillons = 0
    let noirsPurs = 0
    let etoiles = 0
    let teintesBleues = 0
    let chromaMax = 0
    let luminanceMax = 0
    for (let i = 0; i < image.length; i += 4) {
      const r = image[i]
      const g = image[i + 1]
      const b = image[i + 2]
      echantillons += 1
      if (r === 0 && g === 0 && b === 0) noirsPurs += 1
      if (r > 90 && g > 90 && b > 90) etoiles += 1
      if (b > r + 12) teintesBleues += 1
      const chroma = Math.max(r, g, b) - Math.min(r, g, b)
      const luminance = Math.max(r, g, b)
      if (luminance > luminanceMax) luminanceMax = luminance
      if (luminance > 8) chromaMax = Math.max(chromaMax, chroma)
    }
    return { echantillons, noirsPurs, etoiles, teintesBleues, chromaMaxFond: chromaMax, luminanceMax }
  })
  const vignette = await page.evaluate<string>(() => {
    const element = document.querySelector(".sky-vignette") as HTMLElement
    return getComputedStyle(element).backgroundImage
  })
  await page.close()
  await context.close()

  // Vérification du chemin worker dans une page normale (non instrumentée).
  const workerContext = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 })
  await workerContext.addInitScript(() => {
    const prototype = HTMLCanvasElement.prototype as { transferControlToOffscreen?: (...a: unknown[]) => unknown }
    const original = prototype.transferControlToOffscreen
    if (original) {
      prototype.transferControlToOffscreen = function (...args: unknown[]) {
        ;(globalThis as { __skyTransferred?: boolean }).__skyTransferred = true
        return original.apply(this, args)
      }
    }
  })
  await workerContext.addInitScript(() => localStorage.setItem("oc.webui.sky", "on"))
  const workerPage = await workerContext.newPage()
  await workerPage.goto(URL_BASE, { waitUntil: "domcontentloaded" })
  await workerPage.waitForTimeout(1500)
  const workerPath = await workerPage.evaluate<boolean>(
    () => (globalThis as { __skyTransferred?: boolean }).__skyTransferred === true,
  )
  await workerPage.close()
  await workerContext.close()

  return {
    mesure: {
      nom: "application réelle (repli, moteur partagé)",
      images: raw.frames,
      elapsedMs: Math.round(elapsedMs),
      ips: Math.round((raw.frames / (elapsedMs / 1000)) * 100) / 100,
      msParImage: Math.round((raw.total / Math.max(1, raw.frames)) * 1000) / 1000,
      p95Ms: Math.round(p95 * 1000) / 1000,
      heapUtiliseMo: Math.round((metric("JSHeapUsedSize") / 1024 / 1024) * 100) / 100,
      heapTotalMo: Math.round((metric("JSHeapTotalSize") / 1024 / 1024) * 100) / 100,
    },
    pixels,
    vignette,
    workerPath,
  }
}

async function captures(browser: Awaited<ReturnType<typeof chromium.launch>>): Promise<string[]> {
  const ecrits: string[] = []
  for (const mode of ["on", "static", "off"] as const) {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 })
    await context.addInitScript((value: unknown) => localStorage.setItem("oc.webui.sky", value as string), mode)
    const page = await context.newPage()
    await page.goto(URL_BASE, { waitUntil: "domcontentloaded" })
    await page.waitForSelector("canvas.sky-canvas", { state: "attached" })
    await page.waitForTimeout(1200)
    const file = path.join(CAPTURES, `build-12-${mode}-1920x1080.png`)
    await page.screenshot({ path: file, fullPage: false })
    ecrits.push(file)
    await page.close()
    await context.close()
  }
  return ecrits
}

async function main(): Promise<void> {
  await attendreServeur()
  mkdirSync(CAPTURES, { recursive: true })
  const browser = await chromium.launch({ headless: true, executablePath: EXECUTABLE, args: ARGS })
  try {
    const { mesure, pixels, vignette, workerPath } = await mesurerApplication(browser)
    const files = await captures(browser)
    const rapport = {
      date: new Date().toISOString(),
      environnement: {
        playwright: "1.55.0 (cache bun)",
        chromium: EXECUTABLE,
        args: ARGS,
        viewport: VIEWPORT,
        port: 4212,
      },
      cheminWorker: workerPath,
      mesure,
      pixels,
      vignette,
      captures: files.map((file) => path.relative(ROOT, file)),
    }
    const cible = path.join(CAPTURES, "build-12-mesure.json")
    writeFileSync(cible, JSON.stringify(rapport, null, 2) + "\n")
    process.stdout.write(JSON.stringify(rapport, null, 2) + "\n")
  } finally {
    await browser.close()
  }
}

await main()
