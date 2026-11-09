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
- ☐ D: upgrade the GROW Agency Supabase org to Pro (about $25/month) before the pilot on 7 Dec: free projects pause after a week without traffic and have no daily backups
- ☑ C: Apple Developer (GROW AGENCY L.P., team `JUVGRB24Q6`): Pass Type ID `pass.online.growagency.overoll` registered
- ☐ C + D: Pass Type ID certificate (week 2, with the Wallet card)
- ☑ D: Google Pay & Wallet Console business profile for GROW Agency (merchant `BCR2DN6DWL3NFGYM`, account ads@growdigital.gr)
- ☑ D: Google Wallet API terms accepted: issuer `3388000000023239253` (demo mode)
- ☑ C: demo loyalty class `overoll_club` (logo, Overoll pink) created: step 1 of 3 for publishing access
- ☐ C: request publishing access as soon as the business profile is approved (step 3 of 3)
- ☐ C + D: Google Cloud service account with the Wallet API, registered in the console (week 2, for creating passes from our server)
- ☐ D: complete the Google business profile (legal name, address) so Google can approve it (step 2 of 3), and add a second admin
- ☑ C: brand (logos, colours, fonts) from the website project → `docs/brand.md`, `assets/brand/`
- ☑ C: store list (10 stores) from the website + Wolt → `data/stores.json`
- ☑ C: menu with prices from Wolt + reward catalog proposal → `docs/menu-and-rewards.md`, `supabase/seed.sql`
- ☑ C: pilot store chosen: **Chalandri** (Κατσουλιέρη 10)
- ☑ C: authorization letter drafted (Greek + English)
- ☐ D: Overoll fills in and signs the authorization letter
- ☑ D: reward catalog, welcome croissant and Club tier approved; launch with Wolt prices and the 10 stores found
- ☐ C: design drafts: join flow, member card, rewards, staff console, HQ dashboard
- ☑ C: points engine (`packages/server`: join, scan, award, undo, redeem, use, expire) with 61 database tests
- ☑ C: HTTP API (`packages/api`) + Edge Function `api` bundle; CI on GitHub Actions (typecheck, tests, DB tests, build)
- ☑ D: Supabase access token as GitHub secret: CI deploys the `api` Edge Function from `main` (live since 9 Nov)
- ☐ D: from Overoll: their production domain and DNS access for `club.` (landing page + web app); the website itself runs on Cloudflare Pages
- ☑ C: copy deck v0.1 el/en (`docs/copy-deck.md`, `data/copy/errors.*.json`)
- ☑ D: copy deck questions answered: welcome gift 30 days, PIN once per shift, €80 cap, age 15+ (rules in `packages/core` config)
- ☐ D: review the copy deck text itself; Overoll answers the rest (legal name)
- ☑ C: welcome gift in the database and `awardPoints` (unlock on first purchase, redeem with a code, expire after 30 days)
- ☑ C: late points for a forgotten card (same day, same store, receipt number used once)
- ☑ C: API v0.2 server side (`docs/api-contract.md`): staff PIN check (`staff/verify-pin`) with lockout after 5 wrong PINs in every PIN check, points expiry job (`jobs/expire-points`); 4 migrations, not yet applied to Supabase
- ☐ C + D: apply the 4 v0.2 migrations and the seed (sets the welcome reward) to Supabase; schedule `jobs/expire-redemptions` (every minute) and `jobs/expire-points` (daily)
- ☐ D: approve the new error texts (`pin_locked`, `receipt_already_used`, `gift_*`) in the copy deck §f2
- ☐ D: the Overoll design system mentions stores at the airport and in Nicosia: confirm with Overoll and add them to `data/stores.json`
- ☑ C: screen designs v0.1 (member app, till console, landing page, Wallet passes) on the design canvas; Figma copy for the designer

## Week 2 · 16–22 Nov · Join flow + card + Wallet

- ☑ C: scaffold `apps/mobile` (Expo: iOS, Android, web) and `apps/admin` (Next.js)
- ☐ C: sign-up / login (email or SMS one-time code), Greek + English
- ☐ C: member card with rotating QR, points, progress to next reward
- ☐ C: Apple Wallet + Google Wallet passes with live updates
- ☐ D: test sign-up on iPhone and Android; review designs with Overoll

## Week 3 · 23–29 Nov · Staff console + rewards

- ☐ C: staff console: device login, employee PIN, scan, award by amount, undo
- ☐ C: rewards catalog, redemption codes, scan to redeem
- ☐ C: tiers (annual review), fraud alerts (expiry job and PIN lockout done in week 1)
- ☐ D: test the full loop: join → scan → points → reward → redeem

## Week 4 · 30 Nov – 6 Dec · Back office + test

- ☐ C: HQ admin: stores, employees, rewards, members (search, adjust with reason), dashboard
- ☐ C: store manager view: own store numbers and transactions, monthly redemption report
- ☐ C: send a message to members (push + Wallet), manual for now
- ☐ C: print files: counter QR stand per store, cup/bag sticker
- ☐ D: end-to-end test with 5 friends; print the pilot materials for Chalandri

## Week 5 · 7–13 Dec · Pilot (1 store)

- ☐ D: train Chalandri staff (15 minutes), go live in the pilot store
- ☐ C: daily check of errors and numbers; fixes within 24 h
- ☐ C: welcome reward switched on (no double points: decided 9 Nov). The switch is `brands.config.welcome.rewardId`, which the seed sets

## Week 6 · 14–20 Dec · Fixes + apps to the stores

- ☐ C: fixes from pilot
- ☐ C: build and submit iOS and Android apps (**by 14 Dec**, reviews slow down 20–26 Dec)
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
