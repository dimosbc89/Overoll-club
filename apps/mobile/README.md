# @overoll/mobile — Overoll Club customer app

Expo SDK 58 + expo-router. One codebase for **iOS, Android and the customer web app** (Expo web, static output).

| | |
| --- | --- |
| App name / slug | Overoll Club / `overoll-club` |
| Bundle id / package | `online.growagency.overoll` |
| URL scheme | `overollclub://` |

## Run

From the repo root (Node 22): `npm install`, then:

```bash
npm run web -w @overoll/mobile         # web app in the browser
npm run ios -w @overoll/mobile         # iOS simulator / Expo Go
npm run android -w @overoll/mobile
npm run export:web -w @overoll/mobile  # static web build in apps/mobile/dist
npm test -w @overoll/mobile            # vitest: i18n parity, € formatting, today's hours, maps links
npm run typecheck -w @overoll/mobile
```

## Environment

Create `apps/mobile/.env.local` (git-ignored):

```
EXPO_PUBLIC_SUPABASE_URL=https://lwhxqnmntihmavqngeca.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…
```

Only the **publishable** key, never the service-role key: `EXPO_PUBLIC_*` values are built into the app. Without them the app still builds and the Rewards and Stores tabs show a "not connected yet" message.

## Layout

| Path | What |
| --- | --- |
| `src/app/(tabs)` | Card, Rewards, Stores, Profile tabs |
| `src/app/+html.tsx` | HTML shell of the web app (lang, theme colour, favicon) |
| `src/i18n` | `el.json` (reference) and `en.json` with the same keys, typed `t()`, `I18nProvider` (choice saved with AsyncStorage) |
| `src/theme` | Brand tokens from `docs/brand.md`; fonts per platform |
| `src/lib` | Supabase client, queries, € formatting, opening hours, maps links |
| `test` | Unit tests for the pure helpers |

Rules: no user-facing text in components (add keys to both message files); money stays integer cents until `formatEuroFromCents`; text on pink is always cocoa.

## Placeholders

- **Card**: guest card with 0 points and an empty QR box; "Γίνε μέλος / Join" opens Profile. Sign-up, member card and rotating QR come in roadmap week 2.
- **Rewards**: live list from Supabase; costs are Classic costs (`base_cost`). Tier prices and redemption come with sign-in.
- **Stores**: live list; store names and addresses are Greek only (the `stores` table has no English columns yet).
- **Profile**: language switch works; sign-in button is disabled.
- No app icon or splash yet (needs 1024×1024 PNG exports of the mark); tabs are text-only until the icon set is designed.
