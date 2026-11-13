-- Access-rule tests for the init migration. Run with supabase/tests/run-local.sh.
\set ON_ERROR_STOP on
set client_min_messages = notice;

create schema tst;
create function tst.eq(actual bigint, expected bigint, label text) returns void
language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FAIL %: expected %, got %', label, expected, actual;
  end if;
  raise notice 'ok  %', label;
end $$;
grant usage on schema tst to anon, authenticated, service_role;
grant execute on all functions in schema tst to anon, authenticated, service_role;

-- Run a statement as a given user and expect it to be refused (42501) or to violate a check.
create function tst.refused(stmt text, label text, expected_state text default '42501') returns void
language plpgsql as $$
begin
  execute stmt;
  raise exception 'FAIL %: statement was allowed', label;
exception when others then
  if sqlstate <> expected_state then
    raise exception 'FAIL %: expected sqlstate %, got % (%)', label, expected_state, sqlstate, sqlerrm;
  end if;
  raise notice 'ok  % (refused: %)', label, sqlstate;
end $$;
grant execute on all functions in schema tst to anon, authenticated, service_role;

-- ---------------------------------------------------------------- fixtures
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'), -- member 1
  ('00000000-0000-0000-0000-0000000000a2'), -- member 2
  ('00000000-0000-0000-0000-0000000000b1'), -- HQ admin, Overoll
  ('00000000-0000-0000-0000-0000000000c1'), -- till device, store A
  ('00000000-0000-0000-0000-0000000000d1'), -- store manager, store B
  ('00000000-0000-0000-0000-0000000000e1'); -- platform admin (GROW)

insert into public.brands (id, slug, name) values
  ('10000000-0000-0000-0000-000000000001', 'overoll', 'Overoll'),
  ('10000000-0000-0000-0000-000000000002', 'other', 'Other brand');

insert into public.stores (id, brand_id, code, name, active) values
  ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', 'praxitelous', 'Praxitelous', true),
  ('20000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000001', 'aigaleo', 'Aigaleo', true),
  ('20000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-000000000001', 'closed', 'Closed store', false),
  ('20000000-0000-0000-0000-00000000000f', '10000000-0000-0000-0000-000000000002', 'other-1', 'Other 1', true);

insert into public.staff_roles (user_id, brand_id, store_id, role) values
  ('00000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-000000000001', null, 'hq_admin'),
  ('00000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', 'store_device'),
  ('00000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000b', 'store_manager'),
  ('00000000-0000-0000-0000-0000000000e1', null, null, 'platform_admin');

insert into public.employees (id, brand_id, store_id, display_name, pin_hash) values
  ('30000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', 'Maria', extensions.crypt('1234', extensions.gen_salt('bf'))),
  ('30000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000b', 'Nikos', extensions.crypt('5678', extensions.gen_salt('bf'))),
  ('30000000-0000-0000-0000-00000000000f', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-00000000000f', 'Other', extensions.crypt('0000', extensions.gen_salt('bf')));

-- Members are created by the service role (server function), as in production.
set role service_role;
insert into public.members (id, brand_id, user_id, first_name, email, joined_store_id) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Eleni', 'eleni@example.com', '20000000-0000-0000-0000-00000000000a'),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', 'Kostas', 'kostas@example.com', '20000000-0000-0000-0000-00000000000b'),
  ('40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', null, 'Stranger', null, null);
insert into public.member_secrets (member_id)
  select id from public.members;
insert into public.ledger_entries (brand_id, member_id, store_id, employee_id, kind, points, amount_cents, multiplier_pct, idempotency_key) values
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a', 'earn', 65, 650, 100, 'k1'),
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-00000000000b', '30000000-0000-0000-0000-00000000000b', 'earn', 80, 800, 100, 'k2'),
  ('10000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-00000000000f', '30000000-0000-0000-0000-00000000000f', 'earn', 50, 500, 100, 'k3');
insert into public.rewards (brand_id, name_el, name_en, shelf_price_cents, base_cost) values
  ('10000000-0000-0000-0000-000000000001', 'Δωρεάν espresso', 'Free espresso', 220, 300),
  ('10000000-0000-0000-0000-000000000001', 'Παλιό', 'Retired', 300, 400);
update public.rewards set active = false where name_en = 'Retired';
reset role;

select tst.eq((select count(*) from public.members where member_code ~ '^[A-Z2-9]{8}$'), 3, 'member codes generated (8 chars, no look-alikes)');
select tst.eq((select count(distinct qr_secret) from public.member_secrets), 3, 'each member gets its own QR secret');

