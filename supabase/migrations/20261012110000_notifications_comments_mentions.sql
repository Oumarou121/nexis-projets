-- Nouveaux types de notification : commentaire sur une tâche, mention (@) dans un commentaire.
-- À exécuter UNE SEULE FOIS, après 20261012100000_notification_prefs.sql.
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('task_assigned', 'project_member_added', 'project_access_removed', 'task_commented', 'task_mentioned'));
