import { createEffect, createMemo, createSignal, For, Show, onCleanup, onMount, untrack } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import {
  buildFilePart,
  filePartLabel,
  fileSizeLabel,
  isImageMime,
  validateAttachment,
  type Attachment,
} from "./attachments"
import { authHeaders } from "./auth"
import { writeClipboard } from "./clipboard"
import { client, credentials, fetchHealth, rememberCredentials, serverUrl, type Health } from "./client"
import {
  DETAILS_DEFAULT,
  SIDEBAR_DEFAULT,
  SIDEBAR_MAX,
  SIDEBAR_MIN,
  clampWidth,
  computeColumns,
  effectiveSidebarPreference,
} from "./columns"
import {
  Boundary,
  ComposerMarkup,
  TaskContract,
  TodoList,
  ContextInjections,
  ModifiedFiles,
  FileChip,
  Media,
  PatchLine,
  PermissionSheet,
  QuestionSheet,
  Reasoning,
  ShowMore,
  SessionRow,
  Spinner,
  Turn,
  UserPrompt,
  WorkspaceGroup,
} from "./components"
import { COMPOSER_PLACEHOLDER, ComposerControls, ComposerStatusBar, ComposerSuggestions } from "./composer-ui"
import {
  ConversationHeader,
  ConversationParagraph,
  ConversationUserMessage,
  DelegateRow,
  EditRow,
  RunRow,
  ScrollChrome,
  ThoughtRow,
  toolDuration,
} from "./conversation"
import {
  AgentsSection,
  GeneralSection,
  McpSection,
  PluginsSection,
  SettingsSheet,
} from "./settings-sheet"
import { ProvidersSection } from "./providers"
import { browserStorage, readSkyMode, writeSkyMode } from "./sky/preferences"
import { SkyCanvas, SkySection } from "./sky/sky"
import type { SkyMode } from "./sky/types"
import {
  SETTINGS_SECTIONS,
  SETTING_SPECS,
  agentChoices,
  agentDisabled,
  agentModel,
  agentPatch,
  authBody,
  authMethods,
  modelCatalog,
  modelContextLimits,
  catalogSummaries,
  providerModelChoices,
  providerSummaries,
  scopeKey,
  scopedValues,  type ProviderSummary,
  settingDisplay,
  settingGroups,
  settingValue,
  shellChoices,
  type AuthMethod,
  type Choice,
  type ProviderAuth,
  type SettingSpec,
  type SettingsSectionKey,
  blacklistPatch,
  discoverPatch,
  mergeDeclared,
  modelPatch,
  newProviderDraft,
  parseModelChoice,
  modelVariantCatalog,
  preferredVariant,
  providerId,
  providerPatch,
  toggleModel,
} from "./settings"
import { Picker } from "./picker"
import { FolderBrowser } from "./folder-browser"
import { PlusIcon, SendIcon } from "./icons"
import "./shortcuts.css"
import { ShortcutPalette, type PaletteCommand } from "./shortcut-palette"
import {
  deliveryNotice,
  keyState,
  matchShortcut,
  partMetadata,
  submitMode,
  type SubmitMode,
} from "./shortcuts"
import { CrossIcon, FolderPlusIcon, GearIcon, PluginIcon, PlusIcon, SearchIcon, SendIcon } from "./icons"
import { FolderPicker } from "./picker"
import { FolderBrowser } from "./folder-browser"
import { CrossIcon, FolderPlusIcon, GearIcon, PluginIcon, PlusIcon, SearchIcon } from "./icons"
import { TrajectoryView } from "./trajectory-view"
import {
  commandChoices,
  historyStep,
  mentionQuery,
  nextChoice,
  promptHistory,
  replaceRange,
  slashQuery,
  type CommandChoice,
} from "./composer-keys"
import {
  commandRows,
  commandToken,
  isKnownCommand,
  mentionRows,
  moveMenuIndex,
  paletteRows,
  type MentionSession,
  type MenuRow,
} from "./menus"
import { CommandPalette, SuggestMenu } from "./menu-components"
import { relativeTime } from "./time"
  runCommandLine,
  type CommandActivity,
  type SessionCommandHost,
  type SessionCommandTransport,
} from "./session-commands"
import { CommandActivityLines, SessionCommandDialogs, type CommandDialogState } from "./session-command-ui"
import { contractFrom, contractPayload, todosFrom, type ContractDraft, type ContractView, type TodoView } from "./plan"
import {
  agentCounts,
  agentRows,
  agentSummary,
  filterAgents,
  mcpConnectedCount,
  mcpProblems,
  type Agent,
  type McpState,
} from "./config"
import { injectionPhase, parseInjections, relativeTo } from "./injections"
import { pluginEntries, type PluginList } from "./nav"
import { SESSION_LIMIT, groupByWorkspace, sessionDetails, splitSessions, type ProjectRef, type SessionSummary, type WorkspaceGroup as WorkspaceGrouping } from "./sessions"
import { MOTTOS, nextMottoIndex, salutation, type Motto } from "./ouverture"
import { OpeningScreen } from "./ouverture-screen"
import { subscribeEvents, type EventStreamState } from "./events"
import { ConfigTab } from "./config-tab"
import { LogsTab } from "./logs-tab"
import {
  buildConfigPatch,
  maskConfig,
  parseConfigText,
  type JsonObject,
  type LogEntry,
} from "./config-editor"
import { GitPanel } from "./git-panel"
import RessourcesPanel from "./ressources-panel"
import { RightPanel, type GoalAction } from "./right-panel"
import { gitApi, type GitStatus } from "./git-client"
import {
  createReloadGate,
  createTicketGuard,
  createLatestGate,
  resyncPlan,
  threadEventOutcome,
} from "./stream-sync"
import { relativeTime, sessionTimestamp } from "./time"
import {
  SidebarActions,
  SidebarFolder,
  SidebarFooter,
  SidebarHistory,
  SidebarLogo,
  SidebarNewSession,
  SidebarReadMore,
  SidebarSession,
  groupLatestTime,
  recentSessions,
  sessionActivityMap,
} from "./sidebar"
import {
  answerDocuments,
  dropPermission,
  fileDiff,
  formatDuration,
  toolDetail,
  toolStatusLabel,
  toolTitle,
  dropQuestion,
  emptyAnswers,
  groupTurns,
  lastWorkingTurn,
  servedTurn,
  partMedia,
  reducePermissions,
  reasoningLive,
  reduceQuestions,
  sessionStats,
  setCustomAnswer,
  toggleAnswer,
  turnError,
  type Message,
  type TurnCache,
  type Part,
  type PermissionReply,
  type PermissionRequest,
  type QuestionAnswers,
  type QuestionRequest,
  type StepView,
  type ToolState,
  type TurnView,
} from "./view-model"

const DIR_KEY = "oc.webui.directory"

/**
 * L'écran, en cinq zones : rail des sessions, fil, saisie, et un tiroir droit qui n'apparaît que
 * lorsqu'une décision est attendue. Tout le reste a été retiré — un agent généraliste produit des
 * choses très diverses, et c'est la **conversation** qui absorbe cette variété, pas le mobilier.
 */
