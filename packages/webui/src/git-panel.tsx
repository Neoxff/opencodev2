/**
 * Panneau « Dépôt » — état Git du dépôt lié et actions sûres.
 *
 * Actualisation toutes les 30 s et après chaque action, sans bloquer l'interface.
 * Confirmation avant Commit et Pousser. Aucun libellé écrit sur les boutons :
 * icône + info-bulle (`title`) seulement, comme demandé.
 */

import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import {
  dateRelative,
  ErreurGitApi,
  etatDepot,
  gitApi,
  type GitEtat,
  type GitStatus,
} from "./git-client"
import "./git-panel.css"

const ETAT_TEXTE: Record<GitEtat, string> = {
  "a-jour": "À jour",
  "en-avance": "En avance",
  "en-retard": "En retard",
  conflit: "Conflit",
  "hors-ligne": "Hors ligne",
}

type Action = "fetch" | "pull" | "commit" | "push"

export function GitPanel() {
  const [statut, setStatut] = createSignal<GitStatus>()
  const [erreur, setErreur] = createSignal<string>()
  const [occupe, setOccupe] = createSignal<Action>()
  const [confirmation, setConfirmation] = createSignal<Action>()
  const [message, setMessage] = createSignal("")

  const etat = () => etatDepot(statut(), erreur())

  const actualiser = async () => {
    try {
      const s = await gitApi.status()
      setStatut(s)
      setErreur(undefined)
    } catch (e) {
      setErreur(e instanceof ErreurGitApi ? e.code : "ERREUR")
    }
  }

  const ranimer = async (action: Action, f: () => Promise<unknown>) => {
    if (occupe()) return
    setOccupe(action)
    setErreur(undefined)
    try {
      await f()
      await actualiser()
    } catch (e) {
      setErreur(e instanceof ErreurGitApi ? e.code : "ERREUR")
    } finally {
      setOccupe(undefined)
      setConfirmation(undefined)
      setMessage("")
    }
  }

  onMount(() => {
    void actualiser()
    const timer = setInterval(() => void actualiser(), 30_000)
    onCleanup(() => clearInterval(timer))
  })

  // Le bouton est désactivé pendant une action : l'interface reste fluide,
  // seule l'action en cours est bloquée.
  createEffect(() => {
    if (erreur() === "NON_DISPONIBLE") setStatut(undefined)
  })

  return (
    <section class="git-panel" data-etat={etat()} aria-label="Dépôt Git lié">
      <div class="git-head">
        <span class="git-titre">Dépôt</span>
        <span class="git-etat" data-etat={etat()}>
          {ETAT_TEXTE[etat()]}
        </span>
      </div>

      <Show
        when={statut()}
        fallback={
          <div class="git-vide">
            {erreur() === "NON_DISPONIBLE" ? "Jeton local absent" : "Chargement du dépôt…"}
          </div>
        }
      >
        {(s) => (
          <>
            <div class="git-ligne">
              <span class="git-repo" title={s().repo ?? "dépôt local"}>
                {s().repo ?? "dépôt local"}
              </span>
              <span class="git-branche">{s().branch}</span>
            </div>

            <div class="git-ligne git-compteurs">
              <span class="git-pastille" title="Commits en avance">↑{s().ahead}</span>
              <span class="git-pastille" title="Commits en retard">↓{s().behind}</span>
              <span class="git-modifies" title="Fichiers modifiés">{s().modified.length} modifié{s().modified.length > 1 ? "s" : ""}</span>
            </div>

            <Show when={s().lastCommit}>
              {(c) => (
                <div class="git-commit" title={c().sha}>
                  <span class="git-commit-msg">{c().subject}</span>
                  <span class="git-commit-date">{dateRelative(c().date)}</span>
                </div>
              )}
            </Show>

            <div class="git-actions">
              <button
                class="git-bouton"
                title="Récupérer (fetch)"
                aria-label="Récupérer"
                disabled={Boolean(occupe())}
                onClick={() => void ranimer("fetch", () => gitApi.fetch())}
              >
                ⇩
              </button>
              <button
                class="git-bouton"
                title="Mettre à jour (pull fast-forward)"
                aria-label="Mettre à jour"
                disabled={Boolean(occupe()) || s().behind === 0}
                onClick={() => void ranimer("pull", () => gitApi.pull())}
              >
                ⟳
              </button>
              <button
                class="git-bouton"
                classList={{ actif: confirmation() === "commit" }}
                title={confirmation() === "commit" ? "Confirmer le commit" : "Committer les fichiers modifiés"}
                aria-label="Commit"
                disabled={Boolean(occupe()) || confirmation() === "push"}
                onClick={() => {
                  if (confirmation() === "commit") {
                    const msg = message().trim()
                    if (!msg) return
                    void ranimer("commit", () => gitApi.commit(msg, s().modified))
                  } else {
                    setConfirmation("commit")
                  }
                }}
              >
                ✓
              </button>
              <button
                class="git-bouton"
                classList={{ actif: confirmation() === "push" }}
                title={confirmation() === "push" ? "Confirmer le push (jamais de force)" : "Pousser (jamais de force)"}
                aria-label="Pousser"
                disabled={Boolean(occupe()) || confirmation() === "commit"}
                onClick={() => {
                  if (confirmation() === "push") void ranimer("push", () => gitApi.push())
                  else setConfirmation("push")
                }}
              >
                ⇧
              </button>
            </div>

            <Show when={confirmation() === "commit"}>
              <div class="git-confirm">
                <input
                  class="git-message"
                  placeholder="Message du commit"
                  value={message()}
                  onInput={(e) => setMessage(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setConfirmation(undefined)
                  }}
                />
                <button class="git-annuler" title="Annuler" onClick={() => setConfirmation(undefined)}>×</button>
              </div>
            </Show>
            <Show when={confirmation() === "push"}>
              <div class="git-confirm">
                <span class="git-confirm-texte">Pousser vers origin ?</span>
                <button class="git-annuler" title="Annuler" onClick={() => setConfirmation(undefined)}>×</button>
              </div>
            </Show>

            <Show when={erreur()}>
              {(e) => <div class="git-erreur" role="alert">Erreur : {e()}</div>}
            </Show>

            <Show when={s().modified.length > 0}>
              <ul class="git-fichiers">
                <For each={s().modified.slice(0, 5)}>{(f) => <li title={f}>{f}</li>}</For>
              </ul>
            </Show>
          </>
        )}
      </Show>
    </section>
  )
}
