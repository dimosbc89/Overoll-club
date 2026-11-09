# @overoll/server

The operations that move points: join, scan, award, undo, redeem, cancel, use and expire codes. They will be wrapped as Supabase Edge Functions; this package holds the logic and its tests.

- The operations run with the **service role** (row-level security bypassed), so each one checks the caller's rights itself against `public.staff_roles` and `public.members.user_id`.
- Every number and calculation comes from `@overoll/core`, using the brand's config (`brands.config` over `defaultConfig`, via core `resolveConfig`).
- They run in Node and Deno: ESM, no Node-only APIs in `src/` (a test checks this). They use [postgres.js](https://github.com/porsager/postgres) v3.

```ts
import postgres from 'postgres';
import { awardPoints } from '@overoll/server';

const sql = postgres(process.env.SUPABASE_DB_URL!); // no `types`/`transform` options
const result = await awardPoints(sql, {
  callerUserId, storeId, employeeId, pin,
  member: { token: scanned }, amountCents: 640,
  idempotencyKey: crypto.randomUUID(),
});
if (!result.ok) console.log(result.code); // e.g. 'too_soon_after_last_earn'
```

## Operations

Each one is `fn(sql, input)` and returns `{ ok: true, ... }` or `{ ok: false, code, message? }`. Every input also takes `now?: Date` (default: the current time), which is used for the rules and for every timestamp written. Malformed input returns `invalid_input`. Reusing an idempotency key for a different request returns `idempotency_conflict`.

| Operation | Caller | Input | Success | Error codes |
| --- | --- | --- | --- | --- |
| `joinMember` | the signed-in user | `userId, brandSlug, firstName`, optional `lastName, email, phone, birthday, locale, joinedStoreCode, consents {email, sms, push}, referralCode`, `idempotencyKey` | `memberId, memberCode, firstName, tier, locale, created` (false = already a member) | `brand_not_found, store_not_found, referral_not_found, email_taken, phone_taken, member_deleted` |
| `resolveMemberToken` | device or manager of the store, HQ, platform | `callerUserId, storeId, token` | `memberId, memberCode, firstName, tier, balance` | `forbidden, invalid_token, expired_token, old_pass, member_not_found` |
| `awardPoints` | device or manager of the store | `callerUserId, storeId, employeeId, pin, member {memberId} or {token}, amountCents, idempotencyKey` | `entryId, memberId, points, balance, tier, tierChanged` | `forbidden, store_inactive, employee_not_found, bad_pin, amount_not_integer, amount_not_positive, amount_over_limit, amount_too_small, too_soon_after_last_earn, daily_earn_limit_reached`, and the token errors |
| `undoEarn` | device of the store (within 10 min, with PIN), store manager, HQ, platform | `callerUserId, entryId, employee? {employeeId, pin}, idempotencyKey` | `entryId, reversedEntryId, memberId, points, balance` | `forbidden, not_found, not_undoable, already_undone, undo_window_passed, employee_required, employee_not_found, bad_pin` |
| `createRedemption` | the member | `callerUserId, memberId, rewardId, idempotencyKey` | `redemptionId, code, rewardId, pointsSpent, expiresAt, balance` | `forbidden, member_not_found, reward_not_found, reward_unavailable, tier_too_low, insufficient_points` |
| `cancelRedemption` | the member | `callerUserId, redemptionId, idempotencyKey` | `redemptionId, pointsRefunded, balance` | `forbidden, not_found, already_used, cancelled, expired` |
| `useRedemption` | device or manager of the store | `callerUserId, storeId, employeeId, pin, code, idempotencyKey` | `redemptionId, memberId, memberFirstName, rewardId, rewardNameEl, rewardNameEn, pointsSpent, usedAt` | `forbidden, store_inactive, employee_not_found, bad_pin, not_found, expired, already_used, cancelled` |
| `expireRedemptions` | job (all brands) | `now?, batchSize?` | `expired, redemptionIds` | none |

`ErrorCode` is the union of every code; each operation also exports its own (`AwardPointsError`, ...).

## How every write works

- **One transaction** (`sql.begin`). The member row is locked (`select ... for update`) before limits or balances are checked, so concurrent calls for one member run one after the other.
- **Idempotency.** The key is locked for the transaction, then looked up in `private.idempotency_keys`. A stored result is returned unchanged, even if a fresh call would now fail (for example a retry after the undo window). A successful result is stored with its writes. Failures are not stored: they wrote nothing. Ledger entries get `<operation>:<key>` as their `idempotency_key`.
- **Audit.** Every successful write adds an `audit_log` row (`member.join`, `points.award`, `points.undo`, `redemption.create|cancel|use|expire`). `resolveMemberToken` only reads and writes nothing.
- **Errors.** Expected business failures are returned. Bugs and infrastructure problems throw, including an invalid `brands.config` (`InvalidConfigError`).

## Decisions

- **Undone earns don't count towards the fraud limits** (2-minute rule and 5 per Athens day), so a cashier can fix a typo straight away. Undoing doesn't earn anything, so award/undo cycles gain nothing. The "same employee + same member" alert will catch abuse.
- The calendar day for the daily limit is the brand's `time_zone` (`Europe/Athens`).
- A purchase that earns 0 points (a few cents) is refused with `amount_too_small`; the ledger doesn't allow zero entries.
- Employee errors: `employee_not_found` (not an active employee of this store), `bad_pin` (wrong PIN).
- Undo never lowers the tier (only the annual review does), and it leaves `last_purchase_at` as it is.
- A pending code past its expiry can't be used (`expired`); the job marks it expired and returns the points.

## Tests

```bash
npm test -w @overoll/server   # or `npm test` from the repo root
```

`test/global-setup.ts` starts a throwaway PostgreSQL (`/usr/lib/postgresql/*/bin`, as user `postgres` when run as root) on a free port (never 55432/55433). It applies `supabase/tests/supabase-stub.sql` and every migration into a template database, and deletes everything afterwards. Each test file clones its own database. The operations connect as `service_role`, as in production.

## TODO (not in this package yet)

- Points expiry job: 12 months after the last purchase (core `pointsExpireAt`), plus the 30/7-day reminders.
- Welcome croissant after the first purchase.
- Alerts: same employee + same member more than 3 times a day; awards above €50.
- Lock out a PIN after repeated wrong attempts (the PIN is 4 digits).
- Remove old rows from `private.idempotency_keys` (for example after 30 days).
- Edge Function wrappers (Deno: map `@overoll/core` and `postgres` in an import map; the `.js` import suffixes need sloppy imports or a bundling step).
