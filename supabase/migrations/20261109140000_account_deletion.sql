-- Account deletion (docs/api-contract.md v0.4, packages/server deleteMember):
-- the member deletes their account in the app (Apple requires it; GDPR).
-- In one transaction the server cancels the member's pending codes (points
-- not returned), wipes the personal fields, deletes the QR secret, marks the
-- member deleted (members.deleted_at, already in the init schema) and deletes
-- the Supabase Auth user. The ledger stays (append-only) and no longer points
-- to anyone. Rejoining with the same email later makes a new member.

-- ---------------------------------------------------------------------------
-- 1. "Who did it" stays an id, not a foreign key. An auth user who made ledger
--    entries (a member's own redemptions) or audit rows can't otherwise be
--    deleted: the append-only ledger and audit log can't be set to null. The
--    same was true for a till device removed by HQ. The id simply points to
--    nobody once the user is gone.
-- ---------------------------------------------------------------------------
alter table public.ledger_entries drop constraint ledger_entries_created_by_fkey;
alter table public.audit_log drop constraint audit_log_actor_user_id_fkey;

-- ---------------------------------------------------------------------------
-- 2. A deleted member keeps no personal data: enforced by the database, not
--    only by the server. first_name stays NOT NULL (the apps rely on it), so
--    it is emptied. Kept: member_code (a random id, so HQ can follow the
--    ledger), tier, locale, stores, timestamps (points expiry still runs on
--    last_purchase_at), minimum_age_confirmed_at.
-- ---------------------------------------------------------------------------
alter table public.members add constraint member_deleted_wiped check (
  deleted_at is null or (
    user_id is null and first_name = '' and last_name is null and email is null and phone is null
    and birthday is null and referral_code is null
    and not consent_email and not consent_sms and not consent_push
  )
);

-- deleteMember finds the caller's members by user id; deleting an auth user
-- also sets members.user_id and idempotency_keys.actor_user_id to null.
create index members_user on public.members (user_id) where user_id is not null;
create index idempotency_keys_actor on private.idempotency_keys (actor_user_id) where actor_user_id is not null;
-- Stored results that carry a first name (join, redemptions/use): the name is
-- emptied on deletion, so the server may now update `result`.
create index idempotency_keys_member_names on private.idempotency_keys ((result ->> 'memberId'))
  where result ? 'firstName' or result ? 'memberFirstName';
grant update (result) on private.idempotency_keys to service_role;

-- ---------------------------------------------------------------------------
-- 3. Row-level security: a deleted member's rows are readable by HQ (and
--    platform admins) only. The member no longer matches (user_id is null),
--    and store devices and managers no longer see that member's ledger
--    entries and codes in their store's activity. A security-definer check,
--    because store users can't read `members` themselves.
-- ---------------------------------------------------------------------------
create function private.is_active_member(p_member_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.members where id = p_member_id and deleted_at is null);
$$;
revoke execute on function private.is_active_member(uuid) from public;
grant execute on function private.is_active_member(uuid) to authenticated, service_role;

drop policy members_read on public.members;
create policy members_read on public.members for select to authenticated
  using (
    (user_id = (select auth.uid()) and deleted_at is null)
    or private.has_brand_role(brand_id, array['hq_admin']::public.staff_role[])
  );

drop policy member_secrets_owner on public.member_secrets;
create policy member_secrets_owner on public.member_secrets for select to authenticated
  using (exists (
    select 1 from public.members m
    where m.id = member_id and m.user_id = (select auth.uid()) and m.deleted_at is null
  ));

drop policy redemptions_read on public.redemptions;
create policy redemptions_read on public.redemptions for select to authenticated
  using (
    exists (
      select 1 from public.members m
      where m.id = member_id and m.user_id = (select auth.uid()) and m.deleted_at is null
    )
    or private.has_brand_role(brand_id, array['hq_admin']::public.staff_role[])
    or (used_store_id is not null
        and private.has_store_role(used_store_id, array['store_manager', 'store_device']::public.staff_role[])
        and private.is_active_member(member_id))
  );

drop policy ledger_read on public.ledger_entries;
create policy ledger_read on public.ledger_entries for select to authenticated
  using (
    exists (
      select 1 from public.members m
      where m.id = member_id and m.user_id = (select auth.uid()) and m.deleted_at is null
    )
    or private.has_brand_role(brand_id, array['hq_admin']::public.staff_role[])
    or (store_id is not null
        and private.has_store_role(store_id, array['store_manager', 'store_device']::public.staff_role[])
        and private.is_active_member(member_id))
  );

drop policy member_gifts_read on public.member_gifts;
create policy member_gifts_read on public.member_gifts for select to authenticated
  using (
    exists (
      select 1 from public.members m
      where m.id = member_id and m.user_id = (select auth.uid()) and m.deleted_at is null
    )
    or private.has_brand_role(brand_id, array['hq_admin']::public.staff_role[])
  );
