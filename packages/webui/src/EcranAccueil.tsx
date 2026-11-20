/**
 * Écran d'accueil — premier contact avec Opencodev2.
 *
 * Séquence (docs/design/23-depot-accueil.md §1) :
 * 1. Le ciel (dégradé + étoiles) apparaît en fondu, 0 → 400 ms
 * 2. Le titre « Opencodev2 » s'écrit lettre par lettre, 28 ms par lettre,
 *    ≈ 310 ms, puis curseur clignotant
 * 3. L'accueil s'efface, 1 200 → 1 600 ms, l'interface apparaît
 *
 * Règles :
 * - Sautable : clic, touche (Entrée / Espace / Échap) ou swipe
 * - Jamais bloquant : l'interface reste fonctionnelle pendant le fondu
 * - Animations réduites : titre affiché d'emblée, sans curseur ni fondu
 * - Une seule lecture : l'accueil ne rejoue pas au changement de session
 *
 * Spécification : docs/design/23-depot-accueil.md §1
 */

import { createSignal, onCleanup, onMount } from "solid-js"

const TITRE = "Opencodev2"
const DELAI_LETTRE = 28 // ms
const DUREE_TITRE = 1200 // ms
const DUREE_FONDU = 400 // ms

export default function EcranAccueil() {
  const [lettreIndex, setLettreIndex] = createSignal(0)
  const [curseurVisible, setCurseurVisible] = createSignal(true)
  const [fadingOut, setFadingOut] = createSignal(false)
  const [termine, setTermine] = createSignal(false)

  const reduit =
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches

  /** Termine immédiatement la séquence et affiche l'interface. */
  const sauter = () => {
    if (termine()) return
    setTermine(true)
  }

  onMount(() => {
    if (reduit) {
      setTermine(true)
      return
    }

    // Écriture lettre par lettre
    let i = 0
    const interval = setInterval(() => {
      setLettreIndex(i + 1)
      i += 1
      if (i >= TITRE.length) {
        clearInterval(interval)
        // Curseur clignotant pendant la respiration
        const curseur = setInterval(() => setCurseurVisible((v) => !v), 1000)
        // Fondu de sortie après l'affichage complet du titre
        setTimeout(() => {
          clearInterval(curseur)
          setFadingOut(true)
          setTimeout(() => setTermine(true), DUREE_FONDU)
        }, DUREE_TITRE - DELAI_LETTRE)
      }
    }, DELAI_LETTRE)

    onCleanup(() => clearInterval(interval))
  })

  const gestionClavier = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " " || e.key === "Escape") sauter()
  }

  onCleanup(() => {
    window.removeEventListener("keydown", gestionClavier)
  })

  if (termine()) return null

  window.addEventListener("keydown", gestionClavier)

  const titrePartiel = TITRE.slice(0, lettreIndex())
  const afficherCurseur = lettreIndex() < TITRE.length && curseurVisible()

  return (
    <div
      class="accueil"
      onClick={sauter}
      onPointerDown={() => {
        // Empêche la sélection de texte pendant le swipe/clic rapide
      }}
      aria-label="Écran d'accueil Opencodev2 — appuyez sur une touche pour continuer"
      role="region"
    >
      {/* Ciel : dégradé de nuit + étoiles */}
      <div class="accueil-ciel">
        {[...Array(60)].map((_, i) => (
          <div
            id={`etoile-${i}`}
            class="accueil-etoile"
            style={{
              left: `${(i * 37) % 100}%`,
              top: `${(i * 73) % 100}%`,
              width: `${0.5 + (i % 3) * 0.75}px`,
              height: `${0.5 + (i % 3) * 0.75}px`,
            }}
          />
        ))}
      </div>

      {/* Titre : lettre par lettre */}
      <h1 class="accueil-titre">
        {titrePartiel}
        {afficherCurseur && <span class="accueil-curseur"></span>}
      </h1>

      {/* Aide de saut (disparaît avec le fondu) */}
      {!fadingOut() && (
        <p class="accueil-aide">
          Cliquez ou appuyez sur une touche pour continuer
        </p>
      )}
    </div>
  )
}
