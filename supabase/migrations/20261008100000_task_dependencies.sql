-- Dépendances entre tâches (étape 9) : stocke les relations de dépendance
-- (prerequisite_id doit être terminé avant que dependent_id puisse commencer)

create table public.task_dependencies (
  id              uuid primary key default gen_random_uuid(),
  task_id         uuid not null references public.tasks (id) on delete cascade,
  depends_on_id  uuid not null references public.tasks (id) on delete cascade,
  created_at      timestamptz not null default now(),
  unique(task_id, depends_on_id)
);
create index task_dependencies_task_idx on public.task_dependencies (task_id);
create index task_dependencies_depends_on_idx on public.task_dependencies (depends_on_id);

alter table public.task_dependencies enable row level security;
revoke all on public.task_dependencies from public, anon, authenticated;
grant select, insert, delete on public.task_dependencies to service_role;
