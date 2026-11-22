/**
 * Les raccourcis clavier de la webui — purs, donc testables sans navigateur.
 *
 * Deux raisons de tenir ce module à part :
 *   1. une décision se vérifie par un test, pas par une capture — le choix du raccourci, des
 *      modificateurs autorisés et du `preventDefault` est une décision ;
 *   2. le conflit avec le navigateur doit être **écrit**, pas subi : `ctrl+p` imprime, `ctrl+r`
 *      recharge, `ctrl+d` ajoute un favori. On les écrase volontairement, et le registre dit
 *      pourquoi. Les raccourcis sans conflit ne touchent pas à l'événement.
 *
 * Les actions, elles, ne sont pas ici : ce module ne connaît ni session ni client. Il ne sait que
 * reconnaître une frappe et dire ce qu'elle veut faire. L'intégration (`app.tsx`) branche les ids sur
 * les vraies actions/API.
 */

/** Les actions que le clavier peut demander — jamais une donnée de démonstration. */
export type ShortcutId =
  | "palette"
  | "newSession"
  | "renameSession"
  | "deleteSession"
  | "interrupt"
  | "queue"
  | "steer"

/**
 * Portée d'un raccourci.
 *
 * `global` est branché sur `window` ; `composer` est branché sur la zone de saisie. `Entrée` reste
 * dans le champ : un `Entrée` global intercepterait les boutons, les champs de recherche et les
 * dialogues, où il a déjà un sens.
 */
export type ShortcutScope = "global" | "composer"

/** L'état normalisé d'une frappe — la forme que les tests construisent sans DOM. */
export type KeyState = {
  /** `KeyboardEvent.key`, en minuscules pour les lettres. */
  key: string
  /**
   * `KeyboardEvent.code`. Une lettre suffit normalement, mais `Alt+N` produit `˜` sur un clavier
   * français : le code physique (`KeyN`) est alors le seul moyen fiable de reconnaître la touche.
   */
  code?: string
  ctrlKey: boolean
  altKey: boolean
  metaKey: boolean
  shiftKey: boolean
}

/** Ce qu'on affiche dans l'aide et ce qu'on vérifie dans les tests. */
export type ShortcutSpec = {
  id: ShortcutId
  keys: string
  label: string
  scope: ShortcutScope
  /** Le raccourci navigateur écrasé, s'il y en a un. */
  browserConflict?: string
  /** On n'appelle `preventDefault` que si le navigateur ferait autre chose à la place. */
  preventDefault: boolean
  reason: string
}

/**
 * L'ordre est celui de l'aide (maquette `maquette-opencodev2-ui.html`, fonction `help`).
 * Chaque entrée est unique : deux raccourcis pour la même frappe seraient une ambiguïté, pas une
 * fonctionnalité.
 */
export const SHORTCUTS: readonly ShortcutSpec[] = [
  {
    id: "palette",
    keys: "ctrl+p",
    label: "Palette de commandes",
    scope: "global",
    browserConflict: "Imprimer la page",
    preventDefault: true,
    reason: "Ctrl+P imprime dans tous les navigateurs ; on écrase volontairement pour ouvrir la palette.",
  },
  {
    id: "newSession",
    keys: "alt+n",
    label: "Nouvelle session",
    scope: "global",
    preventDefault: false,
    reason: "Alt+N n'a pas de raccourci navigateur standard : l'événement reste intact.",
  },
  {
    id: "renameSession",
    keys: "ctrl+r",
    label: "Renommer la session courante",
    scope: "global",
    browserConflict: "Recharger la page",
    preventDefault: true,
    reason: "Ctrl+R recharge ; sans preventDefault la page partirait avant le renommage.",
  },
  {
    id: "deleteSession",
    keys: "ctrl+d",
    label: "Supprimer la session courante (confirmation)",
    scope: "global",
    browserConflict: "Ajouter un favori",
    preventDefault: true,
    reason: "Ctrl+D ouvre la boîte de favori ; sans preventDefault la suppression serait masquée.",
  },
  {
    id: "interrupt",
    keys: "esc",
    label: "Interrompre l'agent",
    scope: "global",
    preventDefault: false,
    reason: "Échap n'a pas de conflit navigateur ici ; il ferme d'abord les calques, puis interrompt.",
  },
  {
    id: "queue",
    keys: "enter",
    label: "Mettre le message en file pendant le travail",
    scope: "composer",
    preventDefault: true,
    reason: "Dans le champ, Entrée envoie le message au lieu d'ajouter une ligne ; Maj+Entrée reste le retour à la ligne.",
  },
  {
    id: "steer",
    keys: "alt+s",
    label: "Injecter la consigne dans le tour en cours",
    scope: "global",
    preventDefault: false,
    reason: "Alt+S n'est pas un raccourci navigateur (Ctrl+S sauvegarde) : l'événement reste intact.",
  },
]

