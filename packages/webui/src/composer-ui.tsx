import { For, Show } from "solid-js"
import { BotIcon, MicIcon, PlusIcon, SendIcon } from "./icons"
import { Picker } from "./picker"
import type { Choice } from "./settings"
import {
  contextFill,
  formatCount,
  formatPercent,
  formatRate,
  tokensPerSecond,
  type SessionStats,
} from "./view-model"

/** La maquette impose ce texte, jus qu'à la ponctuation — y compris le « or sessions » final. */
export const COMPOSER_PLACEHOLDER = "Describe what you want to build. / commands, @ files or sessions"

/**
 * La barre de gestes du composeur. Elle est présentationnelle : tout vient du parent, qui détient
 * les choix réels (API) et les actions (envoi, arrêt, pièces jointes). Le serveur reste la seule
 * source des agents, modèles et variantes — aucun choix n'est codé ici.
 */
export function ComposerControls(props: {
  agents: Choice[]
  agent: string
  onAgentChange: (value: string) => void
  onOpenAgents: () => void
  models: Choice[]
  model: string
  onModelChange: (value: string) => void
  onOpenModels: () => void
  variants: Choice[]
  variant: string
  onVariantChange: (value: string) => void
  working: boolean
  canSend: boolean
  onAttach: (files: FileList | null) => void
  onInterrupt: () => void
}) {
  return (
    <div class="cv-controls">
      <label class="cv-round" title="Attach files">
        <PlusIcon size={15} />
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

      <span class="cv-select cv-select-agent">
        <Picker
          choices={props.agents}
          value={props.agent}
          placeholder="orchestrator"
          label="agent"
          icon={() => <BotIcon size={14} />}
          chevronRight
          compact
          onOpen={props.onOpenAgents}
          onChange={props.onAgentChange}
        />
      </span>

      <span class="cv-spacer" />

      <span class="cv-select cv-select-variant">
        <Picker
          choices={props.variants}
          value={props.variant}
          placeholder="default variant"
          label="variant"
          chevronRight
          compact
          onChange={props.onVariantChange}
        />
      </span>

      <span class="cv-select cv-select-model">
        <Picker
          choices={props.models}
          value={props.model}
          placeholder="default model"
          label="model"
          chevronRight
          compact
          onOpen={props.onOpenModels}
          onChange={props.onModelChange}
        />
      </span>

      {/* Aucune API vocale n'est exposée par le serveur : le geste existe, mais il est désactivé
          et le dit, plutôt que de laisser croire à une saisie qui n'arrivera jamais. */}
      <button
        type="button"
        class="cv-mic"
        aria-label="Voice input"
        title="Voice input is not available"
        disabled
      >
        <MicIcon size={16} />
      </button>

      <button
        type={props.working ? "button" : "submit"}
        class="cv-send"
        classList={{ "is-working": props.working }}
        aria-label={props.working ? "Interrupt" : "Send"}
        title={props.working ? "Interrupt" : "Send"}
        disabled={!props.working && !props.canSend}
        onClick={(event) => {
          if (!props.working) return
          event.preventDefault()
          props.onInterrupt()
        }}
      >
        <Show when={props.working} fallback={<SendIcon size={15} />}>
          <span class="cv-square" aria-hidden="true" />
        </Show>
      </button>
    </div>
  )
}

/** La liste `/` et `@` du champ : même métriques dans l'accueil et dans le fil. */
export function ComposerSuggestions(props: {
  open: boolean
  entries: Array<{ name: string; detail?: string }>
  active: number
  label: string
  onPick: (index: number) => void
  onHover: (index: number) => void
}) {
  return (
    <Show when={props.open && props.entries.length > 0}>
      <div class="suggest" role="listbox" aria-label={props.label}>
        <For each={props.entries}>
          {(entry, index) => (
            <button
              type="button"
              class="suggest-row"
              classList={{ "is-active": props.active === index() }}
              role="option"
              aria-selected={props.active === index()}
              onMouseEnter={() => props.onHover(index())}
              onClick={() => props.onPick(index())}
            >
              <span class="suggest-name">{entry.name}</span>
              <Show when={entry.detail}>{(detail) => <span class="suggest-detail">{detail()}</span>}</Show>
            </button>
          )}
        </For>
      </div>
    </Show>
  )
}

/**
 * La barre d'état sous le champ. Les chiffres sont ceux de la session courante ; quand la mesure
 * manque, on affiche « — » plutôt qu'un zéro qui dirait une chose fausse.
 */
export function ComposerStatusBar(props: {
  agent: string
  model: string
  variant: string
  stats: SessionStats
  contextLimit?: number
  working: boolean
  onInterrupt: () => void
  onTagFiles: () => void
  onCommands: () => void
}) {
  const tokens = () => formatCount(props.stats.contextTokens) ?? "—"
  const limit = () => formatCount(props.contextLimit) ?? "—"
  const percent = () => formatPercent(contextFill(props.stats.contextTokens, props.contextLimit)) ?? "—%"
  const rate = () => formatRate(tokensPerSecond(props.stats)) ?? "— tok/s"
  const agent = () => props.agent || "default agent"
  const model = () => props.model || "default model"
  const variant = () => props.variant || "default variant"

  return (
    <div class="cv-status" role="status" aria-live="polite">
      <Show
        when={props.working}
        fallback={
          <>
            <span>
              <b>{agent()}</b> · {model()} · {variant()}
            </span>
            <span>
              {tokens()} / {limit()} ({percent()})
            </span>
          </>
        }
      >
        <button type="button" class="cv-status-hint" onClick={props.onInterrupt}>
          <kbd>esc</kbd> interrupt
        </button>
        <span>
          <kbd>enter</kbd> queue
        </span>
        <span>
          <kbd>alt+s</kbd> steer
        </span>
      </Show>
      <span class="cv-spacer" />
      <span>{rate()}</span>
      <button type="button" class="cv-status-button" onClick={props.onTagFiles}>
        @ tag files
      </button>
      <button type="button" class="cv-status-button" onClick={props.onCommands}>
        ctrl+p commands
      </button>
    </div>
  )
}
