/**
 * Préférences d'interface du webui — stockage local, pas `Config`.
 *
 * Le serveur n'a que 37 clés de configuration mesurées (`/doc`) et les rejette
 * silencieusement sinon : une préférence purement visuelle ne peut pas y être
 * écrite. Elle vit donc dans `localStorage`, comme `oc.webui.auth` et
 * `oc.webui.directory`, avec une seule source de vérité par clé.
 */
import { createSignal } from "solid-js"

const AFFICHER_DEPOT_KEY = "oc.webui.afficher_depot"
const LANGUE_KEY = "oc.webui.langue"

function lireBooleen(key: string, defaut: boolean): boolean {
  try {
    const brut = localStorage.getItem(key)
    return brut === null ? defaut : brut === "1"
  } catch {
    return defaut
  }
}

function ecrireBooleen(key: string, valeur: boolean): void {
  try {
    if (valeur) localStorage.setItem(key, "1")
    else localStorage.removeItem(key)
  } catch {
    // stockage indisponible : la valeur en mémoire reste la source de vérité
  }
}

function lireLangue(): "fr" | "en" {
  try {
    return localStorage.getItem(LANGUE_KEY) === "en" ? "en" : "fr"
  } catch {
    return "fr"
  }
}

function ecrireLangue(valeur: "fr" | "en"): void {
  try {
    if (valeur === "en") localStorage.setItem(LANGUE_KEY, "en")
    else localStorage.removeItem(LANGUE_KEY)
  } catch {
    // stockage indisponible : la valeur en mémoire reste la source de vérité
  }
}

/** Signal unique pour la visibilité du panneau Dépôt (défaut : affiché). */
export const [afficherDepot, setAfficherDepot] = createSignal(lireBooleen(AFFICHER_DEPOT_KEY, true))
export function basculerDepot(): void {
  const suivant = !afficherDepot()
  setAfficherDepot(suivant)
  ecrireBooleen(AFFICHER_DEPOT_KEY, suivant)
}

/** Signal unique pour la langue des libellés du panneau Dépôt (défaut : fr). */
export const [langueInterface, setLangueInterface] = createSignal<"fr" | "en">(lireLangue())
export function choisirLangue(valeur: "fr" | "en"): void {
  setLangueInterface(valeur)
  ecrireLangue(valeur)
}
