/**
 * Banc 1 — ciel étoilé : 2 000 étoiles en JavaScript pur, dans Chromium via
 * Playwright. Un « passage » = une page neuve, 240 images, puis lecture des
 * temps. 10 passages indépendants donnent médiane et p95.
 */

import { importerCache, serie, statistiques, versionCache } from "./lib"

type MesureEtoiles = { ips: number; calculMs: number }

const PAGE_ETOILES = `<!doctype html><html><body style="margin:0;background:#05060f">
<canvas id="c" width="1280" height="720"></canvas>
<script>
const N = 2000;
const x = new Float32Array(N), y = new Float32Array(N), prof = new Float32Array(N), phase = new Float32Array(N), vit = new Float32Array(N);
let seed = 12345;
function rnd(){ seed = (seed*1664525+1013904223)>>>0; return seed/4294967296; }
for(let i=0;i<N;i++){ x[i]=rnd()*1280; y[i]=rnd()*720; prof[i]=1+rnd()*3; phase[i]=rnd()*6.283; vit[i]=0.05+rnd()*0.15; }
const ctx = document.getElementById('c').getContext('2d', { alpha: false });
let calcul = [], trames = [], dernier = 0;
function tick(t){
  const a = performance.now();
  ctx.fillStyle = '#05060f'; ctx.fillRect(0,0,1280,720);
  for(let i=0;i<N;i++){
    y[i] += vit[i]*prof[i]*0.35; if(y[i]>720) y[i]-=720;
    x[i] += Math.sin(t*0.0001+phase[i])*0.08*prof[i];
    const tw = 0.55+0.45*Math.sin(t*0.002+phase[i]);
    ctx.globalAlpha = tw; ctx.fillStyle = prof[i]>2.5?'#ffffff':'#cfd8ff';
    ctx.beginPath(); ctx.arc(x[i],y[i],prof[i]*0.6,0,6.283); ctx.fill();
  }
  ctx.globalAlpha = 1;
  calcul.push(performance.now()-a);
  if(dernier) trames.push(t-dernier);
  dernier = t;
  if(trames.length < 240) requestAnimationFrame(tick); else window.__pret = true;
}
requestAnimationFrame(tick);
window.resultat = () => {
  const t = [...trames].sort((a,b)=>a-b), c=[...calcul].sort((a,b)=>a-b);
  const med = a => a[Math.floor(a.length/2)];
  return { ips: 1000/med(t), calculMs: med(c) };
};
</script></body></html>`

export async function mesurerEtoiles() {
  const mod = await importerCache("playwright", "index.js")
  const chromium = (mod as Record<string, any>).chromium
  // Le cache ne contient pas la révision attendue par cette version de
  // Playwright (1243) : on pointe explicitement un Chromium présent, sans
  // téléchargement réseau.
  const executables = [
    process.env.CHROMIUM_PATH,
    `${process.env.HOME}/.cache/ms-playwright/chromium-1252/chrome-linux64/chrome`,
    `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
    "/usr/bin/chromium",
  ].filter(Boolean) as string[]
  const { existsSync } = await import("node:fs")
  const executablePath = executables.find((p) => existsSync(p))
  if (!executablePath) throw new Error("aucun Chromium exécutable trouvé")
  const navigateur = await chromium.launch({ headless: true, executablePath, args: ["--no-sandbox", "--disable-dev-shm-usage"] })

  try {
    const contexte = await navigateur.newContext()
    const mesureIps: number[] = []
    const mesureCalcul: number[] = []
    let trace: { dureeTachesMs: number; dureeScriptMs: number } | undefined

    for (let passage = 0; passage < 10; passage++) {
      const page = await contexte.newPage()
      await page.setContent(PAGE_ETOILES)
      await page.waitForFunction("window.__pret === true", { timeout: 30_000 })
      const r: MesureEtoiles = await page.evaluate("window.resultat()")
      mesureIps.push(r.ips)
      mesureCalcul.push(r.calculMs)

      if (passage === 0) {
        const cdp = await contexte.newCDPSession(page)
        await cdp.send("Performance.enable")
        const avant = await cdp.send("Performance.getMetrics")
        await page.evaluate("window.resultat()")
        const apres = await cdp.send("Performance.getMetrics")
        const a = avant.metrics as { name: string; value: number }[]
        const b = apres.metrics as { name: string; value: number }[]
        const diff = Object.fromEntries(b.map((m, i) => [m.name, m.value - (a[i]?.value ?? 0)]))
        trace = {
          dureeTachesMs: Math.round((diff.TaskDuration ?? 0) * 1000) / 1000,
          dureeScriptMs: Math.round((diff.ScriptDuration ?? 0) * 1000) / 1000,
        }
      }
      await page.close()
    }

    await contexte.close()
    return {
      etoiles: 2000,
      imagesParSeconde: statistiques(mesureIps),
      calculMsParImage: statistiques(mesureCalcul),
      trace: trace ?? { dureeTachesMs: 0, dureeScriptMs: 0 },
      outils: { playwright: await versionCache("playwright"), chromium: "cache ms-playwright" },
    }
  } finally {
    await navigateur.close()
  }
}
