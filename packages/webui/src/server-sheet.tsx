/**
 * Feuille « Server » — panneaux Dépôt et Ressources réunis dans un conteneur.
 *
 * Ce composant est le seul ajout de structure DOM de cette branche : il monte les deux panneaux
 * Solid **existants**, sans les modifier. Aucun style existant n'est réécrit — le CSS du
 * conteneur est isolé dans `server-sheet.css`. Les libellés sont ceux de la maquette.
 */

import { Show } from "solid-js"
import { GitPanel } from "./git-panel"
import RessourcesPanel from "./ressources-panel"
import "./server-sheet.css"

export function ServerSheet(props: { open: boolean; onClose: () => void }) {
  return (
    <Show when={props.open}>
      <div class="server-sheet-scrim" onClick={props.onClose} aria-hidden="true" />
      <aside class="server-sheet" role="dialog" aria-label="Server">
        <header class="server-sheet-head">
          <span class="server-sheet-title">Server</span>
          <button
            type="button"
            class="server-sheet-close"
            aria-label="Close"
            onClick={props.onClose}
          >
            ×
          </button>
        </header>
        <div class="server-sheet-body">
          <GitPanel />
          <RessourcesPanel />
        </div>
      </aside>
    </Show>
  )
}
