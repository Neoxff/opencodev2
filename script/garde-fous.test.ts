import { describe, expect, test } from "bun:test"
import {
  environnementWeb,
  commandeServeur,
  memValeurFixe,
  NO_AUTOSTART_ENV,
  EVAL_REAL_ENV,
  MEM_MAX_ENV,
  ALLOW_AUTOSTART_ENV,
} from "./garde-fous"
import { shouldAutoStart } from "../packages/opencode/src/daemon/autostart"

/**
 * Tests des garde-fous mémoire du lanceur web.
 * Vérifie : démon non démarré avec le drapeau, aucune session headless sans
 * action (EVAL_REAL retiré), plafond mémoire optionnel systemd-run.
 */

const options = { webUiDir: "/tmp/dist", gitTokenEnv: "OPENCODE_GIT_TOKEN", gitToken: "abc123" }

describe("environnementWeb — démon non démarré par défaut", () => {
  test("pose OPENCODE_NO_DAEMON_AUTOSTART=1 par défaut", () => {
    const env = environnementWeb({}, options)
    expect(env[NO_AUTOSTART_ENV]).toBe("1")
  })

  test("le démon n'est pas démarré avec le drapeau (shouldAutoStart amont)", () => {
    const env = environnementWeb({}, options)
    expect(shouldAutoStart({ env, running: false })).toBe(false)
    // Sans le drapeau, l'amont démarrerait le démon — preuve que le drapeau agit.
    expect(shouldAutoStart({ env: {}, running: false })).toBe(true)
  })

  test("ne lance jamais d'évaluations réelles depuis le web", () => {
    const env = environnementWeb({ [EVAL_REAL_ENV]: "1" }, options)
    expect(env[EVAL_REAL_ENV]).toBeUndefined()
  })

  test("transmet le répertoire UI et le jeton Git", () => {
    const env = environnementWeb({}, options)
    expect(env.OPENCODE_WEB_UI_DIR).toBe("/tmp/dist")
    expect(env.OPENCODE_GIT_TOKEN).toBe("abc123")
  })

  test("option explicite pour réautoriser l'autodémarrage", () => {
    const env = environnementWeb({ [ALLOW_AUTOSTART_ENV]: "1" }, options)
    expect(env[NO_AUTOSTART_ENV]).toBeUndefined()
  })

  test("accepte 'true' pour l'option explicite", () => {
    const env = environnementWeb({ [ALLOW_AUTOSTART_ENV]: "true" }, options)
    expect(env[NO_AUTOSTART_ENV]).toBeUndefined()
  })

  test("ne modifie pas l'environnement fourni", () => {
    const original = { FOO: "bar" }
    environnementWeb(original, options)
    expect(original).toEqual({ FOO: "bar" })
  })
})

describe("commandeServeur — plafond mémoire optionnel", () => {
  test("sans OPENCODEV2_MEM_MAX : commande directe", () => {
    const cmd = commandeServeur("/usr/bin/bun", "/src/index.ts", ["serve", "--port", "4096"], {})
    expect(cmd).toEqual(["/usr/bin/bun", "--conditions=browser", "/src/index.ts", "serve", "--port", "4096"])
  })

  test("avec OPENCODEV2_MEM_MAX : systemd-run --user --scope", () => {
    const cmd = commandeServeur("/usr/bin/bun", "/src/index.ts", ["serve", "--port", "4096"], {
      [MEM_MAX_ENV]: "4G",
    })
    expect(cmd[0]).toBe("systemd-run")
    expect(cmd[1]).toBe("--user")
    expect(cmd[2]).toBe("--scope")
    expect(cmd).toContain("-p")
    expect(cmd).toContain("MemoryHigh=3G")
    expect(cmd).toContain("MemoryMax=4G")
    expect(cmd.at(-1)).toBe("4096")
  })

  test("valeur mémoire invalide retombe sur 4G/3G", () => {
    const cmd = commandeServeur("bun", "index.ts", ["serve"], { [MEM_MAX_ENV]: "xyz" })
    expect(cmd).toContain("MemoryMax=4G")
    expect(cmd).toContain("MemoryHigh=3G")
  })
})

describe("memValeurFixe", () => {
  test("MemoryHigh = 75 % de MemoryMax", () => {
    expect(memValeurFixe("4G")).toBe("3G")
    expect(memValeurFixe("8G")).toBe("6G")
    expect(memValeurFixe("2G")).toBe("1.5G")
    expect(memValeurFixe("bogus")).toBe("3G")
  })
})
