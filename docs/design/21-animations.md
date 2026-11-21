# Animations fluides — spécification

Moteur : un seul système de mouvement, jetons de durée et courbes définis ici et dans les variables CSS. Aucune bibliothèque d'animation supplémentaire.

## Tokens

### Durées

| Token | Valeur | Usage |
|---|---|---|
| `instantane` | 90 ms | retour immédiat (hover, focus) |
| `rapide` | 160 ms | boutons, menus |
| `normal` | 240 ms | ouverture de panneau, nouvel élément |
| `lent` | 380 ms | transition de vue, fondu d'entrée |

### Courbes

- **Sortie douce** : `cubic-bezier(0.22, 1, 0.36, 1)` — élément qui arrive.
- **Entrée-sortie** : `cubic-bezier(0.4, 0, 0.2, 1)` — déplacement discret.
- **Ressort** : raideur et amortissement (à régler avec `prefers-reduced-motion` : ressort désactivé).

### Échelonnage

- 30–40 ms par élément, **8 éléments maximum** animés à la fois.
- Au-delà : les éléments suivants apparaissent sans délai supplémentaire.

## Interactions

| Interaction | Propriétés | Durée | Courbe | Déclencheur | Réduit |
|---|---|---|---|---|---|
| Ouverture du panneau latéral | transform, opacity | normal | ressort | clic / raccourci | fondu instantané, pas de ressort |
| Nouveau message | transform, opacity | normal | sortie douce | ajout au fil | apparition immédiate |
| Streaming | opacity (indicateur uniquement) | instantane | entrée-sortie | réception de texte | aucun mouvement |
| Saisie qui grandit | transform | normal | sortie douce | contenu texto | hauteur fixe, pas d'animation |
| Boutons | transform (échelle 0,97 à l'appui) | instantane | sortie douce | pointerdown | sans échelle |
| Menus | transform, opacity | rapide | sortie douce | ouverture | fondu instantané |
| Changement de session | opacity | lent | sortie douce | navigation | fondu instantané |
| Panneau Dépôt | transform, opacity | normal | ressort | ouverture / mise à jour | fondu instantané |
| Écran d'accueil | opacity (lettres) | ≤ 1,2 s | sortie douce | chargement | désactivé |

## Règles

- N'animer que `transform` et `opacity` — jamais `width`, `height`, `top`, `left`, `box-shadow`.
- `will-change` posé juste avant l'animation et retiré après.
- `contain: layout paint` sur les listes longues ; listes virtualisées.
- Ne jamais animer ce qui est en train d'être lu (texte des messages).
- Aucune animation > 400 ms sur une action utilisateur.
- L'écriture continue sans saccades : aucun redémarrage d'animation pendant le streaming.
- Defilement fluide vers le dernier message, sans à-coups.
- 60 i/s visées ; 120 i/s si l'écran le permet.
- `prefers-reduced-motion` : toutes les durées passent à `instantane`, ressort désactivé.

## Contrôle

- Compteur FPS discret activable (« Afficher les performances »), sans coût quand désactivé.
- Mesure du temps de longues tâches (> 50 ms) avec `scripts/bench/run.ts`.
