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
insert into public.stores (brand_id, code, name, country) values ('10000000-0000-0000-0000-000000000001', 'nicosia', 'Nicosia', 'CY');
select tst.eq((select count(*) from public.stores where code = 'nicosia'), 1, 'HQ can add a store');
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

select tst.eq((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
               where n.nspname in ('public', 'private') and c.relkind = 'r' and not c.relrowsecurity), 0,
              'every table in public and private has row-level security on');

\echo ALL RLS TESTS PASSED
