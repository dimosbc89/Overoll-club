-- Overoll Club — initial schema
-- Multi-brand from day one: every row carries brand_id; Overoll is the first brand.
-- Rules:
--   * Points live in an append-only ledger; balances are always derived from it.
--   * Clients (apps, web, back office) only READ through row-level security.
--     Every write that moves points goes through server functions using the
--     service role, which run the shared rules in packages/core.
--   * Money is integer cents, points are integers.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.tier_id as enum ('classic', 'gold', 'club');
create type public.staff_role as enum ('platform_admin', 'hq_admin', 'store_manager', 'store_device');
create type public.ledger_kind as enum (
  'earn',           -- purchase scanned at the till (+)
  'bonus',          -- welcome, referral, streak, campaign (+)
  'redeem',         -- reward redeemed (-)
  'refund_redeem',  -- redemption cancelled or expired unused (+)
  'reverse',        -- staff undo / refund of an earn or bonus (-)
  'adjust',         -- manual correction by HQ, reason required (+/-)
  'expire'          -- points expired after 12 months without a purchase (-)
);
create type public.redemption_status as enum ('pending', 'used', 'cancelled', 'expired');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create function public.forbid_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = 'P0001';
end $$;

-- 8 characters, no look-alikes (0/O, 1/I): what staff may read out loud.
create function public.new_member_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea := extensions.gen_random_bytes(8);
  result text := '';
begin
  for i in 0..7 loop
    result := result || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return result;
end $$;

-- ---------------------------------------------------------------------------
-- Brands and stores
-- ---------------------------------------------------------------------------
create table public.brands (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  -- Overrides of packages/core defaultConfig (earn rate, tiers, limits...).
  config jsonb not null default '{}'::jsonb,
  default_locale text not null default 'el' check (default_locale in ('el', 'en')),
  time_zone text not null default 'Europe/Athens',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  -- Short code used in the counter QR join link, e.g. "praxitelous".
  code text not null check (code ~ '^[a-z0-9-]+$'),
  name text not null,
  address text,
  city text,
  country char(2) not null default 'GR' check (country in ('GR', 'CY')),
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  phone text,
  opening_hours jsonb not null default '{}'::jsonb,
  time_zone text not null default 'Europe/Athens',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, code),
  unique (id, brand_id)
);

-- ---------------------------------------------------------------------------
-- Back-office access
-- ---------------------------------------------------------------------------
create table public.staff_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  brand_id uuid references public.brands (id) on delete cascade,
  store_id uuid,
  role public.staff_role not null,
  created_at timestamptz not null default now(),
  foreign key (store_id, brand_id) references public.stores (id, brand_id) on delete cascade,
  constraint staff_role_scope check (
    (role = 'platform_admin' and brand_id is null and store_id is null)
    or (role = 'hq_admin' and brand_id is not null and store_id is null)
    or (role in ('store_manager', 'store_device') and brand_id is not null and store_id is not null)
  ),
  unique nulls not distinct (user_id, brand_id, store_id, role)
);

-- Cashiers: identified by a personal PIN on the store device.
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  store_id uuid not null,
  display_name text not null,
  pin_hash text not null, -- extensions.crypt(pin, gen_salt('bf'))
  active boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (store_id, brand_id) references public.stores (id, brand_id) on delete cascade,
  unique (id, brand_id)
);

-- Security-definer role checks used by the policies below (they bypass RLS
-- on staff_roles, which avoids policy recursion).
create function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.staff_roles
    where user_id = auth.uid() and role = 'platform_admin'
  );
$$;

create function public.has_brand_role(p_brand_id uuid, p_roles public.staff_role[])
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.staff_roles
    where user_id = auth.uid()
      and (role = 'platform_admin' or (brand_id = p_brand_id and role = any (p_roles)))
  );
$$;

