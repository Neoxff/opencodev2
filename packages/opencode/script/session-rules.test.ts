/**
 * Contrôle de `summarize` : une métrique qui décide du sort d'une règle d'instruction doit être
 * stable et vérifiable. Ces cas fixent la définition des deux compteurs ajoutés le 2026-10-23.
 *
 * Run: bun test script/session-rules.test.ts
 */
import { describe, expect, test } from "bun:test"
import { summarize, type Message } from "./session-rules"

const user = (time: number): Message => ({ id: "u" + time, time, role: "user", tools: [], delegations: [] })

const step = (time: number, tools: string[]): Message => ({
  id: "a" + time,
  time,
  role: "assistant",
  tools,
  delegations: tools.flatMap((tool, index) => (tool === "task" ? [index + 1] : [])),
})

describe("summarize — boucles de contexte", () => {
  test("compte les steps de contexte avant le premier acte", () => {
    const result = summarize([user(1), step(2, ["read"]), step(3, ["grep", "glob"]), step(4, ["edit"])])
    expect(result.turnsWithAct).toBe(1)
    expect(result.loopsMean).toBe(2)
    expect(result.loopsWithinTwoShare).toBe(1)
  })

  test("un tour sans acte ne produit pas de mesure", () => {
    const result = summarize([user(1), step(2, ["read"]), step(3, ["read"])])
    expect(result.turnsWithAct).toBe(0)
    expect(result.loopsMean).toBeNull()
  })

  test("un acte au premier step du tour donne zéro boucle", () => {
    const result = summarize([user(1), step(2, ["edit"]), step(3, ["edit"])])
    expect(result.turnsWithAct).toBe(1)
    expect(result.loopsMean).toBe(0)
    expect(result.loopsWithinTwoShare).toBe(1)
  })

  test("bash ne clôt pas le contexte : il sert aussi à lire", () => {
    const result = summarize([user(1), step(2, ["bash"]), step(3, ["edit"])])
    expect(result.turnsWithAct).toBe(1)
    expect(result.loopsMean).toBe(1)
  })

  test("un lot qui lit puis écrit dans le même step vaut une boucle", () => {
    // Cas réel : la discipline de lot met read/grep et edit dans le même message.
    const batched = summarize([user(1), step(2, ["read", "grep", "edit"])])
    expect(batched.loopsMean).toBe(1)
    const actFirst = summarize([user(1), step(2, ["edit", "read"])])
    expect(actFirst.loopsMean).toBe(0)
  })
})

describe("summarize — ask et discipline de lot", () => {
  test("compte les appels question", () => {
    const result = summarize([user(1), step(2, ["question"]), step(3, ["edit"])])
    expect(result.asks).toBe(1)
    expect(result.stepsWithAsk).toBe(1)
  })

  test("mesure la part de steps à appel unique", () => {
    const result = summarize([user(1), step(2, ["read"]), step(3, ["read", "grep", "glob"]), step(4, ["edit"])])
    expect(result.stepsSingleCall).toBe(2)
    expect(result.singleCallShare).toBeCloseTo(2 / 3, 5)
  })

  test("le seuil de délégation reste à 3 appels", () => {
    const delegated = summarize([user(1), step(2, ["read", "grep", "glob", "task"])])
    expect(delegated.stepsOverThreshold).toBe(1)
    expect(delegated.stepsOverThresholdDelegated).toBe(1)
    expect(delegated.delegationRate).toBe(1)
  })
})
