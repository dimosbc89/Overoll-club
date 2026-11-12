# Contract between the apps and the server (v0.6, 12 Nov 2026)

Three workstreams build against this page at the same time: the server (`packages/core`, `packages/server`, `packages/api`, `supabase/`), the member app (`apps/mobile`) and the staff console (`apps/admin` → `/console`). Change it only together with all three.

Base URL: `{SUPABASE_URL}/functions/v1/api`. Every call: `POST`, JSON body, `Authorization: Bearer <user access token>`, `Content-Type: application/json`. Every write sends an `idempotencyKey` (a fresh UUID per user action; the SAME key when retrying the same action after a network error). Responses and status codes: `packages/api/README.md`. Error codes map to messages with `data/copy/errors.{el,en}.json`.

## Existing routes (unchanged)

`join`, `scan`, `award`, `undo`, `redemptions/create`, `redemptions/cancel`, `redemptions/use`, `jobs/expire-redemptions`: inputs and outputs in `packages/server/README.md`. (`scan` gains `memberCode` in v0.4.)

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

## New in v0.4 (account deletion, typed member code, English store names)

### Account deletion: `account/delete`
- Caller: the signed-in member (their own token). Body `{ confirm: true, idempotencyKey }`; without `confirm: true` → `invalid_input`. Staff accounts (any `staff_roles` row) → `forbidden`: HQ removes those.
- One transaction, under the member lock (`packages/server` `deleteMember`): pending codes are **cancelled and their points are not returned** (the account is closing; program spec "Rejoining": old points are not restored); an unused welcome gift is closed (`expired`); the personal fields are wiped (`first_name` = `''`, `last_name`, `email`, `phone`, `birthday`, `referral_code`, `user_id` → null, consents → false), `members.deleted_at` is set, `member_secrets` is deleted (app card, screenshots and Wallet pass stop working); stored request/results with personal data in `private.idempotency_keys` are removed or have the first name emptied; an `audit_log` row `member.delete`; last, the Supabase Auth user is deleted. The ledger stays (append-only) with no personal data; the balance left expires like anyone's (`jobs/expire-points`). No push tokens are stored yet; when they are, this operation deletes them too.
- Result `{ ok, memberIds, codesCancelled, authUserDeleted }`. Retries are safe without a stored result: a second call finds nothing left (`memberIds: []`) and answers `ok` again.
- Auth user: deleted inside the database transaction (the Edge Function connects as `postgres`). If that role may not delete from `auth.users`, the server returns `authUserDeleted: false` and the Edge Function deletes the user with the Auth admin API (service key); if that fails the route answers 500 and a retry finishes it. The response the app sees always has `authUserDeleted: true`.
- The member app signs out on the device after `ok` (the access token itself stays valid until it expires, but row-level security shows a deleted member nothing). On a retry after `network_error` / `internal_error`, `unauthenticated` means the first attempt went through.
- Rejoining with the same email later works: signing in creates a new auth user, `join` creates a new member (new member code, 0 points, a new welcome gift after the first purchase).
- A deleted member at the till: `scan` (QR, Wallet or typed code) and `award` answer `member_deleted`; `redemptions/create` answers `member_deleted` too. Row-level security: a deleted member's personal rows (`members`, `member_secrets`, `member_gifts`) are readable by HQ and platform admins only. Their `ledger_entries` and used `redemptions` hold no personal data, so the store keeps seeing them in its activity and reports; the member can no longer read anything.
- Database: `ledger_entries.created_by` and `audit_log.actor_user_id` keep the user id but are no longer foreign keys (so an auth user can be deleted while the append-only tables name it); a check constraint `member_deleted_wiped` refuses a deleted member that still has personal data.

