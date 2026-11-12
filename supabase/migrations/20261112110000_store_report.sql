-- Monthly store report (back office v0.6): the rewards a store handed out in a
-- period, per reward and per cashier, with the points spent and their value.
--
-- 1. redemptions.value_cents: the reward's shelf price when the code was used
--    (set by redemptions/use). The store carries that cost (program spec §2),
--    and the report must not change when HQ edits a price later. Codes used
--    before this migration get the price of today.
-- 2. Store staff (managers, till devices) also read their brand's switched-off
--    rewards, so a code made before HQ switched a reward off still shows its
--    name at the till and in reports. The catalog is not secret; members and
--    visitors still see active rewards only.
-- 3. public.store_report(p_store_id, p_from, p_to): one row per reward and
--    cashier for codes used at the store in [p_from, p_to). SECURITY INVOKER
--    (row-level security applies) and only for the store's manager, HQ of the
--    brand and platform admins: anyone else, till devices included, gets no rows.

alter table public.redemptions
  add column value_cents integer check (value_cents is null or value_cents >= 0);

update public.redemptions r
set value_cents = w.shelf_price_cents
from public.rewards w
where w.id = r.reward_id and r.status = 'used' and r.value_cents is null;

drop policy rewards_read on public.rewards;
create policy rewards_read on public.rewards for select to anon, authenticated
  using (active or private.has_brand_role(brand_id, array['hq_admin', 'store_manager', 'store_device']::public.staff_role[]));

create function public.store_report(p_store_id uuid, p_from timestamptz, p_to timestamptz)
returns table (
  reward_id uuid,
  reward_name_el text,
  reward_name_en text,
  employee_id uuid,
  employee_name text,
  used bigint,
  gifts bigint,
  points bigint,
  value_cents bigint
)
language sql stable security invoker set search_path = '' as $fn$
  select r.reward_id, w.name_el, w.name_en, r.used_employee_id, e.display_name,
    count(*)::bigint,
    count(*) filter (where r.gift_id is not null)::bigint,
    coalesce(sum(r.points_spent), 0)::bigint,
    coalesce(sum(coalesce(r.value_cents, w.shelf_price_cents)), 0)::bigint
  from public.redemptions r
  join public.rewards w on w.id = r.reward_id
  left join public.employees e on e.id = r.used_employee_id
  where r.used_store_id = p_store_id
    and r.status = 'used'
    and r.used_at >= p_from and r.used_at < p_to
    and private.has_store_role(p_store_id, array['store_manager']::public.staff_role[])
  group by r.reward_id, w.name_el, w.name_en, w.sort_order, r.used_employee_id, e.display_name
  order by w.sort_order, w.name_el, e.display_name nulls last;
$fn$;

revoke all on function public.store_report(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.store_report(uuid, timestamptz, timestamptz) to authenticated, service_role;
