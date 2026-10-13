-- Étapes (statuts) personnalisables PAR PROJET, avec un modèle par défaut PAR ORGANISATION.
--
-- Chaque étape appartient à une catégorie fixe (todo / in_progress / done). Les rapports, le
-- tableau de bord, le Gantt, les retards et l'avancement se basent sur cette catégorie : on peut
-- donc créer, renommer et réordonner les étapes sans fausser les chiffres.
--
-- tasks.status devient la CATÉGORIE de l'étape de la tâche (« en revue » = en cours) ; elle est
-- tenue à jour par le serveur. tasks.stage_id est l'étape elle-même.
-- Même modèle d'accès que les autres tables : seul le serveur Node (service_role) lit et écrit.
-- Migration à exécuter UNE SEULE FOIS (elle convertit les données existantes).

create table public.project_stages (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 30),
  category   text not null check (category in ('todo','in_progress','done')),
  position   integer not null default 0,
  created_at timestamptz not null default now()
);
create index project_stages_project_idx on public.project_stages (project_id, position);
create unique index project_stages_name_uq on public.project_stages (project_id, lower(name));

-- Modèle d'étapes appliqué aux NOUVEAUX projets d'une organisation (absent = modèle intégré :
-- À faire / En cours / En revue / Terminée). organization_id = identifiant NEXIS Identity.
create table public.organization_stage_templates (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  name            text not null check (char_length(name) between 1 and 30),
  category        text not null check (category in ('todo','in_progress','done')),
  position        integer not null default 0,
  created_at      timestamptz not null default now()
);
create index organization_stage_templates_org_idx on public.organization_stage_templates (organization_id, position);
create unique index organization_stage_templates_name_uq on public.organization_stage_templates (organization_id, lower(name));

alter table public.project_stages               enable row level security;
alter table public.organization_stage_templates enable row level security;
revoke all on public.project_stages, public.organization_stage_templates from public, anon, authenticated;
grant select, insert, update, delete on public.project_stages, public.organization_stage_templates to service_role;

-- 1. Les 4 étapes historiques pour chaque projet existant.
insert into public.project_stages (project_id, name, category, position)
select p.id, s.name, s.category, s.position
from public.projects p
cross join (values ('À faire', 'todo', 0), ('En cours', 'in_progress', 1), ('En revue', 'in_progress', 2), ('Terminée', 'done', 3)) as s (name, category, position);

-- 2. Chaque tâche rejoint l'étape qui correspond à son ancien statut.
alter table public.tasks add column stage_id uuid references public.project_stages (id);
update public.tasks t
set stage_id = s.id
from public.project_stages s
where s.project_id = t.project_id
  and s.position = case t.status when 'todo' then 0 when 'in_progress' then 1 when 'review' then 2 else 3 end;
alter table public.tasks alter column stage_id set not null;
create index tasks_stage_idx on public.tasks (stage_id);

-- 3. Idem pour l'historique des changements de statut (la durée par étape suit les étapes).
alter table public.task_status_history add column stage_id uuid references public.project_stages (id) on delete set null;
update public.task_status_history h
set stage_id = s.id
from public.tasks t, public.project_stages s
where t.id = h.task_id
  and s.project_id = t.project_id
  and s.position = case h.status when 'todo' then 0 when 'in_progress' then 1 when 'review' then 2 else 3 end;

-- 4. Les statuts « stockés » deviennent des catégories : « en revue » rejoint « en cours ».
alter table public.tasks drop constraint if exists tasks_status_check;
update public.tasks set status = 'in_progress' where status = 'review';
alter table public.tasks add constraint tasks_status_check check (status in ('todo','in_progress','done'));

alter table public.task_status_history drop constraint if exists task_status_history_status_check;
update public.task_status_history set status = 'in_progress' where status = 'review';
alter table public.task_status_history add constraint task_status_history_status_check check (status in ('todo','in_progress','done'));