### Typed member code at the till: `scan` with `memberCode`
- `scan` takes `{ storeId, token }` **or** `{ storeId, memberCode }` (exactly one, else `invalid_input`). `memberCode` is the code printed under the QR, shown in groups of 4 ("ABCD 2345"). Case, spaces, dashes and Greek capitals that look Latin (Α Β Ε Ζ Η Ι Κ Μ Ν Ο Ρ Τ Υ Χ) don't matter (core `normalizeMemberCode`). Same callers and same result as a QR scan. Errors: `invalid_token` (can't be a member code), `member_not_found`, `member_deleted`.
- Why this is safe enough: the member code is public (it is printed on the card), so a typed code only identifies the member. The console shows the first name to check (`console.member.check`) and then awards with `member: { memberId }` as after any scan. It can't spend anything: rewards always need a redemption code made in the member's app. The rotating QR stays the normal way; the Wallet pass was already a static code.
- `award` is unchanged (`member: { memberId }` or `{ token }`).
- Redemption codes typed at the till now also accept Greek look-alike capitals and any dash (core `normalizeRedemptionCode`).
- Console: the typed field on the scan screen takes the full `OC1.…` token, the member code or a reward code. A typed 8-character code is looked up as a member code first; on `member_not_found`, if it can be a reward code, the console opens Redeem with it. A code read by the camera that is not a member token still opens Redeem directly (a member card's QR is always a token).

### English store names
- `stores.name_en`, `stores.address_en` (text, null or not blank), filled by `supabase/seed/<brand>.sql` from `data/overoll/stores.json`. `name` / `address` stay Greek. The apps show the English one in English and fall back to Greek. Same access as the rest of `stores` (anyone reads active stores, HQ edits).

### Error codes
- No new code. `member_deleted` (already in the union) is now also returned by `scan`, `award` and `redemptions/create`; its text changed (it is shown at the till) and so did `member_not_found` ("check the code"): copy deck §f2, to approve.

## New in v0.5 (back office for HQ and store managers)

Migration `20261111170000_back_office`. Callers sign in at `/sign-in` of the back office (one-time code to email; a new email gets a bare Auth user with no role, which sees "no access").

| Route | Who | Body | Returns |
| --- | --- | --- | --- |
| `staff/employees/create` | HQ of the brand, the store's manager, platform admin | `storeId`, `displayName` (1–40), `pin`, `idempotencyKey` | `employee { id, storeId, displayName, active }` |
| `staff/employees/update` | same | `employeeId`, any of `displayName`, `active`, `pin` | `employee` (a new PIN also clears the wrong-PIN count and any lock) |
| `staff/add` | HQ of the brand, platform admin | `role` (`store_device`, `store_manager` + `storeId`; `hq_admin` + `brandId`), `email` | `staff { id, userId, role, brandId, storeId, email }`, `created` (false: it already had the role) |
| `staff/remove` | HQ of the brand, platform admin | `staffId` | `removed` (the staff view) |
| `points/adjust` | HQ of the member's brand, platform admin | `memberId`, `points` (whole, not 0, at most ±100 000), `reason` (1–200), `idempotencyKey` | `entryId`, `memberId`, `points`, `balance` (an `adjust` ledger entry; may go negative; never counts for tiers) |

- PINs: core `staffPinProblem` (4–6 digits, not one repeated digit, not a run like 1234 or 9876; `limits.staffPinMinDigits`, `limits.staffPinMaxDigits`). Only the bcrypt hash is stored; no PIN in idempotency fingerprints or the audit log.
- `staff/add` finds or creates the Supabase Auth user of the email (Edge Function: database lookup, then the Auth admin API, confirmed, no email sent). A till account serves one store (`device_in_other_store`). Platform admins (GROW) are not handed out here.
- `staff/remove` keeps the Auth user (it may be a member too). A brand keeps at least one HQ admin (`last_hq_admin`).
- Every write is in the audit log (`employee.create`, `employee.update`, `staff.add`, `staff.remove`, `points.adjust`).
- New error codes: `pin_format`, `pin_too_simple`, `device_in_other_store` (409), `last_hq_admin` (409), `not_configured` (501, `staff/add` without the Auth admin API). Texts in `data/copy/errors.*.json`, copy deck §f2, to approve.

Reads (row-level security, nothing new to open):
- `staff_roles.email` (new): the account's email, lower case, set by `staff/add` (copied from Supabase Auth once for older roles). HQ reads its brand's staff; anyone reads their own roles.
- `public.dashboard_stats(p_since timestamptz)` (new, `SECURITY INVOKER`, `rpc`): per store since `p_since`: `net_points` (earns minus undos), `purchases`, `rewards_used`, `members_joined` (HQ only; `store_id` null = joined without a store). Staff only: members and anonymous callers get nothing.
- Member search: `members` of the brand by `member_code`, email, phone or name (HQ), balances from `member_balances`, history from `ledger_entries`.

## New in v0.6 (HQ edits stores and the reward catalog)

Migration `20261112090000_catalog_writes_via_api`: signed-in users no longer insert or update `stores` and `rewards` directly (the direct rights and their policies are gone); these routes are the only way, so every change is checked, audited and costed by core. Reading is unchanged.

| Route | Who | Body | Returns |
| --- | --- | --- | --- |
| `stores/create` | HQ of the brand, platform admin | `brandId`, `code` (2–40: `a-z`, `0-9`, single dashes; unique per brand), `name`, optional `nameEn`, `address`, `addressEn`, `city`, `country` (`GR`/`CY`), `phone`, `latitude` + `longitude` (both or neither), `openingHours`, `idempotencyKey` | `store { id, brandId, code, name, nameEn, address, addressEn, city, country, phone, latitude, longitude, openingHours, active }` |
| `stores/update` | same | `storeId`, any of the fields above except `code` (fixed: it is in the printed counter QR), `active`; `null` clears an optional field | `store` |
| `rewards/create` | same | `brandId`, `nameEl`, `nameEn` (1–60), `shelfPriceCents` (1–50 000), optional `descriptionEl`, `descriptionEn` (≤200), `category`, `minTier` (`gold`/`club`/null), `sortOrder` (default: last), `idempotencyKey` | `reward { id, brandId, nameEl, nameEn, descriptionEl, descriptionEn, category, shelfPriceCents, baseCost, minTier, active, sortOrder }` |
| `rewards/update` | same | `rewardId`, any of the fields above, `active` | `reward` |

- `openingHours`: `{ "mon": "08:00-20:00", "sun": "closed" }`, keys `mon`…`sun`; a missing day is unknown; closing after opening, `24:00` at the latest.
- `baseCost` is never taken from the body: core `rewardBaseCost(shelfPriceCents, brand config)`. A new price gives a new cost; codes already made keep the points they took.
- Closing a store (`active: false`) hides it from members and the till can't earn there (`store_inactive`); cashiers, staff and history stay. A reward switched off leaves the app; codes already made stay valid until they expire. The brand's welcome gift (`config.welcome.rewardId`) can't be switched off (`welcome_reward`, 409).
- Audit log: `store.create`, `store.update`, `reward.create`, `reward.update` (changed fields, old → new).
- New error codes: `store_code_taken` (409), `welcome_reward` (409). Texts in `data/copy/errors.*.json`, copy deck §f2, to approve.

Yearly tier review (migration `20261112120000_tier_review`): job `jobs/review-tiers` (service only, daily 01:45 UTC). New `members.tier_reviewed_at` (the anniversary last reviewed); `members.tier_review_on` is now filled: the date of the next review in the brand's time zone (for the app's Profile, `profile.tierReview`). A tier lowered at the review is in the audit log (`member.tier_review`).

