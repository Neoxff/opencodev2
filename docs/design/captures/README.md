# Captures — Opencodev2 v3

Ce dossier rassemble les captures utilisées comme preuve visuelle des specs
[`docs/design/`](../).

## Avertissement sur les anciennes captures

**Le thème clair visible dans les anciennes captures est une palette dérivée simulée, pas un
thème clair implémenté dans l'application.** Il a été produit uniquement pour l'illustration.
Le produit reste en **thème sombre uniquement** (décision fixe). Aucune capture claire ne doit
être présentée comme une fonctionnalité livrée.

## Captures du panneau Dépôt

Voir [`depot/README.md`](depot/README.md) : 12 captures (6 états × 2 thèmes) produites avec
Playwright sur le vrai composant `GitPanel`, API simulée, jeton factice. Les variantes `light`
sont les anciennes captures à palette simulée ; les variantes `dark` correspondent au thème réel.

## Règle de preuve

Une capture n'est une preuve que si elle est datée, accompagnée de la commande ou du geste qui
l'a produite, et si son thème est déclaré. Toute capture « clair » est marquée comme simulée.
