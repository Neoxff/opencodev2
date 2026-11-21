/** Orchestrateur du banc de référence : 6 mesures × 10 passages → docs/perf/base.json. */

import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { configurationMachine, RACINE } from "./lib"
import { mesurerDemarrage } from "./demarrage"
import { mesurerEtoiles } from "./etoiles"
import { mesurerEvenements } from "./evenements"
import { mesurerMarkdown } from "./markdown"
import { mesurerRecherche } from "./recherche"
import { mesurerListes } from "./listes"

async function temps<T>(nom: string, f: () => Promise<T>): Promise<T> {
  const t0 = performance.now()
  process.stderr.write(`[bench] ${nom}…\n`)
  const r = await f()
  process.stderr.write(`[bench] ${nom} terminé en ${Math.round(performance.now() - t0)} ms\n`)
  return r
}

const [etoiles, evenements, markdown, recherche, demarrage, listes] = await Promise.all([
  temps("étoiles (Chromium)", mesurerEtoiles),
  temps("événements", mesurerEvenements),
  temps("markdown", mesurerMarkdown),
  temps("recherche", mesurerRecherche),
  temps("démarrage web", mesurerDemarrage),
  temps("listes longues (Chromium)", mesurerListes),
])

const rapport = {
  version: 1,
  machine: configurationMachine(),
  protocole: {
    passages: 10,
    chauffage: 2,
    statistiques: "médiane et p95 sur 10 passages indépendants",
    note: "Aucun changement de comportement de l'application ; banc reproductible via bun scripts/bench/run.ts.",
  },
  mesures: { etoiles, evenements, markdown, recherche, demarrage, listes },
}

const cible = path.join(RACINE, "docs", "perf", "base.json")
mkdirSync(path.dirname(cible), { recursive: true })
writeFileSync(cible, JSON.stringify(rapport, null, 2) + "\n")
process.stdout.write(`[bench] référence écrite : ${cible}\n`)
