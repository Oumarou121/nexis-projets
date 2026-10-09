-- Activités de tâche (étape 3) : permet de planifier des activités sur une tâche
-- (appels, emails, réunions, tâches de suivi, etc.)

create table public.task_activities (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks (id) on delete cascade,
  type        text not null default 'todo' check (type in ('todo','call','email','meeting','note')),
  summary     text not null,
  due_date    date,
  assignee_id uuid,
  done        boolean not null default false,
  created_by  uuid not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index task_activities_task_idx on public.task_activities (task_id, created_at desc);
create index task_activities_assignee_idx on public.task_activities (assignee_id) where assignee_id is not null;

alter table public.task_activities enable row level security;
revoke all on public.task_activities from public, anon, authenticated;
grant select, insert, update, delete on public.task_activities to service_role;
