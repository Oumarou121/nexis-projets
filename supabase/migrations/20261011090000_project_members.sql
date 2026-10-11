-- Visibilité des projets appliquée côté serveur (Interne / Privé) + membres par projet.
-- À exécuter dans le SQL Editor du projet Supabase dédié au module, UNE SEULE FOIS,
-- après 20261008120000_task_status_history.sql.
--
-- Avant : la visibilité n'était qu'un réglage affiché (projects.settings->>'visibility'),
-- jamais appliqué : tout membre de l'organisation voyait tous les projets.
-- Après : le serveur Node filtre chaque route selon projects.visibility et project_members.
--
-- Interne : visible de tous les utilisateurs de l'organisation ayant projects.read.
-- Privé   : visible uniquement des membres du projet, des détenteurs de projects.delete
--           dans l'organisation et des administrateurs plateforme.
-- Public (comptes portail) : pas encore pris en charge, le serveur le refuse.

-- 1. La visibilité devient une vraie colonne (et non plus une clé libre du jsonb « settings »,
--    que n'importe quel éditeur pouvait écrire).
alter table public.projects
  add column visibility text not null default 'internal'
  check (visibility in ('internal', 'private'));

-- Reprise de l'ancien réglage : « privé » reste privé ; « public » et « interne » deviennent internes.
update public.projects set visibility = 'private' where settings->>'visibility' = 'private';

-- La clé disparaît des paramètres, et du défaut des nouveaux projets.
update public.projects set settings = settings - 'visibility' where settings ? 'visibility';
alter table public.projects alter column settings set default '{
  "dependencies": false,
  "milestones": false,
  "recurring_tasks": false,
  "timesheets": false,
  "documents": false
}'::jsonb;

create index projects_org_private_idx on public.projects (organization_id) where visibility = 'private';

-- 2. Membres d'un projet. user_id = identifiant NEXIS Identity (pas de clé étrangère : autre base).
create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id    uuid not null,
  added_by   uuid,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index project_members_user_idx on public.project_members (user_id);

alter table public.project_members enable row level security;
revoke all on public.project_members from public, anon, authenticated;
grant select, insert, update, delete on public.project_members to service_role;

-- Le créateur de chaque projet existant en devient membre (sinon un projet repassé en
-- « privé » ne serait visible de personne d'autre que des responsables).
insert into public.project_members (project_id, user_id, added_by)
select id, created_by, created_by from public.projects
on conflict do nothing;

-- 3. Journal d'activité : une entrée d'un projet privé ne doit pas fuiter par le journal
--    de l'organisation. « restricted » est fixé à l'écriture, et suit le projet quand sa
--    visibilité change ; il survit à la suppression du projet.
alter table public.activity_log add column restricted boolean not null default false;
update public.activity_log set restricted = true
 where project_id in (select id from public.projects where visibility = 'private');
create index activity_restricted_idx on public.activity_log (organization_id, restricted, created_at desc);
grant update (restricted) on public.activity_log to service_role;

-- 4. Contrôle : les projets qui sont PRIVÉS après cette migration (réglage « privé » posé
--    auparavant dans la fenêtre Paramètres). Vérifiez que c'est bien voulu : seuls leur
--    créateur, les détenteurs de projects.delete et les administrateurs plateforme les voient
--    maintenant ; ajoutez les autres membres depuis Paramètres du projet → Membres.
select id, name, organization_id, created_by from public.projects where visibility = 'private';
