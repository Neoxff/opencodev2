import { describe, expect, test } from "vitest"
import {
  fileFromDiff,
  modifiedFiles,
  modifiedFilesHtml,
  splitPath,
  todoClass,
  todoHtml,
  todoRows,
} from "../public/ui/session-todos.js"

const todo = (content: string, status: string) => ({ content, status, priority: "medium" })

describe("todos — uniquement ceux de la session ouverte", () => {
  test("session sans todo : message 'No todos', rien d'inventé", () => {
    expect(todoRows([])).toEqual([{ content: "No todos", className: "empty" }])
    expect(todoRows(undefined)).toEqual([{ content: "No todos", className: "empty" }])
    expect(todoHtml([])).toContain("No todos")
    expect(todoHtml([])).not.toContain("Lot sûr")
  })

  test("quatre états maquette et tous les todos affichés", () => {
    expect(todoClass("pending")).toBe("")
    expect(todoClass("in_progress")).toBe("ip")
    expect(todoClass("completed")).toBe("dn")
    expect(todoClass("cancelled")).toBe("cn")
    const rows = todoRows([
      todo("Étape A", "pending"),
      todo("Étape B", "in_progress"),
      todo("Étape C", "completed"),
      todo("Étape D", "cancelled"),
    ])
    expect(rows.map((r) => r.className)).toEqual(["", "ip", "dn", "cn"])
    const html = todoHtml(rows.map((r) => ({ content: r.content, status: r.status })))
    for (const name of ["Étape A", "Étape B", "Étape C", "Étape D"]) expect(html).toContain(name)
  })

  test("todos qui changent et changement de session", () => {
    const first = todoHtml([todo("A", "pending")])
    const changed = todoHtml([todo("A", "completed"), todo("B", "in_progress")])
    expect(first).toContain("A")
    expect(changed).toContain("B")
    expect(changed).toContain('class="todo dn"')
    // Nouvelle session sans todo : plus aucun todo de la précédente
    const second = todoHtml([])
    expect(second).not.toContain("A")
    expect(second).not.toContain("B")
    expect(second).toContain("No todos")
  })
})

describe("modified files — diff de session", () => {
  const makeFiles = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      file: `packages/webui/src/fichier-${i}.tsx`,
      additions: i + 1,
      deletions: i,
    }))

  test("0 / 1 / 40 fichiers et totaux", () => {
    expect(modifiedFiles([]).files).toHaveLength(0)
    expect(modifiedFiles([]).totals).toEqual({ additions: 0, deletions: 0 })
    expect(modifiedFiles(makeFiles(1)).files).toHaveLength(1)
    const many = modifiedFiles(makeFiles(40))
    expect(many.files).toHaveLength(40)
    expect(many.totals.additions).toBe(820)
    expect(many.totals.deletions).toBe(780)
  })

  test("section vide si aucun fichier", () => {
    const html = modifiedFilesHtml([], "ses_1")
    expect(html).toContain("No modified files")
    expect(html).not.toContain("mfrow")
  })

  test("nom + chemin relatif, +N vert / −N rouge, clic /diff", () => {
    const html = modifiedFilesHtml([{ file: "packages/webui/src/git-panel.tsx", additions: 3, deletions: 1 }], "ses_1")
    expect(html).toContain("git-panel.tsx")
    expect(html).toContain("packages/webui/src")
    expect(html).toContain('<span class="add">+3</span>')
    expect(html).toContain('<span class="del">-1</span>')
    expect(html).toContain("/diff?session=ses_1")
    expect(html).toContain('class="mfrow"')
  })

  test("fichier créé, supprimé et binaire", () => {
    const created = fileFromDiff({ file: "src/new.ts", status: "added", additions: 5, deletions: 0 })!
    const deleted = fileFromDiff({ file: "src/old.ts", status: "deleted", additions: 0, deletions: 9 })!
    const binary = fileFromDiff({ file: "assets/logo.png", binary: true, patch: "" })!
    expect(created.created).toBe(true)
    expect(deleted.deleted).toBe(true)
    expect(binary.binary).toBe(true)
    const html = modifiedFilesHtml([created, deleted, binary], "ses_2")
    expect(html).toContain("created")
    expect(html).toContain("deleted")
    expect(html).toContain("binary")
  })

  test("patch sans compteurs déclarés : comptage ligne par ligne", () => {
    const f = fileFromDiff({ file: "a.ts", patch: "+ligne1\n+ligne2\n-ligne3\n context" })!
    expect(f.additions).toBe(2)
    expect(f.deletions).toBe(1)
    expect(splitPath("packages/webui/src/a.ts")).toEqual({ name: "a.ts", dir: "packages/webui/src" })
  })
})
