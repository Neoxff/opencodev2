/** Banc 2 — débit du traitement d'un flux de 10 000 événements (JS pur). */

import { serie } from "./lib"

type Evenement = { type: string; temps: number; donnees: { id: number; texte: string } }

const EVENEMENTS: Evenement[] = Array.from({ length: 10_000 }, (_, i) => ({
  type: ["message", "tool", "permission", "turn", "step"][i % 5],
  temps: 1_700_000_000_000 + i,
  donnees: { id: i, texte: `évenement ${i} avec un contenu représentatif` },
}))

/** Pipeline représentatif : filtrage, transformation, accumulation. */
function traiter(evenements: Evenement[]): number {
  let somme = 0
  for (const e of evenements) {
    if (e.type === "permission") continue
    const decode = JSON.parse(JSON.stringify(e.donnees)) as { id: number }
    somme += decode.id * (e.type.length % 3 + 1)
  }
  return somme
}

export async function mesurerEvenements() {
  const ms = await serie(() => {
    const t0 = performance.now()
    traiter(EVENEMENTS)
    return performance.now() - t0
  })
  return {
    evenements: 10_000,
    dureeMs: ms,
    debitEvenementsParSeconde: Math.round(10_000 / (ms.mediane / 1000)),
  }
}
