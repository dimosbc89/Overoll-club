-- Reward illustration (member app v2 screens): a key into the brand's
-- illustration set (apps/mobile/src/brand/<brand>Art.ts), e.g. 'espresso'.
-- Null: the app picks one by category. Readable like the rest of the row.
alter table public.rewards
  add column icon text check (icon is null or icon ~ '^[a-z0-9-]{1,40}$');
