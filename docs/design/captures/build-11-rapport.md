# Build 11 — Écran d'ouverture : rapport de capture et de conformité

Branche : `feat/ui-ouverture` · Date : 2026-11-22 · Viewport de capture : **1920 × 1080**

## 1. Prérequis documentaire — écart consigné

Le prérequis **`docs/design/20-ouverture.md` est absent** du dépôt (seuls `20-ciel-etoile.md`,
`21-animations.md`, `README-maquette.md` et `README-ui.md` existent dans `docs/design/`).

Conformément à la consigne, **la maquette validée a été utilisée comme source** :
`docs/design/maquette-opencodev2-ui.html`, blocs « Écran d'ouverture » (lignes 115–127),
« Composeur » (129–158), et script `MOTTOS` / `nextIndex()` / `hello()` / `welcome()`
(lignes 351–371). La règle de priorité est rappelée dans `README-ui.md` §« Priorité en cas de
conflit » : la maquette gagne sur les anciens documents de design.

## 2. Livrables

| Fichier | Rôle |
|---|---|
| `packages/webui/src/ouverture.ts` | Logique pure : 10 mots d'ordre, rotation `localStorage` + repli aléatoire, salut selon l'heure, découpage en mots. Zéro réseau. |
| `packages/webui/src/ouverture.test.ts` | Tests de rotation (séquence, wrap à 10, index invalide) et de repli (lecture/écriture qui échouent, valeurs hors bornes, absence d'appel réseau), salut et découpage. |
| `packages/webui/src/ouverture-screen.tsx` | Composant Solid de présentation, props typées, CSS isolé importé localement. |
| `packages/webui/src/ouverture.css` | Styles préfixés `.ouv-*`, jetons maquette portés localement, responsive et `prefers-reduced-motion`. |
| `packages/webui/src/app.tsx` | Intégration : l'accueil (`renderHome`) rend `OpeningScreen` ; `openHome()` tire un nouveau mot à chaque retour à l'accueil. |
| `docs/design/captures/build-11-*.png` | 4 captures Playwright (voir §4). |
| `docs/design/captures/build-11-rapport.md` | Le présent rapport. |

## 3. Comportement implémenté

- **Salut selon l'heure** : `Bonne nuit` (< 5 h), `Bonjour` ([5, 12[), `Bon après-midi`
  ([12, 18[), `Bonsoir` (≥ 18 h), suivi du jour et de la date en français. Horloge injectée
  dans `salutation(now: Date)` pour des tests déterministes.
- **Mot d'ordre** : les 10 entrées de la maquette, dans l'ordre. Index mémorisé sous
  `oc2.motto`, incrémenté modulo 10 à chaque ouverture. `try/catch` sur **tout** l'accès au
  stockage (y compris l'accès à `localStorage` lui-même) → repli aléatoire borné. Une valeur
  illisible ou hors bornes bascule aussi sur le tirage. **Aucun appel réseau**.
- **Apparition mot par mot** : un `<span class="ouv-word">` par mot, délai
  `calc(var(--k) * 70ms + 450ms)`, opacité + `translate3d` uniquement (token `--courbe-sortie-douce`).
- **Composeur centré qui descend à l'envoi** : `--ouv-lift` monte le dock vers le centre au
  repos ; à la soumission, la classe `ouv--descending` ramène le lift à 0, l'accueil s'efface,
  puis la session est créée après la durée du token `normal` (240 ms ; 0 ms sous
  `prefers-reduced-motion`). Aucune écriture d'état calculé dans un effet.
- **Puces de reprise** : construites uniquement à partir des **vraies sessions** reçues par
  l'app (`sessions()`, 3 au plus, titre réel). Aucune donnée de démonstration. État vide explicite
 lorsqu'aucune session n'est disponible.
- **Accessibilité** : `<form>` + `<button type="submit">`, `<label>`/aria-label sur les champs,
  focus visible, cible tactile 34 px sur les puces, contraste relevé (voir écarts), mouvement
  réduit respecté, validation côté client conservée dans le composeur existant.

## 4. Captures Playwright

Configuration exacte demandée :

```js
require('/home/joachim/.bun/install/cache/playwright-core@1.55.0@@@1/index.js')
chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] })
browser.newContext({ viewport: { width: 1920, height: 1080 } })
// serveur : bun run --cwd packages/webui dev -- --port 4211 --strictPort
```

| Capture | Contenu |
|---|---|
| `build-11-ouverture.png` | Écran d'ouverture réel, backend local joignable (sessions réelles). |
| `build-11-ouverture-rotation.png` | Après rechargement : mot d'ordre suivant. |
| `build-11-ouverture-descente.png` | État cible de la descente (classe CSS posée, aucun envoi réel, aucune session créée). |
| `build-11-maquette-reference.png` | Maquette validée, même viewport, pour comparaison directe. |

## 5. Comparaison mesurée — application vs maquette

| Mesure | Application | Maquette | Écart |
|---|---|---|---|
| Salut | `Bon après-midi · dimanche 22 novembre` | identique | **aucun** |
| Mot d'ordre (1re ouverture) | `Fais-le bien, une étape à la fois.` | identique | **aucun** |
| Description | `Un rapport, une preuve, puis on s'arrête.` | identique | **aucun** |
| Mots animés | 7, opacité finale 1 | 7 | **aucun** |
| Fond | `rgb(0, 0, 0)` | `#000` | **aucun** |
| Police du mot | Space Grotesk | Space Grotesk | **aucun** |
| Police du salut | JetBrains Mono | JetBrains Mono | **aucun** |
| Placeholder | `Describe what you want to build. / commands, @ files or sessions` | identique | **aucun** |
| Puces | 3 (titres de sessions réelles) | 4 (1 « Resume » + 3 commandes fictives) | volontaire, voir §6 |
| Boîte accueil | x 280, y 0, 1280 × 1080 | x 269, y 63, 1330 × 1016 | zone du `<main>` entre rail et tiroir |
| Boîte composeur | x 590, y 533, 660 × 155 | x 604, y 558, 660 × 104 | +51 px de haut, −25 px en y |
| Rotation | `oc2.motto` 0 → 1, mot changé | index +1 | **conforme** |
| Réseau pour le mot | 0 requête | — | **conforme** |
| Descente | `opacity: 0`, `transform: matrix(1,0,0,1,0,0)` | lift → 0 | **conforme** |

Rotation observée : `Fais-le bien, une étape à la fois.` → `Mesure d'abord, optimise ensuite.`
(index `0` → `1`), sans aucune requête réseau.

## 6. Écarts assumés

1. **Puces** : la maquette affiche 4 puces dont 3 commandes de démonstration (`/humanizer`,
   `/mcps`, `@ files`) et un titre de session inventé. La consigne interdit les données de
   démonstration : seules les **vraies sessions** du backend alimentent les puces (3 relevées),
   sans titre fabriqué. Les commandes fictives ne sont pas reproduites.
2. **Composeur plus haut (+51 px)** : le sélecteur de dossier fonctionnel du webui est conservé
   sous le champ (la maquette ne le montre pas). Le retirer ferait perdre le choix du projet de
   la première session. Largeur identique (660 px).
3. **Troisième indice** : `enter send` remplace `ctrl+p palette`. Le webui n'a pas de palette
   `ctrl+p` ; afficher un raccourci inexistant serait mensonger. Les deux autres (`/`, `@`)
   sont réels.
4. **Contraste** : le gris secondaire de la maquette (`#6c6c75`, ≈ 4,0:1 sur noir) est remplacé
   par le jeton accessible `--text-3` (`#8c9697`, ≈ 6,0:1) pour tenir le seuil AA 4,5:1.
5. **Puces 34 px** au lieu de 30 px dans la maquette, pour une cible tactile plus sûre.
6. **Débordement horizontal relevé à 1920 px** (`scrollWidth` 2280) : il provient de l'`aside.side`
   préexistant (tiroir de décisions hors écran, x 1920→2280), **pas du composant**. Aucun
   élément de `.ouv` ne déborde à 320 / 768 / 1440 / 1920 px. Correctif hors périmètre Build 11.

## 7. Validations

| Commande | Résultat |
|---|---|
| `bun run --cwd packages/webui typecheck` | **exit 0** (`tsgo --noEmit`, aucune erreur) |
| `bun run --cwd packages/webui test` | **exit 0** — 31 fichiers, **720 tests réussis** (dont les tests de rotation/repli ajoutés) |
| `bun run --cwd packages/webui build` | **exit 0** — 60 modules, CSS 67,26 ko, JS 240,19 ko, 1,68 s |

Contrôles navigateur complémentaires : largeurs 320 / 768 / 1440 px sans débordement local ;
mots visibles (opacité 1) dans les trois cas. Une erreur console `404` transitoire n'a été
observée que lors de la toute première ouverture du navigateur de capture (ressource
favicon/police) ; elle n'est pas reproductible sur les chargements suivants et ne concerne pas
l'écran d'ouverture.

## 8. Points de vigilance

- **Perf** : une seule lecture de `localStorage` par ouverture ; aucune allocation par image ;
  animations limitées à `transform`/`opacity` ; pas de virtualisation nécessaire (3 puces max).
- **Compatibilité** : `text-wrap: balance` se dégrade gracieusement ; `calc()` dans `animation-delay`
  et `clamp()` sont largement supportés ; replis de police déclarés globalement (`styles.css`).
- **État** : `openHome()` est l'unique point de tirage du mot d'ordre ; tout nouveau chemin qui
  ramène à « aucune session active » doit passer par lui pour préserver la rotation.
- **Données** : si le serveur n'est pas joignable, l'état vide des puces est affiché, jamais un
  titre inventé.
