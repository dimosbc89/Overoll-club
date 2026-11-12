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
  createReward,
  createStore,
  createRedemption,
  deleteMember,
  expirePoints,
  expireRedemptions,
  joinMember,
  removeStaff,
  resolveMemberToken,
  reviewTiers,
  undoEarn,
  updateEmployee,
  updateReward,
  updateStore,
  useRedemption,
  verifyEmployeePin,
  type WalletServices,
  applePassForDevice,
  appleSerialsUpdatedSince,
  registerAppleDevice,
  unregisterAppleDevice,
  walletAppleDownload,
  walletAppleLink,
  walletGoogleLink,
  walletUpdates,
  prepareReviewMember,
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
  /**
   * Wallet passes (v0.7): designs per brand, and the Apple / Google setups when
   * their certificates are configured. Without it the Wallet routes answer
   * `not_configured`.
   */
  wallet?: WalletServices;
  /**
   * App store review account (v0.8): the brand's review email and its fixed
   * 10-digit code, and how to turn the email into a one-time sign-in token
   * (Auth admin API `generateLink`, magic link `hashed_token`). Without it,
   * `auth/review-sign-in` refuses every attempt.
   */
  review?: { email: string; code: string; brandSlug?: string; tokenHash(email: string): Promise<string> };
}

type Body = Record<string, unknown>;
type Outcome = { ok: true } | { ok: false; code: string; message?: string };

interface Route {
  /** `public`: no token (the app store review sign-in, which checks its own code). */
  auth: 'user' | 'service' | 'public';
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
  // Back office (v0.6): HQ edits stores and the reward catalog.
  'stores/create': {
    auth: 'user',
    run: (sql, uid, b) => createStore(sql, { ...(b as any), callerUserId: asUser(uid) }),
  },
  'stores/update': {
    auth: 'user',
    run: (sql, uid, b) => updateStore(sql, { ...(b as any), callerUserId: asUser(uid) }),
  },
  'rewards/create': {
    auth: 'user',
    run: (sql, uid, b) => createReward(sql, { ...(b as any), callerUserId: asUser(uid) }),
  },
  'rewards/update': {
    auth: 'user',
    run: (sql, uid, b) => updateReward(sql, { ...(b as any), callerUserId: asUser(uid) }),
  },
  'jobs/expire-redemptions': {
    auth: 'service',
    run: (sql, _uid, b) => expireRedemptions(sql, batchOption(b)),
  },
  'jobs/expire-points': {
    auth: 'service',
    run: (sql, _uid, b) => expirePoints(sql, batchOption(b)),
  },
  'jobs/review-tiers': {
    auth: 'service',
    run: (sql, _uid, b) => reviewTiers(sql, batchOption(b)),
  },
  // Wallet passes (v0.7): links for the member app, and the job that sends pass updates.
  'wallet/apple/link': {
    auth: 'user',
    run: (sql, uid, _b, deps) => walletAppleLink(sql, { callerUserId: asUser(uid) }, deps.wallet ?? NO_WALLET),
  },
  'wallet/google/link': {
    auth: 'user',
    run: (sql, uid, _b, deps) => walletGoogleLink(sql, { callerUserId: asUser(uid) }, deps.wallet ?? NO_WALLET),
  },
  'jobs/wallet-updates': {
    auth: 'service',
    run: (sql, _uid, b, deps) => walletUpdates(sql, deps.wallet ?? NO_WALLET, batchOption(b)),
  },
  // App store review account (v0.8).
  'auth/review-sign-in': { auth: 'public', run: (sql, _uid, b, deps) => reviewSignIn(sql, b, deps) },
};

const NO_WALLET: WalletServices = { designs: {} };

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * auth/review-sign-in (v0.8): the review email and its fixed 10-digit code
 * (normal sign-in codes are 6 digits) give a one-time token the app turns into
 * a session (`verifyOtp({ token_hash })`). The review member is prepared first
 * (packages/server `prepareReviewMember`). Anything else waits half a second
 * and answers `wrong_code`, whether or not a review account is set up.
 */
async function reviewSignIn(sql: Db, body: Body, deps: HandlerDeps): Promise<Outcome & { tokenHash?: string }> {
  const review = deps.review;
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const code = typeof body.code === 'string' ? body.code.replace(/\D/g, '') : '';
  const matches =
    !!review &&
    !!deps.ensureAuthUser &&
    /^\d{10}$/.test(review.code) &&
    sameText(email, review.email.trim().toLowerCase()) &&
    sameText(code, review.code);
  if (!matches) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return { ok: false, code: 'wrong_code' };
  }
  const userId = await deps.ensureAuthUser!(email);
  const prepared = await prepareReviewMember(sql, {
    userId,
    email,
    ...(review!.brandSlug ? { brandSlug: review!.brandSlug } : {}),
  });
  if (!prepared.ok) return prepared;
  return { ok: true, tokenHash: await review!.tokenHash(email) };
}
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
  store_code_taken: 409,
  welcome_reward: 409,
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

