/**
 * Le visible des commandes de session : les lignes skill/MCP du fil et les dialogues.
 *
 * Tout est branché sur les décisions de `session-commands` : une ligne porte le nom réellement
 * invoqué et son statut ; aucun exemple n'est écrit ici. Les dialogues sont des éléments
 * accessibles (role=dialog, focus au premier champ, Échap pour annuler) — aucun `window.confirm`.
 */

import { For, Show } from "solid-js"
import { activityText, type CommandActivity } from "./session-commands"

/** Les lignes d'activité, rendues après les tours du fil. */
export function CommandActivityLines(props: { activities: CommandActivity[] }) {
  return (
    <For each={props.activities}>
      {(activity) => (
        <div class="cmd-activity" data-kind={activity.kind} data-status={activity.status}>
          <span class="cmd-activity-kind">{activity.kind}</span>
          <span class="cmd-activity-name">{activityText(activity)}</span>
          <span class="cmd-activity-status">{activity.status}</span>
        </div>
      )}
    </For>
  )
}

export type CommandDialogState =
  | { kind: "rename"; sessionID: string; value: string }
  | { kind: "exit" }
  | { kind: "delete"; sessionID: string; title: string }
  | { kind: "editor"; value: string }

export type CommandDialogProps = {
  dialog: CommandDialogState | undefined
  onClose: () => void
  onRename: (sessionID: string, title: string) => void
  onExit: () => void
  onDelete: (sessionID: string) => void
  onEditorSave: (text: string) => void
}

/** Un scrim + une boîte ; le focus entre dans le champ à l'ouverture. */
export function SessionCommandDialogs(props: CommandDialogProps) {
  const cancel = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault()
      event.stopPropagation()
      props.onClose()
    }
  }

  return (
    <Show when={props.dialog}>
      {(dialog) => (
        <div class="cmd-dialog-scrim" onClick={() => props.onClose()}>
          <div
            class="cmd-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={dialog().kind}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={cancel}
          >
            <Show when={dialog().kind === "rename"}>
              {(() => {
                const state = dialog() as Extract<CommandDialogState, { kind: "rename" }>
                let field: HTMLInputElement | undefined
                queueMicrotask(() => field?.select())
                const commit = () => {
                  const title = (field?.value ?? state.value).trim()
                  if (title) props.onRename(state.sessionID, title)
                  props.onClose()
                }
                return (
                  <>
                    <h3 class="cmd-dialog-title">Rename session</h3>
                    <input
                      class="cmd-dialog-field"
                      ref={(element) => (field = element)}
                      aria-label="Session title"
                      value={state.value}
                      autofocus
                      onKeyDown={(event) => {
                        if (event.key === "Enter") commit()
                      }}
                    />
                    <div class="cmd-dialog-actions">
                      <button class="cmd-dialog-button" onClick={() => props.onClose()}>
                        Cancel
                      </button>
                      <button class="cmd-dialog-button primary" onClick={commit}>
                        Rename
                      </button>
                    </div>
                  </>
                )
              })()}
            </Show>

            <Show when={dialog().kind === "exit"}>
              <h3 class="cmd-dialog-title">Exit OpenCodev2?</h3>
              <p class="cmd-dialog-message">The current session view will be closed.</p>
              <div class="cmd-dialog-actions">
                <button class="cmd-dialog-button" onClick={() => props.onClose()} autofocus>
                  Cancel
                </button>
                <button class="cmd-dialog-button danger" onClick={() => props.onExit()}>
                  Exit
                </button>
              </div>
            </Show>

            <Show when={dialog().kind === "delete"}>
              {(() => {
                const state = dialog() as Extract<CommandDialogState, { kind: "delete" }>
                return (
                  <>
                    <h3 class="cmd-dialog-title">Delete session?</h3>
                    <p class="cmd-dialog-message">
                      « {state.title || state.sessionID} » will be removed from the server.
                    </p>
                    <div class="cmd-dialog-actions">
                      <button class="cmd-dialog-button" onClick={() => props.onClose()} autofocus>
                        Cancel
                      </button>
                      <button class="cmd-dialog-button danger" onClick={() => props.onDelete(state.sessionID)}>
                        Delete
                      </button>
                    </div>
                  </>
                )
              })()}
            </Show>

            <Show when={dialog().kind === "editor"}>
              {(() => {
                const state = dialog() as Extract<CommandDialogState, { kind: "editor" }>
                let area: HTMLTextAreaElement | undefined
                queueMicrotask(() => area?.focus())
                const commit = () => props.onEditorSave(area?.value ?? state.value)
                return (
                  <>
                    <h3 class="cmd-dialog-title">Editor</h3>
                    <p class="cmd-dialog-message">Edit the current draft. No shell is started.</p>
                    <textarea
                      class="cmd-dialog-area"
                      ref={(element) => (area = element)}
                      aria-label="Draft editor"
                      value={state.value}
                      rows="10"
                      autofocus
                    />
                    <div class="cmd-dialog-actions">
                      <button class="cmd-dialog-button" onClick={() => props.onClose()}>
                        Cancel
                      </button>
                      <button class="cmd-dialog-button primary" onClick={commit}>
                        Save
                      </button>
                    </div>
                  </>
                )
              })()}
            </Show>
          </div>
        </div>
      )}
    </Show>
  )
}