-- ------------------------------------------------------------ member 1
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
set role authenticated;
select tst.eq((select count(*) from public.members), 1, 'member sees only own profile');
select tst.eq((select count(*) from public.ledger_entries), 1, 'member sees only own ledger');
select tst.eq((select count(*) from public.member_secrets), 1, 'member sees only own QR secret');
select tst.eq((select balance from public.member_balances), 65, 'member balance = 65');
select tst.eq((select earned_12m from public.member_balances), 65, 'member earned in 12 months = 65');
select tst.eq((select count(*) from public.rewards), 1, 'member sees active rewards only');
select tst.eq((select count(*) from public.stores), 3, 'member sees active stores only');
update public.members set first_name = 'Eleni K.' where id = '40000000-0000-0000-0000-000000000001';
select tst.eq((select count(*) from public.members where first_name = 'Eleni K.'), 1, 'member can edit own name');
update public.members set consent_email = true where id = '40000000-0000-0000-0000-000000000001';
select tst.eq((select count(*) from public.members where consents_updated_at is not null), 1, 'consent change is timestamped');
select tst.refused($$update public.members set tier = 'club' where id = '40000000-0000-0000-0000-000000000001'$$, 'member cannot change own tier');
select tst.refused($$update public.members set member_code = 'HACKED12'$$, 'member cannot change member code');
select tst.refused($$insert into public.ledger_entries (brand_id, member_id, kind, points, idempotency_key, reason) values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'adjust', 1000, 'x', 'free points')$$, 'member cannot give themselves points');
select tst.refused($$select pin_hash from public.employees$$, 'member cannot read PIN hashes');
select tst.refused($$insert into public.stores (brand_id, code, name) values ('10000000-0000-0000-0000-000000000001', 'fake', 'Fake')$$, 'member cannot create stores');
reset role;

-- ------------------------------------------------------- till device, store A
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
set role authenticated;
select tst.eq((select count(*) from public.ledger_entries), 1, 'store A device sees only store A entries');
select tst.eq((select count(*) from public.members), 0, 'store device cannot browse members');
select tst.eq((select count(*) from public.member_secrets), 0, 'store device cannot read QR secrets');
select tst.eq((select count(*) from public.employees), 1, 'store device sees its own employees');
select tst.refused($$select pin_hash from public.employees$$, 'store device cannot read PIN hashes');
select tst.eq((select count(*) from public.stores), 4, 'store device sees its brand stores incl. inactive, plus public active ones');
reset role;

-- ------------------------------------------------------ store manager, store B
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', false);
set role authenticated;
select tst.eq((select count(*) from public.ledger_entries), 1, 'store B manager sees only store B entries');
select tst.eq((select sum(points) from public.ledger_entries), 80, 'store B manager sees store B points');
select tst.refused($$insert into public.staff_roles (user_id, brand_id, store_id, role) values ('00000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-000000000001', null, 'hq_admin')$$, 'store manager cannot promote self to HQ');
reset role;

-- --------------------------------------------------------------- HQ admin
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', false);
set role authenticated;
select tst.eq((select count(*) from public.members), 2, 'HQ sees its brand members only');
select tst.eq((select count(*) from public.ledger_entries), 2, 'HQ sees its brand ledger only');
select tst.eq((select count(*) from public.rewards), 2, 'HQ sees inactive rewards too');
select tst.refused($$insert into public.stores (brand_id, code, name, country) values ('10000000-0000-0000-0000-000000000001', 'nicosia', 'Nicosia', 'CY')$$, 'HQ adds stores through the API only (v0.6)');
select tst.refused($$update public.rewards set base_cost = 1 where brand_id = '10000000-0000-0000-0000-000000000001'$$, 'HQ edits rewards through the API only (v0.6): the cost comes from core');
select tst.refused($$insert into public.rewards (brand_id, name_el, name_en, shelf_price_cents, base_cost) values ('10000000-0000-0000-0000-000000000001', 'Δωρεάν', 'Free', 100, 1)$$, 'HQ adds rewards through the API only (v0.6)');
select tst.refused($$insert into public.stores (brand_id, code, name) values ('10000000-0000-0000-0000-000000000002', 'steal', 'Steal')$$, 'HQ cannot add a store to another brand');
select tst.refused($$insert into public.staff_roles (user_id, brand_id, store_id, role) values ('00000000-0000-0000-0000-0000000000b1', null, null, 'platform_admin')$$, 'HQ cannot create a platform admin');
insert into public.staff_roles (user_id, brand_id, store_id, role) values ('00000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000b', 'store_device');
select tst.eq((select count(*) from public.staff_roles where role = 'store_device'), 2, 'HQ can add a till device');
select tst.eq((select count(*) from public.member_secrets), 0, 'even HQ cannot read QR secrets');
reset role;

-- --------------------------------------------------------- platform admin
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false);
set role authenticated;
select tst.eq((select count(*) from public.ledger_entries), 3, 'platform admin sees every brand');
reset role;

-- ------------------------------------------------------------------- anon
select set_config('request.jwt.claim.sub', '', false);
set role anon;
select tst.eq((select count(*) from public.brands), 2, 'anyone can read brand profiles');
select tst.eq((select count(*) from public.rewards), 1, 'anyone can read active rewards');
select tst.refused($$select count(*) from public.ledger_entries$$, 'anonymous cannot read the ledger');
select tst.refused($$select count(*) from public.members$$, 'anonymous cannot read members');
select tst.eq((select count(*) from public.stores where not active), 0, 'anonymous sees open stores only (policy helpers still run for anon)');
reset role;

-- ------------------------------------------------------- API surface
select tst.eq((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.prosecdef), 0,
              'no SECURITY DEFINER function is exposed in the public (API) schema');

