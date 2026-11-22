/**
 * Compteur FPS discret — bouton « Afficher les performances ».
 *
 * Le compteur sous-jacent ne planifie aucune image et n'instancie aucun
 * observateur tant qu'il est désactivé : le coût au repos est nul. Le bouton
 * porte le libellé exact de la spécification (docs/design/21-animations.md § Contrôle).
 */
import { createSignal, onCleanup, Show } from "solid-js"
import { createCompteurFps, type MesureFps } from "./performances"

const VIDE: MesureFps = { actif: false, images: 0, fps: 0, longuesTaches: 0, pireTacheMs: 0 }

export function CompteurFps() {
  const compteur = createCompteurFps()
  const [actif, setActif] = createSignal(false)
  const [mesure, setMesure] = createSignal<MesureFps>(VIDE)
  let minuteur: ReturnType<typeof setInterval> | undefined

  const basculer = () => {
    if (actif()) {
      compteur.desactiver()
      if (minuteur !== undefined) clearInterval(minuteur)
      minuteur = undefined
      setMesure(VIDE)
      setActif(false)
      return
    }
    compteur.activer()
    setActif(true)
    setMesure(compteur.lire())
    minuteur = setInterval(() => setMesure(compteur.lire()), 500)
  }

  onCleanup(() => {
    compteur.desactiver()
    if (minuteur !== undefined) clearInterval(minuteur)
  })

  return (
    <div class="compteur-fps">
      <button
        type="button"
        class="compteur-fps-bouton"
        aria-pressed={actif()}
        onClick={basculer}
      >
        {actif() ? "Masquer les performances" : "Afficher les performances"}
      </button>
      <Show when={actif()}>
        <span class="compteur-fps-valeur" aria-live="off">
          {mesure().fps} i/s · {mesure().longuesTaches} tâche{mesure().longuesTaches > 1 ? "s" : ""} &gt; 50 ms
        </span>
      </Show>
    </div>
  )
}
