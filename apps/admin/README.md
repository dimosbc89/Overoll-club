# @overoll/admin — Overoll Club back office

Next.js 16 (App Router). HQ admin, store manager views and the staff console (till).

## Run

From the repo root (Node 22): `npm install`, then:

```bash
npm run dev -w @overoll/admin        # http://localhost:3000
npm run build -w @overoll/admin
npm run start -w @overoll/admin
npm test -w @overoll/admin           # vitest: i18n parity, € formatting, today's hours, keypad, tier costs
npm run typecheck -w @overoll/admin  # next typegen + tsc
```

Dev and build use **webpack** (`--webpack`): `@overoll/core` imports its own files as `./config.js`, which Turbopack can't map to `.ts` yet (`experimental.extensionAlias` in `next.config.ts`).

## Environment

Create `apps/admin/.env.local` (git-ignored):

```
NEXT_PUBLIC_SUPABASE_URL=https://lwhxqnmntihmavqngeca.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…
```

Next.js bakes `NEXT_PUBLIC_*` in at **build** time, so set them before `npm run build` (on the host too). Never put the service-role key here. Without them the build still succeeds and the Stores and Rewards pages show "Supabase is not configured".

## Layout

| Path | What |
| --- | --- |
| `src/app` | `/` dashboard, `/stores`, `/rewards`, `/console`, `/sign-in` |
| `src/i18n` | `el.json` (reference) and `en.json` with the same keys, typed `t()`; language in the `overoll_locale` cookie, set by a server action |
| `src/lib` | Supabase reads (server only), € formatting, opening hours, keypad, tier costs via `@overoll/core` |
| `src/app/globals.css` | Brand tokens from `docs/brand.md` as CSS variables |

Rules: point costs and limits come from `@overoll/core` (`rewardCostForTier`, `defaultConfig`), never re-implemented here; money stays integer cents until `formatEuroFromCents`.

## Placeholders

- **Dashboard**: three empty stat tiles. Numbers come with the back office (roadmap week 4).
- **Stores / Rewards**: read-only tables with the publishable key. Editing needs staff sign-in.
- **Console**: Scan shows "coming soon"; the keypad builds an integer-cents amount capped at `limits.maxAmountCents` (€80); "Add points" is disabled. No device login, PIN or server calls yet (week 3).
- **Sign in**: disabled form. Staff accounts (Supabase Auth + `staff_roles`, sessions via `@supabase/ssr`) come next.
