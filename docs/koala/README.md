# Koala Club (Koala Coffee)

Second brand on the platform. Dimos decided on 11 Nov 2026 to build it for launch (not as a demo), on its own Supabase project.

| What | Where |
| --- | --- |
| Brand slug | `koala` |
| Supabase project | `rkyoynrsimtotdirqkns` (koala-club, eu-central-1, GROW Agency org), settings in `supabase/projects/koala.json` |
| Data | `data/koala/` (brand, stores, menu, rewards) → `supabase/seed/koala.sql`, applied once (CI applies it to a project whose brand row is missing) |
| Design | Figma `MHtMmw4vUc80oY5PuaBytx` (Koala Club — loyalty app concept), official logo mark `assets/brand/koala/` |
| Pitch deck | https://claude.ai/artifact/3rpyBDM6n5R9CPucpx3TWH |
| Web app / back office | https://club.koalacoffee.gr / https://admin.koalacoffee.gr (live 12 Nov 2026); `koala-club.pages.dev` / `koala-club-admin.pages.dev` still work |

## Programme

Same rules as Overoll (`packages/core` defaults): 10 points per €1; tiers Joey (classic) 0 / Koala (gold) 1.500 / Eucalyptus (club) 4.000 points in 12 months, ×1.00 / ×1.25 / ×1.50, rewards −0 / −20 / −30 %; codes valid 15 minutes; minimum age 15; points expire 12 months after the last purchase. Welcome gift: cinnamon roll, 30 days.

Reward catalog (draft, efood prices of 11 Nov 2026, costs from `packages/core`):

| Reward | Shelf price | Joey | Koala | Eucalyptus |
| --- | ---: | ---: | ---: | ---: |
| Espresso ή ελληνικός | €2.20 | 300 | 240 | 210 |
| Καφές της επιλογής σου | €2.80 | 400 | 320 | 280 |
| Χειροποίητη πίτα | €3.10 | 450 | 360 | 320 |
| Cookie ή muffin | €3.30 | 450 | 360 | 320 |
| Κρουασάν με πραλίνα | €3.40 | 500 | 400 | 350 |
| Cinnamon roll (welcome gift) | €4.00 | 550 | 440 | 390 |
| Sandwich ή τορτίγια | €5.10 | 700 | 560 | 490 |
| Κέικ ή yogurt bowl | €5.30 | 750 | 600 | 530 |
| Καφές + χειροποίητη πίτα | €5.90 | 850 | 680 | 600 |

## Status of the Supabase project

- **Database: done (11 Nov 2026).** All 11 migrations and the seed (2 stores, 9 rewards, cinnamon roll as welcome gift) were applied through the Supabase connection, because CI's token could not reach this project yet. Each file was checked by md5 against the repo before it ran, and recorded in `supabase_migrations.schema_migrations` exactly as `scripts/apply-migrations.ts` records it, so CI continues from here. The schema (tables, columns, policies, functions, indexes, grants) matches Overoll's apart from the jobs function below; security advisor: same two INFO notes as Overoll (server-only tables without policies, by design).
- **API, Auth and jobs: done (11 Nov 2026)** by CI (`deploy (koala)`) with the GitHub secret `SUPABASE_ACCESS_TOKEN_KOALA`: Edge Function `api`, site and redirect URLs, 6-digit sign-in code email, `ALLOWED_ORIGINS`, scheduled jobs (`club-expire-redemptions` every minute, `club-expire-points` daily). Checked: the API refuses unauthenticated calls, answers CORS only for the Koala sites, and the every-minute job returns 200.
- **Web: done (11 Nov 2026).** Cloudflare Pages `koala-club` (https://koala-club.pages.dev, `npm run build:web:mobile -- --brand koala` → `apps/mobile/dist`) and `koala-club-admin` (https://koala-club-admin.pages.dev, `npm run build:web:admin -- --brand koala` → `apps/admin/out`), connected to the repo: every push to `main` rebuilds them. Both talk only to the Koala project.

## Native apps

Koala Club for iOS and Android, from the same code (`apps/mobile`, `EXPO_PUBLIC_BRAND=koala`, EAS profile `koala`): bundle id / package `online.growagency.koala`, scheme `koalaclub://`, draft icon and splash in `apps/mobile/brands/koala/`. Decided by Dimos on 11 Nov 2026: published first from GROW AGENCY's Apple Developer account (and GROW's Google Play account), with Koala's written authorization (App Store guideline 4.2.6); if Apple refuses, the app moves to a Koala account.

