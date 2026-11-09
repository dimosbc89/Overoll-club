# @overoll/mobile — Overoll Club member app

Expo SDK 58 + expo-router. One codebase for **iOS, Android and the customer web app** (Expo web, static output). Screens follow the approved-for-review designs on the design canvas (`Main`, `Card`, `Rewards`, `Redeem`); texts come from `docs/copy-deck.md`.

| | |
| --- | --- |
| App name / slug | Overoll Club / `overoll-club` |
| Bundle id / package | `online.growagency.overoll` |
| URL scheme | `overollclub://` (counter QR on native: `overollclub://join?store=<code>`) |

## Run

From the repo root (Node 22): `npm install`, then:

```bash
npm run web -w @overoll/mobile         # web app in the browser
npm run ios -w @overoll/mobile         # iOS simulator / Expo Go
npm run android -w @overoll/mobile
npm run export:web -w @overoll/mobile  # static web build in apps/mobile/dist
npm test -w @overoll/mobile            # vitest (see Tests)
npm run typecheck -w @overoll/mobile
```

## Environment

Copy `.env.example` to `apps/mobile/.env.local` (git-ignored):

```
EXPO_PUBLIC_SUPABASE_URL=https://lwhxqnmntihmavqngeca.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…
EXPO_PUBLIC_CLUB_URL=club.<overoll domain>   # optional, fills {clubUrl}
```

Only the **publishable** key, never the service-role key: `EXPO_PUBLIC_*` values are built into the app. Without them the app still builds, tests and exports: the home page shows the landing page with an "isn't connected yet" notice, and join, rewards and stores say the same.

## Screens and flows

| Route | What |
| --- | --- |
| `/` (Card tab) | Signed out: the landing page (copy deck §h). Signed in: points (`member_balances`), tier, the **rotating QR** (core `createRotatingToken` with `member_secrets.qr_secret`, new code every `qr.stepSeconds`, works offline once loaded), member code in groups of 4, progress to the next reward (core `nextRewardProgress`) and tier (core `tierProgress`), welcome-gift banner, points expiry date, Wallet button placeholders, the active code if there is one |
| `/join`, `/join?store=<code>` | Counter QR: greets with the store name, then email → one-time code (Supabase `signInWithOtp` / `verifyOtp` type `email`) → first name + "I am 15 or older" (required, `minimumAge`) → email / SMS / push consents (separate, optional, unticked; push only on native) → `POST join` → welcome. Members who sign in go straight to the card |
| `/sign-in` | The same flow starting at the email step |
| Rewards tab | Catalog with the member's tier price (core `rewardCostForTier`), "x to go" or "You can have this!", "Gold and above" limits; the welcome gift on top while it is available (`member_gifts`). Tap → confirm sheet → `POST redemptions/create` (`rewardId` or `giftId`) → code screen |
| `/redeem` | The active code: QR of the code, the code in letters, live countdown to `expiresAt`, cancel (`POST redemptions/cancel`). Checks every 5 s whether the till used it. Shown again (banner on Card and Rewards) when the member comes back while it is still pending |
| Stores tab | Store list with today's hours; tap opens maps |
| Profile tab | Language switch (el/en), name and email, points history (`ledger_entries`, copy `history.*`), sign out, "delete my account" (placeholder sheet: explains and gives the support email) |

Data the app reads directly (row-level security): `brands` (config), `members`, `member_balances`, `member_secrets`, `rewards`, `stores`, `member_gifts`, `redemptions`, `ledger_entries` (`src/lib/data.ts`). Everything that moves points goes through the API (`src/lib/api.ts`). The last member data, QR secret included, is kept on the device (`src/lib/cache.ts`) so the card opens offline; it is removed on sign-out.

`member_gifts` arrives with server v0.2: until the table exists (or if it can't be read) the app shows no gift, and the card says "make your first purchase to unlock…" only to members with no purchase yet.

## API client (`src/lib/api.ts`)

- Base URL `{EXPO_PUBLIC_SUPABASE_URL}/functions/v1/api`, `POST` + JSON, `Authorization: Bearer <session token>`, `apikey: <publishable key>`.
- **One idempotency key per user action**: `ApiAction` creates it once and sends the same key on every retry; `ActionSlot` (used by the screens) keeps the action while the request is unchanged and starts a new one after a success or when the request changes.
- Errors: the response `code` → `data/copy/errors.{el,en}.json` (imported, never copied); unknown codes → `unknown`; no connection or a 20 s timeout → `network_error`; a bare 5xx → `internal_error`. The API's English `message` is never shown.

## Layout

| Path | What |
| --- | --- |
| `src/app` | Routes: `(tabs)` (Card, Rewards, Stores, Profile), `join`, `sign-in`, `redeem`, `+html.tsx` (web shell) |
| `src/components` | UI kit (`ui.tsx`: pill buttons, tags, cards, sheet, progress bar, checkbox, text field), `Logo` (shapes from `assets/brand`, pink or white), `Icon`, `Landing`, `JoinFlow`, `RedeemSheet` |
| `src/i18n` | `el.json` (reference) and `en.json` with the copy-deck keys, typed `t()`, `pluralKey()`, `I18nProvider` (choice saved on the device; fills `{programName}`, `{clubUrl}`, `{supportEmail}`) |
| `src/theme` | Design-system tokens (`tokens.ts`) and Manrope 500/700/800 (`fonts.ts`) |
| `src/lib` | Supabase client, session + member data (`session.tsx`), reads (`data.ts`), API client, rules for the screens via core (`memberView.ts`, `joinForm.ts`), QR ticker, formatting |
| `metro.config.js` | Lets Metro resolve the workspace packages' `./x.js` imports to `x.ts` |
| `test` | Unit tests |

Rules: no user-facing text in components (add keys to both message files **and** to `docs/copy-deck.md`; a test checks every key against the deck); program numbers only from `packages/core` and the brand config; money stays integer cents until `formatEuroFromCents`; nothing a person must read in pink; no emoji.

## Tests

`npm test -w @overoll/mobile`: API client (error mapping, network errors, timeout, idempotency key reuse), countdown and formatting, QR refresh timing (fake timers), member view (tier prices, next reward/tier, welcome banner), join form (age via core, email, OTP, Supabase errors), i18n (parity, placeholders, every text word for word from the copy deck, no emoji), logo shapes match `assets/brand`.

## Placeholders and next steps

- **Wallet buttons**: disabled dashed placeholders with the copy-deck accessibility labels until the official Apple/Google badges and the passes exist.
- **Delete account**: explains what deletion will do and gives `{supportEmail}`; needs a server route.
- **Push**: the consent is saved; the OS permission prompt and notifications come later (expo-notifications).
- **Terms / privacy links**: the terms line is shown; the links wait for `{termsUrl}` / `{privacyUrl}`.
- **SMS sign-in**: email only until the SMS provider is chosen.
- QR secret on native: move from AsyncStorage to the keychain (expo-secure-store) before the native release.
- No app icon or splash yet (needs 1024×1024 PNG exports of the mark).
