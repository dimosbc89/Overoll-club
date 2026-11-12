/**
 * HTTP layer for the server operations. Runtime-neutral (Fetch API only), so
 * the same handler runs in the Supabase Edge Function (Deno) and in Node tests.
 *
 * Every route is POST with a JSON body. The caller's identity always comes from
 * the verified access token, never from the body: any `userId`,
 * `callerUserId` or `now` in the body is dropped.
 */
import {
  type Db,
  addStaff,
  adjustPoints,
  awardPoints,
  cancelRedemption,
  createEmployee,
  createRedemption,
  deleteMember,
  expirePoints,
  expireRedemptions,
  joinMember,
  removeStaff,
  resolveMemberToken,
  undoEarn,
  updateEmployee,
  useRedemption,
  verifyEmployeePin,
} from '@grow-loyalty/server';

export interface HandlerDeps {
  sql: Db;
  /** Verifies the bearer token and returns the user id (JWT `sub`), or null. */
  authenticate(token: string): Promise<string | null>;
  /** True when the bearer token is the service role secret (scheduled jobs). */
  /** True for the service key or the scheduler's jobs token (may look it up). */
  isServiceToken(token: string): boolean | Promise<boolean>;
  /** Origins allowed by CORS; `*` allows any (tokens travel in a header, not cookies). */
  allowedOrigins?: readonly string[];
  /**
   * Delete a Supabase Auth user with the Auth admin API (service key). Used by
   * `account/delete` when the database role could not delete it itself
   * (`authUserDeleted: false`). A user that is already gone is not an error.
   */
  deleteAuthUser?(userId: string): Promise<void>;
  /**
   * The Supabase Auth user with this (lower-case) email, created when missing
   * (Auth admin API, no email sent). Used by `staff/add` after the caller's
   * rights are checked. Without it, `staff/add` answers `not_configured`.
   */
  ensureAuthUser?(email: string): Promise<string>;
}

type Body = Record<string, unknown>;
type Outcome = { ok: true } | { ok: false; code: string; message?: string };

interface Route {
  auth: 'user' | 'service';
  run(sql: Db, userId: string | null, body: Body, deps: HandlerDeps): Promise<Outcome>;
}

const asUser = (userId: string | null): string => userId ?? '';
/** Jobs take only an optional positive whole `batchSize`; anything else uses the default. */
const batchOption = (b: Body): { batchSize?: number } =>
  typeof b.batchSize === 'number' && Number.isInteger(b.batchSize) && b.batchSize > 0 ? { batchSize: b.batchSize } : {};

// Inputs are validated inside each operation; the casts only satisfy TypeScript.
/* eslint-disable @typescript-eslint/no-explicit-any */
export const routes: Readonly<Record<string, Route>> = {
  join: { auth: 'user', run: (sql, uid, b) => joinMember(sql, { ...(b as any), userId: asUser(uid) }) },
  scan: { auth: 'user', run: (sql, uid, b) => resolveMemberToken(sql, { ...(b as any), callerUserId: asUser(uid) }) },
  award: { auth: 'user', run: (sql, uid, b) => awardPoints(sql, { ...(b as any), callerUserId: asUser(uid) }) },
  undo: { auth: 'user', run: (sql, uid, b) => undoEarn(sql, { ...(b as any), callerUserId: asUser(uid) }) },
  'redemptions/create': {
    auth: 'user',
    run: (sql, uid, b) => createRedemption(sql, { ...(b as any), callerUserId: asUser(uid) }),
  },
  'redemptions/cancel': {
    auth: 'user',
    run: (sql, uid, b) => cancelRedemption(sql, { ...(b as any), callerUserId: asUser(uid) }),
  },
  'redemptions/use': {
    auth: 'user',
    run: (sql, uid, b) => useRedemption(sql, { ...(b as any), callerUserId: asUser(uid) }),
  },
  'account/delete': {
    auth: 'user',
    async run(sql, uid, b, deps) {
      const result = await deleteMember(sql, { ...(b as any), callerUserId: asUser(uid) });
      if (!result.ok || result.authUserDeleted || !deps.deleteAuthUser) return result;
      // The database role may not delete auth users: do it with the Auth admin
      // API. If this throws, the member is already wiped; a retry with the same
      // body finds nothing left to wipe and tries the auth user again.
      await deps.deleteAuthUser(asUser(uid));
      return { ...result, authUserDeleted: true };
    },
  },
  'staff/verify-pin': {
    auth: 'user',
    run: (sql, uid, b) => verifyEmployeePin(sql, { ...(b as any), callerUserId: asUser(uid) }),
  },
  // Back office (v0.5): HQ and store managers.
  'staff/employees/create': {
    auth: 'user',
    run: (sql, uid, b) => createEmployee(sql, { ...(b as any), callerUserId: asUser(uid) }),
  },
  'staff/employees/update': {
    auth: 'user',
    run: (sql, uid, b) => updateEmployee(sql, { ...(b as any), callerUserId: asUser(uid) }),
  },
  'staff/add': {
    auth: 'user',
    async run(sql, uid, b, deps) {
      const ensureAuthUser = deps.ensureAuthUser;
      if (!ensureAuthUser) return { ok: false, code: 'not_configured', message: 'Staff accounts cannot be created here' };
      return addStaff(sql, { ...(b as any), callerUserId: asUser(uid) }, { ensureAuthUser });
    },
  },
  'staff/remove': {
    auth: 'user',
    run: (sql, uid, b) => removeStaff(sql, { ...(b as any), callerUserId: asUser(uid) }),
  },
  'points/adjust': {
    auth: 'user',
    run: (sql, uid, b) => adjustPoints(sql, { ...(b as any), callerUserId: asUser(uid) }),
  },
  'jobs/expire-redemptions': {
    auth: 'service',
    run: (sql, _uid, b) => expireRedemptions(sql, batchOption(b)),
  },
  'jobs/expire-points': {
    auth: 'service',
    run: (sql, _uid, b) => expirePoints(sql, batchOption(b)),
  },
};
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Fields a client may never set: identity and clock come from the server. */
const SERVER_ONLY_FIELDS = ['userId', 'callerUserId', 'now'] as const;