Builds: EAS project `koala-club` on GROW's Expo account (dimos@growagency.online), started from GitHub Actions ("Native builds", `apps/mobile/README.md`). Android first: the first test APK built on 12 Nov (version 0.1.0 (1), EAS build `1b32ac0c`, install link valid 13 days); next the Play Console app record (GROW's Google Play account). iOS needs GROW's Apple credentials on EAS once (App Store Connect API key or one interactive build).

iOS: first store build 0.1.0 (4) uploaded to TestFlight on 12 Nov 2026 (EAS submission `47083539`); App Store Connect app "Koala Club", Apple ID `6834007568` (`eas.json` `submit.koala.ios.ascAppId`), so later submissions run from the workflow (`kind: submit`). Store builds hide the Wallet buttons and the "no app needed" copy (`apps/mobile/src/lib/platformFeatures.ts`); the next build for review needs that change (build 4 predates it). Store version: `version` in `apps/mobile/brands/<brand>/native.json` (Koala 1.0.0 from 12 Nov 2026; build numbers stay EAS's).

## Before launch: needed from Koala

- [ ] Approve the reward catalog and the in-store prices (we used efood prices).
- [ ] Confirm the welcome gift (cinnamon roll is on efood only for Αργυρούπολη).
- [ ] Opening hours of both stores (not published anywhere). Once known, HQ types them in the back office (Καταστήματα → Αλλαγή); reward prices likewise under Δώρα.
- [ ] Programme and tier names (Koala Club, Joey, Koala, Eucalyptus).
- [x] Domain: `koalacoffee.gr` (12 Nov 2026, Cloudflare in GROW's account): `club.` and `admin.`, sign-in emails from `app@koalacoffee.gr` (`docs/koala/dns-records.md`). Resend verified 12 Nov; sign-in emails go through Resend SMTP (key in the GitHub secret `RESEND_API_KEY_KOALA`).
- [ ] Legal entity for the terms and privacy policy (pages live on https://club.koalacoffee.gr/terms and /privacy since 12 Nov as drafts; set `legal.company` and `legal.address` in `apps/mobile/src/brand/koala.ts`, then a lawyer reads them) (vrisko lists "KOALA - ΔΗΜΟΓΕΡΟΝΤΑ ΕΕ" for Αργυρούπολη; confirm for both stores).
- [ ] Official wordmark (we have the koala mark only).
- [ ] Whether efood orders earn points; tablet or phone at each till.
- [ ] Signed authorization letter for publishing the app from GROW AGENCY's store accounts.

## Wallet passes

Built 12 Nov 2026 (API contract v0.7). Google Wallet: GROW's issuer `3388000000023239253` (shared by the brands, each with its own loyalty class), service account `wallet-issuer@grow-wallet-514520.iam.gserviceaccount.com`, key in the GitHub secret `GOOGLE_WALLET_SERVICE_ACCOUNT` (12 Nov). Publishing access requested on 12 Nov (2–3 days); until then only users of the Pay & Wallet Console (ads@growdigital.gr) can save a pass. Apple Wallet: waits for the Pass Type ID `pass.online.growagency.koala` and its certificate (`APPLE_PASS_P12_KOALA`, `APPLE_PASS_P12_PASSWORD_KOALA`).

## App store review account

Built 12 Nov 2026 (API contract v0.8). Reviewers sign in with `appreview@growagency.online` (`review.email` in `supabase/projects/koala.json`) and a fixed 10-digit code from the GitHub secret `REVIEW_SIGN_IN_CODE_KOALA`, typed where the emailed code goes. The account keeps at least 1,000 points so every screen can be tried; the till refuses its reward codes. The email and code go into App Store Connect → App Review information and Play Console → App access, never into the repo. Needs a store build made after this change (the app sends 10-digit codes to `auth/review-sign-in`).
