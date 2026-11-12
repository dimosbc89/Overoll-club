-- Apple Wallet and Google Wallet passes (API contract v0.7).
--
-- The pass shows the member's points, tier, first name and next reward, with
-- the static Wallet QR (core createWalletToken). When any of these changes,
-- `wallet_changed_at` moves; the job `jobs/wallet-updates` then tells Apple
-- (a push to each registered device) and Google (the object is updated) and
-- records `wallet_sent_at`.

alter table public.member_secrets
  add column wallet_changed_at timestamptz not null default now(),
  add column wallet_sent_at timestamptz,
  -- Set when the member first asked for a Google Wallet link; only then are
  -- Google objects updated (there is nothing to update before).
  add column google_wallet_at timestamptz;

comment on column public.member_secrets.wallet_changed_at is
  'Last change of what the Wallet pass shows (points, tier, name, next reward). Apple: Last-Modified and passesUpdatedSince.';
comment on column public.member_secrets.wallet_sent_at is
  'wallet_changed_at as last sent to Apple and Google by jobs/wallet-updates.';
comment on column public.member_secrets.google_wallet_at is
  'First Google Wallet save link for this member; Google objects are updated only after that.';

-- The job looks only at members with a pass: Google (this index) or Apple (wallet_apple_devices).
create index member_secrets_google_wallet on public.member_secrets (member_id) where google_wallet_at is not null;

-- Apple Wallet devices holding a member's pass (PassKit web service).
create table public.wallet_apple_devices (
  device_library_id text not null check (length(device_library_id) between 1 and 128),
  member_id uuid not null,
  brand_id uuid not null references public.brands (id) on delete cascade,
  push_token text not null check (length(push_token) between 1 and 256),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (device_library_id, member_id),
  foreign key (member_id, brand_id) references public.members (id, brand_id) on delete cascade
);
create index wallet_apple_devices_member on public.wallet_apple_devices (member_id);

create trigger wallet_apple_devices_touch before update on public.wallet_apple_devices
  for each row execute function public.touch_updated_at();

-- Server only: the push tokens never reach a client.
revoke all on public.wallet_apple_devices from anon, authenticated;
grant all on public.wallet_apple_devices to service_role;
alter table public.wallet_apple_devices enable row level security;

-- What the pass shows changed: points (any ledger entry), tier, first name.
create function private.wallet_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.member_secrets set wallet_changed_at = now() where member_id = new.member_id;
  return null;
end $$;

create function private.wallet_member_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.member_secrets set wallet_changed_at = now() where member_id = new.id;
  return null;
end $$;

revoke execute on function private.wallet_changed(), private.wallet_member_changed() from public, anon, authenticated;

create trigger ledger_wallet_changed after insert on public.ledger_entries
  for each row execute function private.wallet_changed();

create trigger members_wallet_changed after update of tier, first_name on public.members
  for each row when (old.tier is distinct from new.tier or old.first_name is distinct from new.first_name)
  execute function private.wallet_member_changed();
