/**
 * Onglet Config — éditeur de la configuration réelle.
 *
 * Le composant est **contrôlé** : il ne possède ni la donnée ni l'écriture. Le conteneur fournit le
 * texte déjà masqué (`source`) et les callbacks ; ici on ne fait que rendre, valider et signaler.
 * C'est ce qui rend le composant montable seul dans un test, sans serveur ni SDK.
 *
 * Trois états explicites : chargement, erreur, vide — plus l'état normal. Un champ avec une valeur
 * invalide est signalé au lecteur d'écran (`aria-invalid`, `aria-describedby`) et le focus va au
 * premier champ en erreur au moment de l'enregistrement.
 */

import { createMemo, For, Show } from "solid-js"
import { SECRET_MASK, parseConfigText, validateConfig, type ValidationIssue } from "./config-editor"
import "./config-logs.css"

export type ConfigTabProps = {
  /** Texte JSON déjà projeté par `configSource` — aucun secret ne doit s'y trouver. */
  source: string
  onSource: (value: string) => void
  /** Configuration d'origine, masquée également — sert à ne pas réécrire ce qui n'a pas changé. */
  original: Record<string, unknown>
  loading: boolean
  error?: string
  notice?: string
  busy?: boolean
  onSave: () => void
  onReload: () => void
}

export function ConfigTab(props: ConfigTabProps) {
  const parsed = createMemo(() => parseConfigText(props.source))
  const issues = createMemo<ValidationIssue[]>(() => {
    const current = parsed()
    if (current.error) return [{ path: "JSON", message: current.error }]
    return validateConfig(current.value ?? {})
  })
  const empty = createMemo(() => props.source.trim() === "" || props.source.trim() === "{}")
  const valid = createMemo(() => issues().length === 0 && !props.loading)

  let field!: HTMLTextAreaElement

  const save = () => {
    if (!valid()) {
      field?.focus()
      return
    }
    props.onSave()
  }

  return (
    <section class="cl-config" aria-labelledby="cl-config-title">
      <header class="cl-head">
        <div class="cl-head-text">
          <h2 id="cl-config-title" class="cl-title">
            opencodev2.config.json
          </h2>
          <p class="cl-sub">
            live configuration · <code>/global/config</code>
          </p>
        </div>
        <div class="cl-head-actions">
          <button type="button" class="cl-btn" onClick={props.onReload} disabled={props.loading}>
            Reload
          </button>
          <button type="button" class="cl-btn cl-btn-primary" onClick={save} disabled={!valid() || props.busy}>
            {props.busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </header>

      <p class="cl-note" role="note">
        Secrets are hidden as <code>{SECRET_MASK}</code> and are never written back. Link keys (
        <code>repo</code>, <code>defaultBranch</code>, <code>port</code>, <code>workspace</code>) are
        validated with the server rules.
      </p>

      <Show when={props.error}>
        {(message) => (
          <p class="cl-alert cl-alert-error" role="alert">
            {message()}
          </p>
        )}
      </Show>
      <Show when={props.notice}>
        {(message) => (
          <p class="cl-alert cl-alert-ok" role="status">
            {message()}
          </p>
        )}
      </Show>

      <Show when={props.loading} fallback={
        <Show when={empty()} fallback={
          <>
            <label class="cl-label" for="cl-config-source">
              Configuration (JSON)
            </label>
            <textarea
              ref={field}
              id="cl-config-source"
              class="cl-editor"
              classList={{ "cl-invalid": issues().length > 0 }}
              spellcheck={false}
              aria-invalid={issues().length > 0}
              aria-describedby="cl-config-issues"
              value={props.source}
              onInput={(event) => props.onSource(event.currentTarget.value)}
            />
            <div id="cl-config-issues" class="cl-issues" aria-live="polite">
              <Show when={issues().length > 0} fallback={<span class="cl-ok">Valid configuration.</span>}>
                <ul>
                  <For each={issues()}>
                    {(issue) => (
                      <li>
                        <code>{issue.path}</code> — {issue.message}
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </div>
          </>
        }>
          <p class="cl-empty">No configuration values were returned by the server.</p>
        </Show>
      }>
        <p class="cl-empty" aria-busy="true">Loading configuration…</p>
      </Show>
    </section>
  )
}