const STATUS: Record<string, number> = {
  invalid_input: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  route_not_found: 404,
  method_not_allowed: 405,
  idempotency_conflict: 409,
  device_in_other_store: 409,
  last_hq_admin: 409,
  not_configured: 501,
  payload_too_large: 413,
  unsupported_media_type: 415,
};

const MAX_BODY_BYTES = 16 * 1024;

/** Route name from the path: works for /api/award and /functions/v1/api/award. */
export function routeName(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);
  const at = parts.indexOf('api');
  return (at >= 0 ? parts.slice(at + 1) : parts).join('/');
}

function bearer(req: Request): string | null {
  const header = req.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match?.[1] ?? null;
}

function corsHeaders(req: Request, allowed: readonly string[]): Record<string, string> {
  const origin = req.headers.get('origin');
  const allowOrigin = allowed.includes('*') ? '*' : origin && allowed.includes(origin) ? origin : '';
  const headers: Record<string, string> = {
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
  if (allowOrigin) headers['access-control-allow-origin'] = allowOrigin;
  return headers;
}

function json(status: number, body: unknown, extra: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
  });
}

export function createHandler(deps: HandlerDeps): (req: Request) => Promise<Response> {
  const allowed = deps.allowedOrigins ?? ['*'];

  return async (req: Request): Promise<Response> => {
    const cors = corsHeaders(req, allowed);
    const failure = (code: string, message?: string, status?: number) =>
      json(status ?? STATUS[code] ?? 422, { ok: false, code, ...(message ? { message } : {}) }, cors);

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST') return failure('method_not_allowed');

    const route = routes[routeName(new URL(req.url).pathname)];
    if (!route) return failure('route_not_found');

    const token = bearer(req);
    if (!token) return failure('unauthenticated');
    let userId: string | null = null;
    if (route.auth === 'service') {
      if (!(await deps.isServiceToken(token))) return failure('forbidden');
    } else {
      userId = await deps.authenticate(token);
      if (!userId) return failure('unauthenticated');
    }

    if (!(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
      return failure('unsupported_media_type', 'Send a JSON body');
    }
    const text = await req.text();
    if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return failure('payload_too_large');
    let body: Body;
    try {
      const parsed: unknown = text ? JSON.parse(text) : {};
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
      body = parsed as Body;
    } catch {
      return failure('invalid_input', 'Body must be a JSON object');
    }
    for (const field of SERVER_ONLY_FIELDS) delete body[field];

    try {
      const result = await route.run(deps.sql, userId, body, deps);
      if (result.ok) return json(200, result, cors);
      return failure(result.code, result.message);
    } catch (error) {
      // Infrastructure or programming error: log it, never leak details.
      console.error('api error', routeName(new URL(req.url).pathname), error);
      return failure('internal_error', 'Something went wrong, try again', 500);
    }
  };
}
