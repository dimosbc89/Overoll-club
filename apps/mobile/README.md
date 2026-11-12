# @grow-loyalty/mobile — member app (Overoll Club, Koala Club)

Expo SDK 58 + expo-router. One codebase for **iOS, Android and the customer web app** (Expo web, static output). Screens follow the approved-for-review designs on the design canvas (`Main`, `Card`, `Rewards`, `Redeem`); texts come from `docs/copy-deck.md`.

One app per brand, from the same code. `EXPO_PUBLIC_BRAND` picks the brand at build time (`--brand` in `scripts/build-web.ts`, the profile in `eas.json` for native builds); `app.config.ts` takes the name and URL scheme from `supabase/projects/<brand>.json` and the store identity, icon and splash from `brands/<brand>/`.

| | Overoll | Koala |
| --- | --- | --- |
| App name / slug | Overoll Club / `overoll-club` | Koala Club / `koala-club` |
| Bundle id / package | `online.growagency.overoll` | `online.growagency.koala` |
| URL scheme | `overollclub://` | `koalaclub://` |
| Icon, adaptive icon, splash | `brands/overoll/*.png` | `brands/koala/*.png` |

The counter QR on native opens `<scheme>://join?store=<code>`. Bundle ids can still change until the app record exists in App Store Connect / Google Play Console. App Store guideline 4.2.6 asks that apps built from a shared template be submitted by the business itself. Decided 11 Nov 2026: Koala is submitted first from GROW AGENCY's Apple Developer account (team `JUVGRB24Q6`) with Koala's written authorization, as `docs/program-spec.md` §10 plans for Overoll; if Apple refuses, the app is transferred to a Koala account. Overoll's app will differ (its own redesign), so the two are not the same app.

### Native builds (EAS)

`eas.json` has one profile per brand (`overoll`, `koala`, plus `<brand>-preview` for test phones: Android APK, iOS for registered devices) with the same public settings the web build uses (`test/app-config.test.ts` keeps them in step with `supabase/projects/`). Each brand is its own project on expo.dev: `brands/<brand>/native.json` has `expoOwner` (the Expo account) and `easProjectId`, which `app.config.ts` sets as `owner` and `extra.eas.projectId`.

Builds run on Expo's servers, started by `.github/workflows/native.yml` with the GitHub secret `EXPO_TOKEN` (or `EXPO_TOKEN_<BRAND>`): Actions → "Native builds" → Run workflow, or a push to a branch (or tag) `eas/<brand>/<android|ios|all>/<preview|store>`. The job links to the build; Expo e-mails when it is ready. iOS needs the brand's Apple credentials on EAS once: either an App Store Connect API key (Admin) in the secrets `EXPO_ASC_KEY_P8`, `EXPO_ASC_KEY_ID`, `EXPO_ASC_ISSUER_ID`, `EXPO_APPLE_TEAM_ID`, or one interactive `eas build -p ios` by the Apple account holder.

Store submissions: the workflow's `submit` kind sends the latest store build (`eas submit --latest`) with the brand's submit profile in `eas.json`; iOS needs `submit.<brand>.ios.ascAppId`, the app's Apple ID in App Store Connect. The very first iOS submission can instead be run interactively by the Apple account holder (`eas submit -p ios --profile <brand> --latest`), which also creates the App Store Connect app.

```bash
EXPO_PUBLIC_BRAND=koala npx expo config --type public   # see a brand's resolved app config
git push --force origin main:refs/heads/eas/koala/android/preview   # test APK for Koala from main
```

## Run

From the repo root (Node 22): `npm install`, then:

