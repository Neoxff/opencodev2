/**
 * Adaptateurs des commandes d'interface — des payloads réels du serveur vers les `Row`/`View`
 * de `ui-commands.ts`.
 *
 * Ce module est pur : il ne charge rien, il ne garde rien, il ne connaît pas le client SDK. Son
 * intérêt est double : le conteneur reste mince (il branch des signaux), et chaque projection est
 * testable avec un payload réel sans monter l'application. Aucune valeur n'est inventée : quand le
 * serveur ne fournit pas de donnée, la liste est vide et le dialogue le dit.
 */

import type { Choice } from "./settings"
import type { Agent, McpState } from "./config"
import type { SessionSummary } from "./sessions"
import type { DiffFile, DiffLine, Row } from "./ui-commands"

/** Les variantes réelles d'un modèle, lues dans la charge `/config/providers`. */
export function variantsForModel(payload: unknown, model: string): string[] {
  if (!model) return []
  const cut = model.indexOf("/")
  if (cut <= 0) return []
  const providerID = model.slice(0, cut)
  const modelID = model.slice(cut + 1)
  const providers = (payload as { providers?: unknown } | undefined)?.providers
  if (!Array.isArray(providers)) return []
  for (const entry of providers) {
    if (!entry || typeof entry !== "object") continue
    const provider = entry as { id?: unknown; models?: unknown }
    if (provider.id !== providerID || !provider.models || typeof provider.models !== "object") continue
    const target = (provider.models as Record<string, unknown>)[modelID]
    if (!target || typeof target !== "object") return []
    const variants = (target as { variants?: unknown }).variants
    if (!variants || typeof variants !== "object" || Array.isArray(variants)) return []
    return Object.keys(variants as Record<string, unknown>).sort()
  }
  return []
}

export function variantRows(names: string[], current: string): Row[] {
  return names.map((name) => ({ value: name, label: name, current: name === current }))
}

export function choiceRows(choices: Choice[], current: string): Row[] {
  return choices.map((choice) => ({
    value: choice.value,
    label: choice.label,
    detail: choice.group,
    current: choice.value === current,
  }))
}

/** Les sous-agents réels : le serveur porte leur mode dans `mode`. */
export function subagentRows(agents: Agent[]): Row[] {
  return agents
    .filter((agent) => agent.mode === "subagent" && Boolean(agent.name) && agent.hidden !== true)
    .map((agent) => ({
      value: agent.name as string,
      label: agent.name as string,
      detail: agent.description?.replace(/\s+/g, " ").slice(0, 90),
    }))
}

export type Skill = { name?: string; description?: string; location?: string }

export function skillRows(skills: Skill[]): Row[] {
  return skills
    .filter((skill): skill is Skill & { name: string } => typeof skill.name === "string" && Boolean(skill.name))
    .map((skill) => ({
      value: skill.name,
      label: skill.name,
      detail: skill.description?.replace(/\s+/g, " ").slice(0, 90),
    }))
}

/** Les fournisseurs réels exposés par `/provider/auth` — la valeur est l'identifiant du serveur. */
export function providerRows(auth: Record<string, unknown>): Row[] {
  return Object.keys(auth)
    .sort()
    .map((id) => ({ value: id, label: id }))
}

/** L'état MCP réel, tel que le serveur le rend (`connected` / `disabled` / `failed`). */
export function mcpRows(status: Record<string, McpState>): Row[] {
  return Object.entries(status)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, state]) => {
      const value = state?.status ?? "unknown"
      return {
        value: name,
        label: name,
        detail: value === "connected" ? "Connected" : value === "disabled" ? "Disabled" : value,
        on: value === "connected",
        tone: value === "connected" ? "ok" : value === "disabled" ? "off" : "bad",
      }
    })
}

export function sessionRows(sessions: SessionSummary[], current: string | undefined): Row[] {
  return sessions.map((session) => ({
    value: session.id,
    label: session.title || "(untitled)",
    detail: typeof session.directory === "string" ? session.directory.split(/[\\/]/).pop() : undefined,
    current: session.id === current,
  }))
}

/**
 * La timeline : les prompts utilisateur réels de la session. `value` est l'index du tour **dans le
 * fil rendu**, donc l'ancre `data-turn` que `/timeline` cherche existe toujours — la numérotation
 * ne peut pas dériver de l'ordre de l'historique, qui est inversé.
 */
export function timelineRows(prompts: Array<{ value: string; label: string; detail?: string }>): Row[] {
  return prompts.map((prompt) => ({
    value: prompt.value,
    label: prompt.label,
    detail: prompt.detail,
  }))
}

/** Une ligne de patch unified, sans conservation du patch entier. */
export function parsePatch(patch: string): DiffLine[] {
  const out: DiffLine[] = []
  for (const line of patch.split("\n")) {
    const kind: DiffLine["kind"] = line.startsWith("@@")
      ? "hunk"
      : line.startsWith("+")
        ? "add"
        : line.startsWith("-")
          ? "del"
          : "context"
    out.push({ kind, text: line })
  }
  return out
}

export type SnapshotDiff = { file?: string; patch?: string; additions?: number; deletions?: number }

export function diffFiles(snapshots: SnapshotDiff[]): DiffFile[] {
  return snapshots.map((snapshot) => ({
    name: `${snapshot.file ?? "unknown"}  +${snapshot.additions ?? 0} -${snapshot.deletions ?? 0}`,
    lines: typeof snapshot.patch === "string" ? parsePatch(snapshot.patch) : [],
  }))
}

/** L'horodatage réel d'un message, ou une chaîne vide si le serveur ne l'a pas fourni. */
export function stamp(date: number | undefined): string {
  if (typeof date !== "number" || !Number.isFinite(date)) return ""
  return new Date(date).toLocaleTimeString()
}
