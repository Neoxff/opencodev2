/**
 * La couche pure des menus de la saisie — `/`, `@` et la palette `ctrl+p`.
 *
 * Elle est séparée du composant pour la même raison que `composer-keys.ts` : ce sont des
 * décisions (ce qu'on filtre, comment on navigue, ce qu'on refuse d'envoyer), et une décision
 * se vérifie par un test, pas par une capture. Le composant ne fait que brancher ces fonctions
 * sur des événements.
 *
 * Aucune donnée n'est inventée ici : les lignes sont projetées depuis le registre réel que le
 * serveur publie (`GET /command`, dont `source` vaut `command`, `mcp` ou `skill`) et depuis les
 * fichiers (`GET /find`) et les sessions (`GET /session`) déjà connus de l'application.
 */

/** La provenance d'une ligne — elle pilote l'étiquette affichée à droite. */
export type MenuTag = "mcp" | "skill"

/** Ce qu'une ligne représente, et ce qu'on en fait quand on l'active. */
export type MenuKind = "command" | "file" | "session"

/** Une ligne de menu, réduite à ce que la liste affiche et à ce qu'elle insère. */
export type MenuRow = {
  /** Clé stable pour `For` — deux noms identiques venant de sources différentes ne fusionnent pas. */
  key: string
  kind: MenuKind
  /** Nom affiché en mono, avec son préfixe `/` ou `@`. */
  name: string
  /** Description grisée. */
  detail?: string
  /** Étiquette MCP / Skill ; absente pour une commande ordinaire. */
  tag?: MenuTag
  /** Nom nu de la commande, pour l'exécution et le garde-fou. */
  command?: string
  /** Ce qui est écrit dans la saisie quand on complète (`Tab`) ou qu'on clique. */
  completion: string
  /** Identifiant de session, quand la ligne représente une session. */
  sessionID?: string
}

/** La forme minimale d'une commande du registre serveur. */
export type CommandLike = { name: string; description?: string; source?: string }

/** Une session, déjà projetée pour la liste `@` (le temps relatif est calculé par l'appelant). */
export type MentionSession = { id: string; title: string; when: string }

/* -----------------------------------------------------------------------------
   La projection
   -------------------------------------------------------------------------- */

/**
 * Les commandes en lignes de menu — la même projection pour le `/` et pour la palette.
 *
 * L'étiquette vient du `source` **du serveur**, pas d'une devinette sur le nom : le registre
 * distingue lui-même `command`, `mcp` et `skill` (`packages/opencode/src/command/index.ts:34`).
 * Une commandeordinaire n'a donc pas d'étiquette, et c'est exact.
 */
export function commandRows(commands: CommandLike[], query = ""): MenuRow[] {
  const rows = commands.map((command) => ({
    key: `command:${command.name}`,
    kind: "command" as const,
    name: `/${command.name}`,
    detail: command.description,
    tag: command.source === "mcp" ? ("mcp" as const) : command.source === "skill" ? ("skill" as const) : undefined,
    command: command.name,
    completion: `/${command.name} `,
  }))
  return filterMenuRows(rows, query)
}

/** La palette affiche **les mêmes commandes** que le `/` : un seul registre, une seule projection. */
export function paletteRows(commands: CommandLike[], query = ""): MenuRow[] {
  return commandRows(commands, query)
}

/**
 * Les lignes du `@` : les fichiers du dossier **et** les sessions.
 *
 * Les fichiers viennent en premier — c'est l'usage le plus fréquent — et les sessions suivent,
 * bornées à douze : une liste de centaines de sessions ne se parcourt pas, et le filtre reste là
 * pour trouver celle qu'on cherche. Le détail porte la provenance, comme dans la maquette
 * (`file` / `session · 33m`).
 */
export function mentionRows(files: string[], sessions: MentionSession[], query = ""): MenuRow[] {
  const rows: MenuRow[] = files.map((path) => ({
    key: `file:${path}`,
    kind: "file",
    name: `@${path}`,
    detail: "file",
    completion: `${path} `,
  }))
  for (const session of sessions.slice(0, 12)) {
    rows.push({
      key: `session:${session.id}`,
      kind: "session",
      name: `@${session.title}`,
      detail: `session · ${session.when}`,
      completion: `@${session.title} `,
      sessionID: session.id,
    })
  }
  return filterMenuRows(rows, query)
}

/* -----------------------------------------------------------------------------
   Le filtre
   -------------------------------------------------------------------------- */

/**
 * Le filtre porte sur le nom **et** sur la description.
 *
 * Le nom d'abord, parce qu'on tape le début d'un nom ; la description ensuite, parce qu'on cherche
 * parfois « comment on fait un commit » sans connaître le nom du raccourci. Ne filtrer que le nom
 * rendrait la seconde recherche impossible — défaut déjà mesuré sur le `Picker`.
 */
export function filterMenuRows(rows: MenuRow[], query: string): MenuRow[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return rows
  return rows.filter(
    (row) => row.name.toLowerCase().includes(needle) || (row.detail ?? "").toLowerCase().includes(needle),
  )
}

/* -----------------------------------------------------------------------------
   Le clavier
   -------------------------------------------------------------------------- */

/**
 * Le pas suivant dans la liste, en boucle — c'est ce que fait la maquette : `ArrowDown` en bas
 * revient en haut, `ArrowUp` en haut va en bas. `Home` / `End` vont aux extrémités.
 *
 * `undefined` veut dire « cette touche ne déplace pas la sélection » : l'appelant garde alors la
 * main pour `Entrée`, `Tab` et `Échap`. Une liste vide ne se déplace pas non plus.
 */
export function moveMenuIndex(current: number, length: number, key: string): number | undefined {
  if (length <= 0) return undefined
  switch (key) {
    case "ArrowDown":
      return (current + 1) % length
    case "ArrowUp":
      return (current - 1 + length) % length
    case "Home":
      return 0
    case "End":
      return length - 1
    default:
      return undefined
  }
}

/* -----------------------------------------------------------------------------
   Le garde-fou : une commande inconnue n'est jamais envoyée au modèle
   -------------------------------------------------------------------------- */

/**
 * Le nom de commande écrit en tête du texte, ou `undefined` s'il n'y en a pas.
 *
 * `/review changes` donne `review`. Un `/` seul n'est pas encore une commande : c'est l'état qui
 * ouvre la liste, et il ne doit rien bloquer.
 */
export function commandToken(text: string): string | undefined {
  const trimmed = text.trim()
  if (!trimmed.startsWith("/")) return undefined
  const token = trimmed.slice(1).split(/\s+/)[0] ?? ""
  return token || undefined
}

/** Le nom est-il **exactement** dans le registre publié par le serveur ? */
export function isKnownCommand(token: string, commands: CommandLike[]): boolean {
  return commands.some((command) => command.name === token)
}

/**
 * Le nom inconnu d'une commande, ou `undefined` si le texte peut partir.
 *
 * Un `/` suivi d'un nom absent du registre est **bloqué**, même quand le registre est vide :
 * ne pas savoir si une commande existe n'autorise pas à l'envoyer au modèle comme du texte. C'est
 * la différence entre « la liste est vide » et « cette commande n'existe pas » — les deux se
 * traduisent ici par le même refus, et c'est le refus qui est sûr.
 */
export function unknownCommand(text: string, commands: CommandLike[]): string | undefined {
  const token = commandToken(text)
  if (!token) return undefined
  return isKnownCommand(token, commands) ? undefined : token
}
