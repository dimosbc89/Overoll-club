# Overoll Club — working agreement for Claude

Loyalty platform for Overoll Croissanterie (11–20 stores, Greece + Cyprus), built by GROW Agency.
Team of two: Dimos (product owner, client, accounts, device testing) and Claude (spec, code, tests, docs).
Deadline: every store live in the week of 4 January 2027, on web app + Apple/Google Wallet. Native apps follow.

Read first: `docs/program-spec.md` (the rules), `docs/roadmap.md` (what's next, who owns it).
The product plan with features and architecture lives in a shared doc:
https://claude.ai/artifact/WaTPFf7zJmC1hqVqioeEDC

## Repo layout

| Path | What |
| --- | --- |
| `packages/core` | Program rules as pure TypeScript: points, tiers, rewards, expiry, member QR tokens. No I/O. |
| `packages/server` | Transactional operations that move points (join, scan, award, undo, redeem, use, expire). Postgres via `postgres`, rules from `packages/core`, integration tests on a throwaway Postgres |
| `packages/api` | HTTP layer (Fetch API) in front of `packages/server`: routes, auth from the verified token, status codes |
| `supabase/migrations` | Database schema, row-level security, triggers |
| `supabase/tests` | `run-local.sh` spins up a throwaway Postgres and runs `rls.sql` |
| `supabase/functions` | Edge Function `api` (wires `packages/api` to Supabase; bundled by `scripts/build-functions.ts`); Wallet passes next |
| `apps/mobile` | Expo app: iOS, Android **and** the customer web app (Expo web) |
| `apps/admin` | Next.js back office: HQ admin, store manager, staff console |
| `data` | Source data: stores, menu (Wolt prices), reward catalog. Feeds `supabase/seed.sql` |
| `scripts` | `generate-seed.ts`: builds `supabase/seed.sql` from `data/` with reward costs from `packages/core` |
| `assets/brand` | Overoll logos (SVG); colours and fonts in `docs/brand.md` |
| `docs` | Spec, roadmap, brand, menu and rewards |

## Rules of the codebase

- **One source of truth for rules:** every number and calculation lives in `packages/core`. Apps and server functions call it; never re-implement a rule elsewhere.
- **Money = integer cents, points = integers.** No floating point near a balance.
- **The ledger is append-only.** Balances are always derived (`member_balances` view). Corrections are new entries (`reverse`, `adjust`, `refund_redeem`).
- **Clients only read.** Anything that moves points (earn, redeem, undo, adjust, expire) runs in a server function with the service role, with an idempotency key.
- **Multi-brand from day one:** every table has `brand_id`; cross-brand references are impossible (composite foreign keys).
- **Every new table gets RLS + explicit grants**, and a test in `supabase/tests/rls.sql`.
- **Bilingual:** user-facing text in Greek (default) and English. Never hard-code one language in UI.
- **Secrets never in git:** `.env` files are ignored; use `.env.example` for names only.
- TypeScript `strict`, ESM, Node 22.

## Commands

```bash
npm install            # from repo root
npm test               # all workspace unit tests (packages/core: vitest) + seed up to date
npm run typecheck
npm run test:db        # database schema + access-rule tests on a local throwaway Postgres, plus the seed
npm run seed:generate  # rebuild supabase/seed.sql after changing data/*.json
npm run functions:build # bundle Edge Functions (CI deploys them from main)
npm run project:check  # validate supabase/project.config.json + sign-in email (CI applies it from main)
npm run migrations:apply # (CI) apply new migrations to the hosted database
```

## Workflow

- Small branches, one feature each; tests must pass before merging to `main` (GitHub Actions runs typecheck, tests, database tests and the function build).
- New migrations: add `supabase/migrations/<YYYYMMDDHHMMSS>_<name>.sql` (version later than the last one) and merge to `main`; CI applies it after the tests (`scripts/apply-migrations.ts`, recorded under the file's version). Don't apply migrations by hand.
- When a rule changes, update `docs/program-spec.md`, `packages/core/src/config.ts` and its tests in the same change.
- Tick items in `docs/roadmap.md` as they're done.
- Dimos approves anything customer-facing (copy, screens, rewards) before it ships.
