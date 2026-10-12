-- Notifications dans l'application (la « cloche »). À exécuter UNE SEULE FOIS, après
-- 20261011090000_project_members.sql.
--
-- Une ligne = une notification pour UNE personne. Les canaux e-mail et push (à venir) s'appuient sur
-- la même table : la notification est le journal, l'e-mail ou le push n'en sont que l'alerte.
-- user_id = identifiant NEXIS Identity (pas de clé étrangère : autre base).
create table public.notifications (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  user_id         uuid not null,
  actor_id        uuid,
  type            text not null check (type in ('task_assigned', 'project_member_added', 'project_access_removed')),
  -- Supprimés avec le projet ou la tâche : une notification ne doit pas pointer dans le vide.
  project_id      uuid references public.projects (id) on delete cascade,
  task_id         uuid references public.tasks (id) on delete cascade,
  title           text not null,
  created_at      timestamptz not null default now(),
  read_at         timestamptz
);

create index notifications_user_idx on public.notifications (user_id, organization_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id, organization_id) where read_at is null;

-- Même modèle que les autres tables : accès uniquement par le serveur (clé service_role).
alter table public.notifications enable row level security;
revoke all on public.notifications from public, anon, authenticated;
grant select, insert, update, delete on public.notifications to service_role;
