-- Résumé quotidien par e-mail. À exécuter UNE SEULE FOIS, après 20261012130000_notifications_due_dates.sql.
--
-- 1) notification_prefs.digest_enabled : recevoir ou non le résumé quotidien (activé par défaut).
-- 2) digest_log : une ligne par personne, organisation et jour une fois le résumé « réservé ». La clé primaire
--    garantit un seul envoi par jour, même après un redémarrage du serveur ou avec deux instances.
alter table public.notification_prefs add column digest_enabled boolean not null default true;

create table public.digest_log (
  user_id         uuid not null,
  organization_id uuid not null,
  day             date not null,
  created_at      timestamptz not null default now(),
  primary key (user_id, organization_id, day)
);

alter table public.digest_log enable row level security;
revoke all on public.digest_log from public, anon, authenticated;
grant select, insert, update, delete on public.digest_log to service_role;
