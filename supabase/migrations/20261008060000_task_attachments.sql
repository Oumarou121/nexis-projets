-- Pièces jointes des tâches (à exécuter dans le SQL Editor du projet Supabase du module,
-- après les migrations précédentes).
--  * task_attachments : une ligne par fichier (nom d'origine, taille, type, chemin de stockage).
--  * bucket « task-attachments » : PRIVÉ, 10 Mo par fichier. Personne n'y accède directement :
--    seul le serveur Node (service_role) envoie et lit les fichiers, après contrôle des droits.
-- Supprimer une tâche supprime les lignes (cascade) ; le serveur supprime aussi les fichiers.

create table public.task_attachments (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.tasks (id) on delete cascade,
  uploaded_by  uuid not null,
  file_name    text not null check (char_length(file_name) between 1 and 150),
  size_bytes   bigint not null check (size_bytes between 1 and 10485760),
  mime_type    text not null default 'application/octet-stream',
  storage_path text not null unique,
  created_at   timestamptz not null default now()
);
create index task_attachments_task_idx on public.task_attachments (task_id, created_at);

alter table public.task_attachments enable row level security;
revoke all on public.task_attachments from public, anon, authenticated;
grant select, insert, delete on public.task_attachments to service_role;

insert into storage.buckets (id, name, public, file_size_limit)
values ('task-attachments', 'task-attachments', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = 10485760;
