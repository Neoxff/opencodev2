/**
 * Client du panneau « Dépôt » vers l'API Git locale /opencodev2/git/*.
 *
 * Le jeton n'est jamais lu depuis le dépôt : il est injecté par le serveur dans
 * une balise `<meta name="opencodev2-git-token">` du HTML servi. Sans jeton
 * (ex. Vite en développement), les appels ne sont pas tentés et l'UI affiche
 * un état « hors ligne » plutôt qu'une erreur.
 */

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

export type GitEtat = "a-jour" | "en-avance" | "en-retard" | "conflit" | "hors-ligne"

export function etatDepot(statut: GitStatus | undefined, erreur: string | undefined): GitEtat {
  if (erreur === "CONFLIT") return "conflit"
  if (!statut || erreur) return "hors-ligne"
  if (statut.behind > 0) return "en-retard"
  if (statut.ahead > 0) return "en-avance"
  return "a-jour"
}

export class ErreurGitApi extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = "ErreurGitApi"
  }
}

export function lireJeton(): string | undefined {
  if (typeof document === "undefined") return undefined
  const valeur = document.querySelector('meta[name="opencodev2-git-token"]')?.getAttribute("content")
  return valeur && /^[0-9a-f]{64}$/.test(valeur) ? valeur : undefined
}

async function appeler<T>(chemin: string, corps?: unknown): Promise<T> {
  const jeton = lireJeton()
  if (!jeton) throw new ErreurGitApi("NON_DISPONIBLE", "jeton local absent", 0)
  let reponse: Response
  try {
    reponse = await fetch(`/opencodev2/git/${chemin}`, {
      method: corps === undefined ? "GET" : "POST",
      headers: {
        "x-opencodev2-token": jeton,
        ...(corps === undefined ? {} : { "content-type": "application/json" }),
      },
      body: corps === undefined ? undefined : JSON.stringify(corps),
    })
  } catch {
    throw new ErreurGitApi("PAS_DE_RESEAU", "serveur local injoignable", 0)
  }
  const donnees = (await reponse.json().catch(() => undefined)) as { code?: string; message?: string } | undefined
  if (!reponse.ok) {
    throw new ErreurGitApi(donnees?.code ?? "ECHEC_GIT", donnees?.message ?? `HTTP ${reponse.status}`, reponse.status)
  }
  return donnees as T
}

export const gitApi = {
  status: () => appeler<GitStatus>("status"),
  fetch: () => appeler<{ updated: boolean }>("fetch", {}),
  pull: () => appeler<{ sha: string }>("pull", {}),
  commit: (message: string, files: string[]) => appeler<{ sha: string }>("commit", { message, files }),
  push: () => appeler<{ ok: boolean }>("push", {}),
  branch: (name: string) => appeler<{ name: string }>("branch", { name }),
}

/** Date relative courte, sans dépendance. */
export function dateRelative(iso: string | null, maintenant = Date.now()): string {
  if (!iso) return "jamais"
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return "date inconnue"
  const s = Math.max(0, Math.round((maintenant - t) / 1000))
  if (s < 60) return "à l'instant"
  const m = Math.round(s / 60)
  if (m < 60) return `il y a ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `il y a ${h} h`
  const j = Math.round(h / 24)
  return `il y a ${j} j`
}
