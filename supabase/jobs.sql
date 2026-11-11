-- Scheduled jobs: pg_cron → pg_net → Edge Function api/jobs/*.
-- Idempotent; applied by scripts/configure-project.ts (`npm run project:apply`, CI on main),
-- with {projectRef} filled in. Not a migration: it needs pg_cron, pg_net and Vault, which
-- only the hosted project has.
--
-- The jobs token is generated here, kept in Vault, read by the Edge Function from
-- vault.decrypted_secrets and sent by pg_cron: no key leaves the database.

create extension if not exists pg_cron;
-- pg_net belongs in `extensions` (Supabase security advisor). The first setup put it in
-- `public`: move it once (it keeps no data we need; its functions live in schema `net`).
do $do$
begin
  if exists (
    select 1 from pg_extension e join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pg_net' and n.nspname = 'public'
  ) then
    drop extension pg_net;
  end if;
end
$do$;
create extension if not exists pg_net with schema extensions;

do $do$
begin
  if not exists (select 1 from vault.secrets where name = 'jobs_token') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
      'jobs_token',
      'Bearer token pg_cron sends to the api jobs/* routes');
  end if;
end
$do$;

create or replace function private.call_api_job(route text) returns bigint
language sql
set search_path = ''
as $fn$
  select net.http_post(
    url := 'https://{projectRef}.supabase.co/functions/v1/api/jobs/' || route,
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'jobs_token')),
    timeout_milliseconds := 20000);
$fn$;
revoke all on function private.call_api_job(text) from public, anon, authenticated;

-- Job names are brand-neutral (every brand's project runs the same file). The first setup
-- named them overoll-*: remove those once, the club-* ones below replace them.
select cron.unschedule(jobname) from cron.job
where jobname in ('overoll-expire-redemptions', 'overoll-expire-points');

-- Reward codes not used within 15 minutes expire: the points (or the welcome gift) go back.
select cron.schedule('club-expire-redemptions', '* * * * *', $cmd$select private.call_api_job('expire-redemptions')$cmd$);

-- Points expiry, daily at 01:15 UTC (03:15 Athens time in winter, 04:15 in summer).
select cron.schedule('club-expire-points', '15 1 * * *', $cmd$select private.call_api_job('expire-points')$cmd$);