Monthly store report (migration `20261112110000_store_report`, read only):
- `redemptions.value_cents` (new): the reward's shelf price when the code was used, set by `redemptions/use`; codes used earlier got the price of the day of the migration.
- `public.store_report(p_store_id uuid, p_from timestamptz, p_to timestamptz)` (`rpc`, `SECURITY INVOKER`): codes used at the store in `[p_from, p_to)`, one row per reward and cashier: `reward_id, reward_name_el, reward_name_en, employee_id, employee_name, used, gifts, points, value_cents`. For the store's manager, HQ and platform admins; till devices, members and anyone else get no rows (anonymous: refused).
- Store staff (managers, till devices) now also read their brand's switched-off rewards, so older codes keep their names; members and visitors still see active rewards only.

## New in v0.7 (Apple Wallet and Google Wallet passes)

The member's store card in Wallet: points, tier, first name, next reward, and the static Wallet QR the till already accepts (`OCW.<code>.<passVersion>.<sig>`, core `createWalletToken`). Passes only show the card; nothing in Wallet moves points. Texts: `data/copy/wallet.*.json` (copy deck d2), Greek and English; tier names from the app's brand copy; colours and images from `data/<brand>/wallet*`. Code: `packages/server/src/wallet/`.

| Route | Who | What |
| --- | --- | --- |
| `wallet/apple/link` | member | `{ ok, url }`: a link valid 10 minutes that downloads the member's signed `.pkpass` (`GET …/wallet/apple/download/<token>`). Opening it on an iPhone offers "Add to Apple Wallet" |
| `wallet/google/link` | member | `{ ok, url }`: `https://pay.google.com/gp/v/save/<jwt>`; saving creates the brand's loyalty class (first time) and the member's object. From then on the member's Google object gets updates |
| `jobs/wallet-updates` | service (every minute) | For members whose pass changed (`member_secrets.wallet_changed_at` > `wallet_sent_at`): an APNs push to each registered Apple device (Wallet then fetches the new pass) and a PATCH of the Google object. `{ ok, members, applePushes, googleUpdates, failed }` |

