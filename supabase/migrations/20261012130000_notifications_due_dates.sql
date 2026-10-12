-- Rappels d'échéance : nouveaux types de notification. À exécuter UNE SEULE FOIS, après
-- 20261012120000_project_guests.sql.
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('task_assigned', 'project_member_added', 'project_access_removed', 'task_commented', 'task_mentioned', 'task_due_soon', 'task_overdue'));
