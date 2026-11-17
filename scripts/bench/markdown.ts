/** Banc 3 — rendu markdown d'un message de 5 000 lignes (marked, version réellement en cache). */

import { importerCache, serie, versionCache } from "./lib"

const LIGNES: string[] = Array.from({ length: 5_000 }, (_, i) =>
  i % 10 === 0
    ? `## Section ${i}`
    : i % 7 === 0
      ? `- point **${i}** avec du \`code\` et un [lien](https://example.com/${i})`
      : `Texte du paragraphe ${i} avec *emphase* et **gras** pour mesurer le rendu.`,
)
const DOCUMENT = LIGNES.join("\n")

export async function mesurerMarkdown() {
  const mod = await importerCache("marked", "lib/marked.esm.js")
  const marked = mod as { marked: { parse: (s: string) => string } }
  // Chauffage de la JVM-equivalent : première compilation du parseur hors mesure (serie() le fait).
  const ms = await serie(() => {
    const t0 = performance.now()
    const sortie = marked.marked.parse(DOCUMENT)
    if (!sortie.includes("<h2>")) throw new Error("rendu markdown invalide")
    return performance.now() - t0
  })
  return { lignes: 5_000, dureeMs: ms, outil: await versionCache("marked") }
}
