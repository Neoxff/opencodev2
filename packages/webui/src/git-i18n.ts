/**
 * Libellés du panneau Dépôt — FR et EN complets, aucune clé manquante.
 *
 * Le composant ne contient aucun libellé en dur : chaque texte affiché, chaque
 * `title` et chaque `aria-label` passe par `t()`. Le test `git-i18n.test.ts`
 * garantit l'égalité des clés entre les deux langues.
 */
export type Langue = "fr" | "en"

export const CLES = [
  "etat.a-jour", "etat.en-avance", "etat.en-retard", "etat.divergent", "etat.conflit", "etat.hors-ligne",
  "panel.aria", "panel.titre",
  "vide.jeton", "vide.chargement", "repo.local",
  "compteurs.avance", "compteurs.retard", "compteurs.modifies", "compteurs.modifie",
  "action.fetch.titre", "action.fetch.aria",
  "action.pull.titre", "action.pull.aria",
  "action.commit.confirmer", "action.commit.titre", "action.commit.aria",
  "action.push.confirmer", "action.push.titre", "action.push.aria",
  "confirm.message", "confirm.annuler", "confirm.push",
  "erreur.reessayer.titre", "erreur.reessayer.aria",
  "auto.titre", "auto.reglage.fetch", "auto.reglage.commit", "auto.reglage.push", "auto.journal.annuler",
] as const

export type Cle = (typeof CLES)[number]

const FR: Record<Cle, string> = {
  "etat.a-jour": "À jour", "etat.en-avance": "En avance", "etat.en-retard": "En retard",
  "etat.divergent": "Divergent", "etat.conflit": "Conflit", "etat.hors-ligne": "Hors ligne",
  "panel.aria": "Dépôt Git lié", "panel.titre": "Dépôt",
  "vide.jeton": "Jeton local absent", "vide.chargement": "Chargement du dépôt…", "repo.local": "dépôt local",
  "compteurs.avance": "Commits en avance", "compteurs.retard": "Commits en retard",
  "compteurs.modifies": "Fichiers modifiés", "compteurs.modifie": "modifié",
  "action.fetch.titre": "Récupérer (fetch)", "action.fetch.aria": "Récupérer",
  "action.pull.titre": "Mettre à jour (pull fast-forward)", "action.pull.aria": "Mettre à jour",
  "action.commit.confirmer": "Confirmer le commit", "action.commit.titre": "Committer les fichiers modifiés", "action.commit.aria": "Commit",
  "action.push.confirmer": "Confirmer le push (jamais de force)", "action.push.titre": "Pousser (jamais de force)", "action.push.aria": "Pousser",
  "confirm.message": "Message du commit", "confirm.annuler": "Annuler", "confirm.push": "Pousser vers origin ?",
  "erreur.reessayer.titre": "Réessayer (actualiser l'état)", "erreur.reessayer.aria": "Réessayer",
  "auto.titre": "Automatisme", "auto.reglage.fetch": "Récupérer au démarrage",
  "auto.reglage.commit": "Commit automatique (branche agent/)", "auto.reglage.push": "Pousser la branche agent",
  "auto.journal.annuler": "Annuler (revert local)",
}

const EN: Record<Cle, string> = {
  "etat.a-jour": "Up to date", "etat.en-avance": "Ahead", "etat.en-retard": "Behind",
  "etat.divergent": "Divergent", "etat.conflit": "Conflict", "etat.hors-ligne": "Offline",
  "panel.aria": "Linked Git repository", "panel.titre": "Repository",
  "vide.jeton": "Local token missing", "vide.chargement": "Loading repository…", "repo.local": "local repository",
  "compteurs.avance": "Commits ahead", "compteurs.retard": "Commits behind",
  "compteurs.modifies": "Modified files", "compteurs.modifie": "modified",
  "action.fetch.titre": "Fetch", "action.fetch.aria": "Fetch",
  "action.pull.titre": "Update (fast-forward pull)", "action.pull.aria": "Update",
  "action.commit.confirmer": "Confirm commit", "action.commit.titre": "Commit modified files", "action.commit.aria": "Commit",
  "action.push.confirmer": "Confirm push (never force)", "action.push.titre": "Push (never force)", "action.push.aria": "Push",
  "confirm.message": "Commit message", "confirm.annuler": "Cancel", "confirm.push": "Push to origin?",
  "erreur.reessayer.titre": "Retry (refresh status)", "erreur.reessayer.aria": "Retry",
  "auto.titre": "Automation", "auto.reglage.fetch": "Fetch at startup",
  "auto.reglage.commit": "Automatic commit (agent/ branch)", "auto.reglage.push": "Push the agent branch",
  "auto.journal.annuler": "Undo (local revert)",
}

export function t(langue: Langue, cle: Cle): string {
  return (langue === "en" ? EN : FR)[cle]
}

/** Messages d'erreur Git — les codes restent stables, seuls les libellés changent. */
const ERREURS_EN: Record<string, string> = {
  NON_FAST_FORWARD: "Divergent branches: manual merge required.",
  CONFLIT: "Merge conflict: resolve the files.",
  DEPOT_SALE: "Dirty repository: commit or discard your changes.",
  PAS_DE_RESEAU: "Remote server unreachable.",
  NON_AUTHENTIFIE: "Authentication expired.",
  HORS_PERIMETRE: "Path outside the repository.",
  FICHIER_INTERDIT: "Secret file rejected.",
  ARGUMENT_INVALIDE: "Invalid argument.",
}

export function libelleErreurLocal(code: string, langue: Langue, libelleFr: string): string {
  if (langue === "fr") return libelleFr
  return ERREURS_EN[code] ?? "Git error."
}
