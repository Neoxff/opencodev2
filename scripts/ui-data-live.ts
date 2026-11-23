/**
 * Preuve live : la maquette /ui (mode données) consomme les vraies routes.
 * Aucun secret n'est lu ni écrit ; aucun jeton n'est affiché.
 */
import { chromium } from "playwright-core"

const BASE = "http://127.0.0.1:4096"

async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, init)
  if (!response.ok) throw new Error(`${path} -> HTTP ${response.status}`)
  return response.json() as Promise<T>
}

type SessionInfo = { id: string; title: string; time?: { updated?: number } }
type MessageInfo = { info: { role: string }; parts: Array<{ type: string; text?: string; ignored?: boolean }> }

const before = await api<SessionInfo[]>("/session")
let withMessages: { session: SessionInfo; text: string } | undefined
for (const session of before) {
  const messages = await api<MessageInfo[]>(`/session/${session.id}/message`)
  const text = messages
    .map((m) => (m.parts ?? []).filter((p) => p.type === "text" && !p.ignored).map((p) => p.text ?? "").join(" "))
    .find(Boolean)
  if (text) {
    withMessages = { session, text }
    break
  }
}
if (!withMessages) throw new Error("aucune session réelle avec message")

const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1"],
})
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, reducedMotion: "reduce" })
await page.goto(`${BASE}/ui`, { waitUntil: "load" })
await page.waitForFunction(() => document.querySelectorAll(".sess").length > 0, { timeout: 15000 })

const titles = await page.locator(".sess").allInnerTexts()
if (!titles.some((text) => text.includes(withMessages!.session.title))) {
  throw new Error(`session réelle absente de la sidebar : ${withMessages.session.title}`)
}
console.log(`sidebar réelle      : ${titles.length} sessions, titre « ${withMessages.session.title} » présent`)

await page.locator(".sess", { hasText: withMessages.session.title }).first().click()
await page.waitForFunction((title) => document.querySelector("#title")?.textContent === title, withMessages.session.title, {
  timeout: 10000,
})
await page.waitForFunction(
  (fragment) => (document.querySelector("#col")?.textContent ?? "").includes(fragment),
  withMessages.text.slice(0, 24),
  { timeout: 10000 },
)
const shown = await page.locator("#col").innerText()
if (!shown.includes(withMessages.text.slice(0, 24))) throw new Error("messages réels absents après clic")
console.log(`clic session        : titre et messages réels chargés`)

await page.click("#bSearch")
await page.fill("#sfilter", "New session")
await page.waitForTimeout(150)
const filtered = await page.locator(".sess").count()
if (filtered === 0) throw new Error("recherche sans résultat sur vraies données")
await page.fill("#sfilter", "")
console.log(`recherche           : ${filtered} résultat(s) pour « New session »`)

await page.click("#bHist")
await page.waitForSelector("#dlg .mi")
const history = await page.locator("#dlg").innerText()
if (!history.includes(withMessages.session.title)) throw new Error("historique sans session réelle")
await page.keyboard.press("Escape")
console.log(`historique          : session réelle listée`)

const beforeCollapse = await page.locator(".sess").count()
await page.locator(".fold").first().click()
const afterCollapse = await page.locator(".sess").count()
if (afterCollapse >= beforeCollapse) throw new Error("repli sans effet")
console.log(`repli               : ${beforeCollapse} -> ${afterCollapse} sessions visibles`)

const archived = page.locator(".fold", { hasText: "Archived" }).first()
if ((await archived.getAttribute("title")) !== "bientôt") throw new Error("infobulle Archived absente")
console.log(`Archived            : visible, désactivé, infobulle « bientôt »`)

const countBeforeNew = (await api<SessionInfo[]>("/session")).length
await page.click("#newbtn")
await page.waitForFunction(() => document.querySelector("#title")?.textContent?.startsWith("New session"), { timeout: 10000 })
const afterNew = await api<SessionInfo[]>("/session")
if (afterNew.length !== countBeforeNew + 1) throw new Error("POST /session n'a pas créé de session")
const created = afterNew.find((s) => !before.some((b) => b.id === s.id))
console.log(`New session         : ${countBeforeNew} -> ${afterNew.length} sessions, ${created?.id ?? "id inconnu"}`)

if (created) await api(`/session/${created.id}`, { method: "DELETE" })
await browser.close()
console.log("OK : données réelles validées dans /ui")
