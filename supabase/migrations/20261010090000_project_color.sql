-- Couleur d'un projet (refonte de la page Projets) : numéro de teinte 0 à 4, choisi à la création
-- ou dans les paramètres du projet. NULL = couleur déduite du nom (projets existants).
-- À exécuter AVANT de déployer le serveur correspondant (il lit cette colonne).

alter table public.projects
  add column color smallint check (color is null or color between 0 and 4);
