# Contract between the apps and the server (v0.3, 9 Nov 2026)

Three workstreams build against this page at the same time: the server (`packages/core`, `packages/server`, `packages/api`, `supabase/`), the member app (`apps/mobile`) and the staff console (`apps/admin` → `/console`). Change it only together with all three.

Base URL: `{SUPABASE_URL}/functions/v1/api`. Every call: `POST`, JSON body, `Authorization: Bearer <user access token>`, `Content-Type: application/json`. Every write sends an `idempotencyKey` (a fresh UUID per user action; the SAME key when retrying the same action after a network error). Responses and status codes: `packages/api/README.md`. Error codes map to messages with `data/copy/errors.{el,en}.json`.

## Existing routes (unchanged)

`join`, `scan`, `award`, `undo`, `redemptions/create`, `redemptions/cancel`, `redemptions/use`, `jobs/expire-redemptions`: inputs and outputs in `packages/server/README.md`.

## New in v0.2 (server workstream builds them)

### Welcome gift
- New table `public.member_gifts` (`id uuid`, `brand_id`, `member_id`, `kind text` = `'welcome'`, `reward_id` → the butter croissant reward, `unlocked_at timestamptz`, `expires_at timestamptz` = unlocked + core `welcome.validDays`, `status` `'available' | 'redeemed' | 'expired'`, `redemption_id uuid null`). RLS: a member reads their own rows; HQ reads its brand; no client writes.
- `award` unlocks it on the member's first earn (one per member, ever). The `award` result gains `welcomeGiftUnlocked: boolean`.
- `redemptions/create` accepts EITHER `rewardId` OR `giftId`. With `giftId`: the gift must be the caller's, `available` and not expired; `pointsSpent` is 0 and no ledger entry is written; the code works like any other (15 minutes, `redemptions/use`). Cancel or expiry of that code puts the gift back to `available` (if the gift itself has not expired). New error codes: `gift_not_found`, `gift_used`, `gift_expired`.
- `redemptions` gains `gift_id uuid null`; `points_spent` may be 0 only when `gift_id` is set.

### Late points (forgotten card)
- `award` accepts optional `receiptNumber` (string, 1–40 chars, letters/digits/`-`/`/`). When given, the same receipt number can earn points only once per store per Athens calendar day (`receipt_already_used`). Late points are allowed only the same day, at the same store, and still obey all fraud limits.

### Staff PIN
- New route `staff/verify-pin`: input `{ storeId, employeeId, pin }` → `{ ok: true, employee: { id, displayName } }` or `forbidden | employee_not_found | bad_pin | pin_locked`. Caller: a device or manager of that store. The console calls it once per shift (and after a 5-minute idle lock, core `limits.staffPinIdleMinutes`), keeps the PIN in memory only, and sends it with each `award`, `undo` and `redemptions/use`.
- PIN guessing: 5 wrong PINs for one employee within 15 minutes lock that employee for 15 minutes (`pin_locked`) in every PIN-checking operation. Numbers live in core config (`limits.pinMaxAttempts`, `limits.pinLockMinutes`).

### Points expiry job
- `jobs/expire-points` (service key only): writes an `expire` entry for every member whose last purchase is more than `expiryMonths` ago and whose balance is above 0. Idempotent per member and expiry date.

## New in v0.3 (after the first build)

- `join` takes `confirmsMinimumAge: true` (the "I am 15 or older" box). A new member without it gets `invalid_input`; the server stores `members.minimum_age_confirmed_at`. Joining again as an existing member does not need it.
- `redemptions/create` returns `giftId` (the welcome gift the code redeems, or `null` for a reward bought with points).
- `jobs/*` also accept the scheduler's token (Vault secret `jobs_token`). pg_cron calls `jobs/expire-redemptions` every minute and `jobs/expire-points` daily at 01:15 UTC (`supabase/jobs.sql`).

## What the apps read directly (Supabase client, row-level security)

Member app (signed-in member): `members` (own row), `member_balances` (own), `member_secrets` (own: `qr_secret`, `pass_version` → core `createRotatingToken` for the QR, offline), `rewards` (active), `stores` (active), `member_gifts` (own), `redemptions` (own; a `pending` one not past `expires_at` is the active code), `ledger_entries` (own, history). Costs per tier: core `rewardCostForTier`; progress: core `nextRewardProgress`, `tierProgress`.

Staff console (signed-in device user with `store_device` for its store): `stores` (its store), `employees` (its store: id, display_name, active), `ledger_entries` and `redemptions` of its store (today's activity). Everything that writes goes through the routes above.

## Sign-in

Supabase Auth, passwordless one-time code to email (SMS later, provider to be chosen). Members: `signInWithOtp({ email, options: { shouldCreateUser: true } })` then `verifyOtp({ email, token, type: 'email' })`, then `POST join` (first time). Store devices: a Supabase user per device, created by HQ; signs in once with email + one-time code by the store manager.
