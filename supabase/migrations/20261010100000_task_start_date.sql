-- Planning : date de début d'une tâche (redimensionnement des barres du Gantt).
-- Sans date de début, la barre commence à la création de la tâche.
alter table public.tasks add column start_date date;
alter table public.tasks add constraint tasks_dates_check check (start_date is null or due_date is null or start_date <= due_date);
