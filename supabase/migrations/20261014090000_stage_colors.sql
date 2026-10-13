-- Couleur par étape : indice 0 à 7 dans la palette de l'application (null = couleur de la catégorie).
-- À exécuter après 20261013090000_project_stages.sql. Les étapes existantes gardent leur couleur actuelle (null).
alter table public.project_stages add column color smallint check (color between 0 and 7);
alter table public.organization_stage_templates add column color smallint check (color between 0 and 7);
