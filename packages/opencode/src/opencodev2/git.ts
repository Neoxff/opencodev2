/**
 * Noyau Git pour le harnais Opencodev2.
 *
 * Règles de sécurité tenues ici (aucune ne dépend de la bonne volonté de l'appelant) :
 *  - exécution SANS shell : `Bun.spawn` reçoit un tableau d'arguments, jamais une chaîne ;
 *  - répertoire de travail forcé au workspace configuré ;
 *  - tout chemin de fichier passé en argument est résolu et vérifié comme contenu dans le workspace ;
 *  - liste noire de secrets refusée en écriture ;
 *  - délai d'attente sur chaque commande ;
 *  - erreurs typées, sans jamais exposer le contenu d'un secret.
 */

import path from "node:path"

export type GitErrorCode =
  | "PAS_DE_RESEAU"
  | "CONFLIT"
  | "DEPOT_SALE"
  | "NON_AUTHENTIFIE"
  | "NON_FAST_FORWARD"
  | "HORS_PERIMETRE"
  | "FICHIER_INTERDIT"
  | "ARGUMENT_INVALIDE"
  | "ECHEC_GIT"

export class GitError extends Error {
  readonly code: GitErrorCode
  constructor(code: GitErrorCode, message: string) {
    super(message)
    this.name = "GitError"
    this.code = code
  }
}

/** Motifs de fichiers qui ne doivent JAMAIS être commités via l'interface. */
const SECRET_PATTERNS: RegExp[] = [
  /(^|\/)auth\.json$/i,
  /(^|\/)\.env($|\.)/i,
  /(^|\/)credentials?\b/i,
  /\.(pem|key|p12|pfx)$/i,
  /\.(db|sqlite|sqlite3)($|-)/i,
  /(^|\/)token\b/i,
  /(^|\/)secrets?\b/i,
]

const BRANCH_RE = /^[A-Za-z0-9][A-Za-z0-9/._-]*$/

/**
 * Classe une erreur git à partir de ses messages ANGLAIS (voir `runGit` : LC_ALL=C).
 * Aucune formulation localisée n'est acceptée : la locale est forcée avant chaque commande.
 */
export function classerErreur(stderr: string, code: number): GitErrorCode {
  const s = stderr.toLowerCase()
  if (/could not resolve host|failed to connect|timed? ?out|network is unreachable|temporarily unavailable/.test(s))
    return "PAS_DE_RESEAU"
  if (/authentication failed|permission denied|403|401|could not read username/.test(s)) return "NON_AUTHENTIFIE"
  if (
    /non-fast-forward|rejected|fetch first|updates were rejected|not possible to fast-forward|diverging branches|divergent branches/.test(
      s,
    )
  )
    return "NON_FAST_FORWARD"
  // CONFLIT est réservé à une vraie fusion avec fichiers non fusionnés.
  // Le message ff-only ("diverging branches") ne contient pas "conflict" : pas d'ambiguïté.
  if (/conflict|automatic merge failed/.test(s)) return "CONFLIT"
  if (/local changes|would be overwritten|untracked working tree files/.test(s)) return "DEPOT_SALE"
  return code === 0 ? "ECHEC_GIT" : "ECHEC_GIT"
}

/** Vérifie qu'un chemin relatif reste dans la racine. */
export function cheminSansRisque(racine: string, relatif: string): string {
  if (typeof relatif !== "string" || relatif.length === 0 || relatif.includes("\0")) {
    throw new GitError("ARGUMENT_INVALIDE", "chemin vide ou invalide")
  }
  if (path.isAbsolute(relatif)) throw new GitError("HORS_PERIMETRE", "chemin absolu interdit")
  const base = path.resolve(racine)
  const cible = path.resolve(base, relatif)
  if (cible !== base && !cible.startsWith(base + path.sep)) {
    throw new GitError("HORS_PERIMETRE", "chemin hors du workspace")
  }
  return path.relative(base, cible)
}

/** Refuse un fichier de la liste noire des secrets. */
export function verifierListeNoire(relatif: string): void {
  const normalise = relatif.replace(/\\/g, "/")
  if (SECRET_PATTERNS.some((re) => re.test(normalise))) {
    throw new GitError("FICHIER_INTERDIT", `fichier de secrets refusé : ${normalise}`)
  }
}

/** Exécute git avec un tableau d'arguments, sans shell, cwd borné, avec délai. */
export async function runGit(
  racine: string,
  args: string[],
  options: { timeoutMs?: number } = {},
): Promise<{ stdout: string; stderr: string; code: number }> {
  if (!Array.isArray(args) || args.length === 0 || args.some((a) => typeof a !== "string")) {
    throw new GitError("ARGUMENT_INVALIDE", "arguments git invalides")
  }
  const timeoutMs = options.timeoutMs ?? 30_000
  // Locale anglaise figée : classerErreur ne dépend d'aucune formulation localisée.
  // GIT_TERMINAL_PROMPT=0 interdit toute invite interactive (auth bloquée, pas de hang).
  const proc = Bun.spawn(["git", ...args], {
    cwd: path.resolve(racine),
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
    env: { ...process.env, LC_ALL: "C", LANG: "C", GIT_TERMINAL_PROMPT: "0" },
  })
  let expire: ReturnType<typeof setTimeout> | undefined
  const limite = new Promise<never>((_, reject) => {
    expire = setTimeout(() => {
      proc.kill()
      reject(new GitError("PAS_DE_RESEAU", `délai dépassé après ${timeoutMs} ms`))
    }, timeoutMs)
  })
  try {
    const [code, stdout, stderr] = await Promise.race([
      Promise.all([
        proc.exited,
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]) as Promise<[number, string, string]>,
      limite,
    ])
    return { stdout, stderr, code }
  } finally {
    if (expire) clearTimeout(expire)
  }
}

