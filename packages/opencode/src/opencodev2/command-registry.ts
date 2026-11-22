/**
 * Registre des commandes exposé au webui.
 *
 * Source de vérité unique : `Command.Service.list()` du CLI (`src/command/index.ts`).
 * Ce module est PUR : il projette et valide, sans réseau, sans shell, sans processus
 * et sans aucune donnée de démonstration. La route locale et les tests utilisent
 * exactement les mêmes fonctions — c'est ce qui rend la parité structurelle.
 */

import type { Command } from "@/command"

/** Les trois origines réelles d'une commande du CLI. */
export type RegistryType = "command" | "mcp" | "skill"

/** Contrat public d'une entrée : nom, description, type, arguments. */
export type RegistryEntry = {
  name: string
  description?: string
  type: RegistryType
  arguments: string[]
}

export type Refus = { ok: false; status: number; code: string; message: string }
export type Resultat<T> = { ok: true; value: T } | Refus

const TYPES: readonly RegistryType[] = ["command", "mcp", "skill"]

function refus(status: number, code: string, message: string): Refus {
  return { ok: false, status, code, message }
}

/**
 * Projection CLI → web. Aucun tri, aucune exclusion : une commande du CLI absent
 * du registre web est un bug, pas un filtre. `hints` est la liste des arguments
 * déclarés par le CLI (`$1`, `$2`, `$ARGUMENTS`).
 */
export function project(infos: readonly Command.Info[]): RegistryEntry[] {
  return infos.map((info) => ({
    name: info.name,
    ...(info.description ? { description: info.description } : {}),
    type: TYPES.includes(info.source as RegistryType) ? (info.source as RegistryType) : "command",
    arguments: [...(info.hints ?? [])],
  }))
}

// Un nom de commande/skill peut contenir '/', '.', ':' ou '_' (skills namespaced).
const NOM_REGEX = /^[A-Za-z0-9][A-Za-z0-9._:\/-]{0,127}$/

/** Le nom doit correspondre EXACTEMENT à une entrée du registre. */
export function validerNom(nom: unknown, entrees: readonly RegistryEntry[]): Resultat<RegistryEntry> {
  if (typeof nom !== "string" || nom.length === 0 || nom.length > 128 || !NOM_REGEX.test(nom)) {
    return refus(400, "NOM_INVALIDE", "nom de commande invalide")
  }
  const entree = entrees.find((item) => item.name === nom)
  if (!entree) return refus(404, "NOM_INCONNU", `commande inconnue : ${nom}`)
  return { ok: true, value: entree }
}

/**
 * Détecte une tentative d'injection dans une valeur d'argument.
 * Aucune valeur n'est jamais passée à un shell : ce contrôle est une garde
 * supplémentaire, pas le mécanisme d'exécution.
 */
export function contientInjection(valeur: string): boolean {
  // Caractères de contrôle (dont \n, \r, NUL) — jamais légitimes dans un argument.
  if (/[\u0000-\u001f\u007f]/.test(valeur)) return true
  // Métacaractères shell et substitutions.
  if (/[;&|`$<>\\]/.test(valeur)) return true
  // Traversée de chemin.
  if (/\.\.(\/|\\)/.test(valeur)) return true
  return false
}

/**
 * Valide strictement les arguments : clés déclarées par l'entrée (ou le
 * passe-partout `$ARGUMENTS` du CLI), valeurs chaînes sans injection.
 */
export function validerArguments(args: unknown, entree: RegistryEntry): Resultat<Record<string, string>> {
  if (args === undefined || args === null) return { ok: true, value: {} }
  if (typeof args !== "object" || Array.isArray(args)) {
    return refus(400, "ARGUMENTS_INVALIDE", "arguments doit être un objet")
  }
  const valeurs: Record<string, string> = {}
  for (const [cle, valeur] of Object.entries(args as Record<string, unknown>)) {
    if (!entree.arguments.includes(cle) && cle !== "$ARGUMENTS") {
      return refus(400, "ARGUMENT_INCONNU", `argument non déclaré : ${cle}`)
    }
    if (typeof valeur !== "string") {
      return refus(400, "ARGUMENT_INVALIDE", `argument ${cle} doit être une chaîne`)
    }
    if (contientInjection(valeur)) {
      return refus(400, "ARGUMENT_INVALIDE", `injection détectée dans l'argument ${cle}`)
    }
    valeurs[cle] = valeur
  }
  return { ok: true, value: valeurs }
}

/** Seuls les prompts MCP et les skills sont exécutables par la route locale. */
export function validerTypeExecutable(entree: RegistryEntry): Resultat<true> {
  if (entree.type === "mcp" || entree.type === "skill") return { ok: true, value: true }
  return refus(400, "TYPE_NON_EXECUTABLE", `type non exécutable par cette route : ${entree.type}`)
}

/**
 * Substitue les arguments dans un template, exactement comme le CLI
 * (`session/prompt.ts`) : `$1`, `$2`… et `$ARGUMENTS`. Les positions les plus
 * longues sont traitées en premier pour ne pas confondre `$1` et `$10`.
 * Aucune commande shell n'est interprétée.
 */
export function resoudreTemplate(template: string, args: Record<string, string>): string {
  let sortie = template
  const positions = Object.keys(args)
    .filter((cle) => /^\$\d+$/.test(cle))
    .sort((a, b) => b.length - a.length)
  for (const cle of positions) sortie = sortie.split(cle).join(args[cle])
  if (Object.prototype.hasOwnProperty.call(args, "$ARGUMENTS")) {
    sortie = sortie.split("$ARGUMENTS").join(args["$ARGUMENTS"])
  }
  return sortie.trim()
}
