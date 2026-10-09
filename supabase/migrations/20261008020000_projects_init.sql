-- Projet Supabase DÉDIÉ au module « Gestion de projet » (à exécuter dans son SQL Editor).
--
-- Modèle d'accès : seul le serveur Node (service_role) lit et écrit. Il vérifie le JWT
-- de NEXIS Identity et les permissions avant chaque requête. Le navigateur n'accède
-- jamais à ces tables : RLS activée SANS policy + droits retirés à anon/authenticated.
--
-- organization_id / created_by / assignee_id = identifiants de NEXIS Identity
-- (autre projet Supabase : volontairement sans clé étrangère).

create table public.projects (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  name            text not null,
  description     text,
  status          text not null default 'planned' check (status in ('planned','active','on_hold','done')),
  priority        text not null default 'medium'  check (priority in ('low','medium','high','urgent')),
  due_date        date,
  created_by      uuid not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index projects_org_idx on public.projects (organization_id, created_at desc);

create table public.tasks (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  title       text not null,
  description text,
  status      text not null default 'todo' check (status in ('todo','in_progress','review','done')),
  priority    text not null default 'medium' check (priority in ('low','medium','high','urgent')),
  assignee_id uuid,
  due_date    date,
  created_by  uuid not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index tasks_project_idx  on public.tasks (project_id);
create index tasks_assignee_idx on public.tasks (assignee_id) where assignee_id is not null;

alter table public.projects enable row level security;
alter table public.tasks    enable row level security;
revoke all on public.projects, public.tasks from public, anon, authenticated;
grant select, insert, update, delete on public.projects, public.tasks to service_role;
