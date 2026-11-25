/**
 * File d'attente et steer pour la maquette /ui — module pure, sans DOM.
 *
 * Miroir client des prédicats serveur (src/session/prompt-queue.ts) et du TUI
 * (routes/session/pending-turn.ts). Le serveur implémente DÉJÀ l'injection
 * inter-étapes réelle : un prompt avec `metadata.steer === true` est relu en base
 * à chaque frontière d'étape et délivré au modèle dans un `<system-reminder>`,
 * avec un reçu durable `metadata.steerDelivered`. Aucun correctif serveur requis.
 *
 * Règle QUEUED demandée : un message est « queued » seulement si la session est
 * occupée ET qu'aucune réponse de l'assistant n'a encore ce message pour parent.
 * Dès qu'une réponse existe (même une réponse d'étape `finish: "tool-calls"`),
 * ou au résultat final (session au repos), le badge disparaît.
 */

const isUser = (m) => Boolean(m && m?.info?.role === "user")
const isAssistant = (m) => Boolean(m && m?.info?.role === "assistant")
const partsOf = (m) => (Array.isArray(m?.parts) ? m.parts : [])
const hasTextPart = (m) => partsOf(m).some((p) => p && p.type === "text")

/** Un steer est un message utilisateur portant le marqueur sur une part texte. */
export function isSteerUser(m) {
  return isUser(m) && hasTextPart(m) && partsOf(m).some(
    (p) => p.type === "text" && p?.metadata?.steer === true,
  )
}

/** Reçu durable écrit par le serveur quand le steer a atteint le modèle. */
export function hasSteerDelivered(m) {
  return partsOf(m).some((p) => p.type === "text" && p?.metadata?.steerDelivered === true)
}

/** Un assistant écrit après le steer prouve que le run l'a pris en charge. */
export function steerServed(messages, steerID) {
  return (Array.isArray(messages) ? messages : []).some(
    (m) => isAssistant(m) && String(m.info.id) > String(steerID),
  )
}

/** Un message est servi dès qu'une réponse assistant a ce message pour parent. */
export function isAnswered(messages, userID) {
  return (Array.isArray(messages) ? messages : []).some(
    (m) => isAssistant(m) && m.info.parentID === userID,
  )
}

/**
 * Identifiants des messages en file. `busy=false` (résultat final) ⇒ aucune file.
 * Un message déjà servi (réponse parente) sort de la file immédiatement.
 * Les messages steer ne sont jamais « queued » : ils ont leur propre indicateur.
 */
export function queuedUserIDs(messages, busy) {
  const result = {}
  if (!busy || !Array.isArray(messages)) return result
  for (const m of messages) {
    if (!isUser(m) || !m?.info?.id || isSteerUser(m)) continue
    if (isAnswered(messages, m.info.id)) continue
    result[m.info.id] = true
  }
  return result
}

/** Steer en attente d'intégration : non délivré et pas encore repris par un assistant. */
export function pendingSteer(messages) {
  if (!Array.isArray(messages)) return undefined
  for (const m of messages) {
    if (!isSteerUser(m) || hasSteerDelivered(m)) continue
    if (steerServed(messages, m.info.id)) continue
    return m
  }
  return undefined
}

/** Un steer délivré ne doit plus jamais apparaître dans la conversation. */
export function isHiddenSteer(m) {
  return isSteerUser(m)
}

/** Libellé de l'indicateur de barre d'état (chaîne vide si rien en attente). */
export function deliveryIndicator(messages, busy) {
  if (!busy) return ""
  return pendingSteer(messages) ? "steer" : ""
}

/** Après interruption, la file locale est vidée ; le transport annule le run. */
export function queueAfterAbort() {
  return {}
}

/** Décision alt+s : sans session occupée, comportement d'un envoi normal. */
export function steerDeliveryMode(steer, busy) {
  return steer && busy ? "steer" : "send"
}