/** La fiche d'un raccourci. Une id inconnue est une erreur de programmation, pas un fallback silencieux. */
export function shortcut(id: ShortcutId): ShortcutSpec {
  const found = SHORTCUTS.find((spec) => spec.id === id)
  if (!found) throw new Error(`Raccourci inconnu : ${id}`)
  return found
}

/** Une touche lettre se reconnaît par `key` ou, sous Alt, par le code physique. */
function isLetter(state: KeyState, expected: string): boolean {
  if (state.key.length === 1 && state.key.toLowerCase() === expected) return true
  return state.code === `Key${expected.toUpperCase()}`
}

/**
 * La fiche correspondant à une frappe, dans une portée donnée — ou `undefined`.
 *
 * On exige des modificateurs **exact** : `Ctrl+Maj+P` n'est pas `Ctrl+P`, et Cmd n'est jamais
 * intercepté (les raccourcis système de macOS restent au système). C'est ce qui évite de voler une
 * combinaison que l'utilisateur destinait à autre chose.
 */
export function matchShortcut(state: KeyState, scope: ShortcutScope): ShortcutSpec | undefined {
  if (state.metaKey || state.shiftKey) return undefined
  const { ctrlKey: ctrl, altKey: alt } = state
  if (scope === "composer") {
    if (!ctrl && !alt && state.key === "Enter") return shortcut("queue")
    return undefined
  }
  if (ctrl && !alt) {
    if (isLetter(state, "p")) return shortcut("palette")
    if (isLetter(state, "r")) return shortcut("renameSession")
    if (isLetter(state, "d")) return shortcut("deleteSession")
  }
  if (alt && !ctrl) {
    if (isLetter(state, "n")) return shortcut("newSession")
    if (isLetter(state, "s")) return shortcut("steer")
  }
  if (!ctrl && !alt && state.key === "Escape") return shortcut("interrupt")
  return undefined
}

/** Le projet d'une vraie frappe du navigateur vers la forme pure du module. */
export function keyState(event: {
  key: string
  code?: string
  ctrlKey: boolean
  altKey: boolean
  metaKey: boolean
  shiftKey: boolean
}): KeyState {
  return {
    key: event.key.length === 1 ? event.key.toLowerCase() : event.key,
    ...(event.code ? { code: event.code } : {}),
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
  }
}

/**
 * Ce qu'un envoi devient. Le serveur porte le steer dans les métadonnées de la partie texte
 * (`metadata.steer = true`) — vérifié dans `packages/opencode/src/session/prompt-queue.ts` et
 * `.../prompt.ts`, et identique au TUI (`.../cli/cmd/tui/component/prompt/submit-mode.ts`).
 * Sans tour actif, une consigne ne peut pas « steer » : elle part comme message ordinaire.
 */
export type SubmitMode = "send" | "queue" | "steer"

export function submitMode(steer: boolean, busy: boolean): SubmitMode {
  if (steer && busy) return "steer"
  if (busy) return "queue"
  return "send"
}

/** Métadonnées à porter sur la partie texte — c'est le protocole du serveur, pas une simulation. */
export function partMetadata(mode: SubmitMode): { metadata?: { steer: true } } {
  return mode === "steer" ? { metadata: { steer: true } } : {}
}

/** Le retour visuel d'un envoi ; `send` n'affiche rien, ce qui est sain. */
export function deliveryNotice(mode: SubmitMode): string | undefined {
  if (mode === "steer") return "consigne injectée dans le tour en cours (steer)"
  if (mode === "queue") return "message mis en file (queued)"
  return undefined
}