-- Store-level access; HQ admins of the store's brand always pass.
create function public.has_store_role(p_store_id uuid, p_roles public.staff_role[])
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.staff_roles r
    join public.stores s on s.id = p_store_id
    where r.user_id = auth.uid()
      and (
        r.role = 'platform_admin'
        or (r.role = 'hq_admin' and r.brand_id = s.brand_id)
        or (r.store_id = p_store_id and r.role = any (p_roles))
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Members
-- ---------------------------------------------------------------------------
create table public.members (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  member_code text not null unique default public.new_member_code()
    check (member_code ~ '^[A-Z0-9]{6,16}$'),
  first_name text not null,
  last_name text,
  email text,
  phone text,
  birthday date,
  locale text not null default 'el' check (locale in ('el', 'en')),
  home_store_id uuid,
  joined_store_id uuid,
  referral_code text unique default public.new_member_code(),
  referred_by uuid,
  tier public.tier_id not null default 'classic',
  tier_review_on date,
  consent_email boolean not null default false,
  consent_sms boolean not null default false,
  consent_push boolean not null default false,
  consents_updated_at timestamptz,
  last_purchase_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz, -- GDPR deletion: personal fields are wiped, ledger stays
  unique (brand_id, user_id),
  unique (id, brand_id),
  foreign key (home_store_id, brand_id) references public.stores (id, brand_id),
  foreign key (joined_store_id, brand_id) references public.stores (id, brand_id),
  foreign key (referred_by, brand_id) references public.members (id, brand_id)
);

create unique index members_brand_email_key on public.members (brand_id, lower(email))
  where email is not null and deleted_at is null;
create unique index members_brand_phone_key on public.members (brand_id, phone)
  where phone is not null and deleted_at is null;

-- Kept apart from members so the QR secret is only ever visible to its owner.
create table public.member_secrets (
  member_id uuid primary key references public.members (id) on delete cascade,
  qr_secret text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  pass_version integer not null default 1 check (pass_version > 0),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Rewards and redemptions
-- ---------------------------------------------------------------------------
create table public.rewards (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  name_el text not null,
  name_en text not null,
  description_el text,
  description_en text,
  image_url text,
  category text not null default 'coffee',
  shelf_price_cents integer not null check (shelf_price_cents > 0),
  base_cost integer not null check (base_cost > 0), -- packages/core rewardBaseCost()
  min_tier public.tier_id,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, brand_id)
);

create table public.redemptions (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  member_id uuid not null,
  reward_id uuid not null,
  code text not null check (code ~ '^[A-Z0-9]{6,16}$'),
  points_spent integer not null check (points_spent > 0),
  status public.redemption_status not null default 'pending',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_store_id uuid,
  used_employee_id uuid,
  cancelled_at timestamptz,
  unique (brand_id, code),
  unique (id, brand_id),
  foreign key (member_id, brand_id) references public.members (id, brand_id),
  foreign key (reward_id, brand_id) references public.rewards (id, brand_id),
  foreign key (used_store_id, brand_id) references public.stores (id, brand_id),
  foreign key (used_employee_id, brand_id) references public.employees (id, brand_id),
  constraint redemption_used_fields check (
    (status = 'used') = (used_at is not null and used_store_id is not null and used_employee_id is not null)
  ),
  constraint redemption_expiry_after_creation check (expires_at > created_at)
);

-- ---------------------------------------------------------------------------
-- Points ledger (append-only)
-- ---------------------------------------------------------------------------
create table public.ledger_entries (
  id bigint generated always as identity primary key,
  brand_id uuid not null references public.brands (id) on delete cascade,
  member_id uuid not null,
  store_id uuid,
  employee_id uuid,
  kind public.ledger_kind not null,
  points integer not null check (points <> 0),
  amount_cents integer check (amount_cents is null or amount_cents > 0),
  multiplier_pct smallint,
  bonus_multiplier_pct smallint,
  reason text,
  reverses_entry_id bigint references public.ledger_entries (id),
  redemption_id uuid,
  -- Same key twice = same request retried; the second insert fails safely.
  idempotency_key text not null,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (brand_id, idempotency_key),
  foreign key (member_id, brand_id) references public.members (id, brand_id),
  foreign key (store_id, brand_id) references public.stores (id, brand_id),
  foreign key (employee_id, brand_id) references public.employees (id, brand_id),
  foreign key (redemption_id, brand_id) references public.redemptions (id, brand_id),
  constraint ledger_sign check (
    (kind in ('earn', 'bonus', 'refund_redeem') and points > 0)
    or (kind in ('redeem', 'reverse', 'expire') and points < 0)
    or kind = 'adjust'
  ),
  constraint ledger_earn_fields check (
    kind <> 'earn' or (amount_cents is not null and store_id is not null and employee_id is not null)
  ),
  constraint ledger_reverse_ref check ((kind = 'reverse') = (reverses_entry_id is not null)),
  constraint ledger_redemption_ref check (
    kind not in ('redeem', 'refund_redeem') or redemption_id is not null
  ),
  constraint ledger_adjust_reason check (kind <> 'adjust' or nullif(trim(reason), '') is not null)
);

-- An entry can be reversed once; a redemption is charged and refunded once.
create unique index ledger_single_reversal on public.ledger_entries (reverses_entry_id)
  where reverses_entry_id is not null;
create unique index ledger_single_redeem on public.ledger_entries (redemption_id)
  where kind = 'redeem';
create unique index ledger_single_refund on public.ledger_entries (redemption_id)
  where kind = 'refund_redeem';

create index ledger_member_time on public.ledger_entries (member_id, created_at desc);
create index ledger_store_time on public.ledger_entries (store_id, created_at desc) where store_id is not null;
create index ledger_brand_time on public.ledger_entries (brand_id, created_at desc);

create trigger ledger_append_only
  before update or delete on public.ledger_entries
  for each row execute function public.forbid_change();
create trigger ledger_no_truncate
  before truncate on public.ledger_entries
  for each statement execute function public.forbid_change();

-- ---------------------------------------------------------------------------
-- Audit log (append-only)
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  brand_id uuid references public.brands (id) on delete cascade,
  actor_user_id uuid references auth.users (id),
  employee_id uuid references public.employees (id),
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_brand_time on public.audit_log (brand_id, created_at desc);
create trigger audit_append_only
  before update or delete on public.audit_log
  for each row execute function public.forbid_change();

-- ---------------------------------------------------------------------------
-- Derived balances (RLS of the underlying tables applies: security_invoker)
-- ---------------------------------------------------------------------------
create view public.member_balances with (security_invoker = true) as
select
  m.id as member_id,
  m.brand_id,
  coalesce(sum(l.points), 0)::integer as balance,
  coalesce(sum(l.points) filter (
    where l.kind in ('earn', 'bonus', 'reverse') and l.created_at > now() - interval '12 months'
  ), 0)::integer as earned_12m,
  max(l.created_at) filter (where l.kind = 'earn') as last_earn_at
from public.members m
left join public.ledger_entries l on l.member_id = m.id
group by m.id, m.brand_id;

-- ---------------------------------------------------------------------------
-- updated_at and consent timestamps
-- ---------------------------------------------------------------------------
create trigger brands_touch before update on public.brands
  for each row execute function public.touch_updated_at();
create trigger stores_touch before update on public.stores
  for each row execute function public.touch_updated_at();
create trigger rewards_touch before update on public.rewards
  for each row execute function public.touch_updated_at();
create trigger members_touch before update on public.members
  for each row execute function public.touch_updated_at();
create trigger member_secrets_touch before update on public.member_secrets
  for each row execute function public.touch_updated_at();

create function public.stamp_consents() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.consent_email, new.consent_sms, new.consent_push)
     is distinct from (old.consent_email, old.consent_sms, old.consent_push) then
    new.consents_updated_at := now();
  end if;
  return new;