const passHeaders = (lastModified: Date, fileName: string): Record<string, string> => ({
  'content-type': 'application/vnd.apple.pkpass',
  'content-disposition': `attachment; filename="${fileName}"`,
  'last-modified': lastModified.toUTCString(),
  'cache-control': 'no-store',
});

/**
 * Apple Wallet over plain HTTP (not the JSON routes):
 * - GET  wallet/apple/download/<token>: the .pkpass behind a wallet/apple/link link;
 * - the PassKit web service under wallet/apple/v1/ (Wallet calls it with
 *   `Authorization: ApplePass <token>`): device (un)registration, changed
 *   passes, the latest pass, and Wallet's error log.
 */
async function appleWalletHttp(req: Request, name: string, deps: HandlerDeps): Promise<Response> {
  const wallet = deps.wallet ?? NO_WALLET;
  const parts = name.split('/').slice(2).map((p) => decodeURIComponent(p));
  const url = new URL(req.url);
  const auth = /^ApplePass\s+(\S+)$/.exec(req.headers.get('authorization') ?? '')?.[1] ?? null;
  const empty = (status: number) => new Response(null, { status });

  if (parts[0] === 'download' && parts.length === 2 && req.method === 'GET') {
    const file = await walletAppleDownload(deps.sql, parts[1]!, wallet);
    if (file.kind === 'pass') return new Response(file.pkpass as Uint8Array<ArrayBuffer>, { status: 200, headers: passHeaders(file.lastModified, file.fileName) });
    return empty(file.kind === 'expired' ? 410 : 404);
  }
  if (parts[0] !== 'v1') return empty(404);

  // v1/devices/<device>/registrations/<passType>[/<serial>]
  if (parts[1] === 'devices' && parts[3] === 'registrations' && parts.length === 6) {
    const args = { deviceLibraryId: parts[2]!, passTypeId: parts[4]!, serial: parts[5]!, authToken: auth };
    if (req.method === 'POST') {
      const text = await req.text();
      if (text.length > 4096) return empty(413);
      let pushToken: unknown;
      try {
        pushToken = (JSON.parse(text) as { pushToken?: unknown }).pushToken;
      } catch {
        return empty(400);
      }
      return empty(await registerAppleDevice(deps.sql, { ...args, pushToken }, wallet));
    }
    if (req.method === 'DELETE') return empty(await unregisterAppleDevice(deps.sql, args, wallet));
    return empty(405);
  }
  if (parts[1] === 'devices' && parts[3] === 'registrations' && parts.length === 5 && req.method === 'GET') {
    const list = await appleSerialsUpdatedSince(
      deps.sql,
      { deviceLibraryId: parts[2]!, passTypeId: parts[4]!, since: url.searchParams.get('passesUpdatedSince') },
      wallet,
    );
    if (!list) return empty(204);
    return new Response(JSON.stringify(list), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  // v1/passes/<passType>/<serial>
  if (parts[1] === 'passes' && parts.length === 4 && req.method === 'GET') {
    const file = await applePassForDevice(
      deps.sql,
      { passTypeId: parts[2]!, serial: parts[3]!, authToken: auth, ifModifiedSince: req.headers.get('if-modified-since') },
      wallet,
    );
    if (file.kind === 'pass') return new Response(file.pkpass as Uint8Array<ArrayBuffer>, { status: 200, headers: passHeaders(file.lastModified, file.fileName) });
    return empty(file.kind === 'not_modified' ? 304 : 401);
  }
  // v1/log: Wallet reports problems with our passes; keep a short trace.
  if (parts[1] === 'log' && parts.length === 2 && req.method === 'POST') {
    const text = (await req.text()).slice(0, 2000);
    console.warn('apple wallet log', text);
    return empty(200);
  }
  return empty(404);
}

export function createHandler(deps: HandlerDeps): (req: Request) => Promise<Response> {
  const allowed = deps.allowedOrigins ?? ['*'];

  return async (req: Request): Promise<Response> => {
    const cors = corsHeaders(req, allowed);
    const failure = (code: string, message?: string, status?: number) =>
      json(status ?? STATUS[code] ?? 422, { ok: false, code, ...(message ? { message } : {}) }, cors);

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const name = routeName(new URL(req.url).pathname);
    if (name.startsWith('wallet/apple/') && name !== 'wallet/apple/link') {
      try {
        return await appleWalletHttp(req, name, deps);
      } catch (error) {
        console.error('wallet error', name.split('/').slice(0, 4).join('/'), error);
        return new Response(null, { status: 500 });
      }
    }
    if (req.method !== 'POST') return failure('method_not_allowed');

    const route = routes[name];
    if (!route) return failure('route_not_found');

    const token = bearer(req);
    if (!token && route.auth !== 'public') return failure('unauthenticated');
    let userId: string | null = null;
    if (route.auth === 'public') {
      // No identity: the route checks its own secret.
    } else if (!token) {
      return failure('unauthenticated');
    } else if (route.auth === 'service') {
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
