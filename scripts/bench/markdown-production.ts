/**
 * Banc 3b — parser markdown de PRODUCTION (`packages/webui/src/markdown.ts`).
 *
 * Le banc 3 mesure `marked`, qui n'est PAS le parser utilise par l'interface :
 * celui-ci produit un AST sur (MdBlock[]) pour eviter toute injection HTML.
 * Toute decision Rust doit porter sur ce parser-ci, pas sur `marked`.
 *
 * Mesure reproductible : 10 passages apres 2 chauffages, mediane et p95.
 */
import { serie } from "./lib"
import { parseMarkdown } from "../../packages/webui/src/markdown"

const LIGNES: string[] = Array.from({ length: 5_000 }, (_, i) =>
  i % 10 === 0
    ? `## Section ${i}`
    : i % 7 === 0
      ? `- point **${i}** avec du \`code\` et un [lien](https://example.com/${i})`
      : `Texte du paragraphe ${i} avec *emphase* et **gras** pour mesurer le rendu.`,
)
const DOCUMENT = LIGNES.join("\n")

export async function mesurerMarkdownProduction() {
  const ms = await serie(() => {
    const t0 = performance.now()
    const blocs = parseMarkdown(DOCUMENT)
    if (blocs.length === 0) throw new Error("rendu markdown production invalide")
    return performance.now() - t0
  })
  return {
    lignes: 5_000,
    dureeMs: ms,
    outil: "parseMarkdown (AST sur, packages/webui/src/markdown.ts)",
  }
}
