-- Demandes de réassignation : la personne à qui une tâche est assignée demande qu'on la confie à quelqu'un
-- d'autre (surcharge, absence, compétence). Un responsable du projet accepte (en choisissant le nouvel assigné,
-- la personne suggérée par défaut) ou refuse avec un mot d'explication. Une seule demande en attente par tâche.
-- À exécuter UNE SEULE FOIS, après 20261022090000_project_member_roles.sql.

create table public.task_reassign_requests (
  id                uuid primary key default gen_random_uuid(),
  task_id           uuid not null references public.tasks (id) on delete cascade,
  project_id        uuid not null references public.projects (id) on delete cascade,
  requested_by      uuid not null,
  suggested_user_id uuid,
  reason            text not null check (char_length(reason) between 3 and 500),
  status            text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  decided_by        uuid,
  decided_at        timestamptz,
  decision_note     text check (decision_note is null or char_length(decision_note) <= 500),
  new_assignee_id   uuid,
  created_at        timestamptz not null default now()
);
create unique index task_reassign_requests_one_pending on public.task_reassign_requests (task_id) where status = 'pending';
create index task_reassign_requests_project_idx on public.task_reassign_requests (project_id, status);

alter table public.task_reassign_requests enable row level security;
revoke all on public.task_reassign_requests from public, anon, authenticated;
grant select, insert, update, delete on public.task_reassign_requests to service_role;

-- Nouveaux types de notification : demande reçue (responsables), réponse (demandeur).
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('task_assigned', 'project_member_added', 'project_access_removed', 'task_commented', 'task_mentioned', 'task_due_soon', 'task_overdue', 'task_reassign_requested', 'task_reassign_answered'));
