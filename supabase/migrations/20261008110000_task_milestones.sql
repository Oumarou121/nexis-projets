-- Jalons (étape 9) : ajoute un champ pour marquer une tâche comme jalon

alter table public.tasks add column is_milestone boolean not null default false;
