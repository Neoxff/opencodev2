/**
 * Moteur de calcul du ciel étoilé — pur et déterministe.
 *
 * Entrées : graine, dimensions, mode, instant, défilement de parallaxe,
 * saisie en cours. Sortie : état sérialisable à dessiner.
 * Aucun accès au DOM. Les positions sont recalculées à chaque image (pas
 * d'allocation au-delà des tableaux d'état, ~2 000 étoiles).
 *
 * Spécification : docs/design/20-ciel-etoile.md
 */

// --- générateur de nombres aléatoires déterministe (xorshift32) ----------------

function xorshift32(state: number): { value: number; next: number } {
  let x = state >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return { value: (x >>> 0) / 0xffffffff, next: x >>> 0 };
}

function creerGenerateur(graine: number) {
  let state = graine >>> 0;
  return () => {
    const r = xorshift32(state);
    state = r.next;
    return r.value;
  };
}

function dansIntervalle(rand: () => number, min: number, max: number): number {
  return min + rand() * (max - min);
}

// --- palette -------------------------------------------------------------------

/** Index de couleur dans la palette. Blanc froid, blanc chaud, bleu pâle, ambré rare. */
type CouleurIndex = 0 | 1 | 2 | 3;

// --- constantes de densité (docs/design/20-ciel-etoile.md) ---------------------

const DENSITE = {
  activé: { lointaine: 1300, moyenne: 550, proche: 150 },
  réduit: { lointaine: 650, moyenne: 275, proche: 75 },
} as const;

const TAILLE_PAR_COUCHE = [
  { min: 0.5, max: 0.8 }, // 0 lointaine
  { min: 0.8, max: 1.6 }, // 1 moyenne
  { min: 1.6, max: 2.5 }, // 2 proche
] as const;

const DERIVE_PAR_COUCHE = [1.5, 4, 9]; // px/s, indexées par couche

const PROBA_AMBRE = 0.02; // rares touches ambrées
const CADENCE_FILANTE_MIN = 20_000; // ms
const CADENCE_FILANTE_MAX = 40_000; // ms

// --- types ---------------------------------------------------------------------

export type ModeCiel = "activé" | "réduit" | "statique" | "désactivé";

export type Étoile = {
  id: number;
  couche: 0 | 1 | 2; // 0 lointaine, 1 moyenne, 2 proche
  x: number;
  y: number;
  vx: number;
  vy: number;
  taille: number;
  couleur: CouleurIndex;
  phase: number;
  periode: number;
  amplitude: number;
  halo: boolean;
  alpha: number;
};

export type Filante = {
  x: number;
  y: number;
  angle: number; // radians
  longueur: number;
  durée: number;
  t: number; // temps écoulé dans la filante (ms)
  finie: boolean;
};

export type BandeVoieLactee = {
  x: number;
  y: number;
  w: number;
  h: number;
  alpha: number;
};

export type ÉtatCiel = {
  etoiles: Étoile[];
  filantes: Filante[]; // 0 ou 1 (jamais de rafale, jamais deux qui se croisent)
  voieLactee: BandeVoieLactee[];
  // Interne : génération déterministe des filantes.
  _graine: number;
  // Interne : instant de création de la dernière filante (ms).
  _derniereFilante: number;
  // Interne : prochain instant (ms) où une filante peut naître.
  _prochaineCadence: number;
};

/** Nombre d'étoiles par couche selon le mode. */
export function nbÉtoilesParCouche(mode: ModeCiel): {
  lointaine: number;
  moyenne: number;
  proche: number;
} {
  if (mode === "désactivé") return { lointaine: 0, moyenne: 0, proche: 0 };
  const base = mode === "réduit" ? DENSITE.réduit : DENSITE.activé;
  return { lointaine: base.lointaine, moyenne: base.moyenne, proche: base.proche };
}

// --- génération ----------------------------------------------------------------

function générationCouche(
  rand: () => number,
  nb: number,
  couche: 0 | 1 | 2,
  largeur: number,
  hauteur: number,
  idDépart: number,
): Étoile[] {
  const { min, max } = TAILLE_PAR_COUCHE[couche];
  const dérive = DERIVE_PAR_COUCHE[couche];
  const halo = couche === 2; // halo uniquement sur la couche proche
  const étoiles: Étoile[] = [];
  for (let i = 0; i < nb; i += 1) {
    const id = idDépart + i;
    const periode = 2000 + rand() * 4000; // 2-6 s
    const amplitude = 0.2 + rand() * 0.4; // 20-60 %
    const couleur: CouleurIndex =
      rand() < PROBA_AMBRE ? 3 : ((rand() * 3) >>> 0) as CouleurIndex;
    étoiles.push({
      id,
      couche,
      x: rand() * largeur,
      y: rand() * hauteur,
      vx: (rand() - 0.5) * 0.2 * dérive, // dérive lente, direction aléatoire
      vy: (rand() - 0.5) * 0.1 * dérive,
      taille: dansIntervalle(rand, min, max),
      couleur,
      phase: rand() * Math.PI * 2,
      periode,
      amplitude,
      halo,
      alpha: 1,
    });
  }
  return étoiles;
}

