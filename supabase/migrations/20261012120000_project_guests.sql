-- Mode « public » : invités externes (sans compte NEXIS), en lecture seule, par invitation e-mail.
-- À exécuter UNE SEULE FOIS, après 20261012110000_notifications_comments_mentions.sql.
--
-- Sécurité :
--  * le jeton d'invitation n'est JAMAIS stocké : seul son empreinte SHA-256 l'est (une fuite de la base
--    ne donne donc aucun lien utilisable) ;
--  * un invité n'accède qu'à /api/portal, jamais à l'API de l'organisation ;
--  * l'accès exige que le projet soit encore « public » à chaque requête.

-- 1. Le niveau « public » devient valide pour un projet.
alter table public.projects drop constraint if exists projects_visibility_check;
alter table public.projects add constraint projects_visibility_check
  check (visibility in ('internal', 'private', 'public'));

-- 2. Invités.
create table public.project_guests (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects (id) on delete cascade,
  email          text not null check (email = lower(email) and char_length(email) <= 254),
  token_hash     text not null unique,            -- SHA-256 (hex) du jeton envoyé par e-mail
  invited_by     uuid,                            -- identifiant NEXIS Identity de l'invitant
  created_at     timestamptz not null default now(),
  expires_at     timestamptz,                     -- null = n'expire pas
  revoked_at     timestamptz,
  last_access_at timestamptz,
  unique (project_id, email)
);
create index project_guests_project_idx on public.project_guests (project_id);

alter table public.project_guests enable row level security;
revoke all on public.project_guests from public, anon, authenticated;
grant select, insert, update, delete on public.project_guests to service_role;
