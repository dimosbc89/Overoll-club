# Overoll Club — Roadmap to early January 2027

Team: Dimos (product, client, accounts, testing) + Claude (spec, design drafts, code, tests, docs).
Launch goal: every store live in the week of **4 January 2027**, on web app + Apple/Google Wallet.
The native iOS/Android apps are submitted in December and join when Apple and Google approve them.

Legend: **D** = Dimos · **C** = Claude · ☐ open · ☑ done

## Week 1 · 9–15 Nov · Foundation

- ☑ C: program spec v0.1 (`docs/program-spec.md`)
- ☑ C: database schema with access rules (`supabase/migrations`)
- ☑ C: points engine with tests (`packages/core`)
- ☑ C: server operations that move points, with integration tests on a throwaway Postgres (`packages/server`): join, scan, award, undo, redeem, cancel, use, expire codes. Next: wrap them as Supabase Edge Functions
- ☑ C: Supabase project `overoll-club` (GROW Agency org, Frankfurt, free plan): schema + seed applied, security advisor clean
- ☑ D: GROW Agency Supabase org on Pro (9 Nov): sign-in code email template applied, daily backups, no pausing
- ☑ C: Apple Developer (GROW AGENCY L.P., team `JUVGRB24Q6`): Pass Type ID `pass.online.growagency.overoll` registered
- ☐ C + D: Pass Type ID certificate (week 2, with the Wallet card)
- ☑ D: Google Pay & Wallet Console business profile for GROW Agency (merchant `BCR2DN6DWL3NFGYM`, account ads@growdigital.gr)
- ☑ D: Google Wallet API terms accepted: issuer `3388000000023239253` (demo mode)
- ☑ C: demo loyalty class `overoll_club` (logo, Overoll pink) created: step 1 of 3 for publishing access
- ☐ C: request publishing access as soon as the business profile is approved (step 3 of 3)
- ◐ C + D: Google Cloud service account with the Wallet API, registered in the console: `wallet-issuer@grow-wallet-514520.iam.gserviceaccount.com` (project `grow-wallet-514520`, account ads@growdigital.gr, billing "My Billing Account"), Wallet API on, Developer in the Pay & Wallet Console (12 Nov 2026). Key in the GitHub secret `GOOGLE_WALLET_SERVICE_ACCOUNT` and on both brands' functions (12 Nov). Business profile completed; publishing access requested 12 Nov (Google answers in 2–3 days by email to ads@growdigital.gr). Until then only the console's users can save a pass (test with ads@growdigital.gr)
- ☐ D: complete the Google business profile (legal name, address) so Google can approve it (step 2 of 3), and add a second admin
- ☑ C: brand (logos, colours, fonts) from the website project → `docs/brand.md`, `assets/brand/`
- ☑ C: store list (10 stores) from the website + Wolt → `data/overoll/stores.json`
- ☑ C: menu with prices from Wolt + reward catalog proposal → `docs/menu-and-rewards.md`, `supabase/seed/<brand>.sql`
- ☑ C: pilot store chosen: **Chalandri** (Κατσουλιέρη 10)
- ☑ C: authorization letter drafted (Greek + English)
- ☐ D: Overoll fills in and signs the authorization letter
- ☑ D: reward catalog, welcome croissant and Club tier approved; launch with Wolt prices and the 10 stores found
- ☑ C: design drafts: join flow, member card, rewards, staff console (HQ dashboard in week 4)
- ☑ C: points engine (`packages/server`: join, scan, award, undo, redeem, use, expire) with 61 database tests
- ☑ C: HTTP API (`packages/api`) + Edge Function `api` bundle; CI on GitHub Actions (typecheck, tests, DB tests, build)
- ☑ D: Supabase access token as GitHub secret: CI deploys the `api` Edge Function from `main` (live since 9 Nov)
- ☑ D: web address decided: `loyalty.overoll.gr` (landing + web app), `admin.loyalty.overoll.gr` (back office + till console), hosted on Cloudflare Pages; sign-in emails via Resend
- ☑ C: email to Overoll's IT with the DNS records for Papaki (2 CNAME for the sites, 4 for the sign-in email; `docs/dns-records.md`)
- ☑ D + C: Resend (team growagency, Pro since 9 Nov): domain `overoll.gr` added in Ireland (eu-west-1) for sender `app@overoll.gr`; final DNS records in `docs/dns-records.md` and in the IT email
- ☐ C + D: once Resend shows the domain verified, connect SMTP to Supabase (Resend's Supabase integration or an API key as GitHub secret `RESEND_API_KEY`) and set `email.enabled`
- ☐ D: Overoll's IT adds the DNS records
- ☑ C: Cloudflare Pages projects `overoll-loyalty` (member web app → https://overoll-loyalty.pages.dev) and `overoll-loyalty-admin` (back office + till → https://overoll-loyalty-admin.pages.dev), connected to the GitHub repo: every push to `main` builds and deploys (`npm run build:web:mobile|admin`), no token. Custom domains added, waiting for the DNS records
- ☑ C: Supabase settings as code (`supabase/projects/overoll.json`): site URL, redirect URLs, 6-digit sign-in code valid 10 minutes, Greek + English code email, API CORS origins; applied by CI
- ☐ C: switch on SMTP once Resend has verified the domain (until then sign-in emails reach only Supabase org members, a few per hour)
- ☑ C: copy deck v0.1 el/en (`docs/copy-deck.md`, `data/copy/errors.*.json`)
- ☑ D: copy deck questions answered: welcome gift 30 days, PIN once per shift, €80 cap, age 15+ (rules in `packages/core` config)
- ☐ D: review the copy deck text itself; Overoll answers the rest (legal name)
- ☑ C: welcome gift in the database and `awardPoints` (unlock on first purchase, redeem with a code, expire after 30 days)
- ☑ C: late points for a forgotten card (same day, same store, receipt number used once)
- ☑ C: API v0.2 server side (`docs/api-contract.md`): staff PIN check (`staff/verify-pin`) with lockout after 5 wrong PINs in every PIN check, points expiry job (`jobs/expire-points`)
- ☑ C: v0.2 + v0.3 live on Supabase (9 Nov): 5 migrations, welcome reward set, API deployed; pg_cron runs `jobs/expire-redemptions` every minute and `jobs/expire-points` daily (`supabase/jobs.sql`, token kept in Vault)
- ☑ C: API v0.3: `join` stores the 15+ box (`minimum_age_confirmed_at`), gift codes return `giftId`
- ☐ D: approve the new texts: error messages (`pin_locked`, `receipt_already_used`, `gift_*`, §f2), console labels (§f1b, 55), member app additions (§b7, 31), sign-in code email (§e2)
- ☐ D: the Overoll design system mentions stores at the airport and in Nicosia: confirm with Overoll and add them to `data/overoll/stores.json`
- ☑ C: screen designs v0.1 (member app, till console, landing page, Wallet passes) on the design canvas; Figma copy for the designer

## Week 2 · 16–22 Nov · Join flow + card + Wallet

- ☑ C: scaffold `apps/mobile` (Expo: iOS, Android, web) and `apps/admin` (Next.js)
- ☑ C: sign-up / login with an email one-time code, Greek + English (`apps/mobile`: join from the counter QR, sign-in, consents); SMS when the provider is chosen
- ☑ C: member card with rotating QR, points, progress to next reward and tier; rewards with tier prices and the redeem flow (code, countdown, cancel), history, profile
- ◐ C: Apple Wallet + Google Wallet passes with live updates: built and tested on 12 Nov 2026 (API contract v0.7: pass, links, PassKit web service, update job); waiting for the Pass Type ID certificates and the Google service account (D) to go live, then a check on a real iPhone and Android phone
- ☑ C: design v2 in Figma (9 Nov, from the client brief; `docs/design-v2.md`): design system, components, 7-step onboarding, Card, Rewards, Redeem, Stores, Profile, History
- ☐ D: designer + Overoll review v2; decide coloured headings (plum, or pink only as decoration: pink text fails contrast on white) and approve the draft texts (copy deck §a0)
- ☐ C: build v2 into the member app (web + iOS + Android) once approved
- ☐ D: test sign-up on iPhone and Android; review designs with Overoll

## Week 3 · 23–29 Nov · Staff console + rewards

- ☑ C: staff console (`apps/admin` `/console`, built 9 Nov): device sign-in, cashier PIN with idle lock, camera/typed scan, amount keypad with points preview, late points by receipt, undo, redeem by code, today's activity
- ☑ C: rewards catalog, redemption codes (member app) and scan to redeem (console)
- ☑ C: short member code the cashier can type: `scan` takes `memberCode` (case, spaces, dashes, Greek look-alikes don't matter); the console's typed field takes the token, the member code or a reward code (API v0.4)
- ☑ C: account deletion (server route `account/delete` + Profile → Delete account screen): pending codes cancelled without refund, personal fields wiped, QR secret and auth user deleted, ledger kept; rejoining with the same email works (API v0.4, migration `account_deletion`)
- ☑ C: English store names (`stores.name_en`, `address_en`, seeded from `data/overoll/stores.json`): console header, back-office stores, member app store list, join greeting and history
- ☐ D + C: apply the v0.4 migrations (`account_deletion`, `store_names_en`) to Supabase, rename the files to the recorded versions, re-run `supabase/seed/<brand>.sql` (fills the English names), deploy; then delete a test account in the app and check the auth user is gone (if the `postgres` role may not delete auth users, the Edge Function does it with the Auth admin API)
- ☐ D: approve the v0.4 texts: `member_deleted` and `member_not_found` (§f2, changed), `console.scan.typeHint` (§f1b); the landing FAQ `landing.faq.delete.a` still mentions downloading a copy of your data first, which isn't built yet
- ☑ C: keep the member's QR secret in the phone's secure storage in the native apps (Keychain / Keystore via expo-secure-store, this device only, out of backups; the web keeps it in browser storage; 12 Nov)
- ☑ C: tiers: yearly review on the join anniversary (12 Nov: daily job `jobs/review-tiers`, one level down at most, audited)
- ☐ C: fraud alerts (expiry job and PIN lockout done in week 1)
- ☐ D: test the full loop: join → scan → points → reward → redeem

## Week 4 · 30 Nov – 6 Dec · Back office + test

- ☑ C: back office v0.5 (11 Nov, both brands): HQ and store-manager sign-in, dashboard (today / 7 days, per store), cashiers with PIN, till devices and managers by email, HQ admins, member search with history and points correction with reason (`docs/api-contract.md` v0.5)
- ☑ C: HQ admin: edit stores and the reward catalog from the back office (v0.6, 12 Nov: details, opening hours, open/close a store; rewards with price → points from core, switch off/on; audited; the welcome gift can't be switched off)
- ☑ C: store manager view: monthly redemption report (12 Nov: Αναφορές page, per reward and per cashier, value at the in-store price when handed out, CSV for Excel; own store numbers and cashiers: done in v0.5)
- ☑ C: push notifications, server (13 Nov, API v0.9): phones register, points / reward / tier / welcome gift / expired code / expiry reminders sent through Expo, HQ messages to members who said yes (`messages/send`)
- ☑ C: push in the apps (13 Nov: permission asked once after the card loads, token registered on every start and dropped on sign-out, a tap opens the card or the rewards, "turn on notifications" in Profile; white notification icon per brand) and the back-office page Μηνύματα (HQ: write, count, send, list)
- ☑ C: new store builds with push (13 Nov: iOS 1.0.0 (10) in TestFlight and on the 1.0.0 version page, Android 1.0.0 (5) AAB)
- ☐ D: push credentials on expo.dev (iOS APNs key ☑ 13 Nov, Android FCM V1 key: upload the JSON) and Firebase project ☑; approve the push texts (copy deck §d1)
- ☐ C: print files: counter QR stand per store, cup/bag sticker
- ☐ D: end-to-end test with 5 friends; print the pilot materials for Chalandri

## Week 5 · 7–13 Dec · Pilot (1 store)

- ☐ D: train Chalandri staff (15 minutes), go live in the pilot store
- ☐ C: daily check of errors and numbers; fixes within 24 h
- ☐ C: welcome reward switched on (no double points: decided 9 Nov). The switch is `brands.config.welcome.rewardId`, which the seed sets

## Week 6 · 14–20 Dec · Fixes + apps to the stores

- ☐ C: fixes from pilot
- ☐ C: build and submit iOS and Android apps (**by 14 Dec**, reviews slow down 20–26 Dec)
- ☑ C: app store review account (12 Nov: fixed 10-digit code for the review email, at least 1,000 points, codes refused at the till; API contract v0.8)
- ☐ D: GitHub secret `REVIEW_SIGN_IN_CODE_<BRAND>` (10 digits) and the `appreview@growagency.online` mailbox; then the review details in App Store Connect and Play Console
- ☐ D: staff training card + video for all stores; print QR stands for every store

## 21 Dec – 3 Jan · Holiday freeze

- Pilot keeps running. Only bug fixes, no new features.
- ☐ D: deliver QR stands and stickers to every store

## Week of 4 Jan · Network launch

- ☐ D + C: switch on all stores, Instagram launch posts, Meta ads around each store
- ☐ C: daily monitoring for 2 weeks

## After launch (January–February)

- Native apps live (if not already)
- Birthday, referral, streak, quiet-hour bonuses; win-back automation
- Delivery codes decision; POS discovery for integration
- Newsletter invitation to Overoll's existing list (marketing, later)
- Phase 2 list in the plan doc

## Koala Club (second brand, from 11 Nov) · details in `docs/koala/README.md`

- ☑ C: multi-brand platform: one Supabase project per brand (`supabase/projects/<brand>.json`), data and seed per brand, CI deploys each brand on its own
- ☑ C: Koala brand layer in the apps (theme, logo, fonts, copy in Greek and English)
- ☑ C: Supabase project `koala-club`: database (11 migrations, 2 stores, 9 rewards, cinnamon roll welcome gift)
- ☑ D: GitHub secret `SUPABASE_ACCESS_TOKEN_KOALA` (11 Nov)
- ☑ C: CI deploys the API, Auth settings and scheduled jobs to `koala-club`; checked (11 Nov)
- ☑ C: Cloudflare Pages `koala-club` (https://koala-club.pages.dev) and `koala-club-admin` (https://koala-club-admin.pages.dev), built from `main`
- ☐ D + C: end-to-end test with a real sign-in: ~~Dimos signs in to the Koala back office once, Claude gives that account the platform role~~ (done 12 Nov; sign-in code arrived through Resend), then a till device and a cashier from the Staff page; join, points at the till, reward code
- ☐ D: answers from Koala (catalog and prices, opening hours, names, domain and sender email, legal entity, wordmark, efood, till device)
- ☑ C + D: EAS project `koala-club` on GROW AGENCY LP's Expo account, GitHub secret `EXPO_TOKEN`, build workflow (`.github/workflows/native.yml`); first Android test APK built 12 Nov
- ☐ D: test the Android APK on a phone (sign-in, card and QR, rewards, counter QR deep link `koalaclub://join`)
- ☐ D + C: iOS: App Store Connect API key (Admin) in GitHub secrets, or one interactive build; then a TestFlight build
- ☐ D: store records: Google Play Console app (GROW's account) and App Store Connect app (`online.growagency.koala`), with Koala's authorization letter
- ☑ C: store declarations (13 Nov): App Store App Privacy, age rating (16+, terms minimum 15), content rights; Play Data safety, content rating (PEGI 3), target audience 16+, ads, advertising ID, government, financial, health (answers in `docs/koala/README.md`)
- ☐ D: Play account trader status (EU Digital Services Act banner)