Both links answer `not_configured` (501) until the brand's certificate / service account is set up, and `member_not_found` for a caller who isn't a member.

**PassKit web service** (Apple calls it; `webServiceURL` = `https://<ref>.supabase.co/functions/v1/api/wallet/apple`, header `Authorization: ApplePass <authenticationToken>`): `POST`/`DELETE v1/devices/<device>/registrations/<passTypeId>/<serial>` (201 new, 200 known, 401), `GET v1/devices/<device>/registrations/<passTypeId>?passesUpdatedSince=<tag>` (200 `{ serialNumbers, lastUpdated }` or 204), `GET v1/passes/<passTypeId>/<serial>` (the latest `.pkpass`, 304 with `If-Modified-Since`), `POST v1/log`. The serial number is the member id; the authentication token is derived from the member's QR secret and pass version, so reissuing the pass (new version) drops the old one.

**Database:** `member_secrets.wallet_changed_at` (moved by triggers on a new ledger entry and on a new tier or first name), `wallet_sent_at`, `google_wallet_at`; `wallet_apple_devices` (device, member, push token; server only, no client access).

**Setup per brand** (the routes work without it, answering `not_configured`): GitHub secrets `APPLE_PASS_P12_<BRAND>` (the Pass Type ID certificate exported from Keychain as .p12, base64) and `APPLE_PASS_P12_PASSWORD_<BRAND>`; `GOOGLE_WALLET_SERVICE_ACCOUNT` (JSON key of a service account registered as a user in the Pay & Wallet Console) with `wallet.googleIssuerId` in `supabase/projects/<brand>.json`. CI hands them to the Edge Function (`project:apply`). Apple's WWDR G4 certificate is in `data/wallet/`.

## What the apps read directly (Supabase client, row-level security)

Member app (signed-in member): `members` (own row, not once deleted), `member_balances` (own), `member_secrets` (own: `qr_secret`, `pass_version` → core `createRotatingToken` for the QR, offline), `rewards` (active), `stores` (active; `name_en` / `address_en` from v0.4), `member_gifts` (own), `redemptions` (own; a `pending` one not past `expires_at` is the active code), `ledger_entries` (own, history). Costs per tier: core `rewardCostForTier`; progress: core `nextRewardProgress`, `tierProgress`.

Back office (signed-in HQ admin or store manager, v0.5): `stores` (the brand's, inactive ones too), `rewards` (HQ: inactive ones too, v0.6), `employees` (id, name, active), `staff_roles` (with `email`), `members` and `member_balances` (HQ), `ledger_entries`, `dashboard_stats(p_since)`.

Staff console (signed-in device user with `store_device` for its store): `stores` (its store), `employees` (its store: id, display_name, active), `ledger_entries` and `redemptions` of its store (today's activity; not those of deleted members, from v0.4). Everything that writes goes through the routes above.

## Sign-in

Supabase Auth, passwordless one-time code to email (SMS later, provider to be chosen). Members: `signInWithOtp({ email, options: { shouldCreateUser: true } })` then `verifyOtp({ email, token, type: 'email' })`, then `POST join` (first time). Store devices: a Supabase user per device, created by HQ; signs in once with email + one-time code by the store manager.
