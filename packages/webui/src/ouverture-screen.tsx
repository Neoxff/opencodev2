import { createSignal, For, onCleanup, Show } from "solid-js"
import { fileSizeLabel, isImageMime, type Attachment } from "./attachments"
import { ComposerMarkup, FileChip } from "./components"
import { PlusIcon, SendIcon } from "./icons"
import { DUREE, reduitMouvement } from "./motion"
import { motsDuMotto, type Motto } from "./ouverture"
import { FolderPicker, Picker } from "./picker"
import type { Choice } from "./settings"
import type { ProjectRef, SessionSummary } from "./sessions"
import "./ouverture.css"

/** Deux glyphes primitifs, dans la même grammaire que les icônes du projet (14 px, trait fin). */
function SparkIcon() {
  return (
    <svg class="ouv-ico" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3l1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7z" />
      <path d="M19 16l.6 1.9 1.9.6-1.9.6L19 21l-.6-1.9-1.9-.6 1.9-.6z" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg class="ouv-ico" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  )
}

/**
 * Écran d'ouverture — traduction de la maquette validée
 * `docs/design/maquette-opencodev2-ui.html` (blocs « Écran d'ouverture »,
 * « Composeur », `hello()`, `welcome()`).
 *
 * Composant de présentation : il ne charge aucune donnée et ne choisit pas le mot
 * d'ordre — les deux sont calculés par l'app et passés en props. Il n'y a donc
 * aucun appel réseau ici, y compris pour l'affichage du mot d'ordre.
 *
 * Les puces de reprise viennent **uniquement** des vraies sessions reçues par
 * l'app. Sans session, l'état vide est dit, jamais simulé.
 */
export type OpeningProps = {
  salutation: string
  motto: Motto
  sessions: SessionSummary[]
  onResume: (session: SessionSummary) => void
  draft: string
  onDraft: (value: string) => void
  onSubmit: () => void
  attachments: Attachment[]
  attachError?: string
  onAttach: (files: FileList | null) => void
  onRemoveAttachment: (id: string) => void
  directory: string
  projects: ProjectRef[]
  serverPath?: string
  onDirectoryChange: (path: string) => void
  modelOptions: Choice[]
  agentOptions: Choice[]
  composerModel: string
  composerAgent: string
  onModelChange: (value: string) => void
  onAgentChange: (value: string) => void
  onModelOpen: () => void
  onAgentOpen: () => void
}

/** Nombre de puces de reprise : au-delà, la ligne devient une liste à faire défiler. */
const RESUME_LIMIT = 3

export function OpeningScreen(props: OpeningProps) {
  /** Vrai entre l'envoi et la création de la session : le dock descend, l'accueil s'efface. */
  const [descending, setDescending] = createSignal(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  onCleanup(() => {
    if (timer !== undefined) clearTimeout(timer)
  })

  const words = () => motsDuMotto(props.motto[0])
  const resumeSessions = () => props.sessions.slice(0, RESUME_LIMIT)

  /**
   * Un envoi ** descend ** le composeur avant de créer la session : l'animation
   * porte sur `transform` et `opacity` seulement (docs/design/21-animations.md),
   * et sa durée vient du token `normal`. Sous `prefers-reduced-motion`, l'envoi
   * est immédiat — aucun mouvement, aucun délai.
   */
  const submit = (event: SubmitEvent) => {
    event.preventDefault()
    if (descending()) return
    if (!props.draft.trim() && props.attachments.length === 0) return
    setDescending(true)
    timer = setTimeout(() => {
      timer = undefined
      setDescending(false)
      props.onSubmit()
    }, reduitMouvement.get() ? 0 : DUREE.normal)
  }

  return (
    <div class="ouv" classList={{ "ouv--descending": descending() }}>
      <div class="ouv-welcome">
        <div class="ouv-hello">
          <SparkIcon />
          <span>{props.salutation}</span>
        </div>
        <h2 class="ouv-motto">
          <For each={words()}>
            {(word, index) => (
              <>
                <span class="ouv-word" style={{ "--k": String(index()) }}>
                  {word}
                </span>{" "}
              </>
            )}
          </For>
        </h2>
        <div class="ouv-rule" />
        <p class="ouv-sub">{props.motto[1]}</p>
        <div class="ouv-stamp">
          <span>
            <kbd>/</kbd>commands
          </span>
          <span>
            <kbd>@</kbd>files
          </span>
          <span>
            <kbd>enter</kbd>send
          </span>
        </div>
      </div>

      <div class="ouv-dock">
        <form class="ouv-compose" onSubmit={submit}>
          <div class="ouv-folder">
            <FolderPicker
              folders={props.projects.map((project) => (typeof project === "string" ? project : project.path))}
              value={props.directory}
              placeholder={props.serverPath}
              label="Working directory — the new session joins this project"
              onChange={props.onDirectoryChange}
            />
          </div>

          <Show when={props.attachments.length > 0}>
            <ul class="ouv-pending">
              <For each={props.attachments}>
                {(item) => (
                  <li>
                    <FileChip
                      label={item.filename}
                      thumb={isImageMime(item.mime) ? item.dataUrl : undefined}
                      size={fileSizeLabel(item.size)}
                      onRemove={() => props.onRemoveAttachment(item.id)}
                    />
                  </li>
                )}
              </For>
            </ul>
          </Show>
          <Show when={props.attachError}>{(message) => <p class="ouv-error">{message()}</p>}</Show>

          {/* Les deux classes du champ sont celles du compositeur : le calque markdown n'est aligné
              avec le curseur que parce que les deux partagent leurs métriques. */}
          <div class="composer-field">
            <ComposerMarkup text={props.draft} />
            <textarea
              class="composer-input"
              rows="2"
              placeholder="Describe what you want to build. / commands, @ files or sessions"
              aria-label="Message"
              value={props.draft}
              onInput={(event) => props.onDraft(event.currentTarget.value)}
            />
          </div>

          <div class="ouv-ctl">
            <label class="ouv-round" title="Attach files">
              <PlusIcon size={14} />
              <input
                class="hidden-input"
                type="file"
                multiple
                aria-label="Attach files"
                onChange={(event) => {
                  props.onAttach(event.currentTarget.files)
                  // Remis à zéro pour qu'attacher deux fois le même fichier soit possible.
                  event.currentTarget.value = ""
                }}
              />
            </label>
            <Picker
              choices={props.agentOptions}
              value={props.composerAgent}
              placeholder="Default agent"
              label="agent"
              onOpen={props.onAgentOpen}
              onChange={props.onAgentChange}
            />
            <span class="ouv-sp" />
            <Picker
              choices={props.modelOptions}
              value={props.composerModel}
              placeholder="Default model"
              label="model"
              onOpen={props.onModelOpen}
              onChange={props.onModelChange}
            />
            <button
              class="ouv-send"
              type="submit"
              title="Send"
              aria-label="Send"
              disabled={!props.draft.trim() && props.attachments.length === 0}
            >
              <SendIcon />
            </button>
          </div>
        </form>

        <div class="ouv-chips" aria-label="Resume a session">
          <Show
            when={resumeSessions().length > 0}
            fallback={<p class="ouv-chip-empty">No recent session — write above to start one.</p>}
          >
            <For each={resumeSessions()}>
              {(session) => (
                <button class="ouv-chip" type="button" onClick={() => props.onResume(session)}>
                  <ClockIcon />
                  <span>Resume · {session.title || "(untitled)"}</span>
                </button>
              )}
            </For>
          </Show>
        </div>
      </div>
    </div>
  )
}
