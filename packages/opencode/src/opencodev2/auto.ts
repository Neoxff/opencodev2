/**
 * Automatisme Git local d'Opencodev2 — DÉSACTIVÉ PAR DÉFAUT.
 *
 * Trois réglages, tous `false` au départ :
 *  - fetchAuDemarrage : fetch silencieux au lancement ;
 *  - commitAuto : commit des modifications de l'agent dans `agent/<session>` ;
 *  - pushAuto : push de cette branche agent vers origin.
 *
 * Garanties tenues dans le code (pas seulement dans les réglages) :
 *  - AUCUNE action automatique sur main (ni commit, ni push) ;
 *  - push SANS force, uniquement la branche `agent/<session>` ;
 *  - chaque action est journalisée et peut être annulée par un revert local.
 *
 * Le journal et les réglages vivent hors du dépôt, dans ~/.config/opencodev2.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { GitError, runGit } from "./git"

export type ReglagesAuto = {
  fetchAuDemarrage: boolean
  commitAuto: boolean
  pushAuto: boolean
}

export const REGLAGES_PAR_DEFAUT: ReglagesAuto = {
  fetchAuDemarrage: false,
  commitAuto: false,
  pushAuto: false,
}

export type EntreeJournal = {
  id: string
  action: "fetch" | "commit" | "push" | "annulation"
  branche: string
  session?: string
  message?: string
  sha?: string
  date: string
  statut: "ok" | "echec"
  detail?: string
}

function dossierConfig(): string {
  const base = process.env.XDG_CONFIG_HOME ?? path.join(process.env.HOME ?? "", ".config")
  return path.join(base, "opencodev2")
}
function fichierReglages(): string {
  return path.join(dossierConfig(), "auto.json")
}
function fichierJournal(): string {
  return path.join(dossierConfig(), "auto-journal.jsonl")
}

function assurerDossier() {
  mkdirSync(dossierConfig(), { recursive: true, mode: 0o700 })
}

export function lireReglagesAuto(): ReglagesAuto {
  const f = fichierReglages()
  if (!existsSync(f)) return { ...REGLAGES_PAR_DEFAUT }
  try {
    const brut = JSON.parse(readFileSync(f, "utf8")) as Partial<ReglagesAuto>
    return {
      fetchAuDemarrage: brut.fetchAuDemarrage === true,
      commitAuto: brut.commitAuto === true,
      pushAuto: brut.pushAuto === true,
    }
  } catch {
    return { ...REGLAGES_PAR_DEFAUT }
  }
}

export function ecrireReglagesAuto(reglages: ReglagesAuto): ReglagesAuto {
  assurerDossier()
  const valide: ReglagesAuto = {
    fetchAuDemarrage: reglages.fetchAuDemarrage === true,
    commitAuto: reglages.commitAuto === true,
    pushAuto: reglages.pushAuto === true,
  }
  writeFileSync(fichierReglages(), JSON.stringify(valide, null, 2) + "\n", { mode: 0o600 })
  return valide
}

export function lireJournal(): EntreeJournal[] {
  const f = fichierJournal()
  if (!existsSync(f)) return []
  return readFileSync(f, "utf8")
    .split("\n")
    .filter(Boolean)
    .flatMap((ligne) => {
      try {
        return [JSON.parse(ligne) as EntreeJournal]
      } catch {
        return []
      }
    })
    .reverse()
}

function journaliser(entree: Omit<EntreeJournal, "id" | "date">): EntreeJournal {
  assurerDossier()
  const complet: EntreeJournal = {
    ...entree,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date: new Date().toISOString(),
  }
  appendFileSync(fichierJournal(), JSON.stringify(complet) + "\n", { mode: 0o600 })
  return complet
}

/** Nom de branche agent, validé : jamais vide, jamais main. */
export function brancheAgent(sessionID: string): string {
  if (!/^[A-Za-z0-9_-]{3,80}$/.test(sessionID)) {
    throw new GitError("ARGUMENT_INVALIDE", "identifiant de session invalide")
  }
  return `agent/${sessionID}`
}

/** Garde absolue : aucune action automatique sur main. */
export function refuserMain(branche: string) {
  if (branche === "main" || branche === "master" || branche.startsWith("agent/") === false) {
    throw new GitError("ARGUMENT_INVALIDE", "action automatique refusée hors branche agent/")
  }
}

async function brancheCourante(racine: string): Promise<string> {
  const r = await runGit(racine, ["rev-parse", "--abbrev-ref", "HEAD"])
  if (r.code !== 0) throw new GitError("ECHEC_GIT", r.stderr.trim() || "branche courante illisible")
  return r.stdout.trim()
}

export async function autoFetchAuDemarrage(racine: string): Promise<EntreeJournal | undefined> {
  const reglages = lireReglagesAuto()
  if (!reglages.fetchAuDemarrage) return undefined
  const branche = await brancheCourante(racine)
  try {
    const r = await runGit(racine, ["fetch", "--prune"], { timeoutMs: 60_000 })
    if (r.code !== 0) throw new GitError("PAS_DE_RESEAU", r.stderr.trim() || "fetch refusé")
    return journaliser({ action: "fetch", branche, statut: "ok" })
  } catch (e) {
    const err = e as GitError
    return journaliser({
      action: "fetch",
      branche,
      statut: "echec",
      detail: err.code ?? "ECHEC_GIT",
    })
  }
}

