/**
 * Banc 6 — rendu d'une longue liste : 10 000 lignes dans Chromium via
 * Playwright. Compare le montage complet au montage fenêtré (virtualisation)
 * et compte les tâches longues (> 50 ms) pendant le rendu.
 *
 * Un « passage » = une page neuve, mesure du rendu complet puis du rendu
 * fenêtré. 10 passages indépendants donnent médiane et p95.
 */

import { statistiques, importerCache, versionCache } from "./lib"

const NOMBRE_LIGNES = 10_000
const HAUTEUR_LIGNE = 24
const SURVOL = 3

const PAGE_LISTES = `<!doctype html><html><body style="margin:0">
<div id="racine"></div>
<script>
const N = ${NOMBRE_LIGNES}, H = ${HAUTEUR_LIGNE}, SURVOL = ${SURVOL};
const racine = document.getElementById('racine');
let longuesTaches = 0, pireTache = 0;
try {
  new PerformanceObserver((liste) => {
    for (const e of liste.getEntries()) {
      if (e.duration >= 50) { longuesTaches++; pireTache = Math.max(pireTache, e.duration); }
    }
  }).observe({ entryTypes: ['longtask'] });
} catch (e) {}

function fenetre(scrollTop, hauteurVue) {
  const premiere = Math.min(N - 1, Math.max(0, Math.floor(scrollTop / H)));
  const capacite = Math.ceil(Math.max(H, hauteurVue) / H) + 2 * SURVOL;
  const debut = Math.max(0, premiere - SURVOL);
  return { debut, fin: Math.min(N, debut + capacite) };
}

window.mesurer = (mode) => {
  racine.textContent = '';
  const t = performance.now();
  if (mode === 'complet') {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < N; i++) {
      const li = document.createElement('div');
      li.className = 'ligne';
      li.textContent = 'ligne ' + i;
      frag.appendChild(li);
    }
    racine.appendChild(frag);
  } else {
    const f = fenetre(0, 600);
    const frag = document.createDocumentFragment();
    const haut = document.createElement('div');
    haut.style.height = (f.debut * H) + 'px';
    frag.appendChild(haut);
    for (let i = f.debut; i < f.fin; i++) {
      const li = document.createElement('div');
      li.className = 'ligne';
      li.textContent = 'ligne ' + i;
      frag.appendChild(li);
    }
    const bas = document.createElement('div');
    bas.style.height = ((N - f.fin) * H) + 'px';
    frag.appendChild(bas);
    racine.appendChild(frag);
  }
  return { ms: performance.now() - t, noeuds: racine.querySelectorAll('.ligne').length };
};
window.resultat = () => ({ longuesTaches, pireTache: Math.round(pireTache * 10) / 10 });
</script></body></html>`

export async function mesurerListes() {
  const mod = await importerCache("playwright", "index.js")
  const chromium = (mod as Record<string, any>).chromium
  const { existsSync } = await import("node:fs")
  const executables = [
    process.env.CHROMIUM_PATH,
    `${process.env.HOME}/.cache/ms-playwright/chromium-1252/chrome-linux64/chrome`,
    `${process.env.HOME}/.cache/ms-playwright/chromium-1247/chrome-linux64/chrome`,
    `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
    "/usr/bin/chromium",
  ].filter(Boolean) as string[]
  const executablePath = executables.find((p) => existsSync(p))
  if (!executablePath) throw new Error("aucun Chromium exécutable trouvé")
  const navigateur = await chromium.launch({
    headless: true,
    executablePath,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  })

  try {
    const contexte = await navigateur.newContext()
    const msComplet: number[] = []
    const msFenetre: number[] = []
    let noeudsComplet = 0
    let noeudsFenetre = 0
    let taches: { longuesTaches: number; pireTache: number } | undefined

    for (let passage = 0; passage < 10; passage++) {
      const page = await contexte.newPage()
      await page.setContent(PAGE_LISTES)
      // Échauffement : écarte la compilation JIT du premier passage.
      await page.evaluate("window.mesurer('complet')")
      const complet = await page.evaluate("window.mesurer('complet')") as { ms: number; noeuds: number }
      const fenetre = await page.evaluate("window.mesurer('fenetre')") as { ms: number; noeuds: number }
      msComplet.push(complet.ms)
      msFenetre.push(fenetre.ms)
      noeudsComplet = complet.noeuds
      noeudsFenetre = fenetre.noeuds
      taches = await page.evaluate("window.resultat()") as typeof taches
      await page.close()
    }
    await contexte.close()

    return {
      lignes: NOMBRE_LIGNES,
      hauteurLigne: HAUTEUR_LIGNE,
      renduCompletMs: statistiques(msComplet),
      renduFenetreMs: statistiques(msFenetre),
      noeudsComplet,
      noeudsFenetre,
      gainNoeuds: Math.round((1 - noeudsFenetre / noeudsComplet) * 1000) / 10,
      longuesTaches: taches?.longuesTaches ?? 0,
      pireTacheMs: taches?.pireTache ?? 0,
      outils: { playwright: await versionCache("playwright"), chromium: "cache ms-playwright" },
    }
  } finally {
    await navigateur.close()
  }
}
