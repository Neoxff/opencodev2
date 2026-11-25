import { describe, expect, test } from "vitest"
import {
  errorLine,
  isStaleBusy,
  isTitleError,
  retryInfo,
  retryTimeLabel,
  runStatusLabel,
  sanitizeErrorText,
  shouldInterrupt,
  statusErrorLine,
} from "../public/ui/session-error.js"

const NEXT = new Date("2026-11-25T14:35:00").getTime()

const retryStatus = (overrides = {}) => ({
  type: "retry",
  attempt: 1,
  message: "AI_APICallError: Free usage limit reached",
  action: {
    reason: "free_tier_limit",
    provider: "opencode",
    title: "Model error",
    message: "Free usage limit reached, retry scheduled",
    label: "Choose another model",
  },
  next: NEXT,
  ...overrides,
})

describe("erreurs fournisseur — affichage lisible et sans secret", () => {
  test("sanitizeErrorText retire jetons et basic-auth", () => {
    expect(sanitizeErrorText("token ghp_abcdefghijklmnopqrstuvwxyz123456")).toContain("[redacted]")
    expect(sanitizeErrorText("https://user:secret@example.com")).not.toContain("secret")
    expect(sanitizeErrorText("Free usage limit reached")).toBe("Free usage limit reached")
  })

  test("retryInfo extrait message, raison, heure et bouton", () => {
    const info = retryInfo(retryStatus())!
    expect(info.reason).toBe("free_tier_limit")
    expect(info.message).toContain("Free usage limit reached")
    expect(info.label).toBe("Choose another model")
    expect(info.next).toBe(NEXT)
    expect(retryInfo({ type: "idle" })).toBeUndefined()
  })

  test("ligne de conversation : texte lisible, heure et bouton, aucun secret", () => {
    const status = retryStatus()
    status.action.message = "key sk-abcdefghijklmnop123456 Free usage limit reached"
    const line = errorLine(status, {
      sessionID: "ses_1",
      now: NEXT,
    })!
    expect(line.kind).toBe("p")
    expect(line.html).toContain("Free usage limit reached")
    expect(line.html).toContain("Choose another model")
    expect(line.html).toContain("next try at")
    expect(line.html).not.toContain("sk-abcdefghijklmnop123456")
    expect(line.html).toContain("[redacted]")
  })

  test("statusErrorLine ignore les événements non-retry et les erreurs title", () => {
    expect(statusErrorLine({ type: "session.status", properties: { status: { type: "busy" } } })).toBeUndefined()
    expect(statusErrorLine({ type: "session.status", properties: { status: retryStatus() }, agent: "title" })).toBeUndefined()
    expect(isTitleError({ properties: { info: { agent: "title" } } })).toBe(true)
    expect(isTitleError({ properties: { info: { agent: "build" } } })).toBe(false)
  })
})

describe("état Retrying et annulation", () => {
  test("runStatusLabel affiche Retrying at HH:MM puis Working…", () => {
    expect(runStatusLabel(retryStatus(), NEXT)).toMatch(/^Retrying at \d{2}:\d{2}$/)
    expect(runStatusLabel({ type: "busy" })).toBe("Working…")
    expect(retryTimeLabel(NEXT, NEXT)).toMatch(/^\d{2}:\d{2}$/)
  })

  test("shouldInterrupt : esc et bouton carré annulent un retry", () => {
    expect(shouldInterrupt(false, retryStatus())).toBe(true)
    expect(shouldInterrupt(true, { type: "busy" })).toBe(true)
    expect(shouldInterrupt(false, { type: "idle" })).toBe(false)
    expect(shouldInterrupt(true, retryStatus(), true)).toBe(false)
  })

  test("sessions stale après redémarrage détectées via statut serveur", () => {
    expect(isStaleBusy({ type: "busy" }, false)).toBe(true)
    expect(isStaleBusy({ type: "busy" }, true)).toBe(false)
    expect(isStaleBusy({ type: "idle" }, false)).toBe(false)
    expect(isStaleBusy({ type: "retry" }, false)).toBe(false)
  })

  test("transport simulé : abort annule le retry et repasse au repos", async () => {
    const calls: string[] = []
    const transport = {
      async abortSession(id: string) {
        calls.push(`POST /session/${id}/abort`)
        return { ok: true }
      },
    }
    let retryState: unknown = retryStatus()
    let running = true
    const abort = async () => {
      const wasRetry = !!retryInfo(retryState)
      retryState = null
      await transport.abortSession("ses_1")
      running = false
      return wasRetry
    }
    const cancelled = await abort()
    expect(cancelled).toBe(true)
    expect(calls).toEqual(["POST /session/ses_1/abort"])
    expect(retryState).toBeNull()
    expect(running).toBe(false)
  })
})
