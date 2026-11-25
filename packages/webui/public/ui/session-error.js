/**
 * Erreurs et retry de session pour la maquette /ui — module pure, sans DOM ni secret.
 *
 * Le serveur expose GET /session/status : { [id]: { type: "idle"|"busy"|"retry",
 * attempt, message, action?:{reason,provider,title,message,label,link?}, next } }.
 * `next` est un timestamp ms du prochain essai. On ne garde que des champs lisibles
 * et on neutralise toute valeur sensible avant affichage.
 */

const SECRET_PATTERNS = [
  /\bgh[pousr]_[A-Za-z0-9]{16,}/g,
  /\bsk-[A-Za-z0-9_-]{16,}/g,
  /\b[A-Za-z0-9_-]{32,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g,
  /https?:\/\/[^\s)]*:[^\s)]*@/g,
]

/** Neutralise jetons et basic-auth dans un texte destiné à l'écran. */
export function sanitizeErrorText(value) {
  let text = typeof value === "string" ? value : ""
  for (const pattern of SECRET_PATTERNS) text = text.replace(pattern, "[redacted]")
  return text
}

/** Traduit un statut serveur en informations de retry, ou undefined. */
export function retryInfo(status) {
  if (!status || typeof status !== "object" || status.type !== "retry") return undefined
  const action = status.action && typeof status.action === "object" ? status.action : undefined
  return {
    attempt: Number(status.attempt) || 0,
    message: sanitizeErrorText(action?.message || status.message || "Provider error"),
    title: sanitizeErrorText(action?.title || "Model error"),
    reason: typeof action?.reason === "string" ? action.reason : "",
    provider: sanitizeErrorText(action?.provider || ""),
    label: sanitizeErrorText(action?.label || "Choose another model"),
    link: typeof action?.link === "string" && /^https:\/\//.test(action.link) ? action.link : undefined,
    next: Number.isFinite(status.next) ? Number(status.next) : undefined,
  }
}

/** Heure locale HH:MM du prochain essai. */
export function retryTimeLabel(next, now = Date.now()) {
  if (!Number.isFinite(next)) return ""
  const date = new Date(next)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

/** Libellé d'état : « Retrying at HH:MM » tant qu'un retry est programmé. */
export function runStatusLabel(status, now = Date.now()) {
  const info = retryInfo(status)
  if (info?.next) return `Retrying at ${retryTimeLabel(info.next, now)}`
  if (info) return "Retrying…"
  return "Working…"
}

/** Les échecs de l'agent « title » sont intrinsèquement non alarmants. */
export function isTitleError(event) {
  const props = event?.properties || {}
  const info = props.info || props.part || {}
  const agent =
    event?.agent || info.agent || props.agent ||
    (typeof info.metadata?.agent === "string" ? info.metadata.agent : "")
  return agent === "title" || info.subagent === "title" || props.title === "title"
}

/** Échappement minimal pour du HTML injecté dans la conversation. */
function esc(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

/**
 * Construit une ligne de conversation lisible (kind "p", rendu existant).
 * Aucun secret, message tronqué, bouton « Choose another model ».
 */
export function errorLine(status, ctx = {}) {
  const info = retryInfo(status)
  if (!info) return undefined
  const sessionID = ctx.sessionID || ""
  const at = info.next ? ` — next try at ${esc(retryTimeLabel(info.next, ctx.now))}` : ""
  const message = sanitizeErrorText(info.message)
  const short = message.length > 240 ? `${message.slice(0, 240)}…` : message
  const html =
    `<b>${esc(info.title)}</b> — ${esc(short)}${at}` +
    ` <button class="gb choose-model" data-choose-model="1" type="button">${esc(info.label)}</button>` +
    (info.link ? ` <a href="${esc(info.link)}" target="_blank" rel="noopener">More info</a>` : "")
  return {
    key: `error:${sessionID}:${info.reason}:${info.next || ""}`,
    kind: "p",
    html,
    retry: true,
  }
}

/** Une session marquée busy côté serveur mais sans flux live est « stale » après redémarrage. */
export function isStaleBusy(status, hasLiveStream = false) {
  if (!hasLiveStream) return Boolean(status && status.type === "busy")
  return false
}

/** Décision d'interruption : esc/bouton carré annulent aussi un retry programmé. */
export function shouldInterrupt(running, status, menuOpen = false) {
  if (menuOpen) return false
  return Boolean(running || retryInfo(status))
}

/** Évènement session.status → ligne d'erreur éventuelle (hors agent title). */
export function statusErrorLine(event, ctx = {}) {
  if (event?.type !== "session.status") return undefined
  if (isTitleError(event)) return undefined
  return errorLine(event.properties?.status, ctx)
}
