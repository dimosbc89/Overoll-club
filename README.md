# Overoll Club

Loyalty program for **Overoll Croissanterie**: customers join from a QR on the counter, keep their card in Apple/Google Wallet or the app, earn points at every visit and redeem free coffee and croissants. Each store has a staff console; Overoll HQ runs everything from one back office.

Built by [GROW Agency](https://growagency.online).

| | |
| --- | --- |
| Program rules | [docs/program-spec.md](docs/program-spec.md) |
| Roadmap to launch (Jan 2027) | [docs/roadmap.md](docs/roadmap.md) |
| How we work in this repo | [CLAUDE.md](CLAUDE.md) |

## Status

Week 1 foundation: program rules engine (`packages/core`, 32 tests), database schema with access rules (`supabase`, 50 checks), brand, stores, menu and reward catalog (`docs`, `data`). Apps and back office are next.

## Environments

| | |
| --- | --- |
| Supabase project | `overoll-club`, ref `lwhxqnmntihmavqngeca`, GROW Agency org, Frankfurt (eu-central-1) |
| API URL | https://lwhxqnmntihmavqngeca.supabase.co |
| Migrations | `supabase/migrations`; file names match the versions applied to the project |
| Seed | `supabase/seed.sql`, applied 9 Nov 2026 (1 brand, 10 stores, 7 rewards) |
| Apple | GROW AGENCY L.P., team `JUVGRB24Q6`; Pass Type ID `pass.online.growagency.overoll` |
| Google Pay & Wallet Console | GROW Agency, merchant `BCR2DN6DWL3NFGYM` (ads@growdigital.gr) |
| Google Wallet API | issuer `3388000000023239253`, demo mode; loyalty class `3388000000023239253.overoll_club` |
| Brand images (public) | Supabase Storage bucket `brand`, e.g. `…/storage/v1/object/public/brand/overoll/wallet-program-logo.png` |

Variable names are in `.env.example`; values never go in git.

## Quick start

```bash
nvm use            # Node 22
npm install
npm test           # rules engine tests
npm run test:db    # database tests (needs a local PostgreSQL 15+ install)
npm run seed:generate  # rebuild supabase/seed.sql from data/*.json
```
