/**
 * Panneau Ressources — santé machine d'Opencodev2 (docs/design/24-ressources.md).
 *
 * Deux vues du même composant :
 * - compacte dans la barre latérale (mémoire, démon, évaluations réelles) ;
 * - complète dans une feuille (liste des processus + actions).
 *
 * Aucune ligne de commande ni environnement de processus n'est affiché.
 * Rafraîchissement 10 s uniquement si visible ET onglet actif.
 * Seuils : < 80 % tout va bien, ≥ 80 % avertissement, ≥ 90 % critique.
 */

import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import "./ressources.css"
import {
  creerClientHealth,
  type EtatDemon,
  type Memoire,
  type Processus,
  type Transport,
} from "./ressources-client"

export type NiveauAlerte = "normal" | "avertissement" | "critique" | "hors-ligne"

export type PropsRessources = {
  /** Vue compacte (barre latérale) ou complète (feuille). */
  compact?: boolean
  /** Client injectable pour les tests ; défaut : client HTTP réel. */
  client?: ReturnType<typeof creerClientHealth>
  /** État des évaluations réelles (source de vérité : réglages). */
  evaluationsReelles?: boolean
  /** Transport injectable pour construire le client par défaut. */
  transport?: Transport
}

/** Formate un nombre d'octets en Go/Mo lisible (virgule décimale FR). */
export function formaterOctets(octets: number): string {
  if (!Number.isFinite(octets) || octets < 0) return "—"
  const go = octets / 1024 ** 3
  if (go >= 1) return `${go.toFixed(1).replace(".", ",")} Go`
  const mo = octets / 1024 ** 2
  return `${mo.toFixed(0)} Mo`
}

/** Calcule le pourcentage utilisé [0, 100]. */
export function pourcentage(utilisee: number, totale: number): number {
  if (totale <= 0) return 0
  return Math.max(0, Math.min(100, (utilisee / totale) * 100))
}

/** Niveau d'alerte d'après la mémoire et l'état du démon. */
export function niveauAlerte(memoire: Memoire | undefined, demon: EtatDemon | undefined): NiveauAlerte {
  if (!memoire || !demon || !demon.enMarche) return "hors-ligne"
  const pct = pourcentage(memoire.utilisee, memoire.totale)
  if (pct >= 90) return "critique"
  if (pct >= 80) return "avertissement"
  if (memoire.swapUtilisee > 0) return "avertissement"
  return "normal"
}

/** Message actionnable, sans chemin ni secret. */
export function messageAlerte(memoire: Memoire | undefined, demon: EtatDemon | undefined): string | undefined {
  if (!memoire || !demon) return undefined
  if (!demon.enMarche) return "Le démon est arrêté : les évaluations ne tournent pas."
  const pct = pourcentage(memoire.utilisee, memoire.totale)
  if (pct >= 90) return "Mémoire saturée : risquez des échecs d'allocation. Arrêtez le démon."
  if (pct >= 80)
    return "Des sessions d'évaluation consomment de la mémoire. Fermez-les ou arrêtez le démon."
  if (memoire.swapUtilisee > 0) return "Le swap est utilisé : les évaluations sont ralenties."
  return undefined
}

const LIBELLE_NIVEAU: Record<NiveauAlerte, string> = {
  normal: "Tout va bien",
  avertissement: "Avertissement",
  critique: "Critique",
  "hors-ligne": "Hors ligne",
}

