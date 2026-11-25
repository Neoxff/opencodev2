/**
 * Liste réelle des sessions archivées pour la maquette /ui.
 *
 * Connu et vérifié : GET /experimental/session?archived=true existe déjà côté serveur
 * (ExperimentalPaths.session + SessionListQuery.archived). Ce module ne touche ni au DOM
 * ni au CSS. Il ne garde que `id`, `title` et une date lisible : aucun champ brut du
 * serveur (directory, projet, organisation…) ne sort d'ici.
 */

import { foldText } from "./composer.js"

/** Date courte stable, indépendante de la locale du navigateur. */
export function archivedDate(session) {
  const raw = session?.time?.archived ?? session?.time?.updated ?? session?.time?.created
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) return "—"
  return new Date(value).toISOString().slice(0, 10)
}

/** Projection autorisée : une ligne = id, titre, date. Rien d'autre. */
export function toArchivedRows(sessions) {
  const list = Array.isArray(sessions) ? sessions : []
  const rows = []
  for (const session of list) {
    if (!session || typeof session.id !== "string" || !session.id) continue
    const title = typeof session.title === "string" && session.title.trim() ? session.title : "New session"
    rows.push({ id: session.id, title, date: archivedDate(session) })
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title))
}

/** Recherche insensible à la casse et aux accents, sur le titre et la date. */
export function filterArchived(rows, query) {
  const q = foldText(query).trim()
  if (!q) return Array.isArray(rows) ? rows.slice() : []
  return (Array.isArray(rows) ? rows : []).filter((row) =>
    foldText(`${row?.title ?? ""} ${row?.date ?? ""}`).includes(q),
  )
}

async function getJson(fetchImpl, path, init = {}) {
  const response = await fetchImpl(path, { credentials: "same-origin", ...init })
  if (!response.ok) throw new Error(`${path} -> HTTP ${response.status}`)
  return response.json()
}

/** Les sessions archivées, telles que le serveur les renvoie (jamais les actives). */
export async function loadArchivedSessions(fetchImpl = fetch) {
  const sessions = await getJson(fetchImpl, "/experimental/session?archived=true")
  return toArchivedRows(sessions)
}

/**
 * Désarchivage : PATCH /session/{id} avec `time.archived = null`.
 * Le serveur accepte `null` depuis la correction du schéma HTTP (NullOr(ArchivedTimestamp)) ;
 * `undefined` serait ignoré par le handler, `0` laisserait la session archivée.
 */
export async function unarchiveSession(id, fetchImpl = fetch) {
  const response = await fetchImpl(`/session/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ time: { archived: null } }),
  })
  if (!response.ok) throw new Error(`PATCH /session/${id} -> HTTP ${response.status}`)
  return true
}