export async function autoCommitAgent(
  racine: string,
  sessionID: string,
  fichiers: string[],
): Promise<EntreeJournal | undefined> {
  const reglages = lireReglagesAuto()
  if (!reglages.commitAuto) return undefined
  const branche = brancheAgent(sessionID)
  try {
    refuserMain(branche)
    // Crée la branche agent si elle n'existe pas, puis BASCULE dessus : le
    // commit atterrit toujours sur agent/<session>, jamais sur main même si
    // l'agent travaillait sur main au moment du déclenchement.
    // Crée la branche agent si elle n'existe pas, sans toucher à main.
    const existe = await runGit(racine, ["rev-parse", "--verify", `refs/heads/${branche}`])
    if (existe.code !== 0) {
      const c = await runGit(racine, ["branch", branche])
      if (c.code !== 0) throw new GitError("ECHEC_GIT", c.stderr.trim() || "création branche refusée")
    }
    const sw = await runGit(racine, ["switch", branche])
    if (sw.code !== 0) throw new GitError("ECHEC_GIT", sw.stderr.trim() || "bascule refusée")

    const message = `chore(agent): modifications automatisées (${sessionID})`
    if (fichiers.length > 0) {
      const add = await runGit(racine, ["add", "--", ...fichiers])
      if (add.code !== 0) throw new GitError("ECHEC_GIT", add.stderr.trim() || "add refusé")
    }
    const commit = await runGit(racine, ["commit", "-m", message])
    if (commit.code !== 0 && !commit.stderr.includes("nothing to commit")) {
      throw new GitError("ECHEC_GIT", commit.stderr.trim() || "commit refusé")
    }
    const sha = (await runGit(racine, ["rev-parse", "HEAD"])).stdout.trim()
    return journaliser({ action: "commit", branche, session: sessionID, message, sha, statut: "ok" })
  } catch (e) {
    const err = e as GitError
    return journaliser({
      action: "commit",
      branche,
      session: sessionID,
      statut: "echec",
      detail: err.code ?? "ECHEC_GIT",
    })
  }
}

export async function autoPushAgent(racine: string, sessionID: string): Promise<EntreeJournal | undefined> {
  const reglages = lireReglagesAuto()
  if (!reglages.pushAuto) return undefined
  const branche = brancheAgent(sessionID)
  refuserMain(branche)
  try {
    // Push explicite de la branche agent, SANS --force.
    const r = await runGit(racine, ["push", "origin", branche], { timeoutMs: 60_000 })
    if (r.code !== 0) throw new GitError("NON_FAST_FORWARD", r.stderr.trim() || "push refusé")
    return journaliser({ action: "push", branche, session: sessionID, statut: "ok" })
  } catch (e) {
    const err = e as GitError
    return journaliser({
      action: "push",
      branche,
      session: sessionID,
      statut: "echec",
      detail: err.code ?? "ECHEC_GIT",
    })
  }
}

/**
 * Déclenché après une série de modifications de l'agent. Commit les fichiers
 * modifiés du workspace sur `agent/<session>`, puis pousse cette branche si
 * le réglage est actif. Ne touche jamais main. Retourne les entrées de journal.
 */
export async function apresAgent(racine: string, sessionID: string): Promise<EntreeJournal[]> {
  // Valider TOUJOURS l'entrée, même quand l'automatisme est désactivé :
  // sinon une injection resterait silencieusement acceptée avec un 200.
  const valide = brancheAgent(sessionID)
  const reglages = lireReglagesAuto()
  if (!reglages.commitAuto && !reglages.pushAuto) return []
  const courante = await brancheCourante(racine)
  void valide
  const fiches: string[] = []
  const r = await runGit(racine, ["status", "--porcelain", "--untracked-files=normal"])
  if (r.code === 0) {
    for (const ligne of r.stdout.split("\n")) {
      if (ligne.length > 3) fiches.push(ligne.slice(3).trim())
    }
  }
  const entrees: EntreeJournal[] = []
  if (reglages.commitAuto) {
    const c = await autoCommitAgent(racine, sessionID, fiches.filter(Boolean))
    if (c) entrees.push(c)
  }
  if (reglages.pushAuto) {
    const p = await autoPushAgent(racine, sessionID)
    if (p) entrees.push(p)
  }
  // On ne revient PAS sur main : la branche agent reste active pour l'utilisateur.
  void courante
  return entrees
}

/** Annulation locale : revert du dernier commit d'une entrée de journal. */
export async function annulerLocal(racine: string, id: string): Promise<EntreeJournal> {
  const entree = lireJournal().find((e) => e.id === id)
  if (!entree) throw new GitError("ARGUMENT_INVALIDE", "entrée de journal introuvable")
  if (!entree.sha) throw new GitError("ARGUMENT_INVALIDE", "aucun commit à annuler")
  const r = await runGit(racine, ["revert", "--no-edit", entree.sha])
  if (r.code !== 0) throw new GitError("ECHEC_GIT", r.stderr.trim() || "revert refusé")
  return journaliser({
    action: "annulation",
    branche: entree.branche,
    session: entree.session,
    statut: "ok",
    detail: `revert de ${entree.sha.slice(0, 8)}`,
  })
}
