-- Commentaires sur les tâches (à exécuter dans le SQL Editor du projet Supabase du module,
-- après les deux migrations précédentes). Même modèle d'accès : seul le serveur Node
-- (service_role) lit et écrit. author_id = identifiant NEXIS Identity (sans clé étrangère).
-- Supprimer une tâche (ou son projet) supprime ses commentaires.

create table public.task_comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks (id) on delete cascade,
  author_id  uuid not null,
  body       text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index task_comments_task_idx on public.task_comments (task_id, created_at);

alter table public.task_comments enable row level security;
revoke all on public.task_comments from public, anon, authenticated;
grant select, insert, delete on public.task_comments to service_role;
