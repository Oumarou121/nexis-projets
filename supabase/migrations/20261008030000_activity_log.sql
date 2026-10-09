-- Journal d'activité du module « Gestion de projet » (à exécuter dans le SQL Editor
-- du projet Supabase dédié). Même modèle d'accès que les autres tables : seul le
-- serveur Node (service_role) lit et écrit.
-- Pas de clé étrangère vers projects/tasks : une entrée doit survivre à la suppression
-- de l'objet qu'elle décrit. actor_id = identifiant NEXIS Identity.

create table public.activity_log (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  actor_id        uuid not null,
  action          text not null check (action in ('create','update','delete')),
  entity_type     text not null check (entity_type in ('project','task')),
  entity_id       uuid not null,
  project_id      uuid,
  label           text not null,
  details         jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index activity_org_idx on public.activity_log (organization_id, created_at desc);

alter table public.activity_log enable row level security;
revoke all on public.activity_log from public, anon, authenticated;
grant select, insert on public.activity_log to service_role;
