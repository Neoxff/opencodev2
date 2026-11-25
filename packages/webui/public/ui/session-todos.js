/**
 * Todos et fichiers modifiés de la session ouverte pour le panneau droit de /ui.
 * Module pure : aucune donnée inventée, aucun DOM, aucun secret.
 *
 * Sources réelles : GET /session/{id}/todo, GET /session/{id}/diff et événements
 * `todo.updated` / `session.diff`. Les classes de ligne réutilisent celles de la
 * maquette (`.todo`, `.ip`, `.dn`, `.row`, `.add`, `.del`, `.nm`, `.rt`).
 */

const STATUSES = ["pending", "in_progress", "completed", "cancelled"]

/** Classe maquette correspondant à l'état du todo. */
export function todoClass(status) {
  if (status === "in_progress") return "ip"
  if (status === "completed") return "dn"
  if (status === "cancelled") return "cn"
  return ""
}

/** Lignes du panneau Todo, uniquement à partir des todos fournis. */
export function todoRows(todos) {
  if (!Array.isArray(todos) || todos.length === 0) return [{ content: "No todos", className: "empty" }]
  return todos
    .filter((t) => t && typeof t.content === "string")
    .map((t) => ({
      content: t.content,
      className: todoClass(typeof t.status === "string" ? t.status : "pending"),
      status: STATUSES.includes(t.status) ? t.status : "pending",
    }))
}

/** Échappement HTML minimal. */
function esc(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

/** Rendu des lignes Todo avec les classes de la maquette. */
export function todoHtml(todos) {
  return todoRows(todos)
    .map((row) => `<div class="todo ${row.className}"><span class="bx"></span><span>${esc(row.content)}</span></div>`)
    .join("")
}

/** Nom de fichier et chemin relatif au dossier de travail. */
export function splitPath(path) {
  const raw = String(path ?? "")
  const parts = raw.split(/[\\/]/).filter(Boolean)
  return { name: parts[parts.length - 1] || raw || "fichier", dir: parts.slice(0, -1).join("/") }
}

/**
 * Normalise une entrée de diff de session en fichier modifié.
 * Champs acceptés : file/path, additions/deletions, patch (compté ligne par ligne),
 * created/deleted/binary (ou status/binary).
 */
export function fileFromDiff(entry) {
  if (!entry || typeof entry !== "object") return undefined
  const path = typeof entry.file === "string" ? entry.file : typeof entry.path === "string" ? entry.path : ""
  if (!path) return undefined
  const { name, dir } = splitPath(path)
  const binary = entry.binary === true || entry.type === "binary"
  let a = Number.isFinite(entry.additions) ? entry.additions : undefined
  let d = Number.isFinite(entry.deletions) ? entry.deletions : undefined
  if (a === undefined || d === undefined) {
    a = 0
    d = 0
    const patch = typeof entry.patch === "string" ? entry.patch : ""
    for (const line of patch.split("\n")) {
      if (line.startsWith("+") && !line.startsWith("+++")) a++
      else if (line.startsWith("-") && !line.startsWith("---")) d++
    }
  }
  const status = typeof entry.status === "string" ? entry.status : ""
  return {
    path,
    name,
    dir,
    additions: a,
    deletions: d,
    binary,
    created: entry.created === true || status === "added" || status === "created",
    deleted: entry.deleted === true || status === "deleted" || status === "removed",
  }
}

/** Liste des fichiers modifiés et totaux, à partir du diff de session. */
export function modifiedFiles(diff) {
  const files = (Array.isArray(diff) ? diff : [])
    .map(fileFromDiff)
    .filter(Boolean)
  const totals = files.reduce(
    (acc, f) => ({ additions: acc.additions + f.additions, deletions: acc.deletions + f.deletions }),
    { additions: 0, deletions: 0 },
  )
  return { files, totals }
}

/** Ligne d'un fichier modifié, classes maquette, clic = ouvre /diff. */
export function fileRow(file, sessionID = "") {
  const target = `/diff?session=${encodeURIComponent(sessionID)}&file=${encodeURIComponent(file.path)}`
  const counts = file.binary
    ? '<span class="rt">binary</span>'
    : `<span class="rt"><span class="add">+${file.additions}</span><span class="del">-${file.deletions}</span></span>`
  const flag = file.created ? " created" : file.deleted ? " deleted" : ""
  return (
    `<a class="mfrow" href="${esc(target)}" data-file="${esc(file.path)}">` +
    `<span class="nm">${esc(file.name)}</span>` +
    `<span class="pth">${esc(file.dir)}</span>` +
    `<span class="fp${flag}">${file.created ? "created" : file.deleted ? "deleted" : ""}</span>` +
    counts +
    "</a>"
  )
}

/** Section Modified files complète (totaux en en-tête, vide si aucun). */
export function modifiedFilesHtml(diff, sessionID = "") {
  const { files, totals } = modifiedFiles(diff)
  if (!files.length) return '<div class="rs mf" data-id="files"><div class="rh"><b>Modified files</b></div><div class="rb"><div class="mfempty">No modified files</div></div></div>'
  const header = `<span class="n"><span class="add">+${totals.additions}</span> <span class="del">-${totals.deletions}</span> · ${files.length}</span>`
  return (
    '<div class="rs mf" data-id="files"><div class="rh">' + icDown() + '<b>Modified files</b>' + header + '</div><div class="rb">' +
    files.map((f) => fileRow(f, sessionID)).join("") +
    "</div></div>"
  )
}

/** Icône de repli identique à celle des autres sections. */
function icDown() {
  return '<svg class="i c"><use href="#down"/></svg>'
}
