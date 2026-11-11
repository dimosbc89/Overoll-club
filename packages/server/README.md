# @overoll/server

The operations that move points: join, scan, award, undo, redeem, cancel, use and expire codes, check a cashier's PIN, expire points, delete an account. `packages/api` serves them over HTTP (Supabase Edge Function `api`); this package holds the logic and its tests.

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
| `resolveMemberToken` | device or manager of the store, HQ, platform | `callerUserId, storeId`, `token` **or** `memberCode` (typed, v0.4) | `memberId, memberCode, firstName, tier, balance` | `forbidden, invalid_token, expired_token, old_pass, member_not_found, member_deleted` |
| `awardPoints` | device or manager of the store | `callerUserId, storeId, employeeId, pin, member {memberId} or {token}, amountCents`, optional `receiptNumber` (late points), `idempotencyKey` | `entryId, memberId, points, balance, tier, tierChanged, welcomeGiftUnlocked` | `forbidden, store_inactive, employee_not_found, bad_pin, pin_locked, amount_not_integer, amount_not_positive, amount_over_limit, amount_too_small, receipt_already_used, too_soon_after_last_earn, daily_earn_limit_reached`, and the token errors (`member_deleted` included) |
| `undoEarn` | device of the store (within 10 min, with PIN), store manager, HQ, platform | `callerUserId, entryId, employee? {employeeId, pin}, idempotencyKey` | `entryId, reversedEntryId, memberId, points, balance` | `forbidden, not_found, not_undoable, already_undone, undo_window_passed, employee_required, employee_not_found, bad_pin, pin_locked` |
| `createRedemption` | the member | `callerUserId, memberId`, `rewardId` **or** `giftId`, `idempotencyKey` | `redemptionId, code, rewardId, pointsSpent` (0 for a gift)`, expiresAt, balance` | `forbidden, member_not_found, member_deleted, reward_not_found, reward_unavailable, tier_too_low, insufficient_points, gift_not_found, gift_used, gift_expired` |
| `cancelRedemption` | the member | `callerUserId, redemptionId, idempotencyKey` | `redemptionId, pointsRefunded` (0 for a gift: the gift comes back)`, balance` | `forbidden, not_found, already_used, cancelled, expired` |
| `useRedemption` | device or manager of the store | `callerUserId, storeId, employeeId, pin, code, idempotencyKey` | `redemptionId, memberId, memberFirstName, rewardId, rewardNameEl, rewardNameEn, pointsSpent, usedAt` | `forbidden, store_inactive, employee_not_found, bad_pin, pin_locked, not_found, expired, already_used, cancelled` |
| `verifyEmployeePin` | device or manager of the store | `callerUserId, storeId, employeeId, pin` (no idempotency key: moves nothing) | `employee {id, displayName}` | `forbidden, employee_not_found, bad_pin, pin_locked` |
| `expireRedemptions` | job, every minute (all brands) | `now?, batchSize?` | `expired, redemptionIds, giftsExpired, giftIds` | none |
| `expirePoints` | job, daily (all brands) | `now?, batchSize?` | `expired, memberIds, pointsExpired` | none |
| `deleteMember` | the signed-in user, for their own account (v0.4) | `callerUserId, confirm: true, idempotencyKey` | `memberIds, codesCancelled, authUserDeleted` | `forbidden` (staff accounts) |
| `createEmployee` | store manager, HQ, platform (v0.5) | `callerUserId, storeId, displayName, pin, idempotencyKey` | `employee {id, storeId, displayName, active}` | `forbidden, store_not_found, pin_format, pin_too_simple` |
| `updateEmployee` | store manager, HQ, platform (v0.5) | `callerUserId, employeeId`, any of `displayName, active, pin` (no key: setting values again is harmless) | `employee` | `forbidden, not_found, pin_format, pin_too_simple` |
| `addStaff` | HQ, platform (v0.5) | `callerUserId, role, storeId` (store roles) or `brandId` (`hq_admin`), `email`; deps `ensureAuthUser(email)` | `staff {id, userId, role, brandId, storeId, email}, created` | `forbidden, store_not_found, brand_not_found, device_in_other_store` |
| `removeStaff` | HQ, platform (v0.5) | `callerUserId, staffId` | `removed` | `forbidden, not_found, last_hq_admin` |
| `adjustPoints` | HQ, platform (v0.5) | `callerUserId, memberId, points, reason, idempotencyKey` | `entryId, memberId, points, balance` | `member_not_found` (also for callers outside the brand), `member_deleted` |

`ErrorCode` is the union of every code; each operation also exports its own (`AwardPointsError`, ...).

## How every write works

