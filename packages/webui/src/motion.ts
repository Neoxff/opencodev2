/**
 * Moteur de mouvement — Opencodev2
 * Source : docs/design/21-animations.md
 *
 * Un seul système de mouvement, pas de bibliothèque d'animation supplémentaire.
 * Aucune animation autre que `transform` et `opacity`.
 *
 * Les valeurs JS sont les mêmes que les variables CSS déclarées dans
 * `packages/webui/src/styles.css` (section "Mouvement") : un composant ne code
 * jamais en dur une durée, une courbe ou un échelonnage.
 */

export type Duree = "instantane" | "rapide" | "normal" | "lent";

export const DUREE: Record<Duree, number> = {
 * Moteur de mouvement — tokens partagés (Build 3).
 * Fichier recréé sur cette branche car il n'existe pas sur main.
 */

export const DUREE = {
  instantane: 90,
  rapide: 160,
  normal: 240,
  lent: 380,
} as const;

/** Courbes de mouvement. Aucune animation de `width`, `height`, `top`, `left`, `box-shadow`. */
export const COURBE = {
  /** Élément qui arrive. */
  sortieDouce: "cubic-bezier(0.22, 1, 0.36, 1)",
  /** Déplacement discret. */
  entreeSortie: "cubic-bezier(0.4, 0, 0.2, 1)",
} as const;

/** Échelonnage : 30–40 ms par élément, 8 éléments maximum animés à la fois. */
export const COURBE = {
  sortieDouce: "cubic-bezier(0.22, 1, 0.36, 1)",
  entreeSortie: "cubic-bezier(0.4, 0, 0.2, 1)",
} as const;

export const ECHELONNAGE = {
  delaiParElement: 35,
  elementsMax: 8,
} as const;

/** Raideur et amortissement du ressort. Désactivé sous `prefers-reduced-motion`. */
export const RESSORT = {
  raideur: 120,
  amortissement: 18,
} as const;

/** Durée maximale autorisée pour une animation déclenchée par l'utilisateur (ms). */
export const DUREE_MAX_ACTION = 400;

/** Nombre d'éléments devant être animés simultanément au maximum. */
export const ELEMENTS_MAX_ANIMES = ECHELONNAGE.elementsMax;

/**
 * Délai d'échelonnage pour l'élément d'index `i` (0-based). Au-delà de
 * `ELEMENTS_MAX_ANIMES`, les éléments suivants apparaissent sans délai
 * supplémentaire (délai plafonné).
 */
export const DUREE_MAX_ACTION = 400;
export const ELEMENTS_MAX_ANIMES = ECHELONNAGE.elementsMax;

export function delaiEchelonnage(i: number): number {
  return Math.min(i, ELEMENTS_MAX_ANIMES - 1) * ECHELONNAGE.delaiParElement;
}

/**
 * Pose `will-change` juste avant l'animation et le retire après, sur l'élément
 * donné. `fn` reçoit l'élément et doit retourner une Promise résolue quand
 * l'animation est terminée (ou `undefined` pour une transition CSS immédiate).
 */
export async function avecWillChange<T>(
  el: HTMLElement,
  proprietes: string,
  fn: () => T | Promise<T>,
): Promise<T> {
  el.style.willChange = proprietes;
  try {
    return await fn();
  } finally {
    // Laisse au navigateur le temps de peindre avant de retirer will-change.
    await new Promise((resolve) => requestAnimationFrame(resolve));
    el.style.removeProperty("will-change");
  }
}

/**
 * Attend la fin d'une transition CSS sur l'élément (timeout de sécurité inclus).
 */
export function finTransition(el: Element, timeoutMs = 1000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      el.removeEventListener("transitionend", onEnd as EventListener);
      reject(new Error("transition timeout"));
    }, timeoutMs);
    const onEnd = (ev: Event) => {
      if (ev.target === el) {
        clearTimeout(timer);
        el.removeEventListener("transitionend", onEnd as EventListener);
        resolve();
      }
    };
    el.addEventListener("transitionend", onEnd as EventListener);
  });
}

/**
 * Store réactif de `prefers-reduced-motion`.
 * Toutes les durées passent à `instantane` (0 ms) quand le mouvement est refusé.
 */
type MediaQueryLike = {
  matches: boolean;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
};

let valeur =
  typeof matchMedia !== "undefined" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;
const abonnes = new Set<() => void>();
const mql =
  typeof matchMedia !== "undefined"
    ? matchMedia("(prefers-reduced-motion: reduce)")
    : null;
if (mql) {
  mql.addEventListener("change", () => {
    valeur = mql.matches;
    abonnes.forEach((cb) => cb());
  });
}

/**
 * Réinitialise le store avec un nouveau `matchMedia` (tests uniquement).
 * Permet de forcer la préférence `prefers-reduced-motion` sans recharger le module.
 */
export function redefinirMatchMedia(fn: (q: string) => MediaQueryLike): void {
  abonnes.clear();
  const m = fn("(prefers-reduced-motion: reduce)");
  valeur = !!m.matches;
  m.addEventListener("change", () => {
    valeur = !!m.matches;
    abonnes.forEach((cb) => cb());
  });
}

export const reduitMouvement = {
  get: () => valeur,
  surChangement: (cb: () => void) => {
    abonnes.add(cb);
    return () => abonnes.delete(cb);
  },
};

/** Durée effective en ms : 0 quand le mouvement est refusé. */
export function dureeEffective(nom: Duree): number {
  return reduitMouvement.get() ? 0 : DUREE[nom];
}

/** Délai d'échelonnage effectif : 0 quand le mouvement est refusé. */
export function delaiEchelonnageEffectif(i: number): number {
  return reduitMouvement.get() ? 0 : delaiEchelonnage(i);
}
