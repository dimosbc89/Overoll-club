# @overoll/api

The HTTP layer in front of `@overoll/server`. Runtime-neutral (Fetch API), so the same
handler runs in the Supabase Edge Function `api` (Deno) and in the Node tests.

All routes are `POST` with a JSON body and `Authorization: Bearer <token>`:

| Route | Caller | Operation |
| --- | --- | --- |
| `/api/join` | signed-in user | `joinMember` |
| `/api/scan` | store device / manager / HQ | `resolveMemberToken` |
| `/api/award` | store device / manager | `awardPoints` |
| `/api/undo` | device (within 10 min, with PIN) / manager / HQ | `undoEarn` |
| `/api/redemptions/create` | the member | `createRedemption` |
| `/api/redemptions/cancel` | the member | `cancelRedemption` |
| `/api/redemptions/use` | store device / manager | `useRedemption` |
| `/api/jobs/expire-redemptions` | service role key only | `expireRedemptions` |

- Identity comes only from the verified token; `userId`, `callerUserId` and `now` in a body are dropped.
- Responses: `200 {ok:true,…}`; errors `{ok:false, code, message?}` with 400 `invalid_input`,
  401 `unauthenticated`, 403 `forbidden`, 404 unknown route, 409 `idempotency_conflict`,
  422 any other business error (e.g. `amount_over_limit`, `daily_earn_limit_reached`), 500 `internal_error`.
- Bodies over 16 KB are refused. CORS origins from `ALLOWED_ORIGINS` (default `*`).

Tests (`npm test -w @overoll/api`) reuse the throwaway Postgres of `packages/server`.

## Edge Function

`supabase/functions/api/app.ts` wires the handler to Supabase (JWT check with `getClaims`,
Postgres through `SUPABASE_DB_URL`). `npm run functions:build` bundles it into
`supabase/functions/api/dist/app.js` with no imports left; `index.ts` passes in
`npm:postgres` and `npm:@supabase/supabase-js`. CI deploys it on every push to `main`
once the `SUPABASE_ACCESS_TOKEN` secret is set in GitHub.
