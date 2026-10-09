-- Étiquettes et sous-tâches (à exécuter dans le SQL Editor du projet Supabase du module,
-- après les migrations précédentes).
--  * labels    : étiquettes libres (texte), 10 au maximum par tâche.
--  * parent_id : sous-tâche d'une autre tâche. Un seul niveau (vérifié par le serveur).
--                Supprimer la tâche parente supprime ses sous-tâches.

alter table public.tasks
  add column labels text[] not null default '{}'::text[]
    check (cardinality(labels) <= 10),
  add column parent_id uuid references public.tasks (id) on delete cascade;

create index tasks_parent_idx on public.tasks (parent_id) where parent_id is not null;
