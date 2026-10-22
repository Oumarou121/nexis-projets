-- Rôle de chaque membre DANS le projet (modèle mixte : rôle d'organisation + rôle par projet).
--
--   manager     : responsable — paramètres, visibilité, membres, invités, étapes, toutes les tâches
--   contributor : crée des tâches, fait avancer les siennes, commente, joint des fichiers, saisit son temps
--   viewer      : observateur — lit et commente
--
-- Le rôle effectif d'une personne est le plus élevé entre celui que lui donne son organisation
-- (administrateur → responsable partout ; utilisateur → contributeur ; lecture seule → observateur)
-- et celui-ci. Être membre reste aussi ce qui ouvre un projet privé.

alter table public.project_members
  add column if not exists role text not null default 'contributor'
  check (role in ('manager', 'contributor', 'viewer'));

-- Reprise : le créateur d'un projet en est responsable.
update public.project_members m
set role = 'manager'
from public.projects p
where p.id = m.project_id and p.created_by = m.user_id;
