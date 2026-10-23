#!/usr/bin/env bun
/**
 * Mesure le déclenchement effectif des règles « de jugement » sur une session réelle.
 *
 * Aujourd'hui : délégation au-delà de 3 appels d'outils, discipline de lot (1 appel = 1 boucle),
 * boucles de contexte avant le premier acte, et ask (outil `question`).
 * L'intérêt est de remplacer un débat sur l'emplacement d'une règle par un chiffre :
 * une règle qui ne se déclenche jamais doit être supprimée ou codée, pas déplacée.
 *
 * Usage :
 *   bun packages/opencode/script/session-rules.ts                    # 3 sessions récentes, mesure la plus récente
 *   bun packages/opencode/script/session-rules.ts <sessionID>
 *   bun packages/opencode/script/session-rules.ts <sessionID> <chemin.db>
 */
import { Database } from "bun:sqlite"
import { homedir } from "node:os"
import { join } from "node:path"

export function defaultDbPath() {
  return join(homedir(), ".local", "share", "opencodev2", "opencode.db")
}

export type Message = {
  id: string
  time: number
  role: string
  tools: string[]
  delegations: number[]
}

export function readMessages(db: Database, sessionID: string) {
  const rows = db
    .query(
      "select m.id as id, m.time_created as time_created, m.data as mdata, p.data as pdata" +
        " from message m left join part p on p.message_id = m.id" +
        " where m.session_id = ? order by m.time_created asc, p.time_created asc",
    )
    .all(sessionID) as { id: string; time_created: number; mdata: string; pdata: string | null }[]

  const messages = new Map<string, Message>()
  for (const row of rows) {
    let message = messages.get(row.id)
    if (!message) {
      let role = "unknown"
      try {
        role = (JSON.parse(row.mdata) as { role?: string }).role ?? "unknown"
      } catch {
        // data illisible : on garde "unknown" plutôt que d'échouer la mesure
      }
      message = { id: row.id, time: row.time_created, role, tools: [], delegations: [] }
      messages.set(row.id, message)
    }
    if (!row.pdata) continue
    let part: { type?: string; tool?: string; name?: string }
    try {
      part = JSON.parse(row.pdata) as { type?: string; tool?: string; name?: string }
    } catch {
      continue
    }
    if (part.type !== "tool") continue
    const name = part.tool ?? part.name ?? "?"
    message.tools.push(name)
    if (name === "task") message.delegations.push(message.tools.length)
  }
  return [...messages.values()].sort((a, b) => a.time - b.time)
}

/** Outils qui ne font que lire le contexte ; leur enchaînement en début de tour compte comme boucles. */
const CONTEXT_ONLY = new Set([
  "read",
  "grep",
  "glob",
  "inspect_batch",
  "skill",
  "skill_search",
  "memory_retrieve",
  "memory_retrieve_graph_augmented",
  "memory_list",
  "memory_get",
  "webfetch",
  "repo_overview",
])

/**
 * Premier outil de ce type dans un tour = fin de la phase de contexte.
 * `bash` est volontairement exclu : il sert autant à lire qu'à écrire, et le compter comme acte
 * ramenait la mesure à 0 boucle sur toute session (mesuré 2026-10-23 sur `ses_e964d3930ffe` :
 * 5 tours avec acte, moyenne 0.00, 100 % ≤ 2) — une métrique qui dit toujours oui ne mesure rien.
 * L'acte retenu est la mutation de fichier ou la délégation.
 */
const MUTATING = new Set(["edit", "write", "patch", "task"])