-- ----------------------------------------------------- ledger integrity
select tst.refused($$update public.ledger_entries set points = 9999$$, 'ledger rows cannot be edited', 'P0001');
select tst.refused($$delete from public.ledger_entries$$, 'ledger rows cannot be deleted', 'P0001');
select tst.refused($$insert into public.ledger_entries (brand_id, member_id, store_id, kind, points, amount_cents, idempotency_key) values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', 'earn', 10, 100, 'k-no-employee')$$, 'an earn needs an employee', '23514');
select tst.refused($$insert into public.ledger_entries (brand_id, member_id, store_id, employee_id, kind, points, amount_cents, idempotency_key) values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a', 'earn', 65, 650, 'k1')$$, 'a retried request cannot earn twice', '23505');
select tst.refused($$insert into public.ledger_entries (brand_id, member_id, kind, points, idempotency_key) values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'expire', 50, 'k-bad-sign')$$, 'expiry must be negative', '23514');
select tst.refused($$insert into public.ledger_entries (brand_id, member_id, kind, points, idempotency_key) values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'adjust', 50, 'k-no-reason')$$, 'manual adjustment needs a reason', '23514');
select tst.refused($$insert into public.ledger_entries (brand_id, member_id, store_id, employee_id, kind, points, amount_cents, idempotency_key) values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000f', '30000000-0000-0000-0000-00000000000a', 'earn', 65, 650, 'k-cross-brand')$$, 'an entry cannot point at another brand''s store', '23503');
insert into public.ledger_entries (brand_id, member_id, store_id, employee_id, kind, points, reverses_entry_id, idempotency_key)
  select brand_id, member_id, store_id, employee_id, 'reverse', -65, id, 'k1-undo' from public.ledger_entries where idempotency_key = 'k1';
select tst.refused($$insert into public.ledger_entries (brand_id, member_id, store_id, employee_id, kind, points, reverses_entry_id, idempotency_key) select brand_id, member_id, store_id, employee_id, 'reverse', -65, id, 'k1-undo-again' from public.ledger_entries where idempotency_key = 'k1'$$, 'an entry can only be undone once', '23505');
select tst.eq((select balance from public.member_balances where member_id = '40000000-0000-0000-0000-000000000001'), 0, 'undo brings balance back to 0');
select tst.eq((select earned_12m from public.member_balances where member_id = '40000000-0000-0000-0000-000000000001'), 0, 'undo also removes the points from tier progress');

-- ------------------------------------------- server-only: idempotency keys
set role service_role;
insert into private.idempotency_keys (brand_id, key, operation, actor_user_id, fingerprint, result)
values ('10000000-0000-0000-0000-000000000001', 'k-award-1', 'award', '00000000-0000-0000-0000-0000000000c1', '{}', '{"ok": true}');
select tst.eq((select count(*) from private.idempotency_keys), 1, 'service role stores idempotency keys');
reset role;
select tst.refused($$insert into private.idempotency_keys (brand_id, key, operation, fingerprint, result) values ('10000000-0000-0000-0000-000000000001', 'k-award-1', 'award', '{}', '{}')$$, 'an idempotency key is stored once per brand', '23505');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
set role authenticated;
select tst.refused($$select count(*) from private.idempotency_keys$$, 'store device cannot read idempotency keys');
select tst.refused($$insert into private.idempotency_keys (brand_id, key, operation, fingerprint, result) values ('10000000-0000-0000-0000-000000000001', 'k-x', 'award', '{}', '{"ok": true}')$$, 'store device cannot write idempotency keys');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', false);
set role authenticated;
select tst.refused($$select count(*) from private.idempotency_keys$$, 'even HQ cannot read idempotency keys');
reset role;
select set_config('request.jwt.claim.sub', '', false);
set role anon;
select tst.refused($$select count(*) from private.idempotency_keys$$, 'anonymous cannot read idempotency keys');
reset role;
-- ------------------------------------------------- welcome gifts (v0.2)
set role service_role;
insert into public.rewards (id, brand_id, name_el, name_en, shelf_price_cents, base_cost) values
  ('50000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-000000000001', 'Κρουασάν βουτύρου', 'Butter croissant', 300, 400);
insert into public.member_gifts (id, brand_id, member_id, kind, reward_id, unlocked_at, expires_at) values
  ('70000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'welcome', '50000000-0000-0000-0000-0000000000c1', '2027-01-05 09:00+00', '2027-02-04 09:00+00'),
  ('70000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', 'welcome', '50000000-0000-0000-0000-0000000000c1', '2027-01-05 09:00+00', '2027-02-04 09:00+00');
select tst.eq((select count(*) from public.member_gifts), 2, 'service role creates gifts');
-- A gift code: 0 points, the member's own gift, the gift's reward.
insert into public.redemptions (id, brand_id, member_id, reward_id, gift_id, code, points_spent, created_at, expires_at) values
  ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-0000000000c1', '70000000-0000-0000-0000-000000000001', 'GIFTAAAA', 0, '2027-01-06 09:00+00', '2027-01-06 09:15+00');
update public.member_gifts set status = 'redeemed', redemption_id = '60000000-0000-0000-0000-000000000001'
  where id = '70000000-0000-0000-0000-000000000001';
select tst.eq((select count(*) from public.redemptions where points_spent = 0 and gift_id is not null), 1, 'a gift code is stored with 0 points');
reset role;
select tst.refused($$insert into public.member_gifts (brand_id, member_id, kind, reward_id, unlocked_at, expires_at) values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'welcome', '50000000-0000-0000-0000-0000000000c1', now(), now() + interval '30 days')$$, 'a member gets one welcome gift, ever', '23505');
select tst.refused($$insert into public.member_gifts (brand_id, member_id, kind, reward_id, unlocked_at, expires_at) values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'birthday', '50000000-0000-0000-0000-0000000000c1', now(), now() + interval '30 days')$$, 'only known gift kinds', '23514');
select tst.refused($$insert into public.member_gifts (brand_id, member_id, kind, reward_id, unlocked_at, expires_at) values ('10000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000003', 'welcome', '50000000-0000-0000-0000-0000000000c1', now(), now() + interval '30 days')$$, 'a gift cannot be another brand''s reward', '23503');
select tst.refused($$update public.member_gifts set status = 'redeemed' where id = '70000000-0000-0000-0000-000000000002'$$, 'a redeemed gift needs its code', '23514');
select tst.refused($$update public.member_gifts set expires_at = unlocked_at where id = '70000000-0000-0000-0000-000000000002'$$, 'a gift expires after it unlocks', '23514');
select tst.refused($$insert into public.redemptions (brand_id, member_id, reward_id, code, points_spent, expires_at) values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-0000000000c1', 'ZEROAAAA', 0, now() + interval '15 minutes')$$, 'a reward code for 0 points needs a gift', '23514');
select tst.refused($$insert into public.redemptions (brand_id, member_id, reward_id, gift_id, code, points_spent, expires_at) values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-0000000000c1', '70000000-0000-0000-0000-000000000002', 'GIFTBBBB', 400, now() + interval '15 minutes')$$, 'a gift code costs no points', '23514');
select tst.refused($$insert into public.redemptions (brand_id, member_id, reward_id, gift_id, code, points_spent, expires_at) values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-0000000000c1', '70000000-0000-0000-0000-000000000002', 'GIFTCCCC', 0, now() + interval '15 minutes')$$, 'a member cannot use someone else''s gift', '23503');
select tst.refused($$insert into public.redemptions (brand_id, member_id, reward_id, gift_id, code, points_spent, expires_at) select brand_id, '40000000-0000-0000-0000-000000000002', id, '70000000-0000-0000-0000-000000000002', 'GIFTDDDD', 0, now() + interval '15 minutes' from public.rewards where name_en = 'Free espresso'$$, 'a gift code is for the gift''s reward only', '23503');
select tst.refused($$insert into public.redemptions (brand_id, member_id, reward_id, gift_id, code, points_spent, created_at, expires_at) values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-0000000000c1', '70000000-0000-0000-0000-000000000001', 'GIFTEEEE', 0, '2027-01-06 09:01+00', '2027-01-06 09:16+00')$$, 'a gift has one live code at a time', '23505');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
set role authenticated;
select tst.eq((select count(*) from public.member_gifts), 1, 'member sees only own gift');
select tst.eq((select count(*) from public.redemptions where gift_id is not null), 1, 'member sees own gift code');
select tst.refused($$insert into public.member_gifts (brand_id, member_id, kind, reward_id, unlocked_at, expires_at) values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'welcome', '50000000-0000-0000-0000-0000000000c1', now(), now() + interval '30 days')$$, 'member cannot create a gift');
select tst.refused($$update public.member_gifts set status = 'available', redemption_id = null$$, 'member cannot give a used gift back');
select tst.refused($$delete from public.member_gifts$$, 'member cannot delete gifts');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
set role authenticated;
select tst.eq((select count(*) from public.member_gifts), 0, 'store device cannot read gifts');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', false);
set role authenticated;
select tst.eq((select count(*) from public.member_gifts), 2, 'HQ sees its brand gifts');
select tst.refused($$update public.member_gifts set expires_at = expires_at + interval '1 year'$$, 'even HQ cannot change gifts directly');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false);
set role authenticated;
select tst.eq((select count(*) from public.member_gifts), 2, 'platform admin sees gifts');
reset role;
select set_config('request.jwt.claim.sub', '', false);
set role anon;
select tst.refused($$select count(*) from public.member_gifts$$, 'anonymous cannot read gifts');
reset role;

-- ------------------------------------------------ late points: receipt numbers
select tst.refused($$insert into public.ledger_entries (brand_id, member_id, kind, points, reason, receipt_number, idempotency_key) values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'adjust', 10, 'test', 'R-1', 'k-receipt-adjust')$$, 'only an earn carries a receipt number', '23514');
select tst.refused($$insert into public.ledger_entries (brand_id, member_id, store_id, employee_id, kind, points, amount_cents, receipt_number, idempotency_key) values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a', 'earn', 10, 100, '', 'k-receipt-empty')$$, 'a receipt number is not empty', '23514');
set role service_role;
insert into public.ledger_entries (brand_id, member_id, store_id, employee_id, kind, points, amount_cents, multiplier_pct, receipt_number, idempotency_key) values
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a', 'earn', 64, 640, 100, 'A-1234', 'k-late');
reset role;
select tst.eq((select count(*) from public.ledger_entries where receipt_number = 'A-1234'), 1, 'an earn stores its receipt number');

-- --------------------------------------------- server-only: wrong staff PINs
set role service_role;
insert into private.employee_pin_failures (brand_id, employee_id, caller_user_id, failed_at) values
  ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000c1', now());
select tst.eq((select count(*) from private.employee_pin_failures), 1, 'service role stores wrong PINs');
reset role;
select tst.refused($$insert into private.employee_pin_failures (brand_id, employee_id, failed_at) values ('10000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-00000000000a', now())$$, 'a wrong PIN belongs to the employee''s brand', '23503');
select tst.refused($$insert into private.employee_pin_failures (brand_id, employee_id, failed_at, locked_until) values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a', now(), now())$$, 'a lock ends after it starts', '23514');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
set role authenticated;
select tst.refused($$select count(*) from private.employee_pin_failures$$, 'store device cannot read wrong PINs');
select tst.refused($$delete from private.employee_pin_failures$$, 'store device cannot clear a PIN lock');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', false);
set role authenticated;
select tst.refused($$select count(*) from private.employee_pin_failures$$, 'even HQ cannot read wrong PINs');
reset role;
select set_config('request.jwt.claim.sub', '', false);
set role anon;
select tst.refused($$select count(*) from private.employee_pin_failures$$, 'anonymous cannot read wrong PINs');
reset role;

-- ---------------------------------------------- account deletion (v0.4)
-- Member 4 (store A) has an earn, a used code at store A, a pending code, a
-- gift, a QR secret and an audit row of their own; then deletes the account
-- the way packages/server deleteMember does.
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000a4'); -- member 4
set role service_role;
insert into public.members (id, brand_id, user_id, first_name, last_name, email, phone, birthday, consent_email, joined_store_id) values
  ('40000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a4', 'Maria', 'P.', 'maria@example.com', '+306900000004', '1990-02-03', true, '20000000-0000-0000-0000-00000000000a');
insert into public.member_secrets (member_id) values ('40000000-0000-0000-0000-000000000004');
insert into public.ledger_entries (brand_id, member_id, store_id, employee_id, kind, points, amount_cents, multiplier_pct, idempotency_key, created_by) values
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a', 'earn', 700, 7000, 100, 'k-del-earn', '00000000-0000-0000-0000-0000000000c1');
insert into public.redemptions (id, brand_id, member_id, reward_id, code, points_spent, status, created_at, expires_at, used_at, used_store_id, used_employee_id)
  select '60000000-0000-0000-0000-000000000041', brand_id, '40000000-0000-0000-0000-000000000004', id, 'DELUSEDA', 300, 'used', now() - interval '1 hour', now() - interval '45 minutes', now() - interval '50 minutes', '20000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a'
  from public.rewards where name_en = 'Free espresso';
insert into public.redemptions (id, brand_id, member_id, reward_id, code, points_spent, created_at, expires_at)
  select '60000000-0000-0000-0000-000000000042', brand_id, '40000000-0000-0000-0000-000000000004', id, 'DELPENDA', 300, now(), now() + interval '15 minutes'
  from public.rewards where name_en = 'Free espresso';
-- The member's own redemptions: created_by is the member's auth user.
insert into public.ledger_entries (brand_id, member_id, kind, points, redemption_id, idempotency_key, created_by) values
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000004', 'redeem', -300, '60000000-0000-0000-0000-000000000041', 'k-del-redeem-1', '00000000-0000-0000-0000-0000000000a4'),
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000004', 'redeem', -300, '60000000-0000-0000-0000-000000000042', 'k-del-redeem-2', '00000000-0000-0000-0000-0000000000a4');
insert into public.member_gifts (brand_id, member_id, kind, reward_id, unlocked_at, expires_at) values
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000004', 'welcome', '50000000-0000-0000-0000-0000000000c1', now(), now() + interval '30 days');
insert into public.audit_log (brand_id, actor_user_id, action, entity, entity_id) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a4', 'member.join', 'members', '40000000-0000-0000-0000-000000000004');
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
set role authenticated;
select tst.eq((select count(*) from public.ledger_entries where member_id = '40000000-0000-0000-0000-000000000004'), 1, 'store A device sees the member''s earn at its store');
select tst.eq((select count(*) from public.redemptions where member_id = '40000000-0000-0000-0000-000000000004'), 1, 'store A device sees the code used at its store');
reset role;

-- Marking a member deleted without wiping the personal fields is refused.
set role service_role;
select tst.refused($$update public.members set deleted_at = now() where id = '40000000-0000-0000-0000-000000000004'$$, 'a deleted member keeps no personal data', '23514');
select tst.refused($$update public.members set deleted_at = now(), user_id = null, first_name = '', last_name = null, email = null, phone = null, birthday = null, referral_code = null where id = '40000000-0000-0000-0000-000000000004'$$, 'a deleted member keeps no consents either', '23514');
-- deleteMember: cancel the pending code (no refund), close the gift, wipe, drop the QR secret.
update public.redemptions set status = 'cancelled', cancelled_at = now()
  where member_id = '40000000-0000-0000-0000-000000000004' and status = 'pending';
update public.member_gifts set status = 'expired', redemption_id = null
  where member_id = '40000000-0000-0000-0000-000000000004' and status = 'available';
update public.members set
  user_id = null, first_name = '', last_name = null, email = null, phone = null, birthday = null,
  referral_code = null, consent_email = false, consent_sms = false, consent_push = false, deleted_at = now()
  where id = '40000000-0000-0000-0000-000000000004';
delete from public.member_secrets where member_id = '40000000-0000-0000-0000-000000000004';
reset role;
-- The auth user can go although the append-only ledger and audit log name it.
delete from auth.users where id = '00000000-0000-0000-0000-0000000000a4';
select tst.eq((select count(*) from auth.users where id = '00000000-0000-0000-0000-0000000000a4'), 0, 'an auth user with ledger and audit rows can be deleted');
select tst.eq((select count(*) from public.ledger_entries where member_id = '40000000-0000-0000-0000-000000000004'), 3, 'the deleted member''s ledger stays');
select tst.eq((select count(*) from public.ledger_entries where created_by = '00000000-0000-0000-0000-0000000000a4'), 2, 'ledger rows keep the id of who made them');

-- The former member (their access token can live on for up to an hour).
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a4', false);
set role authenticated;
select tst.eq((select count(*) from public.members), 0, 'a deleted member cannot read their old profile');
select tst.eq((select count(*) from public.ledger_entries), 0, 'a deleted member cannot read their old ledger');
select tst.eq((select count(*) from public.redemptions), 0, 'a deleted member cannot read their old codes');
select tst.eq((select count(*) from public.member_gifts), 0, 'a deleted member cannot read their old gifts');
select tst.eq((select count(*) from public.member_balances), 0, 'a deleted member has no balance to read');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
set role authenticated;
select tst.eq((select least(count(*), 1) from public.ledger_entries where member_id = '40000000-0000-0000-0000-000000000004'), 1, 'store device still sees a deleted member''s entries (no personal data in them)');
select tst.eq((select count(*) from public.members where id = '40000000-0000-0000-0000-000000000004'), 0, 'store device cannot see the deleted member row');
select tst.eq((select count(*) from public.ledger_entries where member_id = '40000000-0000-0000-0000-000000000001'), 3, 'store device still sees other members'' entries');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', false);
set role authenticated;
select tst.eq((select count(*) from public.members where id = '40000000-0000-0000-0000-000000000004' and first_name = '' and email is null and deleted_at is not null), 1, 'HQ still sees the wiped member row');
select tst.eq((select count(*) from public.ledger_entries where member_id = '40000000-0000-0000-0000-000000000004'), 3, 'HQ still sees a deleted member''s ledger');
select tst.eq((select count(*) from public.redemptions where member_id = '40000000-0000-0000-0000-000000000004'), 2, 'HQ still sees a deleted member''s codes');
select tst.eq((select balance from public.member_balances where member_id = '40000000-0000-0000-0000-000000000004'), 100, 'the cancelled code''s points were not returned (700 - 300 - 300)');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false);
set role authenticated;
select tst.eq((select count(*) from public.members where deleted_at is not null), 1, 'platform admin sees deleted members');
reset role;
select tst.eq((select count(*) from public.member_secrets where member_id = '40000000-0000-0000-0000-000000000004'), 0, 'the QR secret is gone');


-- ------------------------------------------------ store names in English (v0.4)
set role service_role;
update public.stores set name_en = 'Overoll Praxitelous', address_en = 'Praxitelous 27, Athens'
  where id = '20000000-0000-0000-0000-00000000000a';
reset role;
select set_config('request.jwt.claim.sub', '', false);
set role anon;
select tst.eq((select count(*) from public.stores where name_en = 'Overoll Praxitelous' and address_en is not null), 1, 'anyone reads the English store name and address');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
set role authenticated;
select tst.refused($$update public.stores set name_en = 'Hacked' where id = '20000000-0000-0000-0000-00000000000a'$$, 'a member cannot rename a store');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
set role authenticated;
select tst.refused($$update public.stores set name_en = 'Hacked' where id = '20000000-0000-0000-0000-00000000000a'$$, 'a store device cannot rename its store');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', false);
set role authenticated;
select tst.refused($$update public.stores set name_en = 'Overoll Aigaleo' where id = '20000000-0000-0000-0000-00000000000b'$$, 'HQ renames stores through the API only (v0.6)');
reset role;
set role service_role;
update public.stores set name_en = 'Overoll Aigaleo' where id = '20000000-0000-0000-0000-00000000000b';
select tst.eq((select count(*) from public.stores where name_en = 'Overoll Aigaleo'), 1, 'the API (service role) sets the English store name');
select tst.refused($$update public.stores set name_en = '  ' where id = '20000000-0000-0000-0000-00000000000b'$$, 'an English store name is not blank', '23514');
reset role;

-- ---------------------------------------------------- back office (v0.5)
-- Staff emails on their roles: lower case, read by HQ, not by members or devices of other stores.
set role service_role;
update public.staff_roles set email = 'till-a@example.com' where user_id = '00000000-0000-0000-0000-0000000000c1';
reset role;
select tst.refused($$update public.staff_roles set email = 'Till-A@Example.com' where user_id = '00000000-0000-0000-0000-0000000000c1'$$, 'a staff email is stored in lower case', '23514');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', false);
set role authenticated;
select tst.eq((select count(*) from public.staff_roles where email = 'till-a@example.com'), 1, 'HQ reads the email of its till devices');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
set role authenticated;
select tst.eq((select count(*) from public.staff_roles where email is not null), 0, 'a member reads no staff emails');
reset role;

-- Dashboard numbers: what the caller's row-level security lets them count.
select set_config('tst.brand_points', (
  select coalesce(sum(points), 0)::text from public.ledger_entries
  where brand_id = '10000000-0000-0000-0000-000000000001' and store_id is not null and kind in ('earn', 'reverse')), false);
select set_config('tst.store_a_points', (
  select coalesce(sum(points), 0)::text from public.ledger_entries
  where store_id = '20000000-0000-0000-0000-00000000000a' and kind in ('earn', 'reverse')), false);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', false);
set role authenticated;
select tst.eq((select sum(net_points)::bigint from public.dashboard_stats('2000-01-01')), current_setting('tst.brand_points')::bigint, 'HQ dashboard counts its brand points');
select tst.eq((select count(*) from public.dashboard_stats('2000-01-01') where store_id = '20000000-0000-0000-0000-00000000000f'), 0, 'HQ dashboard leaves other brands out');
select tst.eq((select sum(members_joined)::bigint from public.dashboard_stats('2000-01-01')), (select count(*) from public.members), 'HQ dashboard counts the members who joined');
select tst.eq((select count(*) from public.dashboard_stats('2999-01-01')), 0, 'nothing since a future date');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
set role authenticated;
select tst.eq((select count(*) from public.dashboard_stats('2000-01-01') where store_id is distinct from '20000000-0000-0000-0000-00000000000a'), 0, 'a till device counts only its store');
select tst.eq((select sum(net_points)::bigint from public.dashboard_stats('2000-01-01')), current_setting('tst.store_a_points')::bigint, 'a till device counts its store points');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
set role authenticated;
select tst.eq((select count(*) from public.dashboard_stats('2000-01-01')), 0, 'a member gets no dashboard (not even their own entries)');
reset role;
select set_config('request.jwt.claim.sub', '', false);
set role anon;
select tst.refused($$select * from public.dashboard_stats('2000-01-01')$$, 'anonymous cannot call the dashboard');
reset role;

-- ------------------------------------------------------ store report (v0.6)
-- A code for a reward HQ has since switched off, used at Aigaleo (store b) by Nikos.
set role service_role;
insert into public.redemptions (brand_id, member_id, reward_id, code, points_spent, expires_at, status, used_at, used_store_id, used_employee_id, value_cents)
  select brand_id, '40000000-0000-0000-0000-000000000002', id, 'RPRTAAAA', 400, now() + interval '15 minutes', 'used', now(),
    '20000000-0000-0000-0000-00000000000b', '30000000-0000-0000-0000-00000000000b', 250
  from public.rewards where name_en = 'Retired';
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', false);
set role authenticated;
select tst.eq((select count(*) from public.store_report('20000000-0000-0000-0000-00000000000b', now() - interval '1 day', now() + interval '1 day')
               where reward_name_en = 'Retired' and employee_name = 'Nikos' and used = 1 and points = 400 and value_cents = 250), 1,
              'the store manager gets the report, with the value at the time of use and switched-off rewards named');
select tst.eq((select count(*) from public.store_report('20000000-0000-0000-0000-00000000000a', now() - interval '1 day', now() + interval '1 day')), 0, 'a manager gets nothing for another store');
select tst.eq((select count(*) from public.rewards where not active), 1, 'a store manager reads switched-off rewards of the brand');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', false);
set role authenticated;
select tst.eq((select sum(used)::bigint from public.store_report('20000000-0000-0000-0000-00000000000b', now() - interval '1 day', now() + interval '1 day')), 1::bigint, 'HQ gets any store report of the brand');
select tst.eq((select count(*) from public.store_report('20000000-0000-0000-0000-00000000000b', now() + interval '1 day', now() + interval '2 days')), 0, 'only codes used inside the period');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
set role authenticated;
select tst.eq((select count(*) from public.store_report('20000000-0000-0000-0000-00000000000b', now() - interval '1 day', now() + interval '1 day')), 0, 'a till device gets no report of another store');
select tst.eq((select count(*) from public.store_report('20000000-0000-0000-0000-00000000000a', now() - interval '1 day', now() + interval '1 day')), 0, 'a till device gets no report, even of its own store');
select tst.eq((select count(*) from public.rewards where name_en = 'Retired'), 1, 'a till device reads switched-off rewards (names of older codes)');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
set role authenticated;
select tst.eq((select count(*) from public.store_report('20000000-0000-0000-0000-00000000000b', now() - interval '1 day', now() + interval '1 day')), 0, 'a member gets no store report');
select tst.eq((select count(*) from public.rewards where not active), 0, 'members still see active rewards only');
reset role;
select set_config('request.jwt.claim.sub', '', false);
set role anon;
select tst.refused($$select * from public.store_report('20000000-0000-0000-0000-00000000000b', now() - interval '1 day', now())$$, 'anonymous cannot call the store report');
select tst.eq((select count(*) from public.rewards where not active), 0, 'visitors see active rewards only');
reset role;

-- --------------------------------------------------- Wallet passes (v0.7)
-- Apple device registrations (push tokens) are server-only; a ledger entry or a
-- new tier moves the member's wallet_changed_at.
insert into public.wallet_apple_devices (device_library_id, member_id, brand_id, push_token)
  values ('device-eleni', '40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'push-token-eleni');
select tst.refused($$insert into public.wallet_apple_devices (device_library_id, member_id, brand_id, push_token)
  values ('device-x', '40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'x')$$,
  'a device registration cannot point at a member of another brand', '23503');
update public.member_secrets set wallet_changed_at = now() - interval '1 day', wallet_sent_at = now() - interval '1 day'
  where member_id = '40000000-0000-0000-0000-000000000001';
insert into public.ledger_entries (brand_id, member_id, kind, points, reason, idempotency_key)
  values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'bonus', 5, 'wallet test', 'k-wallet-bonus');
select tst.eq((select count(*) from public.member_secrets where member_id = '40000000-0000-0000-0000-000000000001'
               and wallet_changed_at > wallet_sent_at), 1, 'a ledger entry marks the Wallet pass as changed');
update public.member_secrets set wallet_sent_at = wallet_changed_at where member_id = '40000000-0000-0000-0000-000000000001';
update public.members set consent_email = not consent_email where id = '40000000-0000-0000-0000-000000000001';
select tst.eq((select count(*) from public.member_secrets where member_id = '40000000-0000-0000-0000-000000000001'
               and wallet_changed_at > wallet_sent_at), 0, 'a change the pass does not show leaves it alone');
update public.members set tier = 'gold' where id = '40000000-0000-0000-0000-000000000001';
select tst.eq((select count(*) from public.member_secrets where member_id = '40000000-0000-0000-0000-000000000001'
               and wallet_changed_at > wallet_sent_at), 1, 'a new tier marks the Wallet pass as changed');
update public.members set tier = 'classic' where id = '40000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
set role authenticated;
select tst.refused($$select * from public.wallet_apple_devices$$, 'a member cannot read Wallet device registrations');
select tst.refused($$insert into public.wallet_apple_devices (device_library_id, member_id, brand_id, push_token)
  values ('mine', '40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 't')$$, 'a member cannot register a device');
select tst.eq((select count(*) from public.member_secrets where wallet_changed_at is not null), 1, 'the member reads their own pass timestamps only');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', false);
set role authenticated;
select tst.refused($$select * from public.wallet_apple_devices$$, 'HQ cannot read Wallet device registrations');
reset role;
select set_config('request.jwt.claim.sub', '', false);
set role anon;
select tst.refused($$select * from public.wallet_apple_devices$$, 'anonymous cannot read Wallet device registrations');
reset role;

-- Push notifications (v0.9): devices and the outbox are server-only; HQ reads its brand's messages.
insert into public.push_devices (brand_id, member_id, token, platform)
  values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'ExponentPushToken[rls-test-token-1]', 'ios');
select tst.refused($$insert into public.push_devices (brand_id, member_id, token, platform)
  values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003', 'ExponentPushToken[rls-test-token-2]', 'ios')$$,
  'a push device cannot point at a member of another brand', '23503');
select tst.refused($$insert into public.push_devices (brand_id, member_id, token, platform)
  values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'not-a-token', 'ios')$$,
  'only Expo push tokens are stored', '23514');
insert into public.push_campaigns (id, brand_id, title_el, body_el)
  values ('70000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Τίτλος', 'Κείμενο');
select tst.refused($$insert into public.push_campaigns (brand_id, title_el, body_el, title_en)
  values ('10000000-0000-0000-0000-000000000001', 'Τίτλος', 'Κείμενο', 'Title only')$$,
  'English text comes as a title and a text together', '23514');
insert into public.push_outbox (brand_id, member_id, kind, ref, campaign_id)
  values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'message',
          'rls-1', '70000000-0000-0000-0000-000000000001');
select tst.refused($$insert into public.push_outbox (brand_id, member_id, kind, ref)
  values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'message', 'rls-2')$$,
  'an HQ message in the outbox names its campaign', '23514');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
set role authenticated;
select tst.refused($$select * from public.push_devices$$, 'a member cannot read push devices');
select tst.refused($$select * from public.push_outbox$$, 'a member cannot read the push outbox');
select tst.refused($$insert into public.push_devices (brand_id, member_id, token, platform)
  values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'ExponentPushToken[rls-test-token-3]', 'ios')$$,
  'a member registers a phone only through the API');
select tst.eq((select count(*) from public.push_campaigns), 0, 'a member sees no HQ messages');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', false);
set role authenticated;
select tst.eq((select count(*) from public.push_campaigns), 1, 'HQ reads its brand''s messages');
select tst.refused($$insert into public.push_campaigns (brand_id, title_el, body_el)
  values ('10000000-0000-0000-0000-000000000001', 'x', 'y')$$, 'HQ sends messages only through the API');
select tst.refused($$select * from public.push_outbox$$, 'HQ cannot read the push outbox');
reset role;
select set_config('request.jwt.claim.sub', '', false);
set role anon;
select tst.refused($$select * from public.push_campaigns$$, 'anonymous cannot read HQ messages');
reset role;

select tst.eq((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
               where n.nspname in ('public', 'private') and c.relkind = 'r' and not c.relrowsecurity), 0,
              'every table in public and private has row-level security on');

\echo ALL RLS TESTS PASSED
