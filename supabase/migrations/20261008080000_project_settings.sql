-- Paramètres de projet (étape 6) : stocke les options activables/désactivables pour chaque projet
-- (dépendances, jalons, tâches récurrentes, feuilles de temps, documents, etc.)

alter table public.projects add column settings jsonb default '{
  "dependencies": false,
  "milestones": false,
  "recurring_tasks": false,
  "timesheets": false,
  "documents": false,
  "visibility": "internal"
}'::jsonb;
