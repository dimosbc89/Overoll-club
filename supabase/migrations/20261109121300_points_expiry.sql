-- Points expiry job (docs/api-contract.md v0.2, packages/server expirePoints):
-- points expire packages/core expiryMonths after the member's last purchase
-- (or after joining, for a member who never bought anything). The job looks
-- members up by that date, per brand. The `expire` entries themselves are
-- made idempotent by the ledger's unique (brand_id, idempotency_key):
-- `expire_points:<member id>:<expiry time>`.

create index members_expiry_anchor on public.members (brand_id, (coalesce(last_purchase_at, created_at)));