export default function RessourcesPanel(props: PropsRessources) {
  const api = props.client ?? creerClientHealth(props.transport)
  const [memoire, setMemoire] = createSignal<Memoire | undefined>()
  const [demon, setDemon] = createSignal<EtatDemon | undefined>()
  const [processus, setProcessus] = createSignal<Processus[]>([])
  const [visible, setVisible] = createSignal(true)
  const [confirmation, setConfirmation] = createSignal<string | null>(null)

  const niveau = createMemo(() => niveauAlerte(memoire(), demon()))
  const message = createMemo(() => messageAlerte(memoire(), demon()))
  const pctMemoire = createMemo(() => pourcentage(memoire()?.utilisee ?? 0, memoire()?.totale ?? 0))
  const pctSwap = createMemo(() => pourcentage(memoire()?.swapUtilisee ?? 0, memoire()?.swapTotale ?? 0))

  const mesurer = async () => {
    try {
      const [m, d, p] = await Promise.all([api.memoire(), api.demon(), api.processus()])
      setMemoire(m)
      setDemon(d)
      setProcessus(p.processus ?? [])
    } catch {
      setDemon({ enMarche: false, pid: null })
    }
  }

  let intervalle: ReturnType<typeof setInterval> | undefined
  let sectionEl: HTMLElement | undefined
  let observeur: IntersectionObserver | undefined

  onMount(() => {
    void mesurer()
    intervalle = setInterval(() => {
      if (visible() && typeof document !== "undefined" && !document.hidden) void mesurer()
    }, 10_000)
    const surVisibilite = () => {
      if (!document.hidden && visible()) void mesurer()
    }
    document.addEventListener("visibilitychange", surVisibilite)
    // Le panneau n'est « visible » que s'il est effectivement dans le viewport.
    if (sectionEl && typeof IntersectionObserver !== "undefined") {
      observeur = new IntersectionObserver((entrees) => {
        for (const e of entrees) setVisible(e.isIntersecting)
      })
      observeur.observe(sectionEl)
    }
    onCleanup(() => {
      if (intervalle) clearInterval(intervalle)
      document.removeEventListener("visibilitychange", surVisibilite)
      observeur?.disconnect()
    })
  })

  const confirmer = async () => {
    const cible = confirmation()
    if (!cible) return
    if (cible === "demon") await api.arreterDemon()
    else await api.arreterProcessus(Number(cible))
    setConfirmation(null)
    void mesurer()
  }

  const couleurNiveau = () => {
    switch (niveau()) {
      case "critique": return "var(--danger-texte)"
      case "avertissement": return "var(--attention)"
      case "hors-ligne": return "var(--text-3)"
      default: return "var(--success)"
    }
  }

  return (
    <section
      ref={(el: HTMLElement) => { sectionEl = el }}
      class={`ressources ${props.compact ? "ressources-compact" : "ressources-complet glass-ressources"}`}
      data-niveau={niveau()}
      aria-label="Ressources de la machine"
    >
      <h2>Ressources <span class="ressources-pastille" style={{ background: couleurNiveau() }} aria-hidden="true" /> {LIBELLE_NIVEAU[niveau()]}</h2>

      {message() && <p class="ressources-message" role="status">{message()}</p>}

      <div class="ressources-jauge" role="img" aria-label={`Mémoire : ${formaterOctets(memoire()?.utilisee ?? 0)} sur ${formaterOctets(memoire()?.totale ?? 0)}`}>
        <span>Mémoire</span>
        <div class="jauge-piste"><div class="jauge-remplissage" style={{ width: `${pctMemoire()}%`, background: couleurNiveau() }} /></div>
        <span>{formaterOctets(memoire()?.utilisee ?? 0)} / {formaterOctets(memoire()?.totale ?? 0)}</span>
      </div>

      <div class="ressources-jauge" role="img" aria-label={`Swap : ${formaterOctets(memoire()?.swapUtilisee ?? 0)} sur ${formaterOctets(memoire()?.swapTotale ?? 0)}`}>
        <span>Swap</span>
        <div class="jauge-piste"><div class="jauge-remplissage" style={{ width: `${pctSwap()}%`, background: "var(--attention)" }} /></div>
        <span>{formaterOctets(memoire()?.swapUtilisee ?? 0)} / {formaterOctets(memoire()?.swapTotale ?? 0)}</span>
      </div>

      <div class="ressources-ligne">
        <span class="ressources-pastille" style={{ background: demon()?.enMarche ? "var(--success)" : "var(--text-3)" }} aria-hidden="true" />
        <span>Démon {demon()?.enMarche ? "en marche" : "arrêté"}{demon()?.duree ? ` depuis ${demon()!.duree}` : ""}</span>
      </div>

      <div class="ressources-ligne">
        <span class="ressources-pastille" style={{ background: props.evaluationsReelles ? "var(--success)" : "var(--attention)" }} aria-hidden="true" />
        <span title="les évaluations exécutent le code en environnement réel">Évaluations réelles {props.evaluationsReelles ? "activées" : "désactivées"}</span>
      </div>

      <Show when={!props.compact}>
        <div class="ressources-actions">
          <button class="ressources-bouton" title="Actualiser" aria-label="Actualiser" onClick={() => void mesurer()}>↻</button>
          <Show when={demon()?.enMarche}>
            <button class="ressources-bouton" title="Arrêter le démon" aria-label="Arrêter le démon" onClick={() => setConfirmation("demon")}>■</button>
          </Show>
        </div>

        <ul class="ressources-processus" aria-label="Processus Opencodev2">
          <For each={processus()}>{(p) => (
            <li>
              <span>{p.nom}</span>
              <span>{p.pid} · {formaterOctets(p.rss)} · {p.duree}</span>
              <button class="ressources-bouton" title="Arrêter ce processus" aria-label={`Arrêter ${p.nom} (PID ${p.pid})`} onClick={() => setConfirmation(String(p.pid))}>✕</button>
            </li>
          )}</For>
        </ul>
      </Show>

      <Show when={confirmation()}>
        <div class="ressources-confirmation" role="alertdialog" aria-label="Confirmer l'arrêt">
          <p>Arrêter {confirmation() === "demon" ? `le démon (PID ${demon()?.pid ?? "?"})` : `le processus (PID ${confirmation()})`} ?</p>
          <button class="ressources-bouton" aria-label="Annuler" onClick={() => setConfirmation(null)}>Annuler</button>
          <button class="ressources-bouton danger" aria-label="Arrêter" onClick={() => void confirmer()}>Arrêter</button>
        </div>
      </Show>
    </section>
  )
}