/** Génère l'état initial déterministe à partir d'une graine. */
export function étatInitial(graine: number, largeur: number, hauteur: number, mode: ModeCiel): ÉtatCiel {
  const rand = creerGenerateur(graine);
  const { lointaine, moyenne, proche } = nbÉtoilesParCouche(mode);
  const étoiles: Étoile[] = [];
  let id = 0;
  étoiles.push(...générationCouche(rand, lointaine, 0, largeur, hauteur, id));
  id += lointaine;
  étoiles.push(...générationCouche(rand, moyenne, 1, largeur, hauteur, id));
  id += moyenne;
  étoiles.push(...générationCouche(rand, proche, 2, largeur, hauteur, id));

  // Voie lactée : bandes précalculées (bruit lissé, opacité ≤ 12 %).
  const voieLactee: BandeVoieLactee[] = [];
  const nbBandes = 3 + (rand() * 2 >>> 0);
  for (let i = 0; i < nbBandes; i += 1) {
    voieLactee.push({
      x: rand() * largeur * 0.6,
      y: rand() * hauteur * 0.6,
      w: 120 + rand() * 200,
      h: 15 + rand() * 25,
      alpha: 0.06 + rand() * 0.06, // ≤ 12 %
    });
  }

  // Première cadence de filante déterministe.
  const prochaineCadence = CADENCE_FILANTE_MIN + rand() * (CADENCE_FILANTE_MAX - CADENCE_FILANTE_MIN);

  return {
    etoiles: étoiles,
    filantes: [],
    voieLactee,
    _graine: graine,
    _derniereFilante: 0,
    _prochaineCadence: prochaineCadence,
  };
}

// --- mise à jour par image -----------------------------------------------------

/** Position d'une étoile à l'instant `t` (ms) avec décalage de parallaxe. */
function positionÉtoile(e: Étoile, t: number, offsetX: number, offsetY: number, largeur: number, hauteur: number) {
  const facteurs = [0.5, 1, 1.5]; // parallaxe différenciée par couche
  const f = facteurs[e.couche];
  const x = (e.x + e.vx * t + offsetX * f) % largeur;
  const y = (e.y + e.vy * t + offsetY * f) % hauteur;
  return { x: x < 0 ? x + largeur : x, y: y < 0 ? y + hauteur : y };
}

/** Opacité d'une étoile à l'instant `t` (scintillement). */
function opacitéÉtoile(e: Étoile, t: number, scintillement: boolean): number {
  const base = e.couche === 2 ? 0.9 : e.couche === 1 ? 0.7 : 0.5;
  const scintille = scintillement ? 0.5 + 0.5 * Math.sin((t / e.periode) * Math.PI * 2 + e.phase) : 1;
  return Math.max(0, Math.min(1, base * (1 - e.amplitude / 2 + (e.amplitude / 2) * scintille)));
}

/**
 * Calcule l'état à dessiner à l'instant `t` (ms).
 *
 * @param saisieEnCours si vrai, aucune nouvelle filante n'est créée et les
 *                      filantes existantes sont gelées.
 * @param deltaMs temps écoulé depuis la précédente frame (ms).
 */
export function frame(
  état: ÉtatCiel,
  t: number,
  largeur: number,
  hauteur: number,
  offsetX: number,
  offsetY: number,
  mode: ModeCiel,
  saisieEnCours: boolean,
  deltaMs: number,
): ÉtatCiel {
  const statique = mode === "statique" || mode === "désactivé";
  const scintillement = mode !== "statique";

  // Étoiles : positions et opacité mises à jour.
  const étoiles = état.etoiles.map((e) => {
    if (statique) {
      return { ...e };
    }
    const { x, y } = positionÉtoile(e, t, offsetX, offsetY, largeur, hauteur);
    return { ...e, x, y, alpha: opacitéÉtoile(e, t, scintillement) };
  });

  // Filantes : fait avancer les existantes (gelées pendant la saisie), en
  // crée une si aucune n'est active, pas de rafale, jamais pendant la saisie.
  let filantes = état.filantes.map((f) => {
    const f2 = { ...f };
    if (!saisieEnCours && !f2.finie) {
      f2.t += deltaMs;
      if (f2.t >= f2.durée) f2.finie = true;
    }
    return f2;
  });

  let graine = état._graine;
  let prochaineCadence = état._prochaineCadence;
  const active = filantes.some((f) => !f.finie);
  const depuisDernière = t - état._derniereFilante;
  if (!active && !saisieEnCours && depuisDernière > prochaineCadence) {
    const filante = nouvelleFilante(état, largeur, hauteur, t, graine);
    graine += 1; // avance la graine déterministe
    filantes.push(filante);
    état._derniereFilante = t;
    prochaineCadence = t + CADENCE_FILANTE_MIN + randBorne(graine) * (CADENCE_FILANTE_MAX - CADENCE_FILANTE_MIN);
  }
  filantes = filantes.filter((f) => !f.finie);

  return {
    ...état,
    _graine: graine,
    _prochaineCadence: prochaineCadence,
    etoiles: étoiles,
    filantes,
  };
}

/** Tirage déterministe dans [0, 1[ à partir d'une graine. */
function randBorne(graine: number): number {
  return xorshift32(graine >>> 0).value;
}

/** Génère une nouvelle filante déterministe. */
function nouvelleFilante(état: ÉtatCiel, largeur: number, hauteur: number, t: number, graine: number): Filante {
  const rand = creerGenerateur(graine);
  // angle oblique 25-40°
  const angle = (25 + rand() * 15) * (Math.PI / 180);
  // apparaît sur un bord aléatoire
  const bord = (rand() * 4) >>> 0;
  let x = 0;
  let y = 0;
  if (bord === 0) { x = rand() * largeur; y = 0; }
  else if (bord === 1) { x = largeur; y = rand() * hauteur; }
  else if (bord === 2) { x = rand() * largeur; y = hauteur; }
  else { x = 0; y = rand() * hauteur; }
  return {
    x,
    y,
    angle,
    longueur: 80 + rand() * 140, // 80-220 px
    durée: 600 + rand() * 600, // 0.6-1.2 s
    t: 0,
    finie: false,
  };
}
