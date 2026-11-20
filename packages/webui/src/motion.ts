/**
 * Moteur de mouvement — tokens partagés (Build 3).
 * Fichier recréé sur cette branche car il n'existe pas sur main.
 */

export const DUREE = {
  instantane: 90,
  rapide: 160,
  normal: 240,
  lent: 380,
} as const;

export const COURBE = {
  sortieDouce: "cubic-bezier(0.22, 1, 0.36, 1)",
  entreeSortie: "cubic-bezier(0.4, 0, 0.2, 1)",
} as const;

export const ECHELONNAGE = {
  delaiParElement: 35,
  elementsMax: 8,
} as const;

export const RESSORT = {
  raideur: 120,
  amortissement: 18,
} as const;

export const DUREE_MAX_ACTION = 400;
export const ELEMENTS_MAX_ANIMES = ECHELONNAGE.elementsMax;

export function delaiEchelonnage(i: number): number {
  return Math.min(i, ELEMENTS_MAX_ANIMES - 1) * ECHELONNAGE.delaiParElement;
}

export async function avecWillChange<T>(
  el: HTMLElement,
  proprietes: string,
  fn: () => T | Promise<T>,
): Promise<T> {
  el.style.willChange = proprietes;
  try {
    return await fn();
  } finally {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    el.style.removeProperty("will-change");
  }
}

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