export function summarize(messages: Message[]) {
  let tools = 0
  let stepsWithTools = 0
  let stepsOverThreshold = 0
  let stepsOverThresholdDelegated = 0
  let stepsSingleCall = 0
  let asks = 0
  let stepsWithAsk = 0
  const contextLoops: number[] = []
  // null = tour clos par un acte (ou aucun tour ouvert) ; 0..n = contexte accumulé sans acte
  let loop: number | null = null
  for (const message of messages) {
    if (message.role === "user") {
      loop = 0
      continue
    }
    if (message.tools.length === 0) continue
    tools += message.tools.length
    stepsWithTools++
    if (message.tools.length === 1) stepsSingleCall++
    if (message.tools.length > 3) {
      stepsOverThreshold++
      if (message.delegations.length > 0) stepsOverThresholdDelegated++
    }
    const asking = message.tools.filter((tool) => tool === "question").length
    if (asking > 0) {
      asks += asking
      stepsWithAsk++
    }
    if (loop === null) continue
    // Le lot mêle lecture et acte dans le MÊME step : compter les seuls steps purs de contexte
    // donnait 0 partout (mesuré : 0.00 sur 5 tours). Un step qui lit avant d'écrire vaut donc
    // une boucle, l'ordre des parts fixant la position du premier acte.
    const actIndex = message.tools.findIndex((tool) => MUTATING.has(tool))
    if (actIndex >= 0) {
      const readBeforeAct = message.tools.slice(0, actIndex).some((tool) => CONTEXT_ONLY.has(tool))
      contextLoops.push(loop + (readBeforeAct ? 1 : 0))
      loop = null
      continue
    }
    // Tout step sans acte compte comme contexte. `bash` n'appartient ni à MUTATING ni à
    // CONTEXT_ONLY : exiger « tous les outils en CONTEXT_ONLY » créait une zone morte qui
    // sous-comptait (mesuré : la sonde [bash] puis [edit] rendait 0 au lieu de 1).
    loop++
  }
  const loopsMean =
    contextLoops.length === 0 ? null : contextLoops.reduce((sum, n) => sum + n, 0) / contextLoops.length
  return {
    tools,
    stepsWithTools,
    stepsOverThreshold,
    stepsOverThresholdDelegated,
    delegationRate: stepsOverThreshold === 0 ? null : stepsOverThresholdDelegated / stepsOverThreshold,
    stepsSingleCall,
    singleCallShare: stepsWithTools === 0 ? null : stepsSingleCall / stepsWithTools,
    asks,
    stepsWithAsk,
    turnsWithAct: contextLoops.length,
    loopsMean,
    loopsWithinTwoShare:
      contextLoops.length === 0 ? null : contextLoops.filter((n) => n <= 2).length / contextLoops.length,
  }
}

if (import.meta.main) {
  const dbPath = process.argv[3] ?? defaultDbPath()
  const db = new Database(dbPath, { readonly: true })
  try {
    const recent = db
      .query("select id, title, time_updated from session order by time_updated desc limit 3")
      .all() as { id: string; title: string; time_updated: number }[]

    console.log("SESSIONS RECENTES :")
    for (const session of recent) {
      console.log("  " + session.id + "  " + String(session.title).slice(0, 60))
    }

    const sessionID = process.argv[2] ?? recent[0]?.id
    if (!sessionID) {
      console.log("AUCUNE SESSION")
      process.exit(0)
    }
    console.log("\nSESSION MESUREE = " + sessionID)

    const messages = readMessages(db, sessionID)
    let turn = 0
    console.log("\nTOUR  ROLE        OUTILS  DELEG  RANG_DELEG")
    for (const message of messages) {
      if (message.role === "user") {
        turn++
        continue
      }
      if (message.tools.length === 0) continue
      console.log(
        String(turn).padStart(4) +
          "  " +
          message.role.padEnd(10) +
          String(message.tools.length).padStart(6) +
          String(message.delegations.length).padStart(7) +
          "  " +
          (message.delegations.length ? message.delegations.join(",") : "-"),
      )
    }

    const result = summarize(messages)
    console.log("\nTOTAL: steps_avec_outils=" + result.stepsWithTools + " appels_outils=" + result.tools)
    console.log(
      "STEPS >3 OUTILS=" +
        result.stepsOverThreshold +
        "  dont avec delegation=" +
        result.stepsOverThresholdDelegated,
    )
    console.log(
      "TAUX_DELEGATION=" +
        (result.delegationRate === null ? "n/a" : (result.delegationRate * 100).toFixed(1) + "%"),
    )
    console.log(
      "DISCIPLINE_LOT: steps_1_appel=" +
        result.stepsSingleCall +
        "/" +
        result.stepsWithTools +
        " (" +
        (result.singleCallShare === null ? "n/a" : (result.singleCallShare * 100).toFixed(1) + "%") +
        ")",
    )
    console.log(
      "CONTEXTE: tours_avec_acte=" +
        result.turnsWithAct +
        " boucles_moyennes=" +
        (result.loopsMean === null ? "n/a" : result.loopsMean.toFixed(2)) +
        " tours<=2_boucles=" +
        (result.loopsWithinTwoShare === null ? "n/a" : (result.loopsWithinTwoShare * 100).toFixed(1) + "%"),
    )
    console.log("ASK: appels=" + result.asks + " steps_avec_ask=" + result.stepsWithAsk)
  } finally {
    db.close()
  }
}
