# @grow-loyalty/admin — Overoll Club back office

Next.js 16 (App Router). HQ admin, store manager views and the staff console (till).

## Run

From the repo root (Node 22): `npm install`, then:

```bash
npm run dev -w @grow-loyalty/admin        # http://localhost:3000 (till: /console)
npm run build -w @grow-loyalty/admin
npm run start -w @grow-loyalty/admin
npm test -w @grow-loyalty/admin           # vitest: console state machine, API client, idle lock, keypads, i18n, …
npm run typecheck -w @grow-loyalty/admin  # next typegen + tsc
```

Dev and build use **webpack** (`--webpack`): `@grow-loyalty/core` imports its own files as `./config.js`, which Turbopack can't map to `.ts` yet (`experimental.extensionAlias` in `next.config.ts`). The build downloads Manrope once through `next/font/google` (self-hosted afterwards), so it needs internet access.

## Environment

Create `apps/admin/.env.local` (git-ignored):

```
NEXT_PUBLIC_SUPABASE_URL=https://lwhxqnmntihmavqngeca.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…
```

Next.js bakes `NEXT_PUBLIC_*` in at **build** time, so set them before `npm run build` (on the host too). Never put the service-role key here. Without them the build still succeeds; the Stores and Rewards pages and the till show "Supabase is not configured".

## Layout

| Path | What |
| --- | --- |
| `src/app/(admin)` | Back office with the cocoa header: `/` dashboard, `/stores`, `/rewards`, `/sign-in` |
| `src/app/console` | Staff console (till), full screen, client-side; own layout with Manrope and the design-canvas tokens |
| `src/i18n` | `el.json` (reference) and `en.json` with the same keys, typed `t()`; language in the `overoll_locale` cookie, set by a server action |
| `src/lib` | Supabase reads (server only), € formatting, opening hours, keypads, tier costs via `@grow-loyalty/core`, the API client (`api.ts`), store names per language (`store-names.ts`) |
| `src/lib/console` | Till logic without React: state machine, request runner, idle lock, QR frame reader, device reads |
| `src/app/globals.css` | Back-office brand tokens from `docs/brand.md` as CSS variables |

Rules: point costs, limits and previews come from `@grow-loyalty/core` (`pointsForPurchase`, `validatePurchaseAmount`, `canUndo`, `staffPinSessionExpired`, `resolveConfig`), never re-implemented here; money stays integer cents until `formatEuroFromCents`.

## Staff console (`/console`)

Designs: `Console.dc.html` and `ConsoleDone.dc.html` on the design canvas (tablet landscape 1180×820). Copy: `docs/copy-deck.md` §f.

| Step | How |
| --- | --- |
| Header | Store name in the current language (`stores.name_en` in English, else the Greek `name`) |
| Device sign-in | The store manager types the till's email once → Supabase Auth `signInWithOtp` (`shouldCreateUser: false`, HQ creates device users) → `verifyOtp`. The session stays in localStorage. The store comes from `staff_roles` (`store_device`), the program config from `brands.config` via core `resolveConfig`, the cashiers from `employees` |
| Cashier | Pick a name, type the PIN → `POST staff/verify-pin`. The PIN stays in memory only. The till locks after `limits.staffPinIdleMinutes` without a tap or key (core `staffPinSessionExpired`) and on "Switch cashier" |
| Scan | Camera (BarcodeDetector, else jsQR) or "Type a code" → `POST scan` → member panel. Typed: the full `OC1.…` token, or the member code under the QR ("ABCD 2345", case, spaces, dashes and Greek look-alike capitals don't matter) → `POST scan` with `memberCode`; if no member has that code and it can be a reward code, Redeem opens with it. A redemption code read by the camera opens Redeem directly |
| Award | Integer-cents keypad (max `limits.maxAmountCents`), live preview with core `pointsForPurchase` for the member's tier, optional receipt number for late points → `POST award` with `member: { memberId }` |
| Done | +points, new balance, welcome-croissant and tier-up messages; Undo while core `canUndo` → confirm → `POST undo` with the cashier PIN |
| Redeem | Scan or type the 8-character code → `POST redemptions/use` → reward name in the current language and the 100% discount reminder |
| Today's activity | Today's `ledger_entries` and used `redemptions` of the store (store time zone), newest first |

How it is built:

- `lib/console/machine.ts`: a pure reducer. Screens that wait for the server carry a `requestId`; `pendingRequest(state)` says which call to make; `ConsoleApp.tsx` runs it once (`lib/console/runner.ts`) and dispatches the result. Answers to a request that is no longer current are ignored.
- Idempotency: every write gets a fresh key per user action. After `network_error` / `internal_error` the key is kept and reused for the same payload (Try again, or Back and Add points again with the same amount), so points are never added twice. The undo window counts from the first attempt.
- `lib/api.ts`: base `NEXT_PUBLIC_SUPABASE_URL/functions/v1/api`, bearer from the device session, 20-second timeout → `network_error`. Error codes map to `data/copy/errors.{el,en}.json` (imported), with `{maxAmount}`, `{minutes}`, `{maxEarns}` from the brand config; unknown codes show `unknown`.

## Placeholders

- **Dashboard**: three empty stat tiles. Numbers come with the back office (roadmap week 4).
- **Stores / Rewards**: read-only tables with the publishable key. Editing needs staff sign-in.
- **Sign in** (`/sign-in`): disabled form for HQ and store managers. The till has its own device sign-in in `/console`.
- **Console**: works against the v0.2 API contract; `staff/verify-pin`, `receiptNumber`, `welcomeGiftUnlocked` and `pin_locked` need the server v0.2 deploy. Typing the member code under the QR needs the v0.4 API (`scan` with `memberCode`). Today's activity shows no member names (the device can't read `members`).
