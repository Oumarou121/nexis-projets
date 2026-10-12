-- Notifications push (Firebase Cloud Messaging). À exécuter UNE SEULE FOIS, après 20261012140000_daily_digest.sql.
--
-- Une ligne = un appareil (navigateur) qui a accepté les notifications push. Le jeton FCM est unique : si un autre
-- compte se connecte sur le même navigateur, la ligne change de propriétaire au lieu de se dupliquer.
-- user_id = identifiant NEXIS Identity (pas de clé étrangère : autre base). Les jetons périmés sont supprimés
-- par le serveur dès que FCM répond « jeton inconnu ».
create table public.push_tokens (
  token      text primary key,
  user_id    uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index push_tokens_user_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;
revoke all on public.push_tokens from public, anon, authenticated;
grant select, insert, update, delete on public.push_tokens to service_role;