```bash
npm run web -w @grow-loyalty/mobile         # web app in the browser
npm run ios -w @grow-loyalty/mobile         # iOS simulator / Expo Go
npm run android -w @grow-loyalty/mobile
npm run export:web -w @grow-loyalty/mobile  # static web build in apps/mobile/dist
npm test -w @grow-loyalty/mobile            # vitest (see Tests)
npm run typecheck -w @grow-loyalty/mobile
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
| `/join`, `/join?store=<code>` | Counter QR: greets with the store name (English name in English, `stores.name_en`, else Greek), then email → one-time code (Supabase `signInWithOtp` / `verifyOtp` type `email`) → first name + "I am 15 or older" (required, `minimumAge`) → email / SMS / push consents (separate, optional, unticked; push only on native) → `POST join` → welcome. Members who sign in go straight to the card |
| `/sign-in` | The same flow starting at the email step |
| Rewards tab | Catalog with the member's tier price (core `rewardCostForTier`), "x to go" or "You can have this!", "Gold and above" limits; the welcome gift on top while it is available (`member_gifts`). Tap → confirm sheet → `POST redemptions/create` (`rewardId` or `giftId`) → code screen |
| `/redeem` | The active code: QR of the code, the code in letters, live countdown to `expiresAt`, cancel (`POST redemptions/cancel`). Checks every 5 s whether the till used it. Shown again (banner on Card and Rewards) when the member comes back while it is still pending |
| Stores tab | Store list with today's hours, name and address in the current language (`name_en` / `address_en`, Greek fallback); tap opens maps |
| Profile tab | Language switch (el/en), name and email, points history (`ledger_entries`, copy `history.*`, store names in the current language), sign out, "Delete account" → `/delete-account` |
| `/delete-account` | Copy deck §b6: what is erased and what is kept, type ΔΙΑΓΡΑΦΗ / DELETE (either word, any case or accents), "Delete for good" → `POST account/delete` `{ confirm: true }` (one idempotency key, reused when tapped again after an error) → sign out on the device → `delete.done`. "Download your data" (`delete.exportFirst`) is not shown until the export exists |
| `/support`, `/terms`, `/privacy` | Help (contact, the landing FAQ, links), programme terms and privacy policy (copy deck §b8); readable without signing in, linked from the landing page, the join consents and Profile; the store listings link to them. The texts are templates in `src/legal/` filled by `src/lib/legal.ts` with the brand's `legal` details and the program config, so the numbers follow `packages/core`. A draft notice shows until the brand's company is set |

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
| `src/lib` | Supabase client, session + member data (`session.tsx`), reads (`data.ts`), API client, rules for the screens via core (`memberView.ts`, `joinForm.ts`), QR ticker, formatting, offline card (`memberCache.ts`: the QR secret goes to `secretVault.native.ts`, Keychain / Keystore, in the native apps; the web keeps it in browser storage) |
| `metro.config.js` | Lets Metro resolve the workspace packages' `./x.js` imports to `x.ts` |
| `test` | Unit tests |

Rules: no user-facing text in components (add keys to both message files **and** to `docs/copy-deck.md`; a test checks every key against the deck); program numbers only from `packages/core` and the brand config; money stays integer cents until `formatEuroFromCents`; nothing a person must read in pink; no emoji.

## Tests

`npm test -w @grow-loyalty/mobile`: API client (error mapping, network errors, timeout, idempotency key reuse), countdown and formatting, QR refresh timing (fake timers), member view (tier prices, next reward/tier, welcome banner), join form (age via core, email, OTP, Supabase errors), i18n (parity, placeholders, every text word for word from the copy deck, no emoji), logo shapes match `assets/brand`, offline card (secret only in the vault on native, cleared on sign-out, unreadable secret after a restore).

## Placeholders and next steps

- **Wallet buttons**: disabled dashed placeholders with the copy-deck accessibility labels until the official Apple/Google badges and the passes exist.
- **Push**: the consent is saved; the OS permission prompt and notifications come later (expo-notifications).
- **Terms / privacy links**: the terms line is shown; the links wait for `{termsUrl}` / `{privacyUrl}`.
- **SMS sign-in**: email only until the SMS provider is chosen.
- App icons and splash are drafts made from the brand marks (`brands/<brand>/`); the designer's versions replace them before the store release.
