/**
 * Garde-fous mémoire du lanceur web — changement amont minimal.
 *
 * Trois règles pures, sans effet de bord, faciles à tester :
 *  1. Le harnais web ne démarre jamais le démon automatiquement
 *     (OPENCODE_NO_DAEMON_AUTOSTART=1), sauf option explicite.
 *  2. Le harnais web ne lance jamais d'évaluations réelles
 *     (OPENCODE_DAEMON_EVAL_REAL retiré de l'environnement).
 *  3. Un plafond mémoire OPTIONNEL encapsule le serveur dans systemd-run
 *     quand OPENCODEV2_MEM_MAX est positionné.
 *
 * Aucune modification de l'environnement d'un processus déjà en cours.
 */

export const NO_AUTOSTART_ENV = "OPENCODE_NO_DAEMON_AUTOSTART"
export const EVAL_REAL_ENV = "OPENCODE_DAEMON_EVAL_REAL"
export const MEM_MAX_ENV = "OPENCODEV2_MEM_MAX"
/** Option explicite pour réautoriser l'autodémarrage depuis le lanceur web. */
export const ALLOW_AUTOSTART_ENV = "OPENCODEV2_ALLOW_DAEMON_AUTOSTART"

export type Env = Record<string, string | undefined>

/**
 * Construit l'environnement du serveur lancé par `bun run web`.
 * - Force NO_AUTOSTART=1, sauf si ALLOW_AUTOSTART est à "1"/"true".
 * - Retire EVAL_REAL (le harnais web ne fait jamais d'éval réelle).
 */
export function environnementWeb(
  env: Env,
  options: { webUiDir: string; gitTokenEnv: string; gitToken: string },
): Env {
  const sortant: Env = { ...env }
  delete sortant[EVAL_REAL_ENV]

  const autoriser = env[ALLOW_AUTOSTART_ENV]
  const autostartAutorise = autoriser === "1" || autoriser?.toLowerCase() === "true"
  if (!autostartAutorise) sortant[NO_AUTOSTART_ENV] = "1"

  sortant.OPENCODE_WEB_UI_DIR = options.webUiDir
  sortant[options.gitTokenEnv] = options.gitToken
  return sortant
}

/**
 * Construit la commande de lancement du serveur.
 * Avec OPENCODEV2_MEM_MAX positionné, encapsule dans
 * `systemd-run --user --scope -p MemoryHigh=3G -p MemoryMax=4G`.
 * La valeur de la variable, si elle ressemble à une taille (ex. "4G"),
 * remplace MemoryMax ; MemoryHigh reste à 75 % de celle-ci.
 */
export function commandeServeur(
  lanceur: string,
  entre: string,
  argumentsServeur: string[],
  env: Env,
): string[] {
  const base = [lanceur, "--conditions=browser", entre, ...argumentsServeur]
  const memMax = env[MEM_MAX_ENV]
  if (!memMax) return base

  const valeur = /^\d+(?:\.\d+)?[KMGT]?$/i.test(memMax) ? memMax : "4G"
  return [
    "systemd-run",
    "--user",
    "--scope",
    "-p",
    `MemoryHigh=${memValeurFixe(valeur)}`,
    "-p",
    `MemoryMax=${valeur}`,
    ...base,
  ]
}

/** MemoryHigh = 75 % de MemoryMax (3G pour 4G par défaut). */
export function memValeurFixe(valeur: string): string {
  const m = /^(\d+(?:\.\d+)?)([KMGT]?)$/i.exec(valeur)
  if (!m) return "3G"
  const nombre = Number(m[1])
  const unite = m[2]?.toUpperCase() ?? ""
  const haute = Math.round(nombre * 0.75 * 100) / 100
  return `${haute}${unite}`
}
