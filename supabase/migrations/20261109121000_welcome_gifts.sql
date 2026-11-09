-- Welcome gift (docs/api-contract.md v0.2): a free reward (the butter
-- croissant, brands.config → welcome.rewardId) unlocked by the member's first
-- purchase, once per member ever. It is redeemed with a code like any reward,
-- but for 0 points and without a ledger entry: gifts are not points and never
-- count towards tiers. Written only by the server functions (service role).

create table public.member_gifts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  member_id uuid not null,
  kind text not null check (kind in ('welcome')),
  reward_id uuid not null,
  unlocked_at timestamptz not null,
  -- unlocked_at + packages/core welcome.validDays
  expires_at timestamptz not null,
  -- available → redeemed when a code is created (it stays redeemed once the
  -- code is used) → available again if that code is cancelled or expires
  -- unused; expired once past expires_at (core giftStatusAt).
  status text not null default 'available' check (status in ('available', 'redeemed', 'expired')),
  -- The live code while redeemed; cleared when the code comes back.
  redemption_id uuid,
  -- The earn that unlocked it (the gift stays even if that earn is undone).
  unlocked_by_entry_id bigint references public.ledger_entries (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, brand_id),
  -- Target of redemptions_gift_fk: a code can only use the member's own gift, for the gift's reward.
  unique (id, brand_id, member_id, reward_id),
  foreign key (member_id, brand_id) references public.members (id, brand_id),
  foreign key (reward_id, brand_id) references public.rewards (id, brand_id),
  foreign key (redemption_id, brand_id) references public.redemptions (id, brand_id),
  constraint member_gift_expiry_after_unlock check (expires_at > unlocked_at),
  constraint member_gift_redemption check ((status = 'redeemed') = (redemption_id is not null))
);

-- One gift of each kind per member, ever.
create unique index member_gifts_once on public.member_gifts (member_id, kind);
-- The expiry job finds available gifts past their expiry quickly.
create index member_gifts_available_expiry on public.member_gifts (expires_at) where status = 'available';

create trigger member_gifts_touch before update on public.member_gifts
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Redemptions of a gift: points_spent = 0 and no ledger entry. Codes bought
-- with points keep points_spent > 0.
-- ---------------------------------------------------------------------------
alter table public.redemptions add column gift_id uuid;
alter table public.redemptions
  add constraint redemptions_gift_fk foreign key (gift_id, brand_id, member_id, reward_id)
  references public.member_gifts (id, brand_id, member_id, reward_id);
alter table public.redemptions drop constraint redemptions_points_spent_check;
alter table public.redemptions add constraint redemption_points_spent check (
  (gift_id is null and points_spent > 0) or (gift_id is not null and points_spent = 0)
);
-- A gift has at most one live code (pending or used) at a time.
create unique index redemptions_one_live_per_gift on public.redemptions (gift_id)
  where gift_id is not null and status in ('pending', 'used');

-- ---------------------------------------------------------------------------
-- Privileges and row-level security: the member reads their own gifts, HQ
-- (and platform admins) read the brand's; no client writes.
-- ---------------------------------------------------------------------------
revoke all on public.member_gifts from anon, authenticated;
grant select on public.member_gifts to authenticated;

alter table public.member_gifts enable row level security;
create policy member_gifts_read on public.member_gifts for select to authenticated
  using (
    exists (select 1 from public.members m where m.id = member_id and m.user_id = (select auth.uid()))
    or private.has_brand_role(brand_id, array['hq_admin']::public.staff_role[])
  );
