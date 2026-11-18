/**
 * Jeton aléatoire exigé sur l'API Git locale, régénéré à chaque démarrage.
 *
 * Le lanceur `script/web.ts` est le SEUL auteur du fichier : il génère le
 * jeton, l'écrit en 0600 et l'injecte dans l'environnement du serveur. Le
 * serveur et le daemon ne font que le LIRE depuis l'environnement, ce qui
 * élimine toute course d'écriture entre processus.
 */

import { chmodSync, mkdirSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { timingSafeEqual } from "node:crypto"

export const GIT_TOKEN_HEADER = "x-opencodev2-token"
export const TOKEN_FILENAME = "git-token"
export const GIT_TOKEN_ENV = "OPENCODEV2_GIT_TOKEN"

/** Chemin partagé entre le lanceur et le serveur (hors Git). */
export function gitTokenFile(): string {
  const base = process.env.XDG_CONFIG_HOME ?? path.join(homedir(), ".config")
  return path.join(base, "opencodev2", "opencodev2-git", TOKEN_FILENAME)
}

/** Génère un jeton hexadécimal de 32 octets. */
export function genererGitToken(): string {
  const octets = new Uint8Array(32)
  crypto.getRandomValues(octets)
  return Array.from(octets, (b) => b.toString(16).padStart(2, "0")).join("")
}

/** Écrit le jeton généré par le lanceur, en mode 0600. */
export function ecrireGitToken(value: string): string {
  const file = gitTokenFile()
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  writeFileSync(file, value + "\n", { mode: 0o600 })
  chmodSync(file, 0o600)
  return file
}

export type GitToken = {
  readonly value: string
  readonly file: string
  valide(fourni: string | undefined | null): boolean
}

let courant: GitToken | undefined

/** Lit le jeton injecté. Ne l'écrit jamais : seul le lanceur l'écrit. */
export function gitToken(): GitToken {
  if (courant) return courant
  const fromEnv = process.env[GIT_TOKEN_ENV]
  if (!fromEnv || !/^[0-9a-f]{64}$/.test(fromEnv)) {
    throw new Error("jeton Git local absent ou invalide (lanceur attendu)")
  }
  courant = {
    value: fromEnv,
    file: gitTokenFile(),
    valide(fourni) {
      if (typeof fourni !== "string" || fourni.length !== fromEnv.length) return false
      try {
        return timingSafeEqual(Buffer.from(fourni), Buffer.from(fromEnv))
      } catch {
        return false
      }
    },
  }
  return courant
}
