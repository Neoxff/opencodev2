import { describe, expect, test } from "vitest"
import {
  deliveryIndicator,
  hasSteerDelivered,
  isAnswered,
  isHiddenSteer,
  isSteerUser,
  pendingSteer,
  queueAfterAbort,
  queuedUserIDs,
  steerDeliveryMode,
  steerServed,
} from "../public/ui/session-delivery.js"

const user = (id: string, opts: { steer?: boolean; delivered?: boolean } = {}) => ({
  info: { id, role: "user" },
  parts: [
    {
      type: "text",
      text: "bonjour",
      metadata: {
        ...(opts.steer ? { steer: true } : {}),
        ...(opts.delivered ? { steerDelivered: true } : {}),
      },
    },
  ],
})
const assistant = (id: string, parentID?: string) => ({ info: { id, role: "assistant", parentID } })

describe("QUEUED — règle session occupée ET aucune réponse parente", () => {
  test("file simple : message envoyé pendant que la session est occupée", () => {
    const messages = [user("01")]
    expect(queuedUserIDs(messages, true)).toEqual({ "01": true })
    expect(queuedUserIDs(messages, false)).toEqual({})
  })

  test("deux messages en file", () => {
    const messages = [user("01"), user("02")]
    expect(Object.keys(queuedUserIDs(messages, true))).toEqual(["01", "02"])
  })

  test("badge disparaît à la prise en charge (réponse avec ce message pour parent)", () => {
    const messages = [user("01"), assistant("a1", "01")]
    expect(isAnswered(messages, "01")).toBe(true)
    expect(queuedUserIDs(messages, true)).toEqual({})
  })

  test("réponse d'étape finish=tool-calls avec parent : badge disparaît aussi", () => {
    const messages = [user("01"), { info: { id: "a1", role: "assistant", parentID: "01", finish: "tool-calls" } }]
    expect(isAnswered(messages, "01")).toBe(true)
    expect(queuedUserIDs(messages, true)).toEqual({})
  })

  test("aucun badge après le résultat final (session au repos)", () => {
    const messages = [user("01"), user("02")]
    expect(queuedUserIDs(messages, false)).toEqual({})
  })
})

describe("STEER — non affiché, injection réelle, indicateur", () => {
  test("un steer est reconnu, caché de la conversation, et porte son indicateur", () => {
    const s = user("03", { steer: true })
    expect(isSteerUser(s)).toBe(true)
    expect(isHiddenSteer(s)).toBe(true)
    expect(pendingSteer([user("01"), s])?.info?.id).toBe("03")
    expect(deliveryIndicator([user("01"), s], true)).toBe("steer")
    expect(deliveryIndicator([user("01"), s], false)).toBe("")
  })

  test("steer pendant une boucle d'outils : indicateur jusqu'à la livraison", () => {
    const s = user("03", { steer: true })
    const before = [user("01"), assistant("02", "01")]
    expect(pendingSteer([...before, s])?.info?.id).toBe("03")
    const served = user("03", { steer: true, delivered: true })
    expect(hasSteerDelivered(served)).toBe(true)
    expect(pendingSteer([...before, served])).toBeUndefined()
    expect(deliveryIndicator([...before, served], true)).toBe("")
  })

  test("steer repris par un assistant après lui : plus en attente", () => {
    const s = user("03", { steer: true })
    const messages = [user("01"), s, assistant("a2")]
    expect(steerServed(messages, "03")).toBe(true)
    expect(pendingSteer(messages)).toBeUndefined()
  })

  test("steer sans session occupée = envoi normal", () => {
    expect(steerDeliveryMode(true, false)).toBe("send")
    expect(steerDeliveryMode(true, true)).toBe("steer")
    expect(deliveryIndicator([user("03", { steer: true })], false)).toBe("")
  })

  test("esc annule la file : transport simulé + file vidée", async () => {
    const calls: string[] = []
    const transport = {
      async abortSession(id: string) {
        calls.push(`POST /session/${id}/abort`)
        return { ok: true }
      },
    }
    let queued = queuedUserIDs([user("01"), user("02")], true)
    expect(Object.keys(queued)).toHaveLength(2)
    await transport.abortSession("ses_1")
    queued = queueAfterAbort()
    expect(calls).toEqual(["POST /session/ses_1/abort"])
    expect(queued).toEqual({})
  })

})