async function succes(racine: string, args: string[], timeoutMs?: number): Promise<string> {
  const r = await runGit(racine, args, { timeoutMs })
  if (r.code !== 0) throw new GitError(classerErreur(r.stderr, r.code), r.stderr.trim() || "git a échoué")
  return r.stdout
}

export type GitStatus = {
  repo: string | null
  branch: string
  ahead: number
  behind: number
  modified: string[]
  lastCommit: { sha: string; subject: string; date: string } | null
  lastPush: string | null
  dirty: boolean
}

export function repoDepuisRemote(remote: string): string | null {
  const m = remote.match(/github\.com[:/]([^/]+)\/([^/\s]+?)(?:\.git)?\s*$/)
  return m ? `${m[1]}/${m[2]}` : null
}

export async function gitStatus(racine: string): Promise<GitStatus> {
  const [branchRaw, remoteRaw, porcelain, logRaw, countRaw, pushRaw] = await Promise.all([
    succes(racine, ["rev-parse", "--abbrev-ref", "HEAD"]),
    succes(racine, ["remote", "get-url", "origin"]).catch(() => ""),
    succes(racine, ["status", "--porcelain", "--untracked-files=normal"]),
    succes(racine, ["log", "-1", "--format=%H%x1f%s%x1f%cI"]).catch(() => ""),
    succes(racine, ["rev-list", "--left-right", "--count", "@{upstream}...HEAD"]).catch(() => "0\t0"),
    succes(racine, ["log", "-1", "--format=%cI", "@{push}"]).catch(() => ""),
  ])
  const [behind, ahead] = countRaw.trim().split(/\s+/).map(Number)
  const modifie = porcelain
    .split("\n")
    .map((l) => l.slice(3).trim())
    .filter(Boolean)
  const champs = logRaw.trim().split("\x1f")
  return {
    repo: repoDepuisRemote(remoteRaw.trim()),
    branch: branchRaw.trim(),
    ahead: Number.isFinite(ahead) ? ahead : 0,
    behind: Number.isFinite(behind) ? behind : 0,
    modified: modifie,
    lastCommit: champs.length === 3 ? { sha: champs[0], subject: champs[1], date: champs[2] } : null,
    lastPush: pushRaw.trim() || null,
    dirty: modifie.length > 0,
  }
}

export async function gitFetch(racine: string): Promise<{ updated: boolean }> {
  const avant = await succes(racine, ["rev-parse", "HEAD"])
  await succes(racine, ["fetch", "--prune"], 60_000)
  const apres = await succes(racine, ["rev-parse", "HEAD"])
  return { updated: avant !== apres }
}

export async function gitPull(racine: string): Promise<{ sha: string }> {
  const statut = await gitStatus(racine)
  if (statut.dirty) throw new GitError("DEPOT_SALE", "dépôt sale : annulez ou committez les modifications")
  await succes(racine, ["fetch", "--prune"], 60_000)
  await succes(racine, ["merge", "--ff-only", "@{upstream}"], 60_000)
  return { sha: (await succes(racine, ["rev-parse", "HEAD"])).trim() }
}

export async function gitCommit(
  racine: string,
  message: string,
  fichiers: string[],
): Promise<{ sha: string }> {
  if (typeof message !== "string" || message.trim().length === 0) {
    throw new GitError("ARGUMENT_INVALIDE", "message de commit obligatoire")
  }
  if (message.length > 4000) throw new GitError("ARGUMENT_INVALIDE", "message trop long")
  if (!Array.isArray(fichiers) || fichiers.length === 0) {
    throw new GitError("ARGUMENT_INVALIDE", "liste de fichiers explicite obligatoire")
  }
  const seconds = fichiers.map((f) => {
    const sur = cheminSansRisque(racine, f)
    verifierListeNoire(sur)
    return sur
  })
  await succes(racine, ["add", "--", ...seconds])
  const r = await runGit(racine, ["commit", "-m", message, "--", ...seconds])
  if (r.code !== 0) throw new GitError(classerErreur(r.stderr, r.code), r.stderr.trim() || "commit refusé")
  return { sha: (await succes(racine, ["rev-parse", "HEAD"])).trim() }
}

export async function gitPush(racine: string, branche?: string): Promise<{ ok: true }> {
  const args = ["push", "--no-force", "origin"]
  if (branche) {
    if (!BRANCH_RE.test(branche)) throw new GitError("ARGUMENT_INVALIDE", "nom de branche invalide")
    args.push(branche)
  }
  const r = await runGit(racine, args, { timeoutMs: 60_000 })
  if (r.code !== 0) throw new GitError(classerErreur(r.stderr, r.code), r.stderr.trim() || "push refusé")
  return { ok: true }
}

export async function gitBranch(racine: string, nom: string): Promise<{ name: string }> {
  if (!BRANCH_RE.test(nom)) throw new GitError("ARGUMENT_INVALIDE", "nom de branche invalide")
  await succes(racine, ["branch", nom])
  return { name: nom }
}
