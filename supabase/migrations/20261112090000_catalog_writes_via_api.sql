-- Back office v0.6: HQ edits stores and the reward catalog through the API
-- (stores/create|update, rewards/create|update in packages/server/src/catalog.ts).
-- Those operations check the caller (HQ of the brand or platform admin), take a
-- reward's point cost from packages/core and write every change to the audit
-- log. So signed-in users no longer write these tables directly: the direct
-- insert/update rights and their row-level policies go. Reading is unchanged
-- (active stores and rewards are public; HQ also sees inactive ones).

drop policy if exists stores_hq_insert on public.stores;
drop policy if exists stores_hq_update on public.stores;
drop policy if exists rewards_hq_insert on public.rewards;
drop policy if exists rewards_hq_update on public.rewards;

revoke insert, update on public.stores from authenticated;
revoke insert, update on public.rewards from authenticated;
