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

13 Nov 2026 (afternoon): iOS 1.0.0 (10) (push + Apple Wallet button) is in TestFlight (internal group "Team (Expo)") and selected on the 1.0.0 version page (not sent for review). Android 1.0.0 (5) (push; EAS build `6eb54c43`) is live on Play **internal testing** for the email list "Koala Club" (dimos@growagency.online); testers join at https://play.google.com/apps/internaltest/4701049207165032312. Play App Signing was already on.

### Store declarations (filled 13 Nov 2026)

What the app collects, checked in the code: email, first name, account/member ID, purchase history (points ledger with amount, store and date). Nothing else: no phone or birthday fields in the app (columns exist, not asked), no push tokens yet, no location, camera, analytics or crash SDKs, no advertising ID, no ads. Processors (Supabase, Cloudflare, Resend) are not "sharing" under either store's rules. If any of this changes (push notifications, phone or birthday in the app, an analytics SDK), update both declarations in the same change.

- **App Store, App Privacy** (published): Name (App Functionality); Email Address (App Functionality, Developer's Advertising or Marketing: offers by email with consent); User ID (App Functionality); Purchase History (App Functionality, Analytics: back-office store reports). All linked to the user, none used for tracking. Privacy policy https://club.koalacoffee.gr/privacy.
- **App Store, age rating**: every question "none/no" → calculated 4+, overridden to **16+** because the terms set a minimum age of 15 and Apple requires the rating to match a EULA minimum (Apple has no 15+; 16+ shows as 17+ on iOS before 26, 15+ in Korea, A16 in Brazil). Age suitability URL https://club.koalacoffee.gr/terms. If Dimos prefers 13+, change it under App Information → Age Ratings.
- **App Store, content rights**: contains third-party content (Koala's brand, menu, photos) with the necessary rights; rests on Koala's signed authorization letter (still to come).
- **Play, App content** (all 10 complete): Ads no; Advertising ID no; Government no; Financial features none; Health none; Target audience 16–17 and 18+; Content rating (IARC, "All other app types", contact hello@koalacoffee.gr): only "online content: yes" (catalog and stores load from the server), everything else no → PEGI 3 / ESRB Everyone / IARC 3+; Data safety: collected (not shared, encrypted in transit, all required, not ephemeral) Name (App functionality, Account management), Email (App functionality, Account management, Advertising or marketing), User IDs (App functionality, Account management), Purchase history (App functionality, Analytics, Fraud prevention); account creation "username and other authentication"; delete-account URL https://club.koalacoffee.gr/privacy (the "How long we keep it" section has the steps and what is erased or kept). Sign-in details and privacy policy were entered on 12 Nov.
- Still open at account level: Play's "Declare your trader status" banner (EU Digital Services Act) for GROW's developer account.

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

## Push notifications

Built 13 Nov 2026 (API contract v0.9): server live on Koala the same day (migration `push_notifications`, jobs `club-push-send` every minute and `club-push-reminders` daily 08:30 UTC). The app asks for permission once, registers the phone, and opens the card or the rewards on a tap; HQ writes offers in the back office (Μηνύματα). Texts: copy deck §d1 (title = "Koala Club").

Delivery goes through Expo's push service, which holds the credentials of each platform on expo.dev (project `koala-club`):

- **iOS:** the team's APNs key "GROW CRM push" (Key ID `YMKGLPS3M8`, team `JUVGRB24Q6`, Team Scoped, Sandbox & Production) was already saved in the grow-agency-lp Expo account and was linked to the Koala bundle on 13 Nov 2026 (Credentials → iOS → online.growagency.koala → Push key → Choose saved push key). The team holds the maximum of two such keys ("GROW CRM push" and "Finders"): Apple refuses a third, and revoking either one stops push in the apps that use it.
- **Android:** Firebase project `koala-club-83e47` (GROW's Google Cloud organisation growagency.online, no Analytics, no Gemini), Android app `online.growagency.koala`. Its `google-services.json` goes in `apps/mobile/brands/koala/` (not secret: it ships inside the app); the FCM V1 service account key goes on expo.dev (Credentials → Android → FCM V1 service account key), never in the repo.
- Both need a new store build (the push entitlement and Firebase come with the build): iOS 1.0.0 (10) and Android 1.0.0 (5), 13 Nov 2026. The FCM V1 key was generated in Firebase (Service accounts → Firebase Admin SDK) and uploaded to expo.dev the same day (private key ID a9a60fa1…, service account firebase-adminsdk-fbsvc).

## Apple Wallet

Pass Type ID `pass.online.growagency.koala` ("Koala Club loyalty card") registered 13 Nov 2026 in GROW's Apple Developer account; its certificate "Koala Club pass" (expires 13 Dec 2027: renew before then, or passes stop updating) made the same day and in the GitHub secrets. Its certificate is made on Dimos's Mac (Keychain → Certificate Assistant request → Apple Developer → Certificates → Pass Type ID Certificate → export as .p12) and goes into the GitHub secrets `APPLE_PASS_P12_KOALA` (base64) and `APPLE_PASS_P12_PASSWORD_KOALA`; CI hands it to the Edge Function. The Edge Function reads the certificate since 13 Nov 2026 (after a re-export: the first .p12 password didn't match), and `walletInApp: { apple: true }` in `apps/mobile/src/brand/koala.ts` shows the Apple Wallet button in the iOS app from the next build. Check it in TestFlight (the card → Add to Apple Wallet) before sending that build for review: store review refuses buttons that don't work.

## App store review account

Built 12 Nov 2026 (API contract v0.8). Reviewers sign in with `appreview@growagency.online` (`review.email` in `supabase/projects/koala.json`) and a fixed 10-digit code from the GitHub secret `REVIEW_SIGN_IN_CODE_KOALA`, typed where the emailed code goes. The account keeps at least 1,000 points so every screen can be tried; the till refuses its reward codes. The email and code go into App Store Connect → App Review information and Play Console → App access, never into the repo. Needs a store build made after this change (the app sends 10-digit codes to `auth/review-sign-in`).

## App design (v2 screens)

From 13 Nov 2026 the Koala app uses the screens of the Figma concept (`MHtMmw4vUc80oY5PuaBytx`) that the client saw in the presentation: fixed header with the logo, bottom bar with the active pill, three intro steps, sign-up in three steps, card with the framed QR and two progress bars, reward cards with illustrations, stores, profile with contact choices and data download, points history. Code: `apps/mobile/src/v2` (brand-neutral; Koala's colours, fonts, tier stickers and reward illustrations are in `src/brand/koala.ts` and `koalaArt.ts`). A brand without `v2` keeps the classic screens, so Overoll is unchanged.

- Fonts: Playpen Sans (stickers) and M PLUS Rounded 1c Black, subset to Latin + Greek (OFL, `apps/mobile/assets/fonts`).
- Reward illustrations: `rewards.icon` (migration `20261113000000_reward_icon.sql`, seed from `data/koala/rewards.json`); pie, muffin and cake drawn in the Figma style for Koala's menu.
- The welcome photo is the Figma placeholder (AI-generated, generic): replace with Koala's own shot (`apps/mobile/brands/koala/welcome-photo.jpg`).
- Sign-in by mobile (the segmented control in Figma) waits for an SMS provider; the screens show email only.