end $$;
create trigger members_consents before update on public.members
  for each row execute function public.stamp_consents();

-- ---------------------------------------------------------------------------
-- Privileges: start from nothing, grant exactly what clients need.
-- The service role (server functions) bypasses RLS and keeps full access.
-- ---------------------------------------------------------------------------
revoke all on public.brands, public.stores, public.staff_roles, public.employees,
  public.members, public.member_secrets, public.rewards, public.redemptions,
  public.ledger_entries, public.audit_log, public.member_balances
  from anon, authenticated;

grant select on public.brands, public.stores, public.rewards to anon, authenticated;
grant update (name, config, default_locale, time_zone) on public.brands to authenticated;
grant insert, update on public.stores to authenticated;
grant insert, update on public.rewards to authenticated;
grant select, insert, delete on public.staff_roles to authenticated;
grant select (id, brand_id, store_id, display_name, active, created_at) on public.employees to authenticated;
grant select on public.members to authenticated;
grant update (first_name, last_name, birthday, locale, home_store_id,
  consent_email, consent_sms, consent_push) on public.members to authenticated;
grant select on public.member_secrets, public.ledger_entries, public.redemptions,
  public.audit_log, public.member_balances to authenticated;

revoke execute on function public.new_member_code() from public, anon, authenticated;
grant execute on function public.new_member_code() to service_role;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.brands enable row level security;
alter table public.stores enable row level security;
alter table public.staff_roles enable row level security;
alter table public.employees enable row level security;
alter table public.members enable row level security;
alter table public.member_secrets enable row level security;
alter table public.rewards enable row level security;
alter table public.redemptions enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.audit_log enable row level security;

