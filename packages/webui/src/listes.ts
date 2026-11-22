/**
 * Calcul de fenêtre pour les listes longes — fonction pure, sans DOM.
 *
 * Le rendu ne monte que les lignes visibles plus une marge (`survol`) de part
 * et d'autre. Les espacements gardent la hauteur totale identique à une liste
 * complète, donc le défilement et le rendu visible ne changent pas.
 */
export type Fenetre = {
  debut: number
  fin: number
  margeHaut: number
  margeBas: number
}

/** Au-delà de ce nombre de lignes, la virtualisation est activée. */
export const SEUIL_VIRTUALISATION = 100

export function doitVirtualiser(nombre: number, seuil = SEUIL_VIRTUALISATION): boolean {
  return nombre > seuil
}

export function fenetreVisible(input: {
  nombre: number
  scrollTop: number
  hauteurVue: number
  hauteurLigne: number
  survol?: number
}): Fenetre {
  const { nombre, scrollTop, hauteurVue, hauteurLigne } = input
  const survol = Math.max(0, Math.floor(input.survol ?? 3))
  if (nombre <= 0 || hauteurLigne <= 0) {
    return { debut: 0, fin: 0, margeHaut: 0, margeBas: 0 }
  }

  const vue = Math.max(hauteurLigne, hauteurVue)
  const premiere = Math.min(nombre - 1, Math.max(0, Math.floor(scrollTop / hauteurLigne)))
  const capacite = Math.ceil(vue / hauteurLigne) + 2 * survol
  const debut = Math.max(0, premiere - survol)
  const fin = Math.min(nombre, debut + capacite)

  return {
    debut,
    fin,
    margeHaut: debut * hauteurLigne,
    margeBas: (nombre - fin) * hauteurLigne,
  }
}
