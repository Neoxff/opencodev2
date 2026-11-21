/**
 * Client du panneau « Ressources » vers l'API locale /opencodev2/health/*.
 *
 * Le jeton est le même que celui de l'API Git, injecté par le serveur dans la
 * balise `<meta name="opencodev2-git-token">`. Sans jeton (Vite en dev), aucun
 * appel n'est tenté et le panneau affiche « hors ligne ».
 */

export type Memoire = {
  totale: number
  utilisee: number
  disponible: number
  swapTotale: number
  swapUtilisee: number
}

export type Processus = {
  pid: number
  nom: string
  rss: number
  duree: string
}

export type EtatDemon = {
  enMarche: boolean
  pid: number | null
  duree?: string
}

export type ReponseProcessus = { processus: Processus[] }

export function lireJeton(): string | undefined {
  if (typeof document === "undefined") return undefined
  const valeur = document.querySelector('meta[name="opencodev2-git-token"]')?.getAttribute("content")
  return valeur && /^[0-9a-f]{64}$/.test(valeur) ? valeur : undefined
}

/** Canal injectable pour les tests (client simulé). */
export type Transport = (chemin: string, corps?: unknown) => Promise<unknown>

const transportParDefaut: Transport = async (chemin, corps) => {
  const jeton = lireJeton()
  if (!jeton) throw new Error("NON_DISPONIBLE")
  const reponse = await fetch(`/opencodev2/health/${chemin}`, {
    method: corps === undefined ? "GET" : "POST",
    headers: {
      "x-opencodev2-token": jeton,
      ...(corps === undefined ? {} : { "content-type": "application/json" }),
    },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  })
  const donnees = await reponse.json().catch(() => undefined)
  if (!reponse.ok) throw new Error((donnees as { code?: string })?.code ?? `HTTP ${reponse.status}`)
  return donnees
}

export function creerClientHealth(transport: Transport = transportParDefaut) {
  return {
    memoire: () => transport("memoire") as Promise<Memoire>,
    processus: () => transport("processus") as Promise<ReponseProcessus>,
    demon: () => transport("demon") as Promise<EtatDemon>,
    arreterDemon: () => transport("demon/arreter", {}) as Promise<{ arrete: boolean }>,
    arreterProcessus: (pid: number) =>
      transport(`processus/${pid}/arreter`, {}) as Promise<{ arrete: boolean }>,
  }
}

export const healthApi = creerClientHealth()
