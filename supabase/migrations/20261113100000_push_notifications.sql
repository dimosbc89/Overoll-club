-- Push notifications (API contract v0.9).
--
-- The member app registers its Expo push token (`push/register`). Server
-- operations put what should be said into `push_outbox` (points added, a code
-- that expired, points about to expire, a message from HQ); the job
-- `jobs/push-send` renders each one in the member's language and sends it to
-- the member's devices through the Expo push service.
--
-- Service messages go to every device that registered (the phone's own
-- permission is the switch). HQ messages (offers, news) only to members with
-- `consent_push` (program spec: Notifications).

-- Devices that can receive push notifications for a member.
create table public.push_devices (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  member_id uuid not null,
  token text not null check (token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,200}\]$'),
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One phone, one member at a time: signing in with another account moves the token.
  unique (brand_id, token),
  foreign key (member_id, brand_id) references public.members (id, brand_id) on delete cascade
);
create index push_devices_member on public.push_devices (member_id);

create trigger push_devices_touch before update on public.push_devices
  for each row execute function public.touch_updated_at();

-- Server only: tokens never reach a client.
revoke all on public.push_devices from anon, authenticated;
grant all on public.push_devices to service_role;
alter table public.push_devices enable row level security;

-- Messages HQ sends to members who said yes to offers by notification.
create table public.push_campaigns (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  title_el text not null check (length(btrim(title_el)) between 1 and 65),
  body_el text not null check (length(btrim(body_el)) between 1 and 240),
  title_en text check (title_en is null or length(btrim(title_en)) between 1 and 65),
  body_en text check (body_en is null or length(btrim(body_en)) between 1 and 240),
  -- English text comes in pairs: both or neither (members who chose English get the Greek otherwise).
  check ((title_en is null) = (body_en is null)),
  recipients integer not null default 0 check (recipients >= 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, brand_id)
);
create index push_campaigns_brand on public.push_campaigns (brand_id, created_at desc);

-- HQ reads its brand's messages (back office list); writes go through the API.
revoke all on public.push_campaigns from anon, authenticated;
grant select on public.push_campaigns to authenticated;
grant all on public.push_campaigns to service_role;
alter table public.push_campaigns enable row level security;
create policy push_campaigns_hq_read on public.push_campaigns for select to authenticated
  using (private.has_brand_role(brand_id, array['hq_admin']::public.staff_role[]));

-- What should be said to whom. One row per member and event; the job fans it out to the member's devices.
create table public.push_outbox (
  id bigint generated always as identity primary key,
  brand_id uuid not null references public.brands (id) on delete cascade,
  member_id uuid not null,
  kind text not null check (kind in ('earn', 'code_expired', 'points_expiring', 'message')),
  -- What the event is about (a ledger entry, a redemption, an expiry date, a campaign): one message per event.
  ref text not null check (length(ref) between 1 and 200),
  payload jsonb not null default '{}'::jsonb,
  campaign_id uuid,
  -- Points added are held a minute, so a cashier's immediate undo sends nothing.
  send_after timestamptz not null default now(),
  -- A sender working on the row; another run leaves it alone until then.
  claimed_until timestamptz,
  attempts smallint not null default 0,
  sent_at timestamptz,
  -- sent | no_device | skipped | failed
  outcome text check (outcome is null or outcome in ('sent', 'no_device', 'skipped', 'failed')),
  created_at timestamptz not null default now(),
  unique (brand_id, kind, ref),
  foreign key (member_id, brand_id) references public.members (id, brand_id) on delete cascade,
  foreign key (campaign_id, brand_id) references public.push_campaigns (id, brand_id) on delete cascade,
  check ((kind = 'message') = (campaign_id is not null))
);
create index push_outbox_due on public.push_outbox (send_after) where sent_at is null;
create index push_outbox_member on public.push_outbox (member_id);

revoke all on public.push_outbox from anon, authenticated;
grant all on public.push_outbox to service_role;
alter table public.push_outbox enable row level security;
