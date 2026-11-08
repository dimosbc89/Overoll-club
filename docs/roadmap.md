# Overoll Club — Roadmap to early January 2027

Team: Dimos (product, client, accounts, testing) + Claude (spec, design drafts, code, tests, docs).
Launch goal: every store live in the week of **4 January 2027**, on web app + Apple/Google Wallet.
The native iOS/Android apps are submitted in December and join when Apple and Google approve them.

Legend: **D** = Dimos · **C** = Claude · ☐ open · ☑ done

## Week 1 · 9–15 Nov · Foundation

- ☑ C: program spec v0.1 (`docs/program-spec.md`)
- ☑ C: database schema with access rules (`supabase/migrations`)
- ☑ C: points engine with tests (`packages/core`)
- ☐ D: create a Supabase project (EU, Frankfurt) and invite Claude's workflow (share keys via `.env`, never in git)
- ☐ D: Apple Developer (GROW account): create Pass Type ID `pass.online.growagency.overoll`
- ☐ D: Google Pay & Wallet Console: apply for an issuer account (approval can take days)
- ☑ C: brand (logos, colours, fonts) from the website project → `docs/brand.md`, `assets/brand/`
- ☑ C: store list (10 stores) from the website + Wolt → `data/stores.json`
- ☑ C: menu with prices from Wolt + reward catalog proposal → `docs/menu-and-rewards.md`, `supabase/seed.sql`
- ☑ C: pilot store chosen: **Chalandri** (Κατσουλιέρη 10)
- ☑ C: authorization letter drafted (Greek + English)
- ☐ D: Overoll fills in and signs the authorization letter
- ☐ D: Overoll confirms: in-store prices, opening hours, Glyfada phone, any stores we missed (Nicosia?)
- ☐ D: approve the reward catalog and the welcome reward (free butter croissant)
- ☐ C: design drafts: join flow, member card, rewards, staff console, HQ dashboard

## Week 2 · 16–22 Nov · Join flow + card + Wallet

- ☐ C: scaffold `apps/mobile` (Expo: iOS, Android, web) and `apps/admin` (Next.js)
- ☐ C: sign-up / login (email or SMS one-time code), Greek + English
- ☐ C: member card with rotating QR, points, progress to next reward
- ☐ C: Apple Wallet + Google Wallet passes with live updates
- ☐ D: test sign-up on iPhone and Android; review designs with Overoll

## Week 3 · 23–29 Nov · Staff console + rewards

- ☐ C: staff console: device login, employee PIN, scan, award by amount, undo
- ☐ C: rewards catalog, redemption codes, scan to redeem
- ☐ C: tiers, expiry job, fraud limits
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
- ☐ C: welcome reward + launch double points switched on

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