- **One transaction** (`sql.begin`). The member row is locked (`select ... for update`) before limits or balances are checked, so concurrent calls for one member run one after the other.
- **Idempotency.** The key is locked for the transaction, then looked up in `private.idempotency_keys`. A stored result is returned unchanged, even if a fresh call would now fail (for example a retry after the undo window). A successful result is stored with its writes. Failures are not stored: they wrote nothing. Ledger entries get `<operation>:<key>` as their `idempotency_key`.
- **Audit.** Every successful write adds an `audit_log` row (`member.join`, `member.delete`, `points.award`, `points.undo`, `points.expire`, `redemption.create|cancel|use|expire`, `gift.unlock|expire`, `employee.pin_lock`). `resolveMemberToken` only reads and writes nothing.
- **Writes on a failure.** Two failures still write, and the transaction commits because the failure is returned, not thrown: a wrong PIN (`bad_pin` / `pin_locked`, stored for the lockout) and a gift found past its expiry (`gift_expired`, marked expired).
- **Lock order.** Employee PIN lock → idempotency key → member → gift / receipt. Every operation takes them in this order, so concurrent calls never deadlock. (`deleteMember` takes no idempotency lock: it locks the user's member rows in id order, then their gifts and codes.)
- **Errors.** Expected business failures are returned. Bugs and infrastructure problems throw, including an invalid `brands.config` (`InvalidConfigError`).

## Decisions

- **Undone earns don't count towards the fraud limits** (2-minute rule and 5 per Athens day), so a cashier can fix a typo straight away. Undoing doesn't earn anything, so award/undo cycles gain nothing. The "same employee + same member" alert will catch abuse.
- The calendar day for the daily limit is the brand's `time_zone` (`Europe/Athens`).
- A purchase that earns 0 points (a few cents) is refused with `amount_too_small`; the ledger doesn't allow zero entries.
- Employee errors: `employee_not_found` (not an active employee of this store), `bad_pin` (wrong PIN).
- Undo never lowers the tier (only the annual review does), and it leaves `last_purchase_at` as it is.
- A pending code past its expiry can't be used (`expired`); the job marks it expired and returns the points.

### Welcome gift (v0.2)

- **Which reward:** `brands.config.welcome.rewardId` (core config, a UUID). Explicit, no guessing by price or name; without it the brand has no welcome gift (that is the on/off switch). The seed sets it to the reward named in `data/overoll/rewards.json` → `welcome_reward.reward` (the butter croissant, `md5('overoll:reward:butter-croissant')`). A `rewardId` that is not one of the brand's rewards throws `InvalidConfigError` at the first earn, like any other bad config. The reward's `active` flag doesn't matter: the gift was promised.
- **When:** the member's first earn ever unlocks it (`welcomeGiftUnlocked: true`). Only that one: a member whose first earn came before the gift was switched on never gets one. One `member_gifts` row per member and kind, ever (unique index); undoing the unlocking earn **keeps the gift**. Decided this way because an undo is usually a typo fix followed by the right amount, and taking the gift back would need a rule for a gift already redeemed. A member who deletes their account and joins again is a new member and gets a new gift (follows the rejoining decision).
- **Redeeming:** `createRedemption` with `giftId`: the caller's own gift (else `gift_not_found`), `available` (else `gift_used`, also while a code is pending) and before `expires_at` (else `gift_expired`). The code is a normal 15-minute code with `points_spent = 0`, `gift_id` set and no ledger entry; the gift becomes `redeemed`. Used: stays `redeemed`. Cancelled or expired unused: back to `available`, or `expired` if the gift's own 30 days are over. A code made in time works for its 15 minutes even past the gift's expiry.
- **Expiry:** an `available` gift past `expires_at` counts as expired at once (core `giftStatusAt`, also for apps reading `member_gifts`); `createRedemption` marks it, and `expireRedemptions` marks the rest every minute.

### Late points (v0.2)

- `receiptNumber` is normalised by core `normalizeReceiptNumber` (trim, upper case, accents off, Greek capitals that look Latin → Latin, so `Α-12` and `a-12` are the same receipt) and stored on the earn (`ledger_entries.receipt_number`).
- One receipt earns once per **store** per **calendar day in the brand's time zone** (core `receiptUsedToday`), for any member. An earn that was undone frees the receipt, so a wrong amount can be fixed. All other limits still apply. That the receipt is from today and this store is the cashier's check (the server can't see the receipt).
- Race-safe without a unique index (the ledger is append-only, so an undone earn would block it forever): an advisory lock on store + day + receipt, taken after the member lock, then a lookup.

### Staff PIN lockout (v0.2)

- Every PIN check (`awardPoints`, `undoEarn` with an employee, `useRedemption`, `verifyEmployeePin`) goes through one function. Wrong PINs are stored in `private.employee_pin_failures`; the `limits.pinMaxAttempts`th (5) within `limits.pinLockMinutes` (15) locks that employee for `limits.pinLockMinutes` from that moment and already answers `pin_locked`. Sliding window (core `staff-pin.ts`).
- While locked, PINs aren't checked, counted or extending the lock. After a lock, counting starts from zero.
- **The right PIN clears the count** (deliberate refinement of "5 wrong within 15 minutes": a cashier who mistypes now and then over a shift is never locked out; a guesser never types the right PIN, so it changes nothing for them).
- The lock is per employee, across all devices. A lock adds an `employee.pin_lock` audit row for HQ. A manager or HQ can still undo without a PIN.

### Points expiry (v0.2)

- Points expire `expiryMonths` after the last purchase (core `pointsExpireAt`, calendar months, month ends clamped). A member who never bought anything counts from joining (`created_at`). One `expire` entry takes the whole positive balance off.
- Idempotent per member and expiry date: ledger key `expire_points:<member id>:<expiry time>`. Points added afterwards without a purchase (an HQ adjustment) are not expired again until a new purchase has also lapsed.
- A member with a pending points code is skipped that run (the code resolves within 15 minutes; otherwise a refund after the expiry would bring points back). Gift codes don't block.
- Deleted members are included: their balance expires like anyone's, which keeps the outstanding-points total honest.

### Account deletion (v0.4)

- **What happens** (`deleteMember`, one transaction, member rows locked): unused gifts (available, or held by a pending code) → `expired`; pending codes → `cancelled` **without** a `refund_redeem` (the account is closing; spec: old points are not restored); personal fields wiped (`first_name` `''`, `last_name`, `email`, `phone`, `birthday`, `referral_code`, `user_id` → null, consents off) and `deleted_at` set; `member_secrets` deleted; `private.idempotency_keys`: the user's own rows deleted (join keeps name, email, phone, birthday in its fingerprint), `firstName` / `memberFirstName` emptied in the till's stored results; `audit_log` `member.delete` (`codesCancelled`, `giftsClosed`, `pointsLeft`); then the auth user.
- **Kept**: the ledger (append-only), `member_code` (random, lets HQ follow the ledger), tier, locale, stores, timestamps. The balance left expires with `expirePoints` (12 months after the last purchase). The database refuses a deleted member with personal data left (`member_deleted_wiped` check).
- **Auth user**: `delete from auth.users` inside a savepoint. In production the server connects as `postgres` (SUPABASE_DB_URL), which may do this; `members.user_id` and `idempotency_keys.actor_user_id` go to null with it, and `ledger_entries.created_by` / `audit_log.actor_user_id` keep the id (no longer foreign keys). If the role may not (42501), the result says `authUserDeleted: false` and `packages/api` deletes the user with the Auth admin API. The tests grant the service role delete on `auth.users` to stand in for `postgres`, and also run without it.
- **Retries**: no stored result. A second call finds no member left and answers `ok` with `memberIds: []` (and deletes the auth user if it is still there), so the app's retry after a network error is safe.
- **Staff accounts** (any `staff_roles` row) are refused with `forbidden`. A user who signed in but never joined only loses the auth user.
- **Afterwards**: `scan` / `award` with the old QR, Wallet code, typed code or member id → `member_deleted`; `createRedemption` → `member_deleted`, also when it was waiting for the member lock during the deletion. Joining again with the same email makes a new member (new code, 0 points, a new welcome gift).

### Typed member code (v0.4)

- `resolveMemberToken` takes `memberCode` instead of `token`: core `normalizeMemberCode` (case, spaces, dashes, Greek look-alike capitals), then a lookup by `member_code` in the caller's brand. No secret is checked: the code is printed on the card, the console shows the first name to check, and the result can only lead to points (`awardPoints` with the `memberId`). Something that can't be a member code is `invalid_token`.

## Tests

```bash
npm test -w @overoll/server   # or `npm test` from the repo root
```

`test/global-setup.ts` starts a throwaway PostgreSQL (`/usr/lib/postgresql/*/bin`, as user `postgres` when run as root) on a free port (never 55432/55433). It applies `supabase/tests/supabase-stub.sql` and every migration into a template database, and deletes everything afterwards. Each test file clones its own database. The operations connect as `service_role`, as in production.

## TODO (not in this package yet)

- Expiry reminders 30 and 7 days before (core `expiryReminderDue`); needs the notification channel.
- Scheduling: call `jobs/expire-redemptions` every minute and `jobs/expire-points` daily (pg_cron or a scheduler), with the service key.
- Alerts: same employee + same member more than 3 times a day; awards above €50.
- Remove old rows from `private.idempotency_keys` (for example after 30 days) and stale rows from `private.employee_pin_failures` (older than `pinLockMinutes`; harmless, the right PIN also clears them).
- Annual tier review on the join anniversary.
