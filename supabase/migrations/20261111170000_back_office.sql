-- Back office v0.5 (docs/api-contract.md): HQ and store managers manage cashiers,
-- till devices and store managers, look up members, correct points and see the
-- dashboard. Writes go through the API (packages/server); the back office reads
-- with row-level security, as the apps do.

-- ---------------------------------------------------------------------------
-- 1. The email of a staff account, kept on its role so HQ can tell devices and
--    managers apart in the back office (auth.users is not readable by clients).
--    Set by the server when HQ adds the account (staff/add); a label only:
--    sign-in still goes through Supabase Auth.
-- ---------------------------------------------------------------------------
alter table public.staff_roles
  add column email text check (email is null or (length(email) between 3 and 320 and email = lower(email) and position('@' in email) > 1));

-- Roles added before this column: copy the email from Supabase Auth once (the
-- test stub's auth.users has no email column, so only where it exists).
do $do$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'auth' and table_name = 'users' and column_name = 'email'
  ) then
    execute $q$
      update public.staff_roles r set email = lower(u.email)
      from auth.users u
      where u.id = r.user_id and r.email is null and u.email is not null
    $q$;
  end if;
end
$do$;

-- ---------------------------------------------------------------------------
-- 2. Dashboard numbers per store since a moment (the back office passes the
--    start of the week or day in the brand's time zone). SECURITY INVOKER: the
--    caller's row-level security decides what is counted, so HQ gets its
--    brand, a store manager or device its store. Members and anonymous callers
--    get nothing (staff only).
--      net_points  earn entries minus their undos (reverse), at the store
--      purchases   earn entries not undone
--      rewards_used redemption codes used at the store
--      members_joined members who joined through the store's QR (HQ only:
--                  only HQ reads members); store_id null = joined without a store
-- ---------------------------------------------------------------------------
create function public.dashboard_stats(p_since timestamptz)
returns table (store_id uuid, net_points bigint, purchases bigint, rewards_used bigint, members_joined bigint)
language sql stable security invoker set search_path = '' as $fn$
  with staff as (
    select 1 from public.staff_roles where user_id = (select auth.uid()) limit 1
  ),
  ledger as (
    select l.store_id,
      sum(l.points) as net_points,
      count(*) filter (where l.kind = 'earn') - count(*) filter (where l.kind = 'reverse') as purchases
    from public.ledger_entries l
    where l.created_at >= p_since and l.store_id is not null and l.kind in ('earn', 'reverse')
      and exists (select 1 from staff)
    group by l.store_id
  ),
  used as (
    select r.used_store_id as store_id, count(*) as rewards_used
    from public.redemptions r
    where r.status = 'used' and r.used_at >= p_since and exists (select 1 from staff)
    group by r.used_store_id
  ),
  joined as (
    select m.joined_store_id as store_id, count(*) as members_joined
    from public.members m
    where m.created_at >= p_since and exists (select 1 from staff)
    group by m.joined_store_id
  ),
  stores as (
    select store_id from ledger union select store_id from used union select store_id from joined
  )
  select s.store_id,
    coalesce(l.net_points, 0)::bigint,
    coalesce(l.purchases, 0)::bigint,
    coalesce(u.rewards_used, 0)::bigint,
    coalesce(j.members_joined, 0)::bigint
  from stores s
  left join ledger l on l.store_id is not distinct from s.store_id
  left join used u on u.store_id is not distinct from s.store_id
  left join joined j on j.store_id is not distinct from s.store_id
  order by s.store_id nulls last;
$fn$;

revoke all on function public.dashboard_stats(timestamptz) from public, anon;
grant execute on function public.dashboard_stats(timestamptz) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Member search in the back office (HQ reads members of its brand already):
--    by member code, email, phone and name.
-- ---------------------------------------------------------------------------
create index members_brand_name on public.members (brand_id, lower(first_name), lower(coalesce(last_name, '')))
  where deleted_at is null;
