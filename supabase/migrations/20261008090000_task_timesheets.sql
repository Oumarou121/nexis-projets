-- Feuilles de temps (étape 7) : enregistre le temps passé sur les tâches
-- (date, employé, description, durée en minutes)

create table public.task_timesheets (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks (id) on delete cascade,
  user_id     uuid not null,
  date        date not null,
  description text,
  duration    int not null check (duration > 0), -- en minutes
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index task_timesheets_task_idx on public.task_timesheets (task_id, date desc);
create index task_timesheets_user_idx on public.task_timesheets (user_id, date desc);

alter table public.task_timesheets enable row level security;
revoke all on public.task_timesheets from public, anon, authenticated;
grant select, insert, update, delete on public.task_timesheets to service_role;