-- Brands: public profile; HQ edits its own brand.
create policy brands_read on public.brands for select to anon, authenticated using (true);
create policy brands_hq_update on public.brands for update to authenticated
  using (public.has_brand_role(id, array['hq_admin']::public.staff_role[]))
  with check (public.has_brand_role(id, array['hq_admin']::public.staff_role[]));

-- Stores: active stores are public (store locator); HQ manages them.
create policy stores_read on public.stores for select to anon, authenticated
  using (active or public.has_brand_role(brand_id, array['hq_admin', 'store_manager', 'store_device']::public.staff_role[]));
create policy stores_hq_insert on public.stores for insert to authenticated
  with check (public.has_brand_role(brand_id, array['hq_admin']::public.staff_role[]));
create policy stores_hq_update on public.stores for update to authenticated
  using (public.has_brand_role(brand_id, array['hq_admin']::public.staff_role[]))
  with check (public.has_brand_role(brand_id, array['hq_admin']::public.staff_role[]));

-- Staff roles: see your own; HQ manages store managers and devices of its brand.
create policy staff_roles_read on public.staff_roles for select to authenticated
  using (
    user_id = (select auth.uid())
    or (brand_id is not null and public.has_brand_role(brand_id, array['hq_admin']::public.staff_role[]))
  );
create policy staff_roles_hq_insert on public.staff_roles for insert to authenticated
  with check (
    role <> 'platform_admin'
    and brand_id is not null
    and public.has_brand_role(brand_id, array['hq_admin']::public.staff_role[])
  );
create policy staff_roles_hq_delete on public.staff_roles for delete to authenticated
  using (
    role <> 'platform_admin'
    and brand_id is not null
    and public.has_brand_role(brand_id, array['hq_admin']::public.staff_role[])
  );

-- Employees: visible (without PIN hash, see grants) to their store and HQ.
create policy employees_read on public.employees for select to authenticated
  using (public.has_store_role(store_id, array['store_manager', 'store_device']::public.staff_role[]));

-- Members: a member sees and edits their own row; HQ sees its brand's members.
create policy members_read on public.members for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.has_brand_role(brand_id, array['hq_admin']::public.staff_role[])
  );
create policy members_self_update on public.members for update to authenticated
  using (user_id = (select auth.uid()) and deleted_at is null)
  with check (user_id = (select auth.uid()));

-- QR secrets: owner only.
create policy member_secrets_owner on public.member_secrets for select to authenticated
  using (exists (
    select 1 from public.members m
    where m.id = member_id and m.user_id = (select auth.uid())
  ));

-- Rewards: active ones are public; HQ manages the catalog.
create policy rewards_read on public.rewards for select to anon, authenticated
  using (active or public.has_brand_role(brand_id, array['hq_admin']::public.staff_role[]));
create policy rewards_hq_insert on public.rewards for insert to authenticated
  with check (public.has_brand_role(brand_id, array['hq_admin']::public.staff_role[]));
create policy rewards_hq_update on public.rewards for update to authenticated
  using (public.has_brand_role(brand_id, array['hq_admin']::public.staff_role[]))
  with check (public.has_brand_role(brand_id, array['hq_admin']::public.staff_role[]));

-- Redemptions: the member, HQ, and the store where it was used.
create policy redemptions_read on public.redemptions for select to authenticated
  using (
    exists (select 1 from public.members m where m.id = member_id and m.user_id = (select auth.uid()))
    or public.has_brand_role(brand_id, array['hq_admin']::public.staff_role[])
    or (used_store_id is not null
        and public.has_store_role(used_store_id, array['store_manager', 'store_device']::public.staff_role[]))
  );

-- Ledger: the member, HQ, and the store where the entry happened.
create policy ledger_read on public.ledger_entries for select to authenticated
  using (
    exists (select 1 from public.members m where m.id = member_id and m.user_id = (select auth.uid()))
    or public.has_brand_role(brand_id, array['hq_admin']::public.staff_role[])
    or (store_id is not null
        and public.has_store_role(store_id, array['store_manager', 'store_device']::public.staff_role[]))
  );

-- Audit log: HQ of the brand.
create policy audit_read on public.audit_log for select to authenticated
  using (brand_id is not null and public.has_brand_role(brand_id, array['hq_admin']::public.staff_role[]));
