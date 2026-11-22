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
  libelleErreur,
  type EntreeJournal,
  type GitEtat,
  type GitStatus,
  type ReglagesAuto,
} from "./git-client"
import { libelleErreurLocal, t, type Cle, type Langue } from "./git-i18n"
import "./git-panel.css"

type Action = "fetch" | "pull" | "commit" | "push"

/** Langue par défaut « fr » : préserve les libellés des tests existants. */
export function GitPanel(props: { lang?: Langue } = {}) {
  const langue = () => props.lang ?? "fr"
  const tr = (cle: Cle) => t(langue(), cle)
  const etatTexte = (etat: GitEtat) => tr(`etat.${etat}` as Cle)
  const [statut, setStatut] = createSignal<GitStatus>()
  const [erreur, setErreur] = createSignal<string>()
  const [occupe, setOccupe] = createSignal<Action>()
  const [confirmation, setConfirmation] = createSignal<Action>()
  const [message, setMessage] = createSignal("")
  const [reglages, setReglages] = createSignal<ReglagesAuto>()
  const [journal, setJournal] = createSignal<EntreeJournal[]>([])
  const [autoOuvert, setAutoOuvert] = createSignal(false)

  const chargerAuto = async () => {
    try {
      const [r, j] = await Promise.all([gitApi.reglagesAuto(), gitApi.journal()])
      setReglages(r)
      setJournal(j)
    } catch {
      // L'API auto est facultative : on ne casse pas le panneau principal.
    }
  }

  const basculerReglage = async (cle: keyof ReglagesAuto) => {
    const r = reglages()
    if (!r) return
    const miseAJour = { ...r, [cle]: !r[cle] }
    try {
      setReglages(await gitApi.enregistrerReglagesAuto(miseAJour))
      void chargerAuto()
    } catch {
      // On laisse l'état inchangé en cas d'échec.
    }
  }

  const annulerAction = async (id: string) => {
    try {
      await gitApi.annuler(id)
      await Promise.all([chargerAuto(), actualiser()])
    } catch (e) {
      setErreur(e instanceof ErreurGitApi ? e.code : "ERREUR")
    }
  }

  const etat = () => etatDepot(statut(), erreur())

  /**
   * Erreur affichable dans son propre bloc. `NON_DISPONIBLE` est écarté : il a déjà son
   * libellé court (« Jeton local absent »), inutile de lui ajouter une action.
   */
  const erreurVisible = () => {
    const e = erreur()
    return e && e !== "NON_DISPONIBLE" ? e : undefined
  }

  /** Message d'erreur + action « Réessayer » — une seule source, deux emplacements possibles. */
  const blocErreur = (code: string | undefined) =>
    code === undefined ? null : (
      <div class="git-erreur" role="alert">
        <span class="git-erreur-message">{libelleErreur(code)}</span>
        <button
          class="git-erreur-action"
          title="Réessayer (actualiser l'état)"
          aria-label="Réessayer"
          onClick={() => void actualiser()}
        >
          ↻
        </button>
      </div>
    )

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
    <section
      class="git-panel"
      data-etat={etat()}
      aria-label={tr("panel.aria")}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setConfirmation(undefined)
          setAutoOuvert(false)
          setMessage("")
        }
      }}
    >
      <div class="git-head">
        <span class="git-titre">{tr("panel.titre")}</span>
        <span class="git-etat" data-etat={etat()}>
          {etatTexte(etat())}
        </span>
      </div>

      <Show
        when={statut()}
        fallback={
          erreurVisible() ? (
            blocErreur(erreurVisible())
          ) : (
            <div class="git-vide">
              {erreur() === "NON_DISPONIBLE" ? "Jeton local absent" : "Chargement du dépôt…"}
            </div>
          )
          <Show when={erreur()} fallback={<div class="git-vide">Chargement du dépôt…</div>}>
            {(e) => (
              <div class="git-erreur" role="alert">
                <span class="git-erreur-message">
                  {e() === "NON_DISPONIBLE" ? "Jeton local absent" : libelleErreur(e())}
                </span>
                <button
                  class="git-erreur-action"
                  title="Réessayer (actualiser l'état)"
                  aria-label="Réessayer"
                  onClick={() => void actualiser()}
                >
                  ↻
                </button>
              </div>
            )}
          </Show>
          <div class="git-vide">
            {erreur() === "NON_DISPONIBLE" ? tr("vide.jeton") : tr("vide.chargement")}
          </div>
        }
      >
        {(s) => (
          <>
            <div class="git-ligne">
              <span class="git-repo" title={s().repo ?? tr("repo.local")}>
                {s().repo ?? tr("repo.local")}
              </span>
              <span class="git-branche" title="Branche courante">{s().branch}</span>
            </div>

            <div class="git-ligne git-compteurs">
              <span class="git-pastille" title={tr("compteurs.avance")}>↑{s().ahead}</span>
              <span class="git-pastille" title={tr("compteurs.retard")}>↓{s().behind}</span>
              <span class="git-modifies" title={tr("compteurs.modifies")}>{s().modified.length} {tr("compteurs.modifie")}{s().modified.length > 1 ? "s" : ""}</span>
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
                title={tr("action.fetch.titre")}
                aria-label={tr("action.fetch.aria")}
                disabled={Boolean(occupe())}
                onClick={() => void ranimer("fetch", () => gitApi.fetch())}
              >
                ⇩
              </button>
              <button
                class="git-bouton"
                title={tr("action.pull.titre")}
                aria-label={tr("action.pull.aria")}
                disabled={Boolean(occupe()) || s().behind === 0}
                onClick={() => void ranimer("pull", () => gitApi.pull())}
              >
                ⟳
              </button>
              <button
                class="git-bouton"
                classList={{ actif: confirmation() === "commit" }}
                title={confirmation() === "commit" ? tr("action.commit.confirmer") : tr("action.commit.titre")}
                aria-label={tr("action.commit.aria")}
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
                title={confirmation() === "push" ? tr("action.push.confirmer") : tr("action.push.titre")}
                aria-label={tr("action.push.aria")}
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
                  placeholder={tr("confirm.message")}
                  value={message()}
                  onInput={(e) => setMessage(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setConfirmation(undefined)
                  }}
                />
                <button class="git-annuler" title={tr("confirm.annuler")} onClick={() => setConfirmation(undefined)}>×</button>
              </div>
            </Show>
            <Show when={confirmation() === "push"}>
              <div class="git-confirm">
                <span class="git-confirm-texte">{tr("confirm.push")}</span>
                <button class="git-annuler" title={tr("confirm.annuler")} onClick={() => setConfirmation(undefined)}>×</button>
              </div>
            </Show>

            <Show when={erreurVisible()}>{(e) => blocErreur(e())}</Show>
            <Show when={erreur()}>
              {(e) => (
                <div class="git-erreur" role="alert">
                  <span class="git-erreur-message">{libelleErreurLocal(e(), langue(), libelleErreur(e()))}</span>
                  <button
                    class="git-erreur-action"
                    title={tr("erreur.reessayer.titre")}
                    aria-label={tr("erreur.reessayer.aria")}
                    onClick={() => void actualiser()}
                  >
                    ↻
                  </button>
                </div>
              )}
            </Show>

            <Show when={s().modified.length > 0}>
              <ul class="git-fichiers">
                <For each={s().modified.slice(0, 5)}>{(f) => <li title={f}>{f}</li>}</For>
              </ul>
            </Show>
          </>
        )}
      </Show>

      {/* Automatisme local — désactivé par défaut, réglages et journal hors Git. */}
      <div class="git-auto">
        <button
          class="git-auto-titre"
          aria-expanded={autoOuvert()}
          onClick={() => {
            setAutoOuvert(!autoOuvert())
            if (!autoOuvert()) void chargerAuto()
          }}
        >
          {tr("auto.titre")} {autoOuvert() ? "▾" : "▸"}
        </button>
        <Show when={autoOuvert()}>
          <Show when={reglages()}>
            {(r) => (
              <ul class="git-reglages">
                <li>
                  <label>
                    <input
                      type="checkbox"
                      checked={r().fetchAuDemarrage}
                      onChange={() => void basculerReglage("fetchAuDemarrage")}
                    />
                    {tr("auto.reglage.fetch")}
                  </label>
                </li>
                <li>
                  <label>
                    <input
                      type="checkbox"
                      checked={r().commitAuto}
                      onChange={() => void basculerReglage("commitAuto")}
                    />
                    {tr("auto.reglage.commit")}
                  </label>
                </li>
                <li>
                  <label>
                    <input
                      type="checkbox"
                      checked={r().pushAuto}
                      onChange={() => void basculerReglage("pushAuto")}
                    />
                    {tr("auto.reglage.push")}
                  </label>
                </li>
              </ul>
            )}
          </Show>
          <Show when={journal().length > 0}>
            <ul class="git-journal">
              <For each={journal().slice(0, 8)}>
                {(e) => (
                  <li data-statut={e.statut} title={e.detail ?? e.message ?? e.branche}>
                    <span class="git-journal-action">{e.action}</span>
                    <span class="git-journal-branche">{e.branche}</span>
                    <span class="git-journal-date">{dateRelative(e.date)}</span>
                    <Show when={e.statut === "ok" && e.action !== "fetch" && e.action !== "annulation"}>
                      <button
                        class="git-journal-annuler"
                        title={tr("auto.journal.annuler")}
                        onClick={() => void annulerAction(e.id)}
                      >
                        ↶
                      </button>
                    </Show>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </Show>
      </div>
    </section>
  )
}
