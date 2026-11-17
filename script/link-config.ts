/**
 * Configuration locale de liaison Opencodev2.
 *
 * Le fichier `opencodev2.config.json` vit à la racine du dépôt mais N'EST PAS
 * versionné (voir .gitignore). Il nomme le dépôt GitHub lié, sa branche par
 * défaut, le port du serveur et l'espace de travail ouvert par défaut.
 *
 * Sans fichier, `bun run web` garde exactement son comportement actuel.
 * Avec un fichier invalide, on refuse de démarrer avec un message explicite
 * plutôt que de continuer avec des valeurs surprises.
 */

import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

export const CONFIG_FILENAME = "opencodev2.config.json"
export const DEFAULT_PORT = 4096

export type LinkConfig = {
  /** Propriétaire/nom du dépôt GitHub lié, au format `owner/repo`. */
  repo: string
  /** Branche sur laquelle travaille l'utilisateur (jamais force-pushée). */
  defaultBranch: string
  /** Port d'écoute du serveur local. */
  port: number
  /** Dossier ouvert par défaut, relatif à la racine du dépôt. */
  workspace: string
}

export class LinkConfigError extends Error {
  readonly field?: string

  constructor(message: string, field?: string) {
    super(field ? `${field} : ${message}` : message)
    this.name = "LinkConfigError"
    this.field = field
  }
}

/** `owner/repo` : segments alphanumériques, `.`, `_` ou `-`, sans espace. */
const REPO_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/
/** Nom de branche git sûr : pas de `..`, d'espace, de début `-` ni de caractère de ref. */
const BRANCH_RE = /^(?!-)(?!.*\.\.)(?!.*[@\\^~:?*\s])[A-Za-z0-9](?:[A-Za-z0-9_.\/-]*[A-Za-z0-9])?$/

const KEYS = ["repo", "defaultBranch", "port", "workspace"] as const

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Valide et normalise un objet brut. Aucune dépendance externe. */
export function parseLinkConfig(input: unknown): LinkConfig {
  if (!isObject(input)) {
    throw new LinkConfigError("le fichier doit contenir un objet JSON")
  }

  for (const key of Object.keys(input)) {
    if (!(KEYS as readonly string[]).includes(key)) {
      throw new LinkConfigError(`clé inconnue « ${key} » ; attendu : ${KEYS.join(", ")}`, key)
    }
  }

  const repo = input.repo
  if (typeof repo !== "string" || !REPO_RE.test(repo)) {
    throw new LinkConfigError("doit être au format « proprietaire/nom » (ex. Neoxff/opencodev2)", "repo")
  }

  const defaultBranch = input.defaultBranch
  if (typeof defaultBranch !== "string" || !BRANCH_RE.test(defaultBranch)) {
    throw new LinkConfigError("nom de branche git invalide (pas d'espace, de '..' ni de caractère de ref)", "defaultBranch")
  }

  const port = input.port
  if (typeof port !== "number" || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new LinkConfigError("doit être un entier entre 1 et 65535", "port")
  }

  const workspace = input.workspace
  if (typeof workspace !== "string" || workspace.length === 0 || workspace.includes("\0")) {
    throw new LinkConfigError("doit être une chaîne non vide", "workspace")
  }
  if (path.isAbsolute(workspace) || workspace.split(/[\\/]/).includes("..")) {
    throw new LinkConfigError("doit être un chemin RELATIF sans '..' (ex. « . »)", "workspace")
  }

  return { repo, defaultBranch, port, workspace }
}

/**
 * Lit le fichier à la racine `root`. Retourne `null` s'il est absent :
 * dans ce cas l'appelant doit conserver son comportement habituel.
 */
export function loadLinkConfig(root: string): LinkConfig | null {
  const file = path.join(root, CONFIG_FILENAME)
  if (!existsSync(file)) return null

  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(file, "utf8"))
  } catch (error) {
    throw new LinkConfigError(`JSON invalide dans ${file} : ${(error as Error).message}`)
  }
  return parseLinkConfig(raw)
}

/** Chemin absolu de l'espace de travail, vérifié comme contenu dans `root`. */
export function workspacePath(root: string, config: LinkConfig): string {
  const base = path.resolve(root)
  const target = path.resolve(base, config.workspace)
  if (target !== base && !target.startsWith(base + path.sep)) {
    throw new LinkConfigError("l'espace de travail doit rester dans le dépôt", "workspace")
  }
  return target
}
