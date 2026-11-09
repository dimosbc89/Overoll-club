-- English store names and addresses (data/stores.json name_en, address_en),
-- so the English console and member app don't show Greek names. `name` and
-- `address` stay the Greek ones; the apps show the English column in English
-- and fall back to the Greek one while it is empty. Filled by supabase/seed.sql
-- (re-run it after this migration; it is safe to run again).
--
-- Privileges and row-level security are the table's: anyone reads active
-- stores, HQ inserts and updates (table-level grants cover the new columns).

alter table public.stores
  add column name_en text check (name_en is null or btrim(name_en) <> ''),
  add column address_en text check (address_en is null or btrim(address_en) <> '');
