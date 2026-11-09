-- Support for the server operations in packages/server (join, award, undo,
-- redeem, use, expire).

-- ---------------------------------------------------------------------------
-- Idempotency keys
-- Every operation that writes takes a client-chosen key. The first successful
-- call stores its result here in the same transaction as its writes; a retry
-- with the same key returns the stored result and writes nothing. Server only:
-- kept in the `private` schema (not exposed by the API), RLS on, no policies,
-- no grants to clients.
-- ---------------------------------------------------------------------------
create table private.idempotency_keys (
  brand_id uuid not null references public.brands (id) on delete cascade,
  key text not null check (length(key) between 1 and 200),
  operation text not null,
  actor_user_id uuid references auth.users (id) on delete set null,
  -- Canonical JSON of the request (no PINs, no tokens): a reused key with a
  -- different request is refused instead of returning an unrelated result.
  fingerprint text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (brand_id, key)
);
create index idempotency_keys_created on private.idempotency_keys (created_at);

alter table private.idempotency_keys enable row level security;
revoke all on private.idempotency_keys from public, anon, authenticated;
grant select, insert, delete on private.idempotency_keys to service_role;

-- ---------------------------------------------------------------------------
-- Redemption expiry job: find pending codes past their expiry quickly.
-- ---------------------------------------------------------------------------
create index redemptions_pending_expiry on public.redemptions (expires_at)
  where status = 'pending';
