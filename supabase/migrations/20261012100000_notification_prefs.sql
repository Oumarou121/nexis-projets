-- Préférences de notification par utilisateur : pour l'instant, recevoir ou non les notifications
-- aussi par e-mail (la cloche, elle, reste toujours active). À exécuter UNE SEULE FOIS, après
-- 20261012090000_notifications.sql. user_id = identifiant NEXIS Identity (pas de clé étrangère).
-- Pas de ligne = e-mails activés (valeur par défaut).
create table public.notification_prefs (
  user_id       uuid primary key,
  email_enabled boolean not null default true,
  updated_at    timestamptz not null default now()
);

alter table public.notification_prefs enable row level security;
revoke all on public.notification_prefs from public, anon, authenticated;
grant select, insert, update, delete on public.notification_prefs to service_role;
