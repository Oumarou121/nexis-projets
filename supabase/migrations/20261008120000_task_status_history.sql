-- Historique des changements de statut d'une tâche (durée passée dans chaque étape,
-- affichée dans la barre de statut de la fiche tâche). Même modèle d'accès que les
-- autres tables : seul le serveur Node (service_role) lit et écrit.
-- Une ligne = « la tâche est entrée dans ce statut à cette date ».
-- changed_by = identifiant NEXIS Identity (sans clé étrangère, comme created_by).

create table public.task_status_history (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks (id) on delete cascade,
  status     text not null check (status in ('todo','in_progress','review','done')),
  entered_at timestamptz not null default now(),
  changed_by uuid
);
create index task_status_history_task_idx on public.task_status_history (task_id, entered_at);

alter table public.task_status_history enable row level security;
revoke all on public.task_status_history from public, anon, authenticated;
grant select, insert on public.task_status_history to service_role;

-- Reprise de l'existant, à partir du journal d'activité (le champ « status » d'une
-- modification contient le nouveau statut). Une tâche dont aucun changement n'a été
-- journalisé reste dans son statut actuel depuis sa création. Une exécution unique :
-- ne pas rejouer ce bloc (il dupliquerait les lignes).
insert into public.task_status_history (task_id, status, entered_at, changed_by)
select t.id,
       case when exists (
              select 1 from public.activity_log a
              where a.entity_type = 'task' and a.entity_id = t.id
                and a.action = 'update'
                and a.details->>'status' in ('todo','in_progress','review','done')
            ) then 'todo' else t.status end,
       t.created_at,
       t.created_by
from public.tasks t;

insert into public.task_status_history (task_id, status, entered_at, changed_by)
select a.entity_id, a.details->>'status', a.created_at, a.actor_id
from public.activity_log a
join public.tasks t on t.id = a.entity_id
where a.entity_type = 'task' and a.action = 'update'
  and a.details->>'status' in ('todo','in_progress','review','done');
