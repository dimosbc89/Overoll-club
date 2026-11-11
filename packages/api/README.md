# @overoll/api

The HTTP layer in front of `@overoll/server`. Runtime-neutral (Fetch API), so the same
handler runs in the Supabase Edge Function `api` (Deno) and in the Node tests.

All routes are `POST` with a JSON body and `Authorization: Bearer <token>`:

| Route | Caller | Operation |
| --- | --- | --- |
| `/api/join` | signed-in user | `joinMember` |
| `/api/scan` | store device / manager / HQ | `resolveMemberToken`: `{ storeId, token }` or `{ storeId, memberCode }` (typed code under the QR, v0.4) |
| `/api/award` | store device / manager | `awardPoints` (optional `receiptNumber`; result has `welcomeGiftUnlocked`) |
| `/api/undo` | device (within 10 min, with PIN) / manager / HQ | `undoEarn` |
| `/api/redemptions/create` | the member | `createRedemption` (`rewardId` or `giftId`) |
| `/api/redemptions/cancel` | the member | `cancelRedemption` |
| `/api/redemptions/use` | store device / manager | `useRedemption` |
| `/api/account/delete` | the member (own token) | `deleteMember`: `{ confirm: true, idempotencyKey }` → `{ ok, memberIds, codesCancelled, authUserDeleted }`; deletes the auth user with `deps.deleteAuthUser` (Auth admin API) when the database role could not (v0.4) |
| `/api/staff/verify-pin` | store device / manager | `verifyEmployeePin`: `{ storeId, employeeId, pin }` → `{ ok, employee: { id, displayName } }` |
| `/api/staff/employees/create`, `/api/staff/employees/update` | store manager, HQ (v0.5) | `createEmployee`, `updateEmployee` |
| `/api/staff/add`, `/api/staff/remove` | HQ (v0.5) | `addStaff` (needs the `ensureAuthUser` dependency, else 501 `not_configured`), `removeStaff` |
| `/api/points/adjust` | HQ (v0.5) | `adjustPoints` |
| `/api/jobs/expire-redemptions` | service role key only | `expireRedemptions` (every minute; also expires gifts) |
| `/api/jobs/expire-points` | service role key only | `expirePoints` (daily) |

- Identity comes only from the verified token; `userId`, `callerUserId` and `now` in a body are dropped.
- Responses: `200 {ok:true,…}`; errors `{ok:false, code, message?}` with 400 `invalid_input`,
  401 `unauthenticated`, 403 `forbidden`, 404 unknown route, 409 `idempotency_conflict`, `device_in_other_store`, `last_hq_admin`, 501 `not_configured`,
  422 any other business error (e.g. `amount_over_limit`, `daily_earn_limit_reached`, `receipt_already_used`,
  `pin_locked`, `gift_used`), 500 `internal_error`.
- Jobs take an optional `batchSize` (a positive whole number; anything else means the default, 100).
- Bodies over 16 KB are refused. CORS origins from `ALLOWED_ORIGINS` (default `*`).

Tests (`npm test -w @overoll/api`) reuse the throwaway Postgres of `packages/server`.

## Edge Function

`supabase/functions/api/app.ts` wires the handler to Supabase (JWT check with `getClaims`,
Postgres through `SUPABASE_DB_URL`, `deleteAuthUser` with the Auth admin API and the service key). `npm run functions:build` bundles it into
`supabase/functions/api/dist/app.js` with no imports left; `index.ts` passes in
`npm:postgres` and `npm:@supabase/supabase-js`. CI deploys it on every push to `main`
once the `SUPABASE_ACCESS_TOKEN` secret is set in GitHub.