export default function App() {
  const [health, setHealth] = createSignal<Health | undefined>()
  const [sessions, setSessions] = createSignal<SessionSummary[]>([])
  const [active, setActive] = createSignal<string | undefined>()
  /**
   * Écran d'ouverture : salut selon l'heure et mot d'ordre tirés une fois par
   * ouverture. L'index du mot d'ordre est mémorisé localement par
   * `nextMottoIndex` (avec repli aléatoire) ; aucun appel réseau n'est fait.
   */
  const [greeting, setGreeting] = createSignal(salutation(new Date()))
  const [motto, setMotto] = createSignal<Motto>(MOTTOS[nextMottoIndex()]!)
  const [messages, setMessages] = createSignal<Message[]>([])
  const [stream, setStream] = createSignal<EventStreamState>({ connected: false, reconnects: 0 })
  /** L'agent travaille : le serveur le dit (`session.status` → `busy`), on ne le devine pas. */
  const [working, setWorking] = createSignal(false)
  /** L'activité **par session**, lue sur `GET /session/status` puis tenue par les événements. */
  const [sessionBusy, setSessionBusy] = createSignal<Record<string, boolean>>({})
  /**
   * L'identité des tours, gardée **entre deux rendus** : un tour dont les messages n'ont pas bougé
   * est rendu tel quel, et Solid garde donc ses nœuds (mesuré : sans ce cache, l'animation d'entrée
   * des injections démarrait 610 fois par tour pour 2 lignes). Vidé quand on change de session —
   * les identifiants de messages d'une autre session n'ont rien à y faire.
   */
  const turnCache: TurnCache = new Map()
  /**
   * Le fil, **dans un store réconcilié** — et c'est ce qui rend le rendu fin possible.
   *
   * `groupTurns` rend des objets neufs à chaque changement ; `For` de Solid recrée alors le nœud de
   * l'élément dont la référence a changé. Mesuré sur un tour réel : la ligne d'injections a été
   * recréée **482 fois** et l'icône de raisonnement **238 fois**, à chaque image du flux — d'où une
   * animation d'entrée qui rejouait sans fin, et un coût de rendu qui suivait la taille du fil
   * plutôt que ce qui change.
   *
   * `reconcile` **diffe** au lieu de remplacer : les objets inchangés gardent leur identité, et un
   * champ modifié (`part.text`) est écrit **en place**. Les nœuds du fil survivent donc au flux, ce
   * qui est la condition d'une animation d'entrée qui ne joue qu'une fois.
   */
  const [turnsStore, setTurnsStore] = createStore<{ list: TurnView[] }>({ list: [] })
  createEffect(() => {
    // `messages()` est la seule dépendance : `reconcile` **lit** le store pour le différencier, et
    // cette lecture, faite dans le même effet, le rendrait dépendant de ce qu'il écrit — boucle.
    const next = groupTurns(messages(), turnCache)
    untrack(() => setTurnsStore("list", reconcile(next, { key: "id" })))
  })
  const turns = () => turnsStore.list
  /** Les statistiques de la session : agrégées **une fois**, pour la section — jamais pour le fil. */
  const stats = createMemo(() => sessionStats(turns()))
  /**
   * Le tiroir droit et ses onglets.
   *
   * Il gagne une seconde raison d'exister : la **consultation** (§10). Il s'ouvre toujours de
   * lui-même sur une décision bloquante — ça, ça ne change pas.
   */
  const [drawerOpen, setDrawerOpen] = createSignal(false)
  const [drawerTab, setDrawerTab] = createSignal<"session" | "decisions">("session")
  /**
   * Le panneau droit (« comme le CLI ») : cinq sections qui lisent les signaux déjà présents —
   * contrat, statistiques, MCP, LSP, todos. Il partage la colonne `details` avec le tiroir.
   */
  const [panelOpen, setPanelOpen] = createSignal(true)
  /** État Git réel du dépôt — pour le pied du panneau `dossier:branche`. */
  const [gitStatus, setGitStatus] = createSignal<GitStatus>()
  /**
   * La **vue** du panneau principal : la conversation, ou le journal.
   *
   * Deux vues, pas deux panneaux : elles occupent la même place et se remplacent, comme les dialogues
   * du TUI. Le journal n'est donc pas un tiroir qu'on ouvre à côté du chat — c'est l'écran qui change,
   * et c'est la barre au-dessus du chat qui le commute.
   */
  const [view, setView] = createSignal<"chat" | "logs">("chat")
  /**
   * Le journal de l'écran — les derniers événements reçus du serveur.
   *
   * C'est le seul journal qu'on puisse montrer **honnêtement** : le serveur n'expose pas de route qui
   * *lise* ses logs (`POST /log` ne fait qu'en écrire un), et les fichiers vivent hors du projet, donc
   * hors de portée de `/file/content`. Ce qu'on voit ici est donc ce que la page a réellement reçu —
   * et c'est précisément ce qui sert à diagnostiquer « il ne se passe rien à l'écran ».
   *
   * Borné : un journal qui grossit sans fin est une fuite, pas un journal.
   */
  const [logEntries, setLogEntries] = createSignal<Array<{ at: number; type: string; note?: string }>>([])

  /**
   * Les onglets du panneau principal — Conversation, Config, Logs (maquette §Onglets).
   * `view` garde sa sémantique Chat/Trajectory ; `panelTab` commute l'écran entier vers les deux
   * nouveaux onglets. Un seul onglet actif : trois écrans qui se remplacent, pas trois panneaux.
   */
  const [panelTab, setPanelTab] = createSignal<"conv" | "config" | "logs">("conv")
  /** Éditeur de configuration : texte masqué, configuration d'origine, et trois états. */
  const [configSourceText, setConfigSourceText] = createSignal("")
  const [configOriginal, setConfigOriginal] = createSignal<JsonObject>({})
  const [configLoading, setConfigLoading] = createSignal(false)
  const [configError, setConfigError] = createSignal<string | undefined>()
  const [configNotice, setConfigNotice] = createSignal<string | undefined>()
  const [configBusy, setConfigBusy] = createSignal(false)
  const LOG_LIMIT = 200
  /**
   * Le **schéma déclaré** de chaque outil (`GET /experimental/tool`), pour le panneau de détail.
   *
   * `GET /experimental/tool` pesait 61 ko sur l'instance de développement : c'est le prix d'un onglet
   * `Schema` utile, et il ne se paie qu'à l'ouverture de la vue `Trajectory`. La route exige un couple
   * `provider`/`model`, donc on prend celui de la saisie — le même que celui des messages.
   */
  const [toolSchemas, setToolSchemas] = createSignal<
    Record<string, { description?: string; parameters?: unknown }>
  >({})
  /**
   * La question de l'agent : la **seule** écriture du fil. Elle est bloquante — tant qu'elle n'a pas
   * de réponse, la conversation est arrêtée — donc elle n'est pas rangée dans un panneau : elle
   * s'affiche dans le fil, là où l'on regarde.
   */
  const [questions, setQuestions] = createSignal<QuestionRequest[]>([])
  /** Brouillons de réponse, par identifiant de question : la réponse est positionnelle. */
  const [answers, setAnswers] = createSignal<Record<string, QuestionAnswers>>({})
  const [draft, setDraft] = createSignal("")
  const [error, setError] = createSignal<string | undefined>()
  const [permissions, setPermissions] = createSignal<PermissionRequest[]>([])
  const [expanded, setExpanded] = createSignal<Record<string, boolean>>({})

  const [directory, setDirectory] = createSignal(localStorage.getItem(DIR_KEY) ?? "")
  const [serverPath, setServerPath] = createSignal<string | undefined>()
  /** La racine du projet — la base sous laquelle `/file/content` résout un chemin. */
  const [worktree, setWorktree] = createSignal<string | undefined>()
  /** Le dossier de configuration du serveur — c'est là que les réglages sont réellement écrits. */
  const [configPath, setConfigPath] = createSignal<string | undefined>()
  /**
   * Les workspaces que le serveur connaît déjà — la complétion du champ de dossier du **rail**.
   *
   * Elle vit sur le champ, pas dans la feuille de réglages : la complétion accompagne l'action, et
   * l'action est au premier plan. `GET /project` pèse 962 octets, donc elle se lit au montage.
   */
  const [projects, setProjects] = createSignal<ProjectRef[]>([])
  /**
   * Les choix que le serveur publie, déjà projetés. **Jamais les charges brutes** : celle des
   * modèles porte les clés des fournisseurs, et elle est abandonnée dès la projection.
   */
  const [modelOptions, setModelOptions] = createSignal<Choice[]>([])
  /**
   * Le modèle et l'agent du **prochain message**.
   *
   * Ce ne sont pas des réglages de session persistés : ils partent avec chaque envoi — `promptAsync`
   * les accepte, et c'est ce qui rend le changement effectif dès le message suivant. Vides, ils
   * valent « défaut du serveur » et l'envoi n'ajoute alors aucune contrainte.
   */
  const [composerModel, setComposerModel] = createSignal("")
  const [composerAgent, setComposerAgent] = createSignal("")
  /**
   * Les variantes sont projetées depuis `/config/providers` au moment où le catalogue est lu : la
   * charge brute, elle contient des clés en clair et ne survit pas à cette projection.
   */
  const [variantCatalog, setVariantCatalog] = createSignal<Record<string, Choice[]>>({})
  const [composerVariant, setComposerVariant] = createSignal("")
  const variantOptions = createMemo(() => variantCatalog()[composerModel()] ?? [])
  /** La variante affichée et envoyée : choix explicite valide, sinon la première offerte par le modèle. */
  const activeVariant = createMemo(() => {
    const current = composerVariant()
    const choices = variantOptions()
    return choices.some((choice) => choice.value === current) ? current : preferredVariant(choices)
  })
  /**
   * Le plan de la session — ses todos et son contrat — affiché juste au-dessus du compositeur.
   *
   * Il vit **hors du fil** : ce sont des informations d'état courant, pas un moment passé. Le fil
   * raconte ce qui a eu lieu ; ceci dit où l'on en est maintenant.
   */
  const [todos, setTodos] = createSignal<TodoView[]>([])
  const [contract, setContract] = createSignal<ContractView | undefined>()
  /**
   * Le `goalState` **brut**, tel que le serveur le rend.
   *
   * L'écran n'en affiche qu'une projection, mais l'écriture repart de l'état brut : le serveur
   * **remplace** l'objet reçu, donc renvoyer la projection effacerait `findings` et `completion` —
   * une perte de données silencieuse.
   */
  const [rawGoal, setRawGoal] = createSignal<Record<string, unknown> | undefined>(undefined)
  /** La fenêtre de contexte de chaque modèle — la seule donnée dont le remplissage du contexte a besoin. */
  const [modelLimits, setModelLimits] = createSignal<Record<string, number>>({})
  /** Les agents proposables — chargés à la première ouverture du choix, jamais au montage (1,5 Mo). */
  const [agentOptions, setAgentOptions] = createSignal<Choice[]>([])
  const labelOf = (choices: Choice[], value: string, fallback: string) =>
    choices.find((choice) => choice.value === value)?.label ?? (value || fallback)
  const agentLabel = createMemo(() => labelOf(agentOptions(), composerAgent(), "orchestrator"))
  const modelLabel = createMemo(() => labelOf(modelOptions(), composerModel(), "default model"))
  const variantLabel = createMemo(() => activeVariant() || "default variant")
  /**
   * Le modèle et l'agent de la saisie suivent **ce que la session a réellement utilisé**.
   *
   * C'est la seule source qui décrive l'état courant : la configuration ne donne qu'un défaut global,
   * et la session dit ce qui a servi. On ne remplace jamais un choix explicite — la valeur n'est posée
   * que si rien n'a encore été choisi — et elle est lue sous `untrack`, sinon l'écriture relancerait
   * l'effet qui vient de la faire.
   */
  createEffect(() => {
    const list = messages()
    for (let index = list.length - 1; index >= 0; index -= 1) {
      const info = list[index]?.info
      if (!info || info.role !== "assistant") continue
      untrack(() => {
        if (!composerModel() && info.providerID && info.modelID) setComposerModel(`${info.providerID}/${info.modelID}`)
        if (!composerAgent() && typeof info.agent === "string" && info.agent) setComposerAgent(info.agent)
        const requested = info.model?.variant
        if (!composerVariant() && typeof requested === "string" && requested) setComposerVariant(requested)
      })
      return
    }
  })
  const [shellOptions, setShellOptions] = createSignal<Choice[]>([])
  /**
   * Le menu de suggestions de la saisie : les commandes (`/`) ou les fichiers (`@`).
   *
   * Il vit **au-dessus du champ**, dans la même boîte : c'est le clavier qui le pilote, donc il doit
   * être à portée de regard sans faire quitter le champ des yeux.
   */
  const [menu, setMenu] = createSignal<"commands" | "files" | undefined>()
  const [menuIndex, setMenuIndex] = createSignal(0)
  /**
   * La palette `ctrl+p` — les mêmes commandes que le `/`, dans une boîte de dialogue.
   * Son état est séparé du menu du champ : les deux peuvent être ouverts l'un après l'autre,
   * et la palette a son propre champ de filtre et sa propre ligne active.
   */
  const [paletteOpen, setPaletteOpen] = createSignal(false)
  const [paletteQuery, setPaletteQuery] = createSignal("")
  const [paletteIndex, setPaletteIndex] = createSignal(0)
  /**
   * Une commande inconnue est refusée **avant** l'envoi : ce message dit pourquoi le texte n'est
   * pas parti, plutôt que de laisser croire à un envoi silencieux.
   */
  const [commandError, setCommandError] = createSignal<string | undefined>()
  /**
   * Les commandes, lues à la **première** frappe de `/` seulement — `GET /command` pèse 1,95 Mo de
   * gabarits dont la liste n'affiche que le nom et la description.
   */
  const [commandOptions, setCommandOptions] = createSignal<CommandChoice[]>([])
  const [fileOptions, setFileOptions] = createSignal<string[]>([])
  /** La mention en cours : son intervalle, pour remplacer le **mot entier** et pas le seul curseur. */
  const [mentionRange, setMentionRange] = createSignal<{ start: number; end: number } | undefined>()
  /** La position dans l'historique des prompts ; `-1` = un brouillon neuf. */
  const [historyIndex, setHistoryIndex] = createSignal(-1)
  /** Le champ, pour reposer le curseur après un remplacement. */
  let input: HTMLTextAreaElement | undefined
  let fileTimer: ReturnType<typeof setTimeout> | undefined
  const [query, setQuery] = createSignal("")
  /**
   * Le tiroir droit : « Session » (les statistiques) et « Decisions » (une permission en attente).
   * Sa porte vit dans la **tête du fil**, pas dans le rail : c'est le contenu du chat qu'il longe.
   */
  const [renaming, setRenaming] = createSignal<string | undefined>()
  const [renameDraft, setRenameDraft] = createSignal("")
  // Confirmation en ligne : un `window.confirm` natif ne se style pas et bloque tout pilotage.
  const [confirming, setConfirming] = createSignal<string | undefined>()
  /** Les lignes skill/MCP du fil : le nom réellement invoqué, jamais un exemple. */
  const [commandActivities, setCommandActivities] = createSignal<CommandActivity[]>([])
  /** Le dialogue ouvert par une commande de session (renommage, sortie, suppression, éditeur). */
  const [commandDialog, setCommandDialog] = createSignal<CommandDialogState | undefined>()
  /** Un accusé de réception court, distinct de l'erreur : une commande réussie le dit. */
  const [commandNotice, setCommandNotice] = createSignal<string | undefined>()
  let noticeTimer: ReturnType<typeof setTimeout> | undefined
  /** La promesse ouverte par `/exit` : résolue par le bouton du dialogue. */
  let exitResolver: ((accepted: boolean) => void) | undefined
  /**
   * Le menu « … » d'une ligne de session : quelle ligne l'a ouvert. **Une seule à la fois** — c'est
   * ce qui distingue un menu d'une rangée de boutons : le menu se ferme en s'ouvrant ailleurs.
   *
   * Reproduit de DSH : ses lignes portent un « … » qui ouvre `Rename` / `Delete`. Les nôtres
   * posaient **deux glyphes** (✎ et ✕) sur la ligne — une affordance qui prend la place du titre et
   * qu'il faut viser à la souris, là où un menu se découvre d'un clic et se range aussitôt.
   */
  const [menuOpen, setMenuOpen] = createSignal<string | undefined>()
  /** Le menu « … » d'une **ligne de dossier** — même principe, clé de groupe. */
  const [wsMenu, setWsMenu] = createSignal<string | undefined>()
  /** Le dossier en cours de renommage, et ce qu'on tape. `PATCH /project/{id}` porte le `name`. */
  const [renamingProject, setRenamingProject] = createSignal<string | undefined>()
  const [projectDraft, setProjectDraft] = createSignal("")

  const startRenameProject = (group: WorkspaceGrouping) => {
    setWsMenu(undefined)
    setRenamingProject(group.key)
    setProjectDraft(group.label)
  }

  /**
   * Renommer un dossier — **une action réelle**, et c'est ce qui autorise le menu.
   *
   * `PATCH /project/{id}` accepte un `name` : le serveur le retient, `GET /project` le rend, et la
   * ligne du rail affiche donc le nouveau nom. Le serveur n'offre **aucune** suppression de projet :
   * un « Delete » sur une ligne de dossier serait un bouton sans effet, exactement le défaut qu'on
   * vient de corriger ailleurs.
   */
  const commitProjectRename = async () => {
    const key = renamingProject()
    if (!key) return
    const group = groupByWorkspace(sessions(), projects(), directory()).find((candidate) => candidate.key === key)
    const title = projectDraft().trim()
    setRenamingProject(undefined)
    if (!group?.projectID || !title || title === group.label) return
    await client.project
      .update({ projectID: group.projectID, name: title, ...scope() })
      .catch((cause: unknown) => setError(String(cause)))
    void loadProjects()
  }
  // Deux replis indépendants : un dossier entier, et une ligne de session (son détail).
  const [groupsOpen, setGroupsOpen] = createSignal<Record<string, boolean>>({})
  /**
   * La ligne « Workspaces » porte ses **deux gestes de premier niveau** — chercher, ajouter — et se
   * change en champ quand on en déclenche un. Le champ n'existe donc pas au repos : la ligne reste
   * un libellé, et les deux fonctions se trouvent là où on les cherche, sans coûter une ligne de plus.
   */
  const [headMode, setHeadMode] = createSignal<"none" | "search" | "add">("none")
  const [headDraft, setHeadDraft] = createSignal("")
  // Configuration : lue seulement quand la feuille s'ouvre. Rien de tout cela ne s'affiche au repos.
  const [configOpen, setConfigOpen] = createSignal(false)
  /** La palette Ctrl+P : un calque, donc Échap la ferme avant d'interrompre l'agent. */
  const [paletteOpen, setPaletteOpen] = createSignal(false)
  /** Retour court des raccourcis (file, steer) — effacé après quelques secondes. */
  const [shortcutNotice, setShortcutNotice] = createSignal<string | undefined>()
  let shortcutTimer: ReturnType<typeof setTimeout> | undefined
  const [config, setConfig] = createSignal<{
    model?: unknown
    small_model?: unknown
    username?: unknown
    instructions?: unknown
    /** La carte `Record<nom, AgentConfig>` — lue pour **configurer** les agents, pas seulement les lister. */
    agent?: Record<string, unknown>
    /** Les réglages déclarés (`SETTING_SPECS`) lisent leur clé ici : la signature d'index est
     *  nécessaire, sinon chaque clé devrait être nommée dans ce type — et un réglage ajouté aux
     *  données cesserait de compiler. */
    [key: string]: unknown
  }>({})
  const [agents, setAgents] = createSignal<Agent[]>([])
  const [mcp, setMcp] = createSignal<Record<string, McpState>>({})

  // Réglages : une section ne charge ses données **qu'à sa sélection**. `GET /provider` (6,7 Mo)
  // n'est jamais appelé ; `/provider/auth` suffit et ne pèse que quelques kilo-octets.
  const [settingsSection, setSettingsSection] = createSignal<SettingsSectionKey>("general")
  const [providerAuth, setProviderAuth] = createSignal<ProviderAuth | undefined>()
  const [providerValues, setProviderValues] = createSignal<Record<string, string>>({})
  /**
   * Les fournisseurs **résumés**, et leurs modèles.
   *
   * Ce sont les deux seules choses qui sortent de la charge de `/config/providers`, laquelle porte les
   * clés **en clair** (7 champs `key`/`apiKey` mesurés). Le résumé retient `ready: boolean` — le fait
   * qu'un identifiant existe, jamais sa valeur. La projection se fait au chargement, et la charge
   * n'entre dans aucun signal.
   */
  const [providerRows, setProviderRows] = createSignal<ProviderSummary[]>([])
  const [providerModels, setProviderModels] = createSignal<Record<string, Choice[]>>({})
  /** Le catalogue (228 fournisseurs, 6,7 Mo) — vide tant qu'on n'a pas cherché. */
  const [providerCatalog, setProviderCatalog] = createSignal<ProviderSummary[]>([])
  const [catalogPending, setCatalogPending] = createSignal(false)
  const [providerQuery, setProviderQuery] = createSignal("")
  const [pluginSpec, setPluginSpec] = createSignal("")
  /** Les valeurs saisies, par clé de réglage — avant enregistrement. */
  const [specDrafts, setSpecDrafts] = createSignal<Record<string, string>>({})
  const [settingsNotice, setSettingsNotice] = createSignal<string | undefined>()
  const [settingsError, setSettingsError] = createSignal<string | undefined>()
  const [settingsBusy, setSettingsBusy] = createSignal<string | undefined>()
  /**
   * Le ciel : préférence **de ce navigateur**, persistée dans `localStorage`
   * (et non dans la configuration serveur). Sans valeur enregistrée, on
   * respecte `prefers-reduced-motion` — le doc de design impose `static`.
   */
  const [skyMode, setSkyMode] = createSignal<SkyMode>(
    readSkyMode(
      browserStorage(),
      typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
  )
  /** L'état est appliqué d'abord, la persistance ensuite — jamais l'inverse. */
  const changeSkyMode = (mode: SkyMode) => {
    setSkyMode(mode)
    writeSkyMode(browserStorage(), mode)
  }
  /** Les modèles saisis par agent, avant enregistrement. */
  const [agentDrafts, setAgentDrafts] = createSignal<Record<string, string>>({})
  /** La recherche d'agents : 34 lignes ne se parcourent pas, l'utilisateur sait ce qu'il cherche. */
  const [agentQuery, setAgentQuery] = createSignal("")
  /** Un seul fournisseur ouvert à la fois : huit formulaires concurrents, c'est huit décisions. */
  const [providerSelected, setProviderSelected] = createSignal<string | undefined>()
  /**
   * Déclarer un fournisseur que le catalogue ignore — un serveur maison, un revendeur.
   *
   * Replié au repos, parce que c'est **rare** : l'immense majorité des ajouts consiste à écrire une
   * clé sur un fournisseur qui existe déjà. Un formulaire ouvert en permanence occuperait la place
   * d'un geste qui se fait une fois.
   */
  const [providerNewOpen, setProviderNewOpen] = createSignal(false)
  const [providerDraft, setProviderDraft] = createSignal<Record<string, string>>({})

  // Plugins : les seuls accès hors session. Lus au montage — 708 octets, donc sans coût.
  const [plugins, setPlugins] = createSignal<PluginList | undefined>()
  // « voir plus » par dossier : replier est l'état par défaut, déplier est un geste explicite.
  const [moreOpen, setMoreOpen] = createSignal<Record<string, boolean>>({})
  /** L'historique et les archives ne sont pas des panneaux permanents : ils s'ouvrent sur geste. */
  const [historyOpen, setHistoryOpen] = createSignal(false)
  const [archivedOpen, setArchivedOpen] = createSignal(false)

  /**
   * Les identifiants du serveur — **lus** ici, écrits par le bloc `Server` de `General`.
   *
   * Ils vivent dans `localStorage` (`oc.webui.auth`), pas dans `Config` : c'est un réglage de **ce
   * navigateur**, pas du serveur. Le formulaire n'a plus de popover : il n'a pas d'état d'ouverture.
   */
  const [authUser, setAuthUser] = createSignal(credentials?.username ?? "")
  const [authPass, setAuthPass] = createSignal(credentials?.password ?? "")

  const [attachments, setAttachments] = createSignal<Attachment[]>([])
  const [attachError, setAttachError] = createSignal<string | undefined>()

  /** Horloge figée par rendu : évite que chaque ligne recalcule un temps différent. */
  const now = () => Date.now()
  /**
   * L'horloge de ce qui **dure** : un battement d'une seconde, et seulement pendant que l'agent
   * travaille. Un raisonnement en cours affiche donc un temps qui avance au lieu d'un temps figé —
   * et rien ne bat au repos (aucun minuteur ne tourne).
   */
  const [tick, setTick] = createSignal(Date.now())
  createEffect(() => {
    if (!working()) return
    const timer = setInterval(() => setTick(Date.now()), 1000)
    onCleanup(() => clearInterval(timer))
  })

  // ---- Charpente : solveur de concession de DSH (`columns.ts`) ----
  // Les préférences sont l'état ; les largeurs rendues sont **dérivées**. C'est ce qui rend la
  // restauration au ré-élargissement automatique : rien n'est réécrit pendant une concession.
  const [viewport, setViewport] = createSignal(typeof window === "undefined" ? 1440 : window.innerWidth)
  const [sidebarPref, setSidebarPref] = createSignal(SIDEBAR_DEFAULT)
  const [narrowExpanded, setNarrowExpanded] = createSignal(false)

  const columns = () =>
    computeColumns(viewport(), effectiveSidebarPreference(viewport(), sidebarPref(), narrowExpanded()), DETAILS_DEFAULT)

  /**
   * Le tiroir droit n'a qu'une raison d'exister : une demande d'accord. Pas de panneau vide, pas
   * d'onglets, pas de journal d'événements — la piste reste à 0 tant qu'on n'a rien à décider.
   * Le tiroir a **deux** raisons d'exister (§10) : une permission en attente, et la consultation des
   * statistiques. Mesuré le 2026-10-14 : la largeur ne suivait **que** la permission, donc le bouton
   * `stats` basculait bien son état mais la colonne restait à **0 px** — le panneau se rendait dans
   * une colonne invisible, et le bouton paraissait mort alors que c'était la largeur qui manquait.
   */
  const detailsWidth = () => {
    // Le panneau droit se masque sous 1100 px (maquette) : on ne réserve alors pas sa colonne.
    const drawer = drawerOpen() || permissions().length > 0
    const panel = panelOpen() && viewport() >= 1100
    return drawer || panel ? columns().details : 0
  }

  const layoutStyle = () => ({
    "grid-template-columns": `${columns().sidebar}px minmax(0, 1fr) ${detailsWidth()}px`,
  })

  /**
   * Glissement de la frontière rail/conversation. DSH précise que cette frontière est une **bande
   * de préhension invisible**, là où celle des détails garde une pilule visible.
   */
  const startSidebarDrag = (event: PointerEvent) => {
    event.preventDefault()
    const depart = event.clientX
    const largeurDepart = columns().sidebar
    const onMove = (move: PointerEvent) => {
      setSidebarPref(clampWidth(largeurDepart + (move.clientX - depart), SIDEBAR_MIN, SIDEBAR_MAX))
      // Un glissement manuel sous le seuil vaut ré-expansion explicite (`narrowExpanded` chez DSH).
      if (viewport() < 1024) setNarrowExpanded(true)
    }
    const onUp = () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
  }

  /**
   * Every SDK method takes `directory` as a query parameter, so switching the working directory
   * needs no client rebuild — the value is threaded into each call instead.
   */
  const scope = () => (directory().trim() ? { directory: directory().trim() } : {})

  const loadPath = async () => {
    const result = await client.path.get(scope()).catch(() => undefined)
    // Observed shape: { home, state, config, worktree, directory } — not `cwd`/`root`.
    const data = (result as { data?: { directory?: string; worktree?: string; config?: string } } | undefined)?.data
    setServerPath(data?.directory ?? data?.worktree)
    // La racine du **projet**, gardée à part : c'est la base sous laquelle `/file/content` résout un
    // chemin. L'instance, elle, est le dossier courant (`packages/opencode`), qui ne contient pas
    // tous les fichiers du projet — s'en servir comme base rendrait illisibles la moitié des sources.
    setWorktree(data?.worktree)
    setConfigPath(data?.config)
  }

  /**
   * Les workspaces connus — la complétion du champ de dossier du rail.
   *
   * `/` est un projet maison du serveur, pas un lieu de travail : il n'aide pas la saisie.
   */
  const loadProjects = async () => {
    const result = await client.project.list({}).catch(() => undefined)
    const data = (result as { data?: Array<{ id?: string; worktree?: string; name?: string }> } | undefined)?.data
    if (!Array.isArray(data)) return
    /*
     * On garde l'**identifiant** et le **nom** avec le chemin, et pas seulement le chemin :
     * `PATCH /project/{id}` ne prend pas un chemin mais un identifiant, et c'est le **nom** qui
     * permet à un renommage de se voir sur la ligne du rail. Ne garder que le chemin rendait le
     * renommage impossible sans un second appel.
     */
    setProjects(
      data
        .filter((project) => Boolean(project.worktree) && project.worktree !== "/")
        .map((project) => ({ path: project.worktree as string, id: project.id, name: project.name })),
    )
  }

  /**
   * Les interpréteurs installés. `GET /pty/shells` pèse **353 octets** et n'est **pas dans le SDK**
   * — mesuré : « Request is not supported by this version of OpenCode Server ». On l'appelle donc
   * directement, par le même chemin que le reste : `/pty` est proxifié vers le serveur, et en
   * production l'UI est servie par lui (même origine).
   */
  const fetchShells = async () => {
    const response = await fetch(`${serverUrl}/pty/shells`).catch(() => undefined)
    if (!response?.ok) return undefined
    return (await response.json().catch(() => undefined)) as unknown
  }

  /**
   * Le catalogue des modèles, pour la **saisie**.
   *
   * `GET /config/providers` pèse 531 ko et 49 ms : c'est le prix d'un changement de modèle facile
   * depuis le champ, et il se paie une fois. La charge porte les clés des fournisseurs **en clair**,
   * donc elle est projetée dans les deux lignes suivantes et n'entre dans aucun signal — on ne garde
   * que les `{ value, label }` et les fenêtres de contexte.
   *
   * C'est aussi ce qui donne au remplissage du contexte sa **limite** : sans elle, la barre se tairait
   * au lieu d'afficher un « 0% » qui ferait croire à une fenêtre vide.
   */
  const loadModelCatalog = async () => {
    if (modelOptions().length > 0) return
    const result = await client.config.providers().catch(() => undefined)
    const payload = (result as { data?: unknown } | undefined)?.data
    setModelOptions(modelCatalog(payload))
    setModelLimits(modelContextLimits(payload))
    setVariantCatalog(modelVariantCatalog(payload))
  }

  /** Les agents proposables — payés à la première ouverture du choix, pas au montage. */
  const loadAgentOptions = async (): Promise<Choice[]> => {
    if (agentOptions().length > 0) return agentOptions()
    const result = await client.app.agents(scope()).catch(() => undefined)
    const data = (result as { data?: Agent[] } | undefined)?.data
    const choices = agentChoices(data)
    setAgentOptions(choices)
    return choices
  }

  /**
   * Le **schéma déclaré** de chaque outil, pour l'onglet `Schema` du panneau de détail.
   *
   * La route exige un couple `provider`/`model` : on prend celui de la saisie, qui est aussi celui des
   * messages. Elle pesait **61 ko** sur l'instance de développement — c'est le prix d'un onglet utile,
   * et il ne se paie qu'à l'ouverture de la vue `Trajectory`, jamais au montage.
   */
  const loadToolSchemas = async () => {
    if (Object.keys(toolSchemas()).length > 0) return
    const model = parseModelChoice(composerModel())
    if (!model) return
    const result = await client.tool
      .list({ provider: model.providerID, model: model.modelID, ...scope() })
      .catch(() => undefined)
    const data = (result as { data?: unknown } | undefined)?.data
    if (!Array.isArray(data)) return
    const map: Record<string, { description?: string; parameters?: unknown }> = {}
    for (const entry of data) {
      const tool = entry as { id?: unknown; description?: unknown; parameters?: unknown }
      if (typeof tool.id !== "string") continue
      map[tool.id] = {
        description: typeof tool.description === "string" ? tool.description : undefined,
        parameters: tool.parameters,
      }
    }
    setToolSchemas(map)
  }

  /** Les commandes du serveur — lues une fois, à la première frappe de `/`. */
  const loadCommands = async () => {
    if (commandOptions().length > 0) return
    const result = await client.command.list(scope()).catch(() => undefined)
    setCommandOptions(commandChoices((result as { data?: unknown } | undefined)?.data))
  }

  /** Les fichiers qui correspondent à une mention. Borné à 20 : une liste plus longue ne se lit pas. */
  const loadFiles = async (query: string) => {
    const result = await client.find.files({ query, limit: 20, ...scope() }).catch(() => undefined)
    const data = (result as { data?: unknown } | undefined)?.data
    setFileOptions(Array.isArray(data) ? data.filter((path): path is string => typeof path === "string") : [])
  }

  /**
   * Le contenu d'un fichier d'instructions injecté, quand il est **lisible d'ici**.
   *
   * `/file/content` résout `path` **sous la racine du projet** et rien d'autre : mesuré sur l'instance
   * de développement, un chemin absolu rend une chaîne vide, un chemin relatif sous la racine rend le
   * fichier, et un fichier **hors** du projet rend une erreur 500. Or les injections portent justement
   * des chemins absolus, dont `~/.config/opencodev2/AGENTS.md` — hors projet par nature. On ne tente
   * donc la lecture que pour ce qui est sous la racine, et `undefined` pour le reste : l'écran dit
   * « not readable from here » plutôt que d'afficher une boîte vide, ce qui serait un mensonge.
   */
  const loadInstructionSource = async (path: string): Promise<string | undefined> => {
    const base = worktree()
    const relative = base ? relativeTo(path, base) : undefined
    if (!relative) return undefined
    const result = await client.file.read({ path: relative, directory: base }).catch(() => undefined)
    const content = (result as { data?: { content?: string } } | undefined)?.data?.content
    return typeof content === "string" && content ? content : undefined
  }

  /**
   * Recale le menu sur ce qui est écrit et sur la position du curseur.
   *
   * Appelé à la frappe et après un déplacement du curseur, plutôt que depuis un `createEffect` : la
   * position du curseur n'est pas un signal, et en fabriquer un pour ça obligerait à le tenir à jour
   * sur chaque `clic`, `sélection` et `Tab` — c'est-à-dire à reproduire ce que le champ sait déjà.
   *
   * La recherche de fichiers est **temporisée** : une requête par frappe serait une requête par
   * caractère, alors que la réponse ne sert qu'à la liste qu'on regarde.
   */
  const refreshMenu = (text: string, caret: number) => {
    const slash = slashQuery(text)
    if (slash !== undefined) {
      clearTimeout(fileTimer)
      setMenu("commands")
      setMenuIndex(0)
      void loadCommands()
      return
    }
    const mention = mentionQuery(text, caret)
    if (mention) {
      setMentionRange({ start: mention.start, end: mention.end })
      setMenu("files")
      setMenuIndex(0)
      clearTimeout(fileTimer)
      fileTimer = setTimeout(() => void loadFiles(mention.query), 150)
      return
    }
    clearTimeout(fileTimer)
    setMentionRange(undefined)
    setMenu(undefined)
  }

  /**
   * Les sessions proposées par le `@` — titre et âge relatif calculés ici, nulle part ailleurs :
   * la projection pure ne sait rien de l'horloge, et ses tests la nourrissent avec des valeurs
   * fixes. Le temps vient de la même fonction que la ligne du rail, pour que les deux ne
   * divergent pas.
   */
  const mentionSessions = createMemo<MentionSession[]>(() =>
    sessions().slice(0, 12).map((session) => ({
      id: session.id,
      title: session.title || "(untitled)",
      when: relativeTime(sessionTimestamp(session), now()) || "now",
    })),
  )

  /** Le mot en cours après `@`, lu depuis l'intervalle retenu par `refreshMenu`. */
  const mentionText = () => {
    const range = mentionRange()
    return range ? draft().slice(range.start + 1, range.end) : ""
  }

  /** Ce que la liste ouverte propose — une seule projection pour le `/`, le `@` et la palette. */
  const suggestions = createMemo<MenuRow[]>(() => {
    if (menu() === "commands") return commandRows(commandOptions(), slashQuery(draft()) ?? "")
    if (menu() === "files") return mentionRows(fileOptions(), mentionSessions(), mentionText())
    return []
  })

  /** Les commandes de la palette : le même registre, le même filtre, la même présentation. */
  const paletteItems = createMemo(() => paletteRows(commandOptions(), paletteQuery()))

  /**
   * Le garde-fou d'envoi : un texte qui commence par `/` doit nommer une commande **connue du
   * serveur**. Le registre est relu avant la décision — il est chargé paresseusement, et un texte
   * tapé vite ne doit pas être jugé sur une liste encore vide. Sans ce garde-fou, une faute de
   * frappe partait au modèle comme du texte ordinaire.
   */
  const guardCommand = async (text: string): Promise<boolean> => {
    const token = commandToken(text)
    if (!token) {
      setCommandError(undefined)
      return true
    }
    await loadCommands()
    if (isKnownCommand(token, commandOptions())) {
      setCommandError(undefined)
      return true
    }
    setCommandError(`Unknown command "/${token}". Nothing was sent to the model.`)
    return false
  }

  /**
   * Exécuter une commande — le serveur interprète le prompt quand il commence par `/`. On pose le
   * texte et on l'envoie : c'est une action réelle, pas l'ouverture d'un panneau simulé.
   */
  const executeCommand = (name: string) => {
    setPaletteOpen(false)
    setMenu(undefined)
    setDraft(`/${name} `)
    setHistoryIndex(-1)
    void guardCommand(`/${name}`).then((allowed) => {
      if (allowed) void send()
    })
  }

  /**
   * Activer une suggestion.
   *
   * `Entrée` **exécute** une commande ; `Tab` ne fait que la **compléter** — on garde la main pour
   * écrire son argument. Une mention, elle, remplace **son mot** : `lis @src/a.ts et compare`
   * garde sa phrase, et le curseur se repose juste après ce qui vient d'être inséré.
   */
  const activateSuggestion = (index: number, execute: boolean) => {
    const row = suggestions()[index]
    if (!row) return
    if (row.kind === "command") {
      if (execute && row.command) executeCommand(row.command)
      else {
        setDraft(row.completion)
        setMenu(undefined)
        input?.focus()
      }
      return
    }
    const range = mentionRange()
    if (!range) return
    const edit = replaceRange(draft(), range.start, range.end, row.completion)
    setDraft(edit.text)
    setMenu(undefined)
    setMentionRange(undefined)
    // Le curseur se repose **après** le rendu : `setSelectionRange` s'applique au texte déjà posé.
    queueMicrotask(() => {
      input?.focus()
      input?.setSelectionRange(edit.caret, edit.caret)
    })
  }

  /** Un retour transitoire : le raccourci a agi, l'écran le dit, puis la trace disparaît. */
  const flash = (text: string) => {
    setShortcutNotice(text)
    clearTimeout(shortcutTimer)
    shortcutTimer = setTimeout(() => setShortcutNotice((current) => (current === text ? undefined : current)), 4000)
  }

  /**
   * Arrêter le travail en cours.
   *
   * L'agent est bloqué sur sa boucle, et c'est le serveur qui le dit (`session.status` → `busy`) : on
   * ne devine pas qu'il travaille, donc on ne devine pas non plus qu'il faut l'arrêter.
   */
  const abortRun = async () => {
    const sessionID = active()
    if (!sessionID) return
    await client.session.abort({ sessionID, ...scope() }).catch((cause: unknown) => setError(String(cause)))
  }

  /** `@ tag files` : on ouvre la mention au curseur, exactement comme si on l'avait tapée. */
  const tagFiles = () => {
    const element = input
    const current = draft()
    const caret = element?.selectionStart ?? current.length
    const edit = replaceRange(current, caret, caret, " @")
    setDraft(edit.text)
    setHistoryIndex(-1)
    queueMicrotask(() => {
      element?.focus()
      element?.setSelectionRange(edit.caret, edit.caret)
      refreshMenu(edit.text, edit.caret)
    })
  }

  /** `ctrl+p commands` : le menu `/` déjà testé, sans écraser ce qui est écrit. */
  const openCommands = () => {
    setMenu("commands")
    setMenuIndex(0)
    void loadCommands()
    input?.focus()
  }

  /**
   * Le clavier du champ — dans l'ordre où les touches se disputent.
   *
   * Le menu **consomme** les flèches, `Entrée` et `Échap` tant qu'il est ouvert : sinon on déplacerait
   * le curseur sous la liste, et `Entrée` enverrait le message au lieu de choisir la ligne.
   */
  const onComposerKey = (
    event: KeyboardEvent & { currentTarget: HTMLTextAreaElement },
    submit: () => void = () => void send(),
  ) => {
    const element = event.currentTarget
    const mod = event.ctrlKey || event.metaKey
    const key = event.key.toLowerCase()
    // Les raccourcis de session ne s'appliquent pas tant qu'un menu de suggestion est ouvert.
    if (!menu()) {
      if (mod && key === "d") {
        // Suppression : confirmation obligatoire, jamais d'appel direct au serveur.
        event.preventDefault()
        const sessionID = active()
        if (!sessionID) return
        const session = sessions().find((item) => item.id === sessionID)
        setConfirming(undefined)
        setCommandDialog({ kind: "delete", sessionID, title: session?.title ?? "" })
        return
      }
      if (event.altKey && key === "n") {
        event.preventDefault()
        void dispatchCommand("/new")
        return
      }
      if (mod && key === "r") {
        event.preventDefault()
        const sessionID = active()
        if (!sessionID) return
        const session = sessions().find((item) => item.id === sessionID)
        setCommandDialog({ kind: "rename", sessionID, value: session?.title ?? "" })
        return
      }
    }
    const rows = suggestions()
    if (menu() && rows.length > 0) {
      const next = moveMenuIndex(menuIndex(), rows.length, event.key)
      if (next !== undefined) {
        event.preventDefault()
        setMenuIndex(next)
        return
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault()
        // `Entrée` exécute la commande, `Tab` la complète seulement.
        activateSuggestion(menuIndex(), event.key === "Enter")
        return
      }
      if (event.key === "Escape") {
        event.preventDefault()
        // Le menu consomme Échap : le gestionnaire global ne doit pas interrompre l'agent par-dessus.
        event.stopPropagation()
        setMenu(undefined)
        return
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      // Sur l'accueil aucune session n'est ouverte : c'est `sendFromHome` qui la crée avant
      // l'envoi. Appeler `send()` directement laissait `Entrée` sans effet sur le premier message.
      if (active()) void send()
      else void sendFromHome()
      // Pendant le travail, `promptAsync` met le message en file côté serveur ; le mode le dit.
      void send(undefined, submitMode(false, working()))
      submit()
      return
    }
    if (event.key === "Tab") {
      // `Tab` change l'agent. La liste se charge au premier appui et le changement suit **ce même
      // appui** : sans cela, la première pression ne ferait que charger la liste et il faudrait
      // appuyer deux fois pour voir un changement — ce qui se lit comme une panne.
      event.preventDefault()
      void loadAgentOptions().then((choices) => setComposerAgent((current) => nextChoice(choices, current)))
      return
    }
    // Échap remonte au gestionnaire global : un seul Échap interrompt l'agent quand il travaille,
    // comme dans la maquette. Ici, seul le menu de suggestions le consommait plus haut.
    if (event.key === "ArrowUp" && element.selectionStart === 0 && element.selectionEnd === 0) {
      event.preventDefault()
      const step = historyStep(promptHistory(messages()), historyIndex(), "up")
      setHistoryIndex(step.index)
      setDraft(step.text)
      return
    }
    if (event.key === "ArrowDown" && historyIndex() >= 0) {
      event.preventDefault()
      const step = historyStep(promptHistory(messages()), historyIndex(), "down")
      setHistoryIndex(step.index)
      setDraft(step.text)
      return
    }
  }

  const loadSessions = async () => {
    const search = query().trim()
    /**
     * **Sans** `scope()` : le rail liste des *workspaces*, il lui faut donc les sessions de tous —
     * pas seulement celles du dossier courant. C'est la seule lecture qui réponde à « où ai-je
     * travaillé ? ». Le rattachement de chaque session à son workspace ne coûte aucun appel de plus :
     * `GET /session` porte déjà `directory`, et `GET /project` porte les workspaces.
     */
    const result = await client.session
      .list({ ...(search ? { search } : {}) })
      .catch((cause: unknown) => {
        setError(String(cause))
        return undefined
      })
    const data = (result as { data?: SessionSummary[] } | undefined)?.data
    if (Array.isArray(data)) setSessions(data)
  }

  /**
   * Le **plan** de la session : ses todos et son contrat de tâche.
   *
   * Deux routes pour une seule question — « où en est-on ? ». Les todos bougent souvent (l'agent les
   * réécrit à chaque étape), le contrat presque jamais ; les deux se relisent au même moment, quand
   * on ouvre une session ou quand le fil avance.
   *
   * Chacune échoue **pour son compte** : une session sans contrat n'a pas de `goalState`, et cela ne
   * doit pas empêcher ses todos de s'afficher.
   */
  const loadPlan = async (sessionID: string) => {
    const [todoResult, sessionResult] = await Promise.all([
      client.session.todo({ sessionID, ...scope() }).catch(() => undefined),
      client.session.get({ sessionID, ...scope() }).catch(() => undefined),
    ])
    setTodos(todosFrom(todoResult?.data))
    setContract(contractFrom(sessionResult?.data))
    // Conservé à part : c'est **lui** que l'écriture renvoie, complété de ce que l'écran a décidé.
    setRawGoal((sessionResult?.data as { goalState?: Record<string, unknown> } | undefined)?.goalState)
  }

  /**
   * Écrit le contrat de la session ouverte. Rend `true` si le serveur a accepté — le composant le
   * **dit** alors à l'écran, au lieu de le supposer.
   *
   * `PATCH /session/{id}` **remplace** le `goalState` : on repart de l'état brut et l'on n'y change
   * que ce que l'écran a décidé (`findings`, `completion`, `compaction` traversent tels quels). Le
   * vrai est ensuite relu : l'affichage doit être la réponse du serveur, jamais l'espoir de l'avoir
   * écrit.
   */
  const saveContract = async (draft: ContractDraft): Promise<boolean> => {
    const sessionID = active()
    const payload = contractPayload(rawGoal(), draft)
    if (!sessionID || !payload) return false
    const result = await client.session
      // Le SDK type `goalState` finement ; l'écran, lui, transporte l'objet du serveur tel quel et
      // n'en réécrit que trois champs. Ce cast dit exactement cela — et rien de plus.
      .update({
        sessionID,
        goalState: payload as Parameters<typeof client.session.update>[0]["goalState"],
        ...scope(),
      })
      .catch((cause: unknown) => {
        setError(String(cause))
        return undefined
      })
    if (!result) return false
    await loadPlan(sessionID)
    return true
  }

  /**
   * Les actions du panneau droit, écrites par la même route que l'édition du contrat. Les commandes
   * `/goal-*` du TUI sont locales au terminal : le webui n'a pas de route serveur pour elles, il
   * reproduit donc leur effet sur `goalState` par `PATCH /session/{id}` — le vrai chemin d'écriture.
   */
  const goalAction = async (action: GoalAction): Promise<boolean> => {
    const sessionID = active()
    if (!sessionID) return false
    const raw = rawGoal()
    if (!raw) return false
    const base = raw as Record<string, unknown>
    const version = typeof base.version === "number" ? base.version : 0
    let changes: Record<string, unknown>
    if (action === "approve") {
      changes = { status: "approved", source: "user" }
    } else if (action === "skip") {
      changes = { status: "skipped", source: "user" }
    } else {
      // Generate / regenerate : même gabarit que le TUI, alimenté par le dernier prompt réel.
      const source = promptHistory(messages())[0] ?? ""
      changes = {
        status: "draft",
        source: "auto",
        goal: source.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "Continuer la tâche demandée par l'utilisateur",
        dod: ["Produire une réponse utile et actionnable alignée avec la demande en cours."],
        outOfScope: [],
      }
    }
    const payload = {
      ...base,
      ...changes,
      version: action === "regenerate" || action === "generate" ? version + 1 : version,
      updatedAt: Date.now(),
    }
    const result = await client.session
      .update({
        sessionID,
        goalState: payload as Parameters<typeof client.session.update>[0]["goalState"],
        ...scope(),
      })
      .catch((cause: unknown) => {
        setError(String(cause))
        return undefined
      })
    if (!result) return false
    await loadPlan(sessionID)
    return true
  }

  /** État MCP réel au montage — la section « réglages » ne le charge qu'à l'ouverture. */
  const loadMcp = async () => {
    const result = await client.mcp.status(scope()).catch(() => undefined)
    const data = (result as { data?: Record<string, McpState> } | undefined)?.data
    if (data) setMcp(data)
  }

  /** Configuration globale, lue pour le réglage `lsp` du panneau droit (19 ko). */
  const loadPanelConfig = async () => {
    const result = await client.global.config.get().catch(() => undefined)
    const data = (result as { data?: Record<string, unknown> } | undefined)?.data
    if (data) setConfig(data)
  }

  /** État Git réel — sans jeton injecté (Vite en développement), le pied affiche « — ». */
  const loadGit = async () => {
    const status = await gitApi.status().catch(() => undefined)
    if (status) setGitStatus(status)
  }

  /** Dossier affiché dans le pied du panneau : dernier segment du répertoire de travail. */
  const folderLabel = () => {
    const dir = directory().trim() || serverPath() || ""
    const parts = dir.split(/[\\/]/).filter(Boolean)
    return parts.at(-1) ?? ""
  }

  const loadMessages = async (sessionID: string) => {
    // Le plan se relit avec le fil : c'est au même moment qu'on en a besoin, et l'agent réécrit ses
    // todos à chaque étape — un plan lu une seule fois à l'ouverture serait périmé en une minute.
    void loadPlan(sessionID)
    const result = await client.session.messages({ sessionID, ...scope() }).catch(() => undefined)
    const data = (result as { data?: Message[] } | undefined)?.data
    setThread(Array.isArray(data) ? data : [])
  }

  /**
   * La resynchronisation du fil porte **son propre garde-fou** : une relecture en vol au plus, une en
   * attente au plus (la dernière demande gagne), et un jeton monotone pour qu'une réponse ancienne
   * n'écrase pas un état plus récent.
   *
   * Sans cela, chaque événement non applicable lançait une lecture complète — une session en cours de
   * réponse en produit plusieurs par seconde — et deux réponses concurrentes écrivaient dans le même
   * signal : la plus lente gagnait, donc le fil reculait sous les yeux de l'utilisateur, sans erreur.
   */
  const reloadGate = createReloadGate()
  const threadTickets = createTicketGuard()

  /**
   * Le fil s'applique **au plus une fois par image**.
   *
   * Mesuré le 2026-10-17 pendant une longue tâche : le serveur émettait 75 `message.part.delta` par
   * seconde. Chaque delta appliqué écrit le signal des messages, donc recalcule les tours et rend le
   * fil : l'onglet a bloqué **12 388 ms** sur une image et n'a plus répondu à `Runtime.evaluate`
   * pendant plus de 10 s. Le débit vient du serveur et la tâche est légitime ; c'est la page qui
   * doit absorber le flot. Une image ne rend donc que **le dernier** état, les deltas intermédiaires
   * étant fusionnés — exactement ce que `createReloadGate` fait pour les relectures.
   */
  const threadGate = createLatestGate<Message[]>()
  let threadFrame: number | undefined
  const scheduleThread = () => {
    if (threadFrame !== undefined) return
    threadFrame = requestAnimationFrame(() => {
      threadFrame = undefined
      const next = threadGate.flush()
      if (next) setMessages(next)
    })
  }
  const applyThread = (next: Message[]) => {
    threadGate.push(next)
    scheduleThread()
  }
  /**
   * Écriture du fil **hors flot** : une relecture REST, une session vidée. La porte est vidée avant,
   * car une valeur différée plus ancienne écraserait l'état autoritaire qu'on vient d'obtenir.
   */
  const setThread = (next: Message[]) => {
    threadGate.reset()
    setMessages(next)
  }

  /**
   * Revenir à l'accueil : c'est **chaque** retour à « aucune session active »
   * qui tire un nouveau mot d'ordre, pas seulement le chargement initial.
   * Le salut est relu aussi, pour suivre l'heure si la page reste ouverte.
   */
  const openHome = () => {
    setActive(undefined)
    setThread([])
    setDraft("")
    setAttachments([])
    turnCache.clear()
    setGreeting(salutation(new Date()))
    setMotto(MOTTOS[nextMottoIndex()]!)
  }

  const reloadThread = (sessionID: string) => {
    reloadGate.request(sessionID, async (key) => {
      const ticket = threadTickets.issue()
      // Le plan se relit avec le fil, comme dans `loadMessages`.
      void loadPlan(key)
      const result = await client.session.messages({ sessionID: key, ...scope() }).catch(() => undefined)
      // Le jeton se vérifie **après** l'attente : c'est la réponse la plus récente qui écrit.
      if (!threadTickets.accept(ticket)) return
      const data = (result as { data?: Message[] } | undefined)?.data
      if (Array.isArray(data)) setThread(data)
    })
  }

  /**
   * L'état d'activité, relu par REST (`GET /session/status`).
   *
   * Il ne venait que du flux : un `session.idle` manqué pendant une coupure laissait l'écran sur
   * « travail en cours » indéfiniment alors que l'agent avait fini depuis longtemps. La route
   * **existe** (groupe `session`, identifiant `session.status`, valeurs `idle` / `busy` / `retry`) et
   * le CLI s'en sert déjà quand l'événement manque (`cli/cmd/run/stream.transport.ts:10`). L'appel
   * passe par `fetch` direct, comme `/pty/shells` : c'est le chemin dont la preuve est faite ici
   * (`200` et un corps JSON **par le proxy Vite** — un `200` qui rendrait `index.html` serait un échec
   * muet, cf. `API_PREFIXES`), et la forme rendue est celle du serveur, pas celle qu'un wrapper
   * suppose.
   *
   * Lue **à la reconnexion seulement** — jamais en boucle : les événements restent la voie normale.
   */
  const loadActivity = async () => {
    const query = new URLSearchParams(scope() as Record<string, string>).toString()
    const response = await fetch(`${serverUrl}/session/status${query ? `?${query}` : ""}`, {
      headers: authHeaders(credentials),
    }).catch(() => undefined)
    if (!response?.ok) return
    const data = (await response.json().catch(() => undefined)) as unknown
    const busy = sessionActivityMap(data)
    setSessionBusy(busy)
    setWorking(Boolean(busy[active() ?? ""]))
  }

  const loadPermissions = async () => {
    const result = await client.permission.list(scope()).catch(() => undefined)
    const data = (result as { data?: PermissionRequest[] } | undefined)?.data
    if (Array.isArray(data)) setPermissions(data)
  }

  /** La question qui bloque la session ouverte : c'est elle, et elle seule, qui s'affiche dans le fil. */
  const activeQuestion = () => questions().find((item) => item.sessionID === active())
  const answersFor = (request: QuestionRequest) => answers()[request.id] ?? emptyAnswers(request)

  /**
   * Les questions en attente — lues au montage et à la reconnexion, comme les permissions.
   *
   * Un `question.asked` manqué pendant une coupure laisserait l'agent **bloqué** sans que rien ne
   * l'indique à l'écran : c'est le même défaut que celui trouvé en P5 sur les permissions, et il se
   * traite de la même façon.
   */
  const loadQuestions = async () => {
    const result = await client.question.list(scope()).catch(() => undefined)
    const data = (result as { data?: QuestionRequest[] } | undefined)?.data
    if (Array.isArray(data)) setQuestions(data)
  }

  /**
   * Répondre — la seule écriture du fil.
   *
   * La question est retirée **avant** l'appel : c'est l'état que l'utilisateur vient de produire. Si
   * l'appel échoue, `loadQuestions` la fait revenir — une réponse perdue ne doit pas ressembler à une
   * réponse envoyée, sinon l'agent attend sans que rien ne le montre.
   */
  const answerQuestion = async (request: QuestionRequest) => {
    const payload = answersFor(request)
    setQuestions((current) => dropQuestion(current, request.id))
    const result = await client.question
      .reply({ requestID: request.id, answers: payload, ...scope() })
      .catch(() => undefined)
    if (!result) {
      setError("The answer could not be sent.")
      void loadQuestions()
    }
  }

  const rejectQuestion = async (request: QuestionRequest) => {
    setQuestions((current) => dropQuestion(current, request.id))
    const result = await client.question.reject({ requestID: request.id, ...scope() }).catch(() => undefined)
    if (!result) {
      setError("The question could not be dismissed.")
      void loadQuestions()
    }
  }

  /**
   * Configuration : trois appels, tous facultatifs. Un serveur qui n'expose pas l'un d'eux ne
   * casse pas la feuille — la section correspondante reste vide, ce qui est exact.
   *
   * `GET /provider` n'est **pas** appelé : il rend 6,7 Mo (228 fournisseurs, 8 775 modèles) pour
   * deux nombres qui ne changent aucune décision. Mesuré : c'est lui qui gelait l'ouverture.
   */
  /**
   * Les réglages — une section à la fois.
   *
   * C'est ce qui répond à « éviter de charger la page de settings » : chaque section ne lit que ce
   * qu'elle montre. `GET /agent` (1,27 Mo) n'est lu que si l'on ouvre « agents » ; `GET /provider`
   * (6,7 Mo) n'est **jamais** lu, `/provider/auth` donne les méthodes pour quelques kilo-octets.
   */
  const loadSettings = async (section: SettingsSectionKey) => {
    setSettingsNotice(undefined)
    setSettingsError(undefined)

    /**
     * Les sections déclarées — `general`, `behavior`, `tools`. Elles ne lisent que la configuration.
     *
     * `general` lit **en plus** les trois listes de choix, parce que quatre de ses cinq réglages sont
     * des `select` : modèles, agents, interpréteurs. Le prix est mesuré et assumé :
     *
     *   config           19 ko     4 ms
     *   config/providers 531 ko   49 ms   → 7 fournisseurs, 696 modèles
     *   agent           1,27 Mo   37 ms   → 34 agents, six primaires
     *   pty/shells       353 o   110 ms   → 4 interpréteurs
     *
     * soit ~1,8 Mo, **une fois**, à l'ouverture de la page. `GET /provider` (6,7 Mo, 1 198 ms) n'est
     * jamais appelé : il fait le même travail pour douze fois le prix.
     *
     * `models` a disparu de cette liste avec la section : ses trois clés vivent dans `general`.
     */
    if (section === "general" || section === "behavior" || section === "tools") {
      const general = section === "general"
      /**
       * **Cache de session.** La page relisait 531 ko de modèles **et** 1,27 Mo d'agents à chaque
       * ouverture — 1,8 Mo pour deux listes qui ne changent que si l'on écrit quelque chose. On ne
       * les redemande donc que si on ne les a pas.
       *
       * L'invalidation est faite par le **writer** qui peut les changer, et par lui seul :
       * `saveProvider` (authentifier un fournisseur change les modèles qu'il propose) et `saveAgent`.
       * C'est ce qui rend le cache sûr : sans un point d'invalidation nommé, il montrerait une liste
       * incomplète jusqu'au redémarrage — le piège qu'on cherche à ne pas poser.
       *
       * Les interpréteurs ne sont **pas** cachés : 353 octets, il n'y a rien à économiser.
       */
      const needModels = general && modelOptions().length === 0
      const needAgents = general && agents().length === 0
      const [configResult, providersResult, shellsResult, agentResult] = await Promise.all([
        client.global.config.get().catch(() => undefined),
        needModels ? client.config.providers().catch(() => undefined) : Promise.resolve(undefined),
        general ? fetchShells() : Promise.resolve(undefined),
        needAgents ? client.app.agents(scope()).catch(() => undefined) : Promise.resolve(undefined),
      ])
      const data = (configResult as { data?: Record<string, unknown> } | undefined)?.data
      if (data) {
        setConfig(data)
        // Les saisies en cours sont abandonnées : la config relue est la vérité.
        setSpecDrafts({})
      }
      if (general) {
        // **Projection immédiate.** La charge de `/config/providers` porte les clés des fournisseurs
        // en clair ; elle ne survit pas à cette ligne et n'entre dans aucun signal.
        if (needModels) setModelOptions(modelCatalog((providersResult as { data?: unknown } | undefined)?.data))
        setShellOptions(shellChoices(shellsResult))
        const agentData = (agentResult as { data?: Agent[] } | undefined)?.data
        if (Array.isArray(agentData)) setAgents(agentData)
      }
      return
    }

    if (section === "providers") {
      // La grille a besoin des **noms**, du compte de modèles et de l'état de chaque fournisseur :
      // `/provider/auth` ne les porte pas. On lit donc `/config/providers` (531 ko, 49 ms) — le même
      // appel que `General` — et on projette aussitôt, parce que la charge porte les clés en clair.
      const need = providerRows().length === 0
      const [authResult, providersResult, configResult] = await Promise.all([
        client.provider.auth(scope()).catch(() => undefined),
        need ? client.config.providers().catch(() => undefined) : Promise.resolve(undefined),
        // La config est lue **ici aussi** : c'est elle qui porte `provider.<id>` — l'adresse, le
        // paquet npm, `discover`, la liste d'exclusions et les modèles écrits à la main. Sans elle,
        // le détail ne saurait ni ce qui est déjà réglé, ni quoi réécrire.
        client.global.config.get().catch(() => undefined),
      ])
      setProviderAuth((authResult as { data?: ProviderAuth } | undefined)?.data)
      const configData = (configResult as { data?: Record<string, unknown> } | undefined)?.data
      if (configData) setConfig(configData)
      const payload = (providersResult as { data?: unknown } | undefined)?.data
      if (payload) {
        // **Projection immédiate** : rien de ce qui suit ne garde la charge. `ready` est un booléen,
        // jamais la clé qui le rend vrai.
        const rows = providerSummaries(payload)
        setProviderRows(rows)
        const index: Record<string, Choice[]> = {}
        for (const row of rows) index[row.id] = providerModelChoices(payload, row.id)
        setProviderModels(index)
      }
      return
    }

    if (section === "agents") {
      // La config est relue **ici aussi** : la carte `agent` vit dedans, et configurer un agent sans
      // l'avoir lue écraserait les entrées existantes au lieu de les modifier.
      const [configResult, agentResult] = await Promise.all([
        client.global.config.get().catch(() => undefined),
        client.app.agents(scope()).catch(() => undefined),
      ])
      const configData = (configResult as { data?: Record<string, unknown> } | undefined)?.data
      if (configData) setConfig(configData)
      const agentData = (agentResult as { data?: Agent[] } | undefined)?.data
      if (Array.isArray(agentData)) setAgents(agentData)
      return
    }

    if (section === "mcp") {
      const result = await client.mcp.status(scope()).catch(() => undefined)
      const data = (result as { data?: Record<string, McpState> } | undefined)?.data
      if (data) setMcp(data)
      return
    }

    await loadPlugins()
  }

  /** Le modèle déclaré pour un agent, lu dans la carte de configuration. */
  const agentModelOf = (name: string) => agentModel(config().agent?.[name])

  /** Un agent est-il désactivé ? */
  const agentDisabledOf = (name: string) => agentDisabled(config().agent?.[name])

  /**
   * Configurer un agent — `PATCH /global/config` avec la carte `agent` **entière**.
   *
   * Envoyer seulement l'agent modifié écraserait les 33 autres si le serveur **remplace** la carte
   * au lieu de la fusionner. On ne connaît pas cette sémantique, donc on n'en dépend pas : la carte
   * complète donne le même résultat dans les deux cas.
   */
  const saveAgent = async (name: string, changes: Record<string, unknown>, label: string) => {
    setSettingsBusy(`agent:${name}`)
    setSettingsError(undefined)
    setSettingsNotice(undefined)
    const result = await client.global.config
      .update({
        // Le schéma généré nomme les 21 champs d'`AgentConfig` ; notre carte reste délibérément
        // `Record<string, unknown>` — on ne recopie pas le schéma à la main, il divergerait au
        // premier changement. Le cast est étroit : il ne porte que sur cette carte.
        config: { agent: agentPatch(config().agent, name, changes) as Record<string, never> },
      })
      .catch((cause: unknown) => {
        setSettingsError(String(cause))
        return undefined
      })
    setSettingsBusy(undefined)
    if (result) {
      setAgentDrafts((current) => ({ ...current, [name]: "" }))
      // Le modèle ou l'état d'un agent vient de changer : le cache d'agents devient faux.
      setAgents([])
      await loadSettings("agents")
      setSettingsNotice(`${label} saved`)
    }
  }

  const toggleAgent = (name: string, disabled: boolean) =>
    void saveAgent(name, { disable: disabled }, `agent ${name}`)

  const openConfig = () => {
    setConfigOpen(true)
    void loadSettings(settingsSection())
  }

  const selectSection = (key: SettingsSectionKey) => {
    setSettingsSection(key)
    void loadSettings(key)
  }

  /**
   * Charge la configuration réelle pour l'éditeur de l'onglet Config. La charge brute porte des clés
   * de fournisseur en clair : elle est projetée ici même, avant tout signal, donc avant le DOM.
   */
  const loadConfigTab = async () => {
    setConfigLoading(true)
    setConfigError(undefined)
    setConfigNotice(undefined)
    const result = await client.global.config.get().catch((cause: unknown) => {
      setConfigError(String(cause))
      return undefined
    })
    setConfigLoading(false)
    const data = (result as { data?: Record<string, unknown> } | undefined)?.data
    if (data) {
      const masked = maskConfig(data) as JsonObject
      setConfigOriginal(masked)
      setConfigSourceText(JSON.stringify(masked, null, 2))
    }
  }

  /** Commute l'onglet du panneau ; Config charge à la demande, Logs lit le flux déjà souscrit. */
  const selectPanelTab = (tab: "conv" | "config" | "logs") => {
    setPanelTab(tab)
    if (tab === "config") void loadConfigTab()
  }

  /** Écrit le patch de l'éditeur — partiel, et sans aucun secret. */
  const saveConfigTab = async () => {
    const parsed = parseConfigText(configSourceText())
    if (!parsed.value) {
      setConfigError(parsed.error)
      return
    }
    const { patch, skipped } = buildConfigPatch(parsed.value, configOriginal())
    setConfigBusy(true)
    setConfigError(undefined)
    setConfigNotice(undefined)
    const result = await client.global.config
      .update({ config: patch as Record<string, never> })
      .catch((cause: unknown) => {
        setConfigError(String(cause))
        return undefined
      })
    setConfigBusy(false)
    if (result) {
      const count = Object.keys(patch).length
      setConfigNotice(
        count
          ? `${count} value(s) saved${skipped.length ? ` · ${skipped.length} secret field(s) kept` : ""}`
          : "nothing changed",
      )
      await loadConfigTab()
    }
  }

  /**
   * Les réglages **déclarés** (modèles, général, comportement, outils) se rendent d'un seul bloc :
   * le composant ne fait que rendre, la donnée dit quoi montrer. Ajouter un réglage, c'est ajouter
   * une entrée dans `SETTING_SPECS` — pas une ligne de JSX.
   */
  const specDraft = (spec: SettingSpec) => specDrafts()[spec.key] ?? settingDisplay(spec, config()[spec.key])
  const setSpecDraft = (key: string, value: string) =>
    setSpecDrafts((current) => ({ ...current, [key]: value }))

  /**
   * Les choix d'un réglage déclaré — l'aiguillage par **source**, une seule fois.
   *
   * Un réglage ne sait pas d'où vient sa liste, et le contrôle non plus : les deux reçoivent des
   * `Choice`. C'est ici, et seulement ici, que « models » veut dire `/config/providers`.
   */
  const optionsOf = (spec: SettingSpec): Choice[] => {
    if (spec.source === "models") return modelOptions()
    if (spec.source === "shells") return shellOptions()
    if (spec.source === "agents") return agentChoices(agents())
    return []
  }
  const commitSpec = (spec: SettingSpec, raw: string | boolean) =>
    void saveConfig({ [spec.key]: settingValue(spec, raw) }, spec.label)

  /** Les identifiants du fournisseur ouvert, extraits de la carte plate et préfixée. */
  const providerValuesFor = (id: string) => scopedValues(providerValues(), id)

  /**
   * Chercher un fournisseur — le **seul** moment où le catalogue se paie.
   *
   * `GET /provider` rend 6,7 Mo en 1 198 ms (228 fournisseurs, 8 775 modèles). La grille au repos
   * montre les sept qu'on a ; on ne cherche dans le catalogue que pour ajouter ce qu'on n'a pas, donc
   * le poids suit l'intention au lieu de précéder l'écran. Une fois par session : le catalogue ne
   * change pas sous nos pieds, et un rechargement le vide.
   */
  const searchProviders = (value: string) => {
    setProviderQuery(value)
    if (!value.trim() || providerCatalog().length > 0 || catalogPending()) return
    setCatalogPending(true)
    void client.provider
      .list(scope())
      .then((result) => setProviderCatalog(catalogSummaries((result as { data?: unknown } | undefined)?.data)))
      .catch(() => setProviderCatalog([]))
      .finally(() => setCatalogPending(false))
  }

  /** Le réglage `model` — le contrôle « default for new sessions » du détail d'un fournisseur. */
  const modelSpec = () => (SETTING_SPECS.general ?? []).find((spec) => spec.key === "model")

  /**
   * Le pied de la page General — **deux faits** qu'aucun autre écran ne donne : où les réglages sont
   * réellement écrits, et quelle version du serveur les sert.
   *
   * Le fichier est `opencode.jsonc` et non `config.json` : mesuré, c'est le `.jsonc` qui gagne sur le
   * `.json`, quel que soit le mtime (`config.ts:578-580`), et c'est là que le TUI écrit. Dire
   * « enregistré » sans dire où est exactement le défaut qui coûte une heure de recherche.
   */
  const generalFootnote = () => {
    const facts: string[] = []
    const dir = configPath()
    const version = health()?.version
    if (dir) facts.push(`written to ${dir}\\opencode.jsonc`)
    if (version) facts.push(`server ${version}`)
    return facts.length > 0 ? facts.join(" · ") : undefined
  }

  /**
   * Écrire la configuration — **globale**, et en forme **imbriquée**.
   *
   * Deux défauts corrigés ici, tous deux silencieux :
   *
   *   1. **La forme.** Le SDK attend `{ config: { … } }` (`{ key: "config", map: "body" }`) et non
   *      un patch à plat. Envoyer `{ model: "…" }` faisait chercher `parameters.config`, ne rien
   *      trouver, et envoyer un **corps vide** — donc un `200` pour une écriture nulle.
   *   2. **La cible.** `PATCH /config` écrit la config **du projet** : mesuré, il **matérialise un
   *      `config.json` à la racine du dépôt** là où il n'y en avait aucun. Un panneau de réglages
   *      configure l'outil, pas un dépôt — c'est `/global/config` qui convient, et il ne dépose
   *      rien dans l'arbre de travail.
   */
  const saveConfig = async (patch: Record<string, unknown>, label: string, reload: SettingsSectionKey = "general") => {
    setSettingsBusy(label)
    setSettingsError(undefined)
    setSettingsNotice(undefined)
    const result = await client.global.config
      .update({ config: patch })
      .catch((cause: unknown) => {
        setSettingsError(String(cause))
        return undefined
      })
    setSettingsBusy(undefined)
    if (result) {
      // Le rechargement **avant** la notice : `loadSettings` commence par effacer les messages, donc
      // poser la notice d'abord la faisait disparaître aussitôt — un succès qui ne se voyait jamais.
      await loadSettings(reload)
      setSettingsNotice(`${label} saved`)
    }
  }

  /**
   * Enregistrer une clé : `PUT /auth/{providerID}`, corps `ApiAuth`.
   *
   * `authBody` rend `undefined` sur un champ vide — et on n'écrit alors **rien** : écrire une clé
   * vide écraserait une clé valide.
   */
  const saveProvider = async (providerID: string, method: AuthMethod) => {
    const body = authBody(method, providerValuesFor(providerID))
    if (!body) {
      setSettingsError("empty field — nothing was written")
      return
    }
    setSettingsBusy(`provider:${providerID}`)
    setSettingsError(undefined)
    setSettingsNotice(undefined)
    const result = await client.auth.set({ providerID, ...body }).catch((cause: unknown) => {
      setSettingsError(String(cause))
      return undefined
    })
    setSettingsBusy(undefined)
    if (result) {
      // Une clé ajoutée change les modèles que ce fournisseur propose : le cache devient faux.
      setModelOptions([])
      setSettingsNotice(`${providerID} saved`)
      setProviderValues({})
    }
  }

  /**
   * L'entrée de configuration d'un fournisseur, telle que le **fichier** la porte.
   *
   * C'est la seule source pour ce qui n'est pas un identifiant : `baseURL`, `npm`, `discover`,
   * `blacklist`. La clé, elle, n'est jamais lue — `/config/providers` la rend en clair, et rien ici
   * n'en retient la valeur.
   */
  const providerEntry = (id: string): Record<string, unknown> => {
    const providers = config()?.provider
    if (!providers || typeof providers !== "object") return {}
    const entry = (providers as Record<string, unknown>)[id]
    return entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {}
  }

  /**
   * La grille : ce que le serveur a **chargé**, plus ce que la configuration **déclare**.
   *
   * Sans cette fusion, un fournisseur qu'on vient de créer disparaîtrait de l'écran aussitôt : la
   * liste du serveur ne bouge pas parce qu'un fichier a changé. L'écran dirait « créé » puis ne
   * montrerait rien — le pire des deux mensonges.
   */
  const providerGrid = createMemo(() => mergeDeclared(providerRows(), config()))

  /** La connexion affichée : ce que le fichier porte, recouvert par ce qui est en cours de saisie. */
  const connectionFor = (id: string): Record<string, string> => {
    const entry = providerEntry(id)
    const options =
      entry.options && typeof entry.options === "object" ? (entry.options as Record<string, unknown>) : {}
    const fromFile: Record<string, string> = {}
    if (typeof options.baseURL === "string") fromFile.baseURL = options.baseURL
    if (typeof entry.npm === "string") fromFile.npm = entry.npm
    return { ...fromFile, ...providerValuesFor(id) }
  }

  /** Les modèles exclus — le seul levier d'exclusion du serveur, et il remplace la liste entière. */
  const excludedFor = (id: string): string[] => {
    const list = providerEntry(id).blacklist
    return Array.isArray(list) ? list.filter((entry): entry is string => typeof entry === "string") : []
  }

  /**
   * Les modèles affichés : ceux du serveur, plus ceux **écrits à la main**.
   *
   * Un modèle déclaré dans `provider.<id>.models` n'apparaît pas dans `/config/providers` tant que le
   * serveur n'a pas rechargé ses fournisseurs : sans cette fusion, « add model » semblerait n'avoir
   * rien fait — et on le referait.
   */
  const modelsFor = (id: string): Choice[] => {
    const fromServer = providerModels()[id] ?? []
    const declared = providerEntry(id).models
    if (!declared || typeof declared !== "object") return fromServer
    const known = new Set(fromServer.map((entry) => entry.value))
    const extra: Choice[] = []
    for (const [modelID, raw] of Object.entries(declared as Record<string, unknown>)) {
      if (known.has(modelID)) continue
      const name = raw && typeof raw === "object" ? (raw as { name?: unknown }).name : undefined
      extra.push({ value: modelID, label: typeof name === "string" && name.trim() ? name.trim() : modelID })
    }
    return [...fromServer, ...extra]
  }

  /**
   * Déclarer un fournisseur que le catalogue ignore : `provider.<id>` dans `/global/config`.
   *
   * L'ajout est **sans retour** par l'API — il n'existe ni `PUT` ni `DELETE` sur `/config` ni sur
   * `/global/config`, seulement un `PATCH` qui fusionne. C'est écrit à l'écran, à côté du bouton :
   * un geste qu'on ne peut pas défaire se dit avant le clic, pas après.
   */
  const createProvider = async () => {
    const draft = providerDraft()
    const patch = providerPatch(draft.id ?? "", { npm: draft.npm, baseURL: draft.baseURL })
    if (!patch) {
      setSettingsError("a provider needs an id, and something to speak with")
      return
    }
    const id = providerId(draft.id ?? "")
    await saveConfig(patch, `provider ${id}`, "providers")
    setProviderNewOpen(false)
    setProviderDraft(newProviderDraft())
    setProviderSelected(id)
  }

  /** L'adresse : `provider.<id>.options.baseURL` — le **second** magasin, distinct de la clé. */
  const saveConnection = async (id: string) => {
    const values = providerValuesFor(id)
    const patch = providerPatch(id, { baseURL: values.baseURL, npm: values.npm })
    if (!patch) {
      setSettingsError("empty field — nothing was written")
      return
    }
    await saveConfig(patch, `${id} connection`, "providers")
  }

  /** La découverte : le serveur ira lire `GET {baseURL}/models` lui-même, au prochain chargement. */
  const setDiscover = async (id: string, on: boolean) => {
    const patch = discoverPatch(id, on)
    if (patch) await saveConfig(patch, `${id} discovery`, "providers")
  }

  /** Un modèle à la main — précisément ce que la découverte ne sait pas décrire. */
  const addModel = async (id: string, modelID: string) => {
    const patch = modelPatch(id, modelID)
    if (patch) await saveConfig(patch, `${id} model`, "providers")
  }

  /**
   * Exclure un modèle — ou le remettre.
   *
   * Ce n'est pas un état du modèle : `ModelStatus` vaut `alpha|beta|deprecated|active` et il n'existe
   * pas de « désactivé ». Le levier du serveur est la liste `blacklist`, et un tableau est **remplacé**
   * par la fusion de configuration : on écrit donc la liste entière, recalculée depuis celle qu'on vient
   * de lire.
   */
  const excludeModel = async (id: string, modelID: string, excluded: boolean) => {
    const patch = blacklistPatch(id, toggleModel(excludedFor(id), modelID, excluded))
    if (patch) await saveConfig(patch, `${id} models`, "providers")
  }

  /** Ajouter un plugin : `POST /plugin`, corps `{ spec }`. */
  const addPlugin = async () => {
    const spec = pluginSpec().trim()
    if (!spec) return
    setSettingsBusy("plugin")
    setSettingsError(undefined)
    setSettingsNotice(undefined)
    const result = await client.plugin.add({ spec, ...scope() }).catch((cause: unknown) => {
      setSettingsError(String(cause))
      return undefined
    })
    setSettingsBusy(undefined)
    if (result) {
      setSettingsNotice("plugin added")
      setPluginSpec("")
      await loadPlugins()
    }
  }

  /** Retirer un plugin : `DELETE /plugin/{spec}`. */
  const removePlugin = async (spec: string) => {
    setSettingsBusy("plugin")
    setSettingsError(undefined)
    setSettingsNotice(undefined)
    const result = await client.plugin.remove({ spec, ...scope() }).catch((cause: unknown) => {
      setSettingsError(String(cause))
      return undefined
    })
    setSettingsBusy(undefined)
    if (result) {
      setSettingsNotice("plugin removed")
      await loadPlugins()
    }
  }

  const selectSession = async (sessionID: string) => {
    setActive(sessionID)
    setError(undefined)
    // Autre session : les identifiants de messages qui y sont gardés n'ont rien à faire ici.
    turnCache.clear()
    await loadMessages(sessionID)
  }

  const createSession = async (directory?: string) => {
    /**
     * Le dossier est un **paramètre**, pas le contexte courant : le bouton porté par une ligne de
     * workspace ouvre une session *chez ce dossier*, sans exiger de l'avoir d'abord choisi.
     */
    const target = directory?.trim() ? { directory: directory.trim() } : scope()
    const result = await client.session.create(target).catch((cause: unknown) => {
      setError(String(cause))
      return undefined
    })
    const created = (result as { data?: SessionSummary } | undefined)?.data
    await loadSessions()
    if (created?.id) await selectSession(created.id)
  }

  const startRename = (session: SessionSummary) => {
    setRenaming(session.id)
    setRenameDraft(session.title ?? "")
  }

  const commitRename = async () => {
    const sessionID = renaming()
    if (!sessionID) return
    const title = renameDraft().trim()
    setRenaming(undefined)
    if (!title) return
    await client.session.update({ sessionID, title, ...scope() }).catch((cause: unknown) => setError(String(cause)))
    await loadSessions()
  }

  const removeSession = async (session: SessionSummary) => {
    setConfirming(undefined)
    await client.session.delete({ sessionID: session.id, ...scope() }).catch((cause: unknown) => {
      setError(String(cause))
      return undefined
    })
    if (active() === session.id) openHome()
    await loadSessions()
  }

  /* ---------------------------------------------------------------------------------------------
     Commandes de session — le pont entre les décisions pures et le client SDK réel.
     Aucun appel shell : `/editor` ouvre une vue, `/exit` ferme la vue de session.
     ------------------------------------------------------------------------------------------ */

  /** Le transport est le client SDK branché sur `scope()` : aucune donnée de démonstration. */
  const commandTransport: SessionCommandTransport = {
    create: async () => (await client.session.create(scope()).catch(() => undefined))?.data,
    update: async (sessionID, title) => client.session.update({ sessionID, title, ...scope() }),
    remove: async (sessionID) => client.session.delete({ sessionID, ...scope() }),
    fork: async (sessionID) => (await client.session.fork({ sessionID, ...scope() }).catch(() => undefined))?.data,
    revert: async (sessionID) => client.session.revert({ sessionID, ...scope() }),
    summarize: async (sessionID) => client.session.summarize({ sessionID, ...scope() }),
    share: async (sessionID) => {
      const data = (await client.session.share({ sessionID, ...scope() }).catch(() => undefined))?.data
      return data?.share?.url ? { url: data.share.url } : undefined
    },
    unshare: async (sessionID) => client.session.unshare({ sessionID, ...scope() }),
    init: async (sessionID) => client.session.init({ sessionID, ...scope() }),
    command: async (sessionID, command, args) =>
      client.session.command({ sessionID, command, ...(args ? { arguments: args } : {}), ...scope() }),
    messages: async (sessionID) =>
      (await client.session.messages({ sessionID, ...scope() }).catch(() => undefined))?.data as
        | Awaited<ReturnType<typeof client.session.messages>>["data"]
        | undefined,
  }

  const showNotice = (message: string) => {
    clearTimeout(noticeTimer)
    setCommandNotice(message)
    noticeTimer = setTimeout(() => setCommandNotice(undefined), 2600)
  }

  const closeCommandDialog = () => {
    if (exitResolver) {
      exitResolver(false)
      exitResolver = undefined
    }
    setCommandDialog(undefined)
  }

  const commandHost: SessionCommandHost = {
    clipboard: writeClipboard,
    download: (filename, content) => {
      const url = URL.createObjectURL(new Blob([content], { type: "text/markdown" }))
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    },
    notice: showNotice,
    error: (message) => setError(message),
    selectSession: (sessionID) => {
      void selectSession(sessionID)
    },
    reload: () => {
      const sessionID = active()
      if (sessionID) void loadMessages(sessionID)
      void loadSessions()
    },
    clearSession: () => {
      setActive(undefined)
      setThread([])
      setDraft("")
      setMenu(undefined)
      turnCache.clear()
      setCommandDialog(undefined)
    },
    rename: (sessionID) => {
      const current = sessions().find((session) => session.id === sessionID)
      setCommandDialog({ kind: "rename", sessionID, value: current?.title ?? "" })
    },
    openEditor: () => setCommandDialog({ kind: "editor", value: draft() }),
    confirm: (message) => {
      // La question est portée par le dialogue ; la promesse n'est résolue que par un clic.
      void message
      return new Promise<boolean>((resolve) => {
        exitResolver = resolve
        setCommandDialog({ kind: "exit" })
      })
    },
    addActivity: (activity) => setCommandActivities((current) => [...current, activity]),
    updateActivity: (id, status) =>
      setCommandActivities((current) => current.map((item) => (item.id === id ? { ...item, status } : item))),
  }

  /** Une seule porte d'entrée : la ligne saisie est soit une commande, soit un prompt ordinaire. */
  const dispatchCommand = async (text: string) => {
    const result = await runCommandLine(text, {
      sessionID: active(),
      choices: commandOptions(),
      transport: commandTransport,
      host: commandHost,
    })
    if (result.ok) setDraft("")
    return result
  }

  const commitCommandRename = async (sessionID: string, title: string) => {
    await client.session.update({ sessionID, title, ...scope() }).catch((cause: unknown) => setError(String(cause)))
    await loadSessions()
  }

  const onExitConfirmed = () => {
    exitResolver?.(true)
    exitResolver = undefined
    setCommandDialog(undefined)
  }

  const onDeleteConfirmed = (sessionID: string) => {
    const session = sessions().find((item) => item.id === sessionID)
    setCommandDialog(undefined)
    if (session) void removeSession(session)
  }

  const replyPermission = async (request: PermissionRequest, reply: PermissionReply) => {
    // Optimistic removal: the server also emits `permission.replied`, which is authoritative.
    setPermissions((current) => dropPermission(current, request.id))
    const result = await client.permission
      .reply({ requestID: request.id, reply, ...scope() })
      .catch((cause: unknown) => {
        setError(String(cause))
        return undefined
      })
    if (!result) await loadPermissions()
    const sessionID = active()
    if (sessionID) await loadMessages(sessionID)
  }

  /**
   * Lit un fichier en data URL — la forme que `FilePartInput.url` attend, relevée dans le SDK et
   * confirmée par l'usage de l'app existante (`build-request-parts.ts:190`, `url: attachment.dataUrl`).
   */
  const readAsDataUrl = (file: File, mime: string) =>
    new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.addEventListener("error", () => resolve(""))
      reader.addEventListener("load", () => {
        const value = typeof reader.result === "string" ? reader.result : ""
        const separator = value.indexOf(",")
        resolve(separator === -1 ? "" : `data:${mime};base64,${value.slice(separator + 1)}`)
      })
      reader.readAsDataURL(file)
    })

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setAttachError(undefined)
    const accepted: Attachment[] = []
    for (const file of Array.from(files)) {
      const mime = file.type || "application/octet-stream"
      const problem = validateAttachment({ size: file.size, mime, filename: file.name })
      if (problem) {
        setAttachError(problem)
        continue
      }
      const dataUrl = await readAsDataUrl(file, mime)
      if (!dataUrl) {
        setAttachError(`Lecture impossible : « ${file.name} »`)
        continue
      }
      accepted.push({
        id: `${file.name}:${file.size}:${accepted.length}`,
        mime,
        filename: file.name,
        dataUrl,
        size: file.size,
      })
    }
    if (accepted.length) setAttachments((current) => [...current, ...accepted])
  }

  const removeAttachment = (id: string) => setAttachments((current) => current.filter((item) => item.id !== id))

  const send = async (event?: { preventDefault: () => void }, mode: SubmitMode = "send") => {
    event?.preventDefault()
    const text = draft().trim()
    // Une ligne en tête de `/` est une commande de session — jamais un prompt à envoyer au modèle.
    // `/new` agit même sans session active : le test doit donc précéder le garde-fou.
    if (text.startsWith("/")) {
      setMenu(undefined)
      await dispatchCommand(text)
      return
    }
    const sessionID = active()
    const files = attachments()
    if (!sessionID || (!text && files.length === 0)) return
    // Un texte qui commence par `/` doit nommer une commande du registre serveur : un nom
    // inconnu n'est **jamais** envoyé au modèle, même par accident.
    if (!(await guardCommand(text))) return
    setDraft("")
    setAttachments([])
    setAttachError(undefined)
    // Le steer est porté par les métadonnées de la partie texte — le protocole du serveur
    // (`prompt-queue.ts`), pas une simulation côté interface.
    const parts = [
      ...(text ? [{ type: "text" as const, text, ...partMetadata(mode) }] : []),
      ...files.map(buildFilePart),
    ]
    // Le modèle et l'agent partent avec le message : c'est ce qui rend le changement effectif ici et
    // maintenant, sans toucher à la configuration. Absents, le serveur applique son défaut.
    const model = parseModelChoice(composerModel())
    const result = await client.session
      .promptAsync({
        sessionID,
        parts,
        ...(model ? { model } : {}),
        ...(activeVariant() ? { variant: activeVariant() } : {}),
        ...(composerAgent() ? { agent: composerAgent() } : {}),
        ...scope(),
      })
      .catch((cause: unknown) => {
        setError(String(cause))
        return undefined
      })
    if (result) {
      await loadMessages(sessionID)
      // Le retour ne s'affiche qu'après acceptation : dire « queued » d'un message refusé serait un mensonge.
      const note = deliveryNotice(mode)
      if (note) flash(note)
    }
  }

  /** Entrée pendant le travail : le message est accepté puis mis en file par le serveur. */
  const queueMessage = () => {
    if (!draft().trim() && attachments().length === 0) {
      flash("file d'attente : saisissez un message")
      return
    }
    void send(undefined, "queue")
  }

  /** Alt+S : la consigne rejoint le tour en cours si le serveur le permet, sinon on le dit. */
  const steerMessage = () => {
    if (!working()) {
      flash("steer : aucun tour en cours — consigne non envoyée")
      return
    }
    if (!draft().trim() && attachments().length === 0) {
      flash("steer : saisissez une consigne")
      return
    }
    void send(undefined, "steer")
  }

  const applyDirectory = (value: string) => {
    setDirectory(value)
    const trimmed = value.trim()
    if (trimmed) localStorage.setItem(DIR_KEY, trimmed)
    else localStorage.removeItem(DIR_KEY)
    openHome()
    void loadPath()
    void loadSessions()
    void loadPermissions()
  }

  /**
   * « Nouvelle session dans ce dossier » — le geste porté par une ligne de workspace.
   *
   * Le dossier devient le lieu de travail **avant** la création : le client envoie `directory` à
   * chaque appel, donc créer ailleurs sans le dire laisserait la page dans un contexte qui ne
   * correspond plus à la session affichée.
   */
  const newSessionIn = (folder: string) => {
    applyDirectory(folder)
    void createSession(folder)
  }

  const toggle = (id: string) => setExpanded((current) => ({ ...current, [id]: !current[id] }))

  /** Un dossier est ouvert par défaut : on replie pour dégager, on ne déplie pas pour découvrir. */
  const groupOpen = (key: string) => groupsOpen()[key] !== false
  const toggleGroup = (key: string) => setGroupsOpen((current) => ({ ...current, [key]: current[key] === false }))

  /**
   * Les plugins seulement — les seuls accès hors session.
   *
   * Ils se lisent au montage : `GET /plugin` pèse **708 octets**. Les commandes ne sont plus lues :
   * la section qui les listait a été retirée, parce qu'une route qui existe n'est pas une raison
   * d'afficher — `GET /command` pesait 736 669 octets compressés pour un catalogue qu'on ne
   * consulte pas (un skill s'injecte, il ne se parcourt pas).
   */
  const loadPlugins = async () => {
    const result = await client.plugin.list(scope()).catch(() => undefined)
    setPlugins((result as { data?: PluginList } | undefined)?.data)
  }

  /** Déplier les sessions cachées d'un dossier. */
  const toggleMore = (key: string) => setMoreOpen((current) => ({ ...current, [key]: !current[key] }))

  /**
   * Le fil ne se déplace que si l'on est **déjà en bas**.
   *
   * Le suivi inconditionnel rendait la lecture impossible : remonter dans le fil pendant que l'agent
   * écrit ramenait de force en bas. On retient la position au défilement, et on ne descend que si l'on
   * y était — sinon on ne bouge pas ce qu'on est en train de lire.
   */
  let scroller: HTMLDivElement | undefined
  let following = true
  const [scrollChrome, setScrollChrome] = createSignal({ up: false, thumb: false, progress: 0 })
  const measureScroll = () => {
    if (!scroller) return
    const max = scroller.scrollHeight - scroller.clientHeight
    setScrollChrome({
      up: scroller.scrollTop > 8,
      thumb: max > 4,
      progress: max > 0 ? Math.min(1, scroller.scrollTop / max) : 0,
    })
  }
  const onScroll = () => {
    if (!scroller) return
    following = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 40
    measureScroll()
  }
  createEffect(() => {
    messages()
    if (scroller && following) scroller.scrollTop = scroller.scrollHeight
    queueMicrotask(measureScroll)
  })

  onMount(async () => {
    setHealth(await fetchHealth())
    await loadPath()
    await loadProjects()
    await loadSessions()
    await loadPermissions()
    await loadQuestions()
    await loadPlugins()
    // Le panneau droit lit ses cinq états réels au montage — aucun d'eux n'est fabriqué ici.
    void loadMcp()
    void loadPanelConfig()
    void loadGit()
    // Le catalogue des modèles est payé au montage : le choix du modèle est dans la saisie, donc il
    // doit être prêt avant qu'on écrive. Les agents, eux, attendent la première ouverture (1,5 Mo).
    void loadModelCatalog()

    const healthTimer = setInterval(async () => {
      setHealth(await fetchHealth())
      // Le même battement de 10 s sert de chien de garde : le serveur bat toutes les 10 s, donc un
      // flux ouvert mais muet depuis trois battements est mort — et `EventSource` ne le verra jamais.
      eventStream.watchdog(Date.now())
    }, 10_000)
    // La charpente suit la largeur de fenêtre : le solveur est pur, donc rien à mémoriser ici.
    const onResize = () => setViewport(window.innerWidth)
    window.addEventListener("resize", onResize)
    /**
     * Les raccourcis globaux, branchés sur les vraies actions de la page.
     *
     * Chaque calque consomme son propre Échap (stopPropagation) avant cette ligne : Échap ferme
     * d'abord ce qui est ouvert, puis interrompt l'agent s'il travaille. Le `preventDefault` vient
     * du registre (`shortcuts.ts`) : seuls les raccourcis qui écrasent le navigateur le demandent.
     */
    const onKey = (event: KeyboardEvent) => {
      // La palette s'ouvre de n'importe où, y compris hors du champ : c'est un geste global.
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "p") {
        event.preventDefault()
        setPaletteQuery("")
        setPaletteIndex(0)
        setPaletteOpen(true)
        void loadCommands()
        return
      }
      if (event.key === "Escape") {
        if (paletteOpen()) setPaletteOpen(false)
        else setConfigOpen(false)
      const match = matchShortcut(keyState(event), "global")
      if (!match) return
      if (match.preventDefault) event.preventDefault()
      switch (match.id) {
        case "palette":
          setPaletteOpen(true)
          return
        case "newSession":
          void createSession()
          return
        case "renameSession": {
          const session = sessions().find((entry) => entry.id === active())
          if (session) startRename(session)
          return
        }
        case "deleteSession": {
          const sessionID = active()
          if (sessionID) setConfirming(sessionID)
          return
        }
        case "interrupt":
          if (paletteOpen()) {
            setPaletteOpen(false)
            return
          }
          if (configOpen()) {
            setConfigOpen(false)
            return
          }
          if (working()) void abortRun()
          return
        case "steer":
          steerMessage()
          return
      }
    }
    window.addEventListener("keydown", onKey)
    // Debounced search: the list endpoint takes `search`, so the server does the filtering.
    let searchTimer: ReturnType<typeof setTimeout> | undefined
    createEffect(() => {
      query()
      clearTimeout(searchTimer)
      searchTimer = setTimeout(() => void loadSessions(), 250)
    })

    const eventStream = subscribeEvents({
      onEvent: (event) => {
        /**
         * Le fil se décide **ici**, avant l'aiguillage, pour que le journal porte la **raison** : un
         * événement qui arrive et ne change rien est exactement ce qu'on cherche quand l'écran semble
         * mort. La décision est pure (`stream-sync.ts`), donc c'est la même que celle testée hors DOM.
         */
        const sessionID = active()
        const outcome = event.type.startsWith("message.")
          ? threadEventOutcome(messages(), sessionID, event)
          : undefined
        // Le journal se remplit **avant** l'aiguillage : ce qui n'est traité nulle part doit rester
        // visible, sinon on ne peut pas voir qu'un événement arrive et n'est pas pris en charge.
        setLogEntries((current) => {
          const next = [
            ...current,
            { at: Date.now(), type: event.type, note: outcome && outcome.kind !== "applied" ? outcome.reason : undefined },
          ]
          return next.length > LOG_LIMIT ? next.slice(next.length - LOG_LIMIT) : next
        })
        if (event.type === "permission.asked" || event.type === "permission.replied") {
          setPermissions((current) => reducePermissions(current, event))
          // Une décision bloquante ouvre le tiroir d'elle-même : elle ne doit jamais attendre dans un
          // onglet fermé. C'est la règle d'avant, et elle ne change pas — le tiroir a juste gagné une
          // seconde raison d'exister.
          if (event.type === "permission.asked") {
            setDrawerTab("decisions")
            setDrawerOpen(true)
          }
        }
        // La question arrive par le même canal, mais elle vit dans le fil : c'est une écriture là où
        // les permissions sont une décision de côté.
        if (
          event.type === "question.asked" ||
          event.type === "question.replied" ||
          event.type === "question.rejected"
        ) {
          setQuestions((current) => reduceQuestions(current, event))
        }
        if (event.type === "session.created" || event.type === "session.deleted") void loadSessions()

        /**
         * Le fil s'entretient **en place**.
         *
         * La page relisait auparavant tout le fil par REST dès qu'un événement citait l'identifiant de
         * session — 7 782 parts relues à chaque delta : c'est ce qui faisait sauter le défilement et
         * clignoter le texte. `reduceThread` applique l'événement, et le rechargement ne subsiste que
         * pour un cas nommé : un message encore inconnu de la page (le début d'un tour).
         */
        if (outcome?.kind === "applied") applyThread(outcome.messages)
        else if (outcome?.kind === "resync" && sessionID) reloadThread(sessionID)
        if (event.type === "session.status" || event.type === "session.idle") {
          const properties = (event.properties ?? {}) as { sessionID?: string; status?: { type?: string } }
          const occupe = properties.status?.type === "busy"
          if (properties.sessionID) {
            setSessionBusy((current) => ({ ...current, [properties.sessionID!]: occupe }))
          }
          if (properties.sessionID === active()) {
            // Fin d'une série de modifications : l'auto-commit/push est
            // désactivé par défaut et vérifié côté serveur (aucune action sur main).
            if (working() && !occupe && properties.sessionID) {
              void gitApi.apresAgent(properties.sessionID).catch(() => undefined)
            }
            setWorking(occupe)
          }
        }
      },
      onState: (state) => {
        const previous = stream()
        setStream(state)
        /**
         * Ce qu'une (re)connexion demande de relire est décidé par une fonction pure (`resyncPlan`) :
         * le premier branchement ne relit pas le fil — il vient d'être chargé et le relire doublerait
         * la requête la plus lourde —, une **coupure** le relit, ainsi que l'état d'activité.
         *
         * Sans cela, un `session.idle` manqué pendant la coupure laissait l'écran sur « travail en
         * cours » indéfiniment, et les deltas émis pendant l'interruption étaient perdus pour de bon :
         * le flux ne rejoue rien (aucun `Last-Event-ID` côté serveur), donc la page ne peut pas
         * espérer les rattraper par le flux — elle doit relire.
         */
        for (const target of resyncPlan(previous, state)) {
          if (target === "permissions") void loadPermissions()
          else if (target === "questions") void loadQuestions()
          else if (target === "sessions") void loadSessions()
          else if (target === "messages") {
            const sessionID = active()
            if (sessionID) reloadThread(sessionID)
          } else void loadActivity()
        }
      },
    })

    onCleanup(() => {
      clearInterval(healthTimer)
      clearTimeout(searchTimer)
      clearTimeout(shortcutTimer)
      if (threadFrame !== undefined) cancelAnimationFrame(threadFrame)
      window.removeEventListener("resize", onResize)
      window.removeEventListener("keydown", onKey)
      eventStream.stop()
    })
  })

  /**
   * Le fil — l'unité de lecture est **l'étape**, pas le message.
   *
   * `groupTurns` (voir `view-model.ts`) découpe chaque réponse en étapes, chacune portant son prix. Le
   * prompt de l'utilisateur garde sa surface et son texte tel quel ; la prose de l'agent est au grand
   * corps ; le travail (outils, raisonnement, patches) tient **une ligne** chacun et se déplie sur place.
   */
  const renderItem = (part: Part) => {
    const id = part.id ?? ""
    if (part.type === "text") {
      return <ConversationParagraph text={part.text ?? ""} synthetic={part.synthetic} ignored={part.ignored} />
    }
    if (part.type === "reasoning") {
      // La durée, pas le volume : `reasoning.time` est renseigné 1 511 fois sur 1 511. Tant que le
      // serveur ne l'a pas bornée, la durée est **vivante** — elle avance au battement de `tick`.
      const start = part.time?.start
      const end = part.time?.end
      const live = reasoningLive(part)
      const duration =
        typeof start !== "number"
          ? undefined
          : typeof end === "number"
            ? end - start
            : live
              ? tick() - start
              : undefined
      return (
        <ThoughtRow
          duration={formatDuration(duration)}
          chars={(part.text ?? "").length}
          text={part.text ?? ""}
          open={Boolean(expanded()[id])}
          onToggle={() => toggle(id)}
        />
      )
    }
    if (part.type === "tool") {
      // Ce qu'un outil a joint est un **média réel** : `state.attachments` porte des data URLs
      // (25 parties mesurées). On le montre sous la ligne d'action, jamais un chemin nu.
      const media = partMedia(part)
      return (
        <>
          <Show when={part.state} fallback={<RunRow name={part.tool ?? "run"} status="pending" output="" open={false} onToggle={() => toggle(id)} />}>
            {(raw) => {
              const state = raw() as ToolState
              const duration = toolDuration(state, tick())
              const title = toolTitle(state) ?? part.tool ?? ""
              const diff = fileDiff(state)
              const delegate = part.tool === "task" || part.tool === "subagent"
              const status = state.status === "completed" ? "done" : toolStatusLabel(state)
              const detail = toolDetail(state)
              const output = detail.output ?? detail.error ?? detail.input ?? ""
              return (
                <Show when={diff} fallback={
                  <Show when={delegate} fallback={
                    <RunRow
                      name={title}
                      status={status}
                      output={output}
                      duration={duration}
                      open={Boolean(expanded()[id])}
                      onToggle={() => toggle(id)}
                    />
                  }>
                    <DelegateRow
                      name={title}
                      running={state.status === "running" || state.status === "pending"}
                      duration={duration}
                    />
                  </Show>
                }>
                  {(value) => (
                    <EditRow
                      file={title}
                      additions={value().additions}
                      deletions={value().deletions}
                      done={state.status === "completed"}
                      duration={duration}
                    />
                  )}
                </Show>
              )
            }}
          </Show>
          <For each={media}>{(item) => <Media kind={item.kind} url={item.url} name={item.name} />}</For>
        </>
      )
    }
    if (part.type === "patch") {
      return <PatchLine files={part.files ?? []} open={Boolean(expanded()[id])} onToggle={() => toggle(id)} />
    }
    if (part.type === "compaction") {
      // Une coupe franche dans l'historique : ce qui suit ne s'appuie plus sur ce qui précède.
      return <Boundary label={part.auto ? "context compacted" : "context compacted on request"} />
    }
    if (part.type === "retry") {
      return <Boundary label={typeof part.attempt === "number" ? `retry attempt ${part.attempt + 1}` : "retry"} />
    }
    if (part.type === "file") {
      // `Part` est le miroir **permissif** de l'union du serveur, où `type` est une chaîne ouverte :
      // `Extract<Part, { type: "file" }>` se réduit donc à `never`. On garde les champs à la lecture.
      const mime = typeof part.mime === "string" ? part.mime : ""
      const filename = typeof part.filename === "string" ? part.filename : undefined
      const url = typeof part.url === "string" ? part.url : undefined
      // Une image s'affiche — c'est la pièce jointe qu'on veut voir. Tout autre fichier reste une
      // pastille nommée : un `.zip` n'a rien à montrer.
      const media = partMedia(part)
      if (media.length > 0) {
        return <For each={media}>{(item) => <Media kind={item.kind} url={item.url} name={item.name} />}</For>
      }
      return <FileChip label={filePartLabel({ filename, mime })} thumb={isImageMime(mime) ? url : undefined} />
    }
    // Type inconnu : un nom de type interne n'est pas une information — mieux vaut ne rien montrer.
    return null
  }

  /** Le prompt de l'utilisateur : le seul texte qu'il a écrit lui-même, donc la seule surface mise en forme. */
  const renderPrompt = (part: Part, queued = false) => {
    if (part.type !== "text") return renderItem(part)
    const text = part.text ?? ""
    // Le bloc d'injections arrive en texte brut, dans le même message que le prompt. On le lit comme
    // une structure et il ne s'affiche **pas** comme si l'utilisateur l'avait écrit.
    const injections = parseInjections(text)
    if (!injections) return <ConversationUserMessage text={text} queued={queued} />
    // Les tirs de garde-fous ont leur propre forme : une ligne par tir, avec l'origine en clair.
    // Les passer à `ContextInjections` afficherait « 0 section » — le bloc n'a pas de volumes.
    if (injections.kind === "firings") {
      return (
        <div class="injections">
          <div class="injections-head">{`${injections.count} tir(s) de garde-fou`}</div>
          <ul class="injections-list">
            {injections.firings.map((firing) => (
              <li>{`🛡 guard: ${firing.origin}/${firing.name}${firing.reason ? ` · ${firing.reason}` : ""}`}</li>
            ))}
          </ul>
        </div>
      )
    }
    const id = part.id ?? "injections"
    return <ContextInjections injections={injections} open={Boolean(expanded()[id])} onToggle={() => toggle(id)} loadSource={loadInstructionSource} />
  }

  /**
   * Envoyer depuis l'accueil **crée la session d'abord**.
   *
   * C'est le premier message qui fait naître la session, sans qu'on ait à cliquer « New session »
   * avant d'écrire. L'ordre compte : `send()` écrit dans la session **ouverte**, donc elle doit
   * exister avant l'envoi.
   */
  const sendFromHome = async (event?: { preventDefault: () => void }) => {
    event?.preventDefault()
    if (!draft().trim() && attachments().length === 0) return
    // Même garde-fou que dans le compositeur : on ne crée pas une session pour y envoyer
    // une commande inconnue.
    if (!(await guardCommand(draft()))) return
    await createSession()
    if (!active()) return
    await send()
  }

  /**
   * L'accueil, quand **aucune session n'est ouverte**.
   *
   * C'est l'écran d'ouverture de la maquette validée : salut selon l'heure, mot
   * d'ordre local qui tourne à chaque ouverture, composeur monté au centre qui
   * descend à l'envoi, et puces de reprise construites sur les vraies sessions.
   * Le composant ne fait aucun appel réseau : tout lui est passé en props.
   */
  const renderHome = () => (
    <div class="home">
      <div class="home-inner">
        <div class="home-head">
          <h1 class="home-title">Into the Unknown</h1>
          <p class="home-sub">Describe what you want done. The folder decides which project it joins.</p>
        </div>

        {/* Le dossier **avant** le champ : c'est lui qui décide à quel projet la session appartiendra,
            et il ne se change plus sans rouvrir une session. */}
        <div class="home-picks">
          <FolderPicker
            folders={projects().map((project) => (typeof project === "string" ? project : project.path))}
            value={directory()}
            placeholder={serverPath()}
            label="Working directory — the new session joins this project"
            onChange={applyDirectory}
          />
        </div>

        <form class="home-composer" onSubmit={(event) => void sendFromHome(event)}>
          {/* L'accueil est le premier écran : le `/` et le `@` doivent y ouvrir la même liste que
              dans le compositeur de session, sinon le premier message ne peut rien choisir. */}
          <Show when={menu() && suggestions().length > 0}>
            <SuggestMenu
              rows={suggestions()}
              active={menuIndex()}
              label={menu() === "commands" ? "commands" : "files"}
              onHover={setMenuIndex}
              onPick={(row) => activateSuggestion(suggestions().indexOf(row), false)}
            />
          </Show>
          <div class="composer-field">
            <ComposerMarkup text={draft()} />
            <textarea
              class="composer-input"
              rows="3"
              placeholder="Describe what you want to build, / commands, @ files"
              value={draft()}
              ref={(element: HTMLTextAreaElement) => (input = element)}
              onInput={(event) => {
                const value = event.currentTarget.value
                setDraft(value)
                setHistoryIndex(-1)
                refreshMenu(value, event.currentTarget.selectionStart)
              }}
              onKeyDown={onComposerKey}
              onKeyUp={(event) => {
                if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
                  refreshMenu(draft(), event.currentTarget.selectionStart)
                }
              }}
              onClick={(event) => refreshMenu(draft(), event.currentTarget.selectionStart)}
            />
          </div>
          <Show when={attachError()}>{(message) => <p class="error">{message()}</p>}</Show>
          <Show when={commandError()}>{(message) => <p class="error">{message()}</p>}</Show>
          <div class="composer-bar">
            <label class="attach" title="Attach files">
              <PlusIcon size={16} />
              <input
                class="hidden-input"
                type="file"
                multiple
                onChange={(event) => {
                  void addFiles(event.currentTarget.files)
                  // Remis à zéro pour qu'attacher deux fois le même fichier soit possible.
                  event.currentTarget.value = ""
        <div class="cv-dock">
          <form class="home-composer cv-composer" onSubmit={(event) => void sendFromHome(event)}>
            <ComposerSuggestions
              open={Boolean(menu()) && suggestions().length > 0}
              entries={suggestions()}
              active={menuIndex()}
              label={menu() === "commands" ? "commands" : "files"}
              onPick={acceptSuggestion}
              onHover={setMenuIndex}
            />
            <div class="composer-field">
              <ComposerMarkup text={draft()} />
              <textarea
                class="composer-input"
                rows="2"
                placeholder={COMPOSER_PLACEHOLDER}
                value={draft()}
                ref={(element: HTMLTextAreaElement) => (input = element)}
                onInput={(event) => {
                  const value = event.currentTarget.value
                  setDraft(value)
                  setHistoryIndex(-1)
                  refreshMenu(value, event.currentTarget.selectionStart)
                }}
                onKeyDown={(event) => onComposerKey(event, () => void sendFromHome())}
                onKeyUp={(event) => {
                  if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
                    refreshMenu(draft(), event.currentTarget.selectionStart)
                  }
                }}
                onClick={(event) => refreshMenu(draft(), event.currentTarget.selectionStart)}
              />
            </div>
            <Show when={attachError()}>{(message) => <p class="error">{message()}</p>}</Show>
            <ComposerControls
              agents={agentOptions()}
              agent={composerAgent()}
              onAgentChange={setComposerAgent}
              onOpenAgents={() => void loadAgentOptions()}
              models={modelOptions()}
              model={composerModel()}
              onModelChange={setComposerModel}
              onOpenModels={() => void loadModelCatalog()}
              variants={variantOptions()}
              variant={activeVariant()}
              onVariantChange={setComposerVariant}
              working={working()}
              canSend={Boolean(draft().trim()) || attachments().length > 0}
              onAttach={(files) => void addFiles(files)}
              onInterrupt={() => void abortRun()}
            />
          </form>
          <ComposerStatusBar
            agent={agentLabel()}
            model={modelLabel()}
            variant={variantLabel()}
            stats={stats()}
            contextLimit={modelLimits()[composerModel()]}
            working={working()}
            onInterrupt={() => void abortRun()}
            onTagFiles={tagFiles}
            onCommands={openCommands}
          />
        </div>
      </div>
    </div>
    <OpeningScreen
      salutation={greeting()}
      motto={motto()}
      sessions={sessions()}
      onResume={(session) => void selectSession(session.id)}
      draft={draft()}
      onDraft={setDraft}
      onSubmit={() => void sendFromHome()}
      attachments={attachments()}
      attachError={attachError()}
      onAttach={(files) => void addFiles(files)}
      onRemoveAttachment={removeAttachment}
      directory={directory()}
      projects={projects()}
      serverPath={serverPath()}
      onDirectoryChange={applyDirectory}
      modelOptions={modelOptions()}
      agentOptions={agentOptions()}
      composerModel={composerModel()}
      composerAgent={composerAgent()}
      onModelChange={setComposerModel}
      onAgentChange={setComposerAgent}
      onModelOpen={() => void loadModelCatalog()}
      onAgentOpen={() => void loadAgentOptions()}
    />
  )

  const renderTurn = (turn: TurnView, index: number = -1) => (
    <>
      <Show when={turn.prompt.length > 0}>
        <Turn role="user" index={index}>
          <For each={turn.prompt}>{(part) => renderPrompt(
            part,
            working() &&
              turn.id === [...turns()].reverse().find((item) => item.prompt.length > 0)?.id &&
              turn.id !== servedTurn(turns())?.id,
          )}</For>
          {/*
            Ce qui **travaille** le dit : une ligne d'attente, avec le spinner, à la place de la ligne
            qui n'est pas encore écrite. Deux phases, dans l'ordre du serveur — « loaded … » tant que
            les fichiers d'instructions ne sont pas écrits, « Injecting… » tant que le contexte ne
            l'est pas. Chaque phase finie devient sa ligne posée, avec son losange.
          */}
          {/*
            Seul le tour que le run **sert** annonce une injection. Un prompt envoyé pendant
            qu'un autre tourne attend en file : sa ligne d'injection ne doit pas apparaître,
            sinon elle s'affiche avant même l'injection et reste animée après, ce tour-là ne
            recevant ses parts qu'une fois servi.
          */}
          <Show when={turn.id === servedTurn(turns())?.id && injectionPhase(turn.prompt, working()) !== "done"}>
            <div class="injections injecting">
              <span class="injections-head">
                <Spinner />
                <span class="injections-title">
                  {injectionPhase(turn.prompt, working()) === "loading" ? "loaded …" : "Injecting…"}
                </span>
              </span>
            </div>
          </Show>
        </Turn>
      </Show>
      <Show when={turn.steps.length > 0 || turnError(turn)}>
        <Turn role="assistant" index={index}>
          {/* Le **flux**, dans l'ordre des faits : la prose au corps de lecture, le travail en une
              ligne chacune, sans repli. Un repli qui cache tout ne montrait plus rien (§9.2 révisé) ;
              le détail reste accessible en dépliant **l'entrée elle-même**. */}
          <For each={turn.steps}>
            {(step: StepView) => <For each={step.items}>{(part) => renderItem(part)}</For>}
          </For>

          {/* Une réponse qui a échoué **n'a aucune partie** : le tour ne disait donc rien du tout.
              L'erreur vit dans `info.error`, la page la lisait déjà (`errorText`) et la rangeait dans
              `turn.error` — mais personne ne l'affichait. Mesuré le 2026-10-17 : un tour muet alors
              que le serveur portait `getaddrinfo ENOTFOUND opencode.ai`. C'est ce silence qui fait
              croire à une panne de l'interface. */}
          <Show when={turnError(turn)}>{(message) => <p class="error">The turn failed: {message()}</p>}</Show>

          {/* Le bilan de la dernière réponse : ses documents, à la fin de son dernier step (§12.3). */}
          <Show when={turn.id === lastWorkingTurn(turns())?.id}>
            <ModifiedFiles docs={answerDocuments(turn)} />
          </Show>
        </Turn>
      </Show>
    </>
  )

  /**
   * Les commandes de la palette pointent toutes sur des actions déjà dans l'interface : la palette
   * n'invente aucun geste, elle donne un clavier à ceux qui existent.
   */
  const paletteCommands = (): PaletteCommand[] => {
    const session = sessions().find((entry) => entry.id === active())
    const sessionID = active()
    return [
      { id: "new", label: "Nouvelle session", keys: "alt+n", run: () => void createSession() },
      { id: "search", label: "Rechercher des sessions", hint: "workspaces", run: () => setHeadMode("search") },
      {
        id: "rename",
        label: "Renommer la session courante",
        keys: "ctrl+r",
        run: () => {
          if (session) startRename(session)
        },
      },
      {
        id: "delete",
        label: "Supprimer la session courante",
        keys: "ctrl+d",
        hint: "confirmation",
        run: () => {
          if (sessionID) setConfirming(sessionID)
        },
      },
      { id: "interrupt", label: "Interrompre l'agent", keys: "esc", run: () => void abortRun() },
      { id: "queue", label: "Mettre le message en file", keys: "enter", run: queueMessage },
      { id: "steer", label: "Injecter la consigne dans le tour", keys: "alt+s", run: steerMessage },
      { id: "config", label: "Ouvrir les réglages", run: () => setConfigOpen(true) },
    ]
  }

  /**
   * Ce qui est sain ne s'affiche pas. Le bandeau n'existe que si quelque chose est cassé, et
   * disparaît dès que c'est réparé — l'absence est le meilleur indicateur.
   */
  const notice = () => {
    // Le retour d'un raccourci est prioritaire : c'est la réponse à l'action qu'on vient de faire.
    const flashMessage = shortcutNotice()
    if (flashMessage) return { text: flashMessage, bad: false }
    if (!health()?.healthy) return { text: "server unreachable", bad: true }
    if (!stream().connected) return { text: "stream interrupted", bad: false }
    // L'agent travaille : le serveur le dit, on ne le devine pas. Transitoire, donc pas un « badge au
    // repos » — il disparaît de lui-même dès que la session repasse au repos.
    if (working()) return { text: "working…", bad: false }
    return undefined
  }

  return (
    <>
      {/* Fond : canvas derrière la charpente, vignettage CSS statique. Les
          colonnes latérales gardent leur fond opaque ; la colonne centrale
          transparente laisse voir les étoiles. Aucun contenu, aria-hidden. */}
      <SkyCanvas mode={skyMode()} />
      <div class="layout" style={layoutStyle()}>
        <aside class="rail">
        <div class="grip" onPointerDown={startSidebarDrag} />

        <SidebarLogo />

        <div class="rail-new">
          <SidebarNewSession onClick={() => void createSession()} />
        </div>

        <div class="rail-workspaces">
          <SidebarActions
            query={query()}
            headDraft={headDraft()}
            searchOpen={headMode() === "search"}
            addOpen={headMode() === "add"}
            historyOpen={historyOpen()}
            onQuery={setQuery}
            onHeadDraft={setHeadDraft}
            onSearch={() => {
              setHistoryOpen(false)
              setHeadDraft("")
              setHeadMode(headMode() === "search" ? "none" : "search")
            }}
            onAddFolder={() => {
              setHistoryOpen(false)
              setQuery("")
              setHeadDraft("")
              setHeadMode(headMode() === "add" ? "none" : "add")
            }}
            onHistory={() => {
              setHeadMode("none")
              setHistoryOpen(!historyOpen())
            }}
            onCollapse={toggleSidebar}
            onAddSubmit={() => {
              const path = headDraft().trim()
              setHeadMode("none")
              setHeadDraft("")
              if (path) applyDirectory(path)
            }}
            onEscape={() => {
              setHeadMode("none")
              setHeadDraft("")
              setQuery("")
              setHistoryOpen(false)
            }}
          />
          {/* La ligne du libellé porte les **deux gestes de premier niveau** — chercher, ajouter —
              et devient le champ correspondant. Au repos elle n'est qu'un libellé : ce qui est rare
              ne s'affiche pas (§8), et ces deux fonctions se trouvent là où on les cherche. */}
          <div class="ws-head">
            <Show when={headMode() === "none"} fallback={<input
              class="ws-input"
              autofocus
              placeholder={headMode() === "search" ? "Search sessions" : "path to a project folder"}
              aria-label={headMode() === "search" ? "Search sessions" : "path to a project folder"}
              value={headMode() === "search" ? query() : headDraft()}
              onInput={(event) =>
                headMode() === "search" ? setQuery(event.currentTarget.value) : setHeadDraft(event.currentTarget.value)
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  const path = headMode() === "add" ? headDraft().trim() : ""
                  setHeadMode("none")
                  setHeadDraft("")
                  if (path) applyDirectory(path)
                }
                if (event.key === "Escape") {
                  // Ce champ consomme Échap : le global ne doit pas interrompre l'agent par-dessus.
                  event.stopPropagation()
                  // Fermer un filtre le retire aussi : une liste filtrée sans champ visible ne
                  // dirait plus pourquoi elle est courte.
                  setHeadMode("none")
                  setHeadDraft("")
                  setQuery("")
                }
              }}
            />}>
              <span class="rail-label">workspaces</span>
            </Show>
            {/* Les deux boutons **restent visibles quand le champ est ouvert**, et celui qui a ouvert
                le champ le referme : la première version les cachait derrière l'input, donc la
                recherche ouverte n'avait plus aucun moyen d'être fermée à la souris (défaut relevé
                le 2026-10-15). Un geste qui ouvre doit être le même qui ferme. */}
            <span class="ws-actions">
              <button
                class="icon-btn"
                classList={{ active: headMode() === "search" }}
                title={headMode() === "search" ? "Close search" : "Search sessions"}
                aria-label={headMode() === "search" ? "Close search" : "Search sessions"}
                onClick={() => {
                  setHeadDraft("")
                  if (headMode() === "search") {
                    setHeadMode("none")
                    setQuery("")
                  } else setHeadMode("search")
                }}
              >
                <Show when={headMode() === "search"} fallback={<SearchIcon size={16} />}>
                  <CrossIcon size={16} />
                </Show>
              </button>
              <button
                class="icon-btn"
                classList={{ active: headMode() === "add" }}
                title={headMode() === "add" ? "Cancel" : "Add a workspace folder"}
                aria-label={headMode() === "add" ? "Cancel" : "Add a workspace folder"}
                onClick={() => {
                  setQuery("")
                  setHeadDraft("")
                  setHeadMode(headMode() === "add" ? "none" : "add")
                }}
              >
                <Show when={headMode() === "add"} fallback={<FolderPlusIcon size={16} />}>
                  <CrossIcon size={16} />
                </Show>
              </button>
            </span>
          </div>

          <Show when={headMode() === "add"}>
            <FolderBrowser
              start={directory() || serverPath() || ""}
              onChoose={(path) => {
                applyDirectory(path)
                setHeadMode("none")
              }}
            />
          </Show>

          <Show when={historyOpen()}>
            <SidebarHistory
              sessions={recentSessions(sessions())}
              now={now()}
              onSelect={(id) => {
                setHistoryOpen(false)
                void selectSession(id)
              }}
            />
          </Show>

          <div class="rows">
            <For each={groupByWorkspace(sessions(), projects(), directory())}>
              {(group) => {
                const split = () => splitSessions(group.sessions, Boolean(moreOpen()[group.key]))
                return (
                  <>
                    <SidebarFolder
                      label={group.label}
                      hint={group.hint}
                      time={relativeTime(groupLatestTime(group), now())}
                      open={groupOpen(group.key)}
                      current={group.current}
                      renaming={renamingProject() === group.key}
                      menuOpen={wsMenu() === group.key}
                      onToggle={() => toggleGroup(group.key)}
                      onNew={() => newSessionIn(group.hint)}
                      onMenu={() => setWsMenu(wsMenu() === group.key ? undefined : group.key)}
                      onRename={() => startRenameProject(group)}
                    >
                      <input
                        class="rename"
                        autofocus
                        value={projectDraft()}
                        onInput={(event) => setProjectDraft(event.currentTarget.value)}
                        onBlur={() => void commitProjectRename()}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") void commitProjectRename()
                          if (event.key === "Escape") setRenamingProject(undefined)
                        }}
                      />
                    </SidebarFolder>
                    <Show when={groupOpen(group.key)}>
                      <For each={split().shown}>
                        {(session) => (
                          <Show
                            when={renaming() === session.id}
                            fallback={
                              <SidebarSession
                                title={session.title || "(untitled)"}
                                hint={[
                                  session.title || "(untitled)",
                                  ...sessionDetails(session).map((line) => `${line.label} : ${line.value}`),
                                ].join("\n")}
                                time={relativeTime(sessionTimestamp(session), now())}
                                busy={Boolean(sessionBusy()[session.id])}
                                active={session.id === active()}
                                onSelect={() => {
                                  setMenuOpen(undefined)
                                  void selectSession(session.id)
                                }}
                <>
                  <WorkspaceGroup
                  label={group.label}
                  hint={group.hint}
                  current={group.current}
                  onToggle={() => toggleGroup(group.key)}
                  onNew={() => newSessionIn(group.hint)}
                  menuOpen={wsMenu() === group.key}
                  onMenu={() => setWsMenu(wsMenu() === group.key ? undefined : group.key)}
                  onRename={() => startRenameProject(group)}
                  renaming={renamingProject() === group.key}
                >
                  <input
                    class="rename"
                    autofocus
                    value={projectDraft()}
                    onInput={(event) => setProjectDraft(event.currentTarget.value)}
                    onBlur={() => void commitProjectRename()}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void commitProjectRename()
                      if (event.key === "Escape") {
                        event.stopPropagation()
                        setRenamingProject(undefined)
                      }
                    }}
                  />
                </WorkspaceGroup>
                <Show when={groupOpen(group.key)}>
                    <For each={split().shown}>
                    {(session) => (
                      <Show
                        when={renaming() === session.id}
                        fallback={
                          <SessionRow
                            title={session.title || "(untitled)"}
                            hint={[
                              session.title || "(untitled)",
                              ...sessionDetails(session).map((line) => `${line.label} : ${line.value}`),
                            ].join("\n")}
                            time={sessionTimestamp(session)}
                            now={now()}
                            active={session.id === active()}
                            onSelect={() => {
                              setMenuOpen(undefined)
                              void selectSession(session.id)
                            }}
                          >
                            <span class="row-actions">
                              <Show
                                when={menuOpen() === session.id}
                                fallback={
                                  <button
                                    class="ghost row-menu-trigger"
                                    title="Actions"
                                    aria-label="Session actions"
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      setMenuOpen(session.id)
                                    }}
                                  >
                                    …
                                  </button>
                                }
                              >
                                <span class="row-actions">
                                  <Show
                                    when={menuOpen() === session.id}
                                    fallback={
                                      <button
                                        class="ghost row-menu-trigger"
                                        title="Actions"
                                        aria-label="Session actions"
                                        onClick={(event) => {
                                          event.stopPropagation()
                                          setMenuOpen(session.id)
                                        }}
                                      >
                                        …
                                      </button>
                                    }
                                  >
                                    <span class="row-menu">
                                      <button
                                        class="row-menu-item"
                                        onClick={(event) => {
                                          event.stopPropagation()
                                          setMenuOpen(undefined)
                                          startRename(session)
                                        }}
                                      >
                                        Rename
                                      </button>
                                      <Show
                                        when={confirming() === session.id}
                                        fallback={
                                          <button
                                            class="row-menu-item danger"
                                            onClick={(event) => {
                                              event.stopPropagation()
                                              setConfirming(session.id)
                                            }}
                                          >
                                            Delete
                                          </button>
                                        }
                                      >
                                        <button
                                          class="row-menu-item danger"
                                          onClick={(event) => {
                                            event.stopPropagation()
                                            setMenuOpen(undefined)
                                            void removeSession(session)
                                          }}
                                        >
                                          Confirm delete
                                        </button>
                                        <button
                                          class="row-menu-item"
                                          onClick={(event) => {
                                            event.stopPropagation()
                                            setConfirming(undefined)
                                            setMenuOpen(undefined)
                                          }}
                                        >
                                          Cancel
                                        </button>
                                      </Show>
                                    </span>
                                  </Show>
                                </span>
                              </SidebarSession>
                            }
                          >
                            <input
                              class="rename"
                              autofocus
                              value={renameDraft()}
                              onInput={(event) => setRenameDraft(event.currentTarget.value)}
                              onBlur={commitRename}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") void commitRename()
                                if (event.key === "Escape") setRenaming(undefined)
                              }}
                            />
                          </Show>
                        )}
                      </For>
                      <Show when={split().hidden > 0}>
                        <SidebarReadMore hidden={split().hidden} expanded={false} onToggle={() => toggleMore(group.key)} />
                              </Show>
                            </span>
                          </SessionRow>
                        }
                      >
                        <input
                          class="rename"
                          autofocus
                          value={renameDraft()}
                          onInput={(event) => setRenameDraft(event.currentTarget.value)}
                          onBlur={commitRename}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") void commitRename()
                            if (event.key === "Escape") {
                              event.stopPropagation()
                              setRenaming(undefined)
                            }
                          }}
                        />
                      </Show>
                      <Show when={Boolean(moreOpen()[group.key]) && group.sessions.length > SESSION_LIMIT}>
                        <SidebarReadMore hidden={0} expanded={true} onToggle={() => toggleMore(group.key)} />
                      </Show>
                    </Show>
                  </>
                )
              }}
            </For>
          </div>
        </div>

        <SidebarFooter
          archivedOpen={archivedOpen()}
          archivedCount={0}
          onArchived={() => setArchivedOpen(!archivedOpen())}
          onServer={openConfig}
        >
          <Show when={archivedOpen()}>
            <div class="side-history-empty">No archived-session endpoint is exposed by the server.</div>
          </Show>
        </SidebarFooter>
      </aside>

      {/* `busy` nomme l'état pour le CSS : c'est lui qui autorise un mouvement dans le fil (le
          curseur de la prose en cours), et rien au repos. */}
      <main class="thread" classList={{ busy: working() }}>
        <ConversationHeader
          title={sessions().find((item) => item.id === active())?.title ?? "New session"}
          view={view()}
          working={working()}
          onBack={() => {
            setActive(undefined)
            setThread([])
            turnCache.clear()
          }}
          onGoal={() => setDrawerOpen(!drawerOpen())}
          onView={(next) => {
            setView(next)
            if (next === "logs") void loadToolSchemas()
          }}
          onConfig={openConfig}
        />
        <ScrollChrome
          up={scrollChrome().up}
          thumb={scrollChrome().thumb}
          progress={scrollChrome().progress}
          onUp={() => scroller?.scrollTo({ top: 0, behavior: "smooth" })}
        />
        <Show when={notice()}>
          {(state) => (
            <div class="thread-head">
              <span class="notice" classList={{ bad: state().bad }}>
                {state().text}
              </span>
            </div>
          )}
        </Show>

        {/* Onglets du panneau — Conversation / Config / Logs (maquette §Onglets). Lequel que soit
            l'onglet, la barre reste là : c'est elle qui dit où l'on est et permet de revenir. */}
        <nav class="cl-tabbar" role="tablist" aria-label="Panel views">
          <button
            type="button"
            role="tab"
            class="cl-tab"
            classList={{ active: panelTab() === "conv" }}
            aria-selected={panelTab() === "conv"}
            onClick={() => selectPanelTab("conv")}
          >
            Conversation
          </button>
          <button
            type="button"
            role="tab"
            class="cl-tab"
            classList={{ active: panelTab() === "config" }}
            aria-selected={panelTab() === "config"}
            onClick={() => selectPanelTab("config")}
          >
            Config
          </button>
          <button
            type="button"
            role="tab"
            class="cl-tab"
            classList={{ active: panelTab() === "logs" }}
            aria-selected={panelTab() === "logs"}
            onClick={() => selectPanelTab("logs")}
          >
            Logs
          </button>
        </nav>

        <Show when={panelTab() === "config"}>
          <ConfigTab
            source={configSourceText()}
            onSource={setConfigSourceText}
            original={configOriginal()}
            loading={configLoading()}
            error={configError()}
            notice={configNotice()}
            busy={configBusy()}
            onSave={() => void saveConfigTab()}
            onReload={() => void loadConfigTab()}
          />
        </Show>
        <div class="thread-head">
          <Show when={columns().sidebar === 0}>
            <button class="ghost" title="Show sessions" onClick={toggleSidebar}>
              ☰
            </button>
          </Show>
          <Show when={notice()}>
            {(state) => (
              <span class="notice" classList={{ bad: state().bad }}>
                {state().text}
              </span>
            )}
          </Show>
          {/* La porte du panneau droit vit ici, comme dans la maquette : en tête du fil. */}
          <button
            class="ghost rp-toggle"
            title={panelOpen() ? "Hide details panel" : "Show details panel"}
            aria-label={panelOpen() ? "Hide details panel" : "Show details panel"}
            aria-pressed={panelOpen()}
            onClick={() => setPanelOpen((open) => !open)}
          >
            ▤
          </button>
        </div>

        <Show when={panelTab() === "logs"}>
          <LogsTab
            entries={logEntries() as LogEntry[]}
            connected={stream().connected}
            reconnects={stream().reconnects}
            lastError={stream().lastError}
            onClear={() => setLogEntries([])}
          />
        </Show>

        <Show when={panelTab() === "conv"}>
        <Show when={active()} fallback={renderHome()}>
          <Show when={view() === "logs"}>
            {/* La vue **Trajectory**, reprise de la capture de DSH : barre d'outils, diagramme en
                pistes, puis la liste des événements — badge, contenu, résultat. */}
            <div class="scroll tj-scroll">
              <TrajectoryView turns={turns()} toolSchema={(id) => toolSchemas()[id]} />
            </div>
            {/* Le **journal brut** — ce que la page a réellement reçu. Il vivait dans le tiroir avec
                les statistiques, retirées le 2026-10-15 ; sa place est ici, où la cible §4 le met :
                la vue Logs est le seul endroit qu'on ouvre en se demandant « il ne se passe rien ? ». */}
            <details class="log-events">
              <summary>Raw events ({logEntries().length})</summary>
              <Show when={logEntries().length > 0} fallback={<p class="log-empty">No events received yet.</p>}>
                <ul class="log-list">
                  <For each={[...logEntries()].reverse()}>
                    {(entry) => (
                      <li class="log-row">
                        <span class="log-time">{new Date(entry.at).toLocaleTimeString()}</span>
                        <span class="log-type">{entry.type}{entry.note ? ` → ${entry.note}` : ""}</span>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </details>
          </Show>
          <Show when={view() === "chat"}>
          <div class="scroll" ref={scroller} onScroll={onScroll}>
            <div class="transcript">
              <Show when={error()}>
                <p class="error">{error()}</p>
              </Show>
              <Show when={commandNotice()}>
                <p class="notice" role="status">{commandNotice()}</p>
              </Show>
              <For each={turns()}>{(turn, index) => renderTurn(turn, index())}</For>
              <CommandActivityLines activities={commandActivities()} />

              {/* La seule écriture du fil : l'agent est bloqué tant qu'il n'a pas sa réponse. */}
              <Show when={activeQuestion()}>
                {(request) => (
                  <QuestionSheet
                    request={request()}
                    answers={answersFor(request())}
                    onToggle={(index, label, multiple) =>
                      setAnswers((current) => ({
                        ...current,
                        [request().id]: toggleAnswer(answersFor(request()), index, label, multiple),
                      }))
                    }
                    onCustom={(index, value) =>
                      setAnswers((current) => ({
                        ...current,
                        [request().id]: setCustomAnswer(answersFor(request()), index, value),
                      }))
                    }
                    onSubmit={() => void answerQuestion(request())}
                    onReject={() => void rejectQuestion(request())}
                  />
                )}
              </Show>
            </div>
          </div>

          {/* Le plan de la session, collé au-dessus du champ : le contrat dit ce qui a été
              **demandé**, les todos ce qui est **fait**. Les deux répondent à « où en est-on ? »,
              et c'est au moment d'écrire qu'on se le demande — pas en relisant le fil. */}
          <Show when={contract()}>
            {(current) => <TaskContract contract={current()} onSave={saveContract} />}
          </Show>
          <Show when={todos().length > 0}>
            <TodoList todos={todos()} />
          </Show>

          <form class="composer" onSubmit={send}>
            <div class="composer-inner cv-composer">
              <Show when={attachments().length > 0}>
                <ul class="pending">
                  <For each={attachments()}>
                    {(item) => (
                      <li>
                        <FileChip
                          label={item.filename}
                          thumb={isImageMime(item.mime) ? item.dataUrl : undefined}
                          size={fileSizeLabel(item.size)}
                          onRemove={() => removeAttachment(item.id)}
                        />
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
              <Show when={attachError()}>{(message) => <p class="error">{message()}</p>}</Show>
              <Show when={commandError()}>{(message) => <p class="error">{message()}</p>}</Show>
              {/* Le champ et son calque, dans une même boîte : le calque est **dessous**, à métriques
                  identiques, et le texte du champ est transparent. Le champ reste un `textarea` — le
                  seul contrôle qui garde un curseur, une sélection et le copier-coller du système. */}
              {/* La liste des suggestions, **au-dessus** du champ : c'est le clavier qui la pilote,
                  donc elle reste dans la même boîte et ne fait pas quitter le champ des yeux. */}
              <Show when={menu() && suggestions().length > 0}>
                <SuggestMenu
                  rows={suggestions()}
                  active={menuIndex()}
                  label={menu() === "commands" ? "commands" : "files"}
                  onHover={setMenuIndex}
                  /* Un clic complète, comme `Tab` : `Entrée` reste le geste qui exécute. */
                  onPick={(row) => activateSuggestion(suggestions().indexOf(row), false)}
                />
              </Show>
              <ComposerSuggestions
                open={Boolean(menu()) && suggestions().length > 0}
                entries={suggestions()}
                active={menuIndex()}
                label={menu() === "commands" ? "commands" : "files"}
                onPick={acceptSuggestion}
                onHover={setMenuIndex}
              />
              <div class="composer-field">
                <ComposerMarkup text={draft()} />
                <textarea
                  class="composer-input"
                  rows="2"
                  placeholder={COMPOSER_PLACEHOLDER}
                  value={draft()}
                  ref={(element: HTMLTextAreaElement) => (input = element)}
                  onInput={(event) => {
                    const value = event.currentTarget.value
                    setDraft(value)
                    // Toute frappe sort de l'historique : on écrit du neuf.
                    setHistoryIndex(-1)
                    refreshMenu(value, event.currentTarget.selectionStart)
                  }}
                  onKeyDown={onComposerKey}
                  /* Le curseur qui se déplace sans frappe (flèches, `Home`, `End`) change aussi ce
                     qu'une mention recouvre — mais seulement ces touches-là, pas toutes. */
                  onKeyUp={(event) => {
                    if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
                      refreshMenu(draft(), event.currentTarget.selectionStart)
                    }
                  }}
                  onClick={(event) => refreshMenu(draft(), event.currentTarget.selectionStart)}
                />
              </div>
              <ComposerControls
                agents={agentOptions()}
                agent={composerAgent()}
                onAgentChange={setComposerAgent}
                onOpenAgents={() => void loadAgentOptions()}
                models={modelOptions()}
                model={composerModel()}
                onModelChange={setComposerModel}
                onOpenModels={() => void loadModelCatalog()}
                variants={variantOptions()}
                variant={activeVariant()}
                onVariantChange={setComposerVariant}
                working={working()}
                canSend={Boolean(draft().trim()) || attachments().length > 0}
                onAttach={(files) => void addFiles(files)}
                onInterrupt={() => void abortRun()}
              />
            </div>
            <ComposerStats stats={stats()} contextLimit={modelLimits()[composerModel()]} working={working()} />
            {/* Les raccourcis du tour en cours, dits pendant qu'ils s'appliquent (maquette `status`). */}
            <Show when={working()}>
              <div class="shortcut-hints" aria-label="Raccourcis pendant le travail">
                <span><kbd>esc</kbd> interrompre</span>
                <span><kbd>enter</kbd> file d'attente</span>
                <span><kbd>alt+s</kbd> steer</span>
              </div>
            </Show>
            <ComposerStatusBar
              agent={agentLabel()}
              model={modelLabel()}
              variant={variantLabel()}
              stats={stats()}
              contextLimit={modelLimits()[composerModel()]}
              working={working()}
              onInterrupt={() => void abortRun()}
              onTagFiles={tagFiles}
              onCommands={openCommands}
            />
          </form>
          </Show>
        </Show>
        </Show>
      </main>

      {/* Le panneau droit « comme le CLI » : cinq sections lues sur les signaux réels de la session. */}
      <RightPanel
        open={panelOpen()}
        contract={contract()}
        stats={stats()}
        contextLimit={modelLimits()[composerModel()]}
        mcp={mcp()}
        lsp={typeof config().lsp === "boolean" ? { lsp: config().lsp } : undefined}
        todos={todos()}
        folder={folderLabel()}
        branch={gitStatus()?.branch ?? ""}
        version={health()?.version}
        onGoalAction={goalAction}
        onSaveContract={saveContract}
      />

      <aside class="side" classList={{ open: drawerOpen() }}>
        <div class="side-inner">
          <div class="side-tabs">
            <span class="side-title">Decisions</span>
            <Show when={permissions().length > 0}>
              <span class="pill-count">{permissions().length}</span>
            </Show>
            <button class="side-close" title="Close" onClick={() => setDrawerOpen(false)}>
              ✕
            </button>
          </div>
          {/* Le panneau « Session » vivait ici — **retiré le 2026-10-15**. Ce qu'il montrait existe
              deux fois ailleurs et mieux : la page `Trajectory` porte le détail par tour, et la barre
              sous la saisie porte les agrégats qu'on veut lire en écrivant. Un troisième endroit pour
              la même donnée n'est pas une commodité, c'est un endroit de plus où elle peut diverger. */}
          <Show when={drawerTab() === "decisions"}>
            <For each={permissions()}>
              {(request) => (
                <PermissionSheet request={request} onReply={(reply) => void replyPermission(request, reply)} />
              )}
            </For>
          </Show>
        </div>
      </aside>

      <Show when={paletteOpen()}>
        <ShortcutPalette commands={paletteCommands()} onClose={() => setPaletteOpen(false)} />
      </Show>

      <Show when={configOpen()}>
        <SettingsSheet
          sections={SETTINGS_SECTIONS}
          active={settingsSection()}
          onSelect={selectSection}
          onClose={() => setConfigOpen(false)}
          notice={settingsNotice()}
          error={settingsError()}
          busy={settingsBusy()}
        >
          {/* Les réglages **déclarés** — general, behavior, tools — d'un seul bloc.
              Ajouter un réglage, c'est ajouter une entrée dans `SETTING_SPECS`, pas une ligne ici.
              `general` reçoit en plus le dossier de travail et le pied de page : c'est la seule page
              qui porte autre chose que des clés de `Config`. */}
          <Show when={SETTING_SPECS[settingsSection()]}>
            <GeneralSection
              blocks={settingGroups(SETTING_SPECS[settingsSection()] ?? [])}
              choicesOf={optionsOf}
              draftOf={specDraft}
              checkedOf={(spec) => config()[spec.key] === true}
              busy={settingsBusy()}
              onInput={(spec, value) => setSpecDraft(spec.key, value)}
              onCommit={commitSpec}
              footnote={settingsSection() === "general" ? generalFootnote() : undefined}
              server={
                settingsSection() === "general"
                  ? {
                      address: serverUrl || undefined,
                      username: authUser(),
                      password: authPass(),
                      stored: Boolean(credentials),
                      onChange: (field, value) => (field === "username" ? setAuthUser(value) : setAuthPass(value)),
                      // `rememberCredentials` réécrit le stockage puis recharge la page : le client
                      // SDK et le flux SSE sont bâtis au démarrage, donc rien moins qu'un
                      // redémarrage ne peut prendre les nouveaux en-têtes.
                      onSave: () => rememberCredentials({ username: authUser(), password: authPass() }),
                      onForget: () => rememberCredentials(undefined),
                    }
                  : undefined
              }
            />
          </Show>

          <Show when={settingsSection() === "providers"}>
            {/* La section choisit elle-même entre la grille et le détail : une page qui décide de sa
                mise en page se teste sans monter la moitié de l'application. */}
            <Show
              when={providerRows().length > 0 || providerSelected()}
              fallback={<p class="set-note">loading providers…</p>}
            >
              <ProvidersSection
                providers={providerGrid()}
                catalog={providerCatalog()}
                query={providerQuery()}
                onQuery={searchProviders}
                catalogPending={catalogPending()}
                addOpen={providerNewOpen()}
                draft={providerDraft()}
                onDraft={(key, value) => setProviderDraft((current) => ({ ...current, [key]: value }))}
                onCreate={() => void createProvider()}
                onCancelAdd={() => {
                  setProviderNewOpen((open) => !open)
                  // Le draft part avec son adaptateur : le champ le montre, donc il doit partir.
                  setProviderDraft(newProviderDraft())
                }}
                selected={providerSelected()}
                onSelect={setProviderSelected}
                methods={authMethods(providerAuth(), providerSelected() ?? "")}
                values={providerValuesFor(providerSelected() ?? "")}
                busy={settingsBusy() === `provider:${providerSelected()}`}
                onInput={(key, value) =>
                  setProviderValues((current) => ({ ...current, [scopeKey(providerSelected() ?? "", key)]: value }))
                }
                onSubmit={(method) => void saveProvider(providerSelected() ?? "", method)}
                connection={connectionFor(providerSelected() ?? "")}
                onConnection={(key, value) =>
                  setProviderValues((current) => ({ ...current, [scopeKey(providerSelected() ?? "", key)]: value }))
                }
                onConnectionSave={() => void saveConnection(providerSelected() ?? "")}
                discover={providerEntry(providerSelected() ?? "").discover === true}
                onDiscover={(on) => void setDiscover(providerSelected() ?? "", on)}
                excluded={excludedFor(providerSelected() ?? "")}
                models={modelsFor(providerSelected() ?? "")}
                onAddModel={(modelID) => void addModel(providerSelected() ?? "", modelID)}
                onExclude={(modelID, excluded) => void excludeModel(providerSelected() ?? "", modelID, excluded)}
                defaultModel={modelSpec() ? specDraft(modelSpec() as SettingSpec) : ""}
                defaultModelChoices={modelOptions()}
                onDefaultModel={(value) => {
                  const spec = modelSpec()
                  if (spec) commitSpec(spec, value)
                }}
              />
            </Show>
          </Show>

          <Show when={settingsSection() === "agents"}>
            <AgentsSection
              agents={filterAgents(agentRows(agents()), agentQuery())}
              total={agentRows(agents()).length}
              summary={agentSummary(agentCounts(agentRows(agents())))}
              query={agentQuery()}
              onQuery={setAgentQuery}
              modelOf={agentModelOf}
              disabledOf={agentDisabledOf}
              drafts={agentDrafts()}
              busy={settingsBusy()}
              onDraft={(name, value) => setAgentDrafts((current) => ({ ...current, [name]: value }))}
              onSave={(name) => void saveAgent(name, { model: agentDrafts()[name] ?? "" }, `agent ${name}`)}
              onToggle={toggleAgent}
            />
          </Show>

          <Show when={settingsSection() === "mcp"}>
            <McpSection
              total={Object.keys(mcp()).length}
              connected={mcpConnectedCount(mcp())}
              problems={mcpProblems(mcp())}
            />
          </Show>

          <Show when={settingsSection() === "plugins"}>
            <PluginsSection
              plugins={pluginEntries(plugins())}
              spec={pluginSpec()}
              busy={settingsBusy() === "plugin"}
              onSpec={setPluginSpec}
              onAdd={() => void addPlugin()}
              onRemove={(spec) => void removePlugin(spec)}
            />
          </Show>

          {/* Le ciel : trois niveaux, préférence locale persistée — rangée à côté
              des autres préférences de `general`, sans huitième section. */}
          <Show when={settingsSection() === "general"}>
            <SkySection mode={skyMode()} onChange={changeSkyMode} />
          </Show>
        </SettingsSheet>
      </Show>

      {/* La palette `ctrl+p` — les mêmes commandes que le `/`, avec son propre filtre et son
          propre clavier. Elle vit à la racine pour couvrir toute la page, y compris le rail. */}
      <Show when={paletteOpen()}>
        <CommandPalette
          rows={paletteItems()}
          query={paletteQuery()}
          active={paletteIndex()}
          onQuery={(value) => {
            setPaletteQuery(value)
            setPaletteIndex(0)
          }}
          onActive={setPaletteIndex}
          onMove={(key) => {
            const next = moveMenuIndex(paletteIndex(), paletteItems().length, key)
            if (next !== undefined) setPaletteIndex(next)
          }}
          onPick={(row) => {
            if (row.command) executeCommand(row.command)
          }}
          onClose={() => setPaletteOpen(false)}
        />
      </Show>
      <SessionCommandDialogs
        dialog={commandDialog()}
        onClose={closeCommandDialog}
        onRename={(sessionID, title) => void commitCommandRename(sessionID, title)}
        onExit={onExitConfirmed}
        onDelete={onDeleteConfirmed}
        onEditorSave={(text) => {
          setDraft(text)
          setCommandDialog(undefined)
          input?.focus()
        }}
      />
    </div>
    </>
  )
}
