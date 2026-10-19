-- Tâches planifiées du module pour l'hébergement Vercel (plan Hobby : un cron Vercel ne tourne qu'une fois par
-- jour). Supabase pg_cron appelle toutes les heures l'API du module, qui fait la passe :
--   * à hh:05 : rappels d'échéance  → POST <APP_URL>/api/cron/reminders
--   * à hh:10 : résumé quotidien    → POST <APP_URL>/api/cron/digest (envoyé seulement à DIGEST_HOUR, une fois par jour)
-- Chaque appel porte l'en-tête « Authorization: Bearer <CRON_SECRET> » (même valeur que la variable CRON_SECRET
-- du serveur). À exécuter dans le projet Supabase DU MODULE (pas celui d'Identity).
--
-- PRÉREQUIS — créer d'abord les deux secrets dans Supabase Vault (SQL Editor) :
--   select vault.create_secret('https://projets.votre-domaine.com', 'projets_app_url');   -- URL publique, sans slash final
--   select vault.create_secret('<la valeur de CRON_SECRET>', 'projets_cron_secret');       -- 32 caractères au moins
-- Pour changer une valeur plus tard :
--   select vault.update_secret((select id from vault.secrets where name = 'projets_cron_secret'), '<nouvelle valeur>');
--
-- Vérifier : select jobname, schedule, active from cron.job where jobname like 'nexis-projets-%';
-- Derniers appels et leur réponse HTTP :
--   select created, status_code, left(content::text, 200) from net._http_response order by created desc limit 10;
-- Arrêter : select cron.unschedule('nexis-projets-reminders'); select cron.unschedule('nexis-projets-digest');
--
-- Rejouable : les tâches existantes sont remplacées.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Appelle une route /api/cron/<job> du module. Lit l'URL et le secret dans Vault à chaque appel (jamais stockés
-- dans la définition des tâches cron, lisible par tout administrateur de la base).
create or replace function public.projets_call_cron(job text)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  app_url text;
  secret text;
begin
  if job not in ('reminders', 'digest') then
    raise exception 'tâche inconnue : %', job;
  end if;
  select decrypted_secret into app_url from vault.decrypted_secrets where name = 'projets_app_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'projets_cron_secret';
  if app_url is null or secret is null then
    raise warning '[nexis-projets cron] secrets Vault projets_app_url / projets_cron_secret manquants';
    return null;
  end if;
  return net.http_post(
    url := rtrim(app_url, '/') || '/api/cron/' || job,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Authorization', 'Bearer ' || secret, 'Content-Type', 'application/json'),
    timeout_milliseconds := 60000
  );
end;
$$;

-- Réservée à pg_cron (exécuté en tant que propriétaire de la base) : jamais appelable par l'API Supabase.
revoke all on function public.projets_call_cron(text) from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname in ('nexis-projets-reminders', 'nexis-projets-digest');
select cron.schedule('nexis-projets-reminders', '5 * * * *', $$select public.projets_call_cron('reminders')$$);
select cron.schedule('nexis-projets-digest', '10 * * * *', $$select public.projets_call_cron('digest')$$);
