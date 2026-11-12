/**
 * Client for the Overoll Club API (Supabase Edge Function `api`, docs/api-contract.md).
 *
 * - Every call is POST + JSON to `{NEXT_PUBLIC_SUPABASE_URL}/functions/v1/api/<route>`
 *   with `Authorization: Bearer <access token of the signed-in device>`.
 * - Writes carry an `idempotencyKey`: a fresh one per user action, the SAME one
 *   when retrying that action after a network or server error (the caller keeps it).
 * - Failures come back as `{ ok: false, code }`; `fetch` failures and timeouts are
 *   `network_error`. Show `errorMessage(code)`, never the API's English `message`.
 */
import type { ProgramConfig, TierId } from '@grow-loyalty/core';

import errorsEl from '../../../../data/copy/errors.el.json';
import errorsEn from '../../../../data/copy/errors.en.json';
import { fillTemplate, type Locale } from '../i18n/messages';
import { CLUB_URL, PROGRAM_NAME, SUPPORT_EMAIL } from './env';
import { formatEuroFromCents } from './format';

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export type ErrorCode = keyof typeof errorsEl;
export interface ApiFailure {
  ok: false;
  /** An API error code (`bad_pin`, `amount_over_limit`, …) or `network_error` / `unknown`. */
  code: string;
}
export type ApiResponse<T> = ({ ok: true } & T) | ApiFailure;

export interface VerifiedPin {
  employee: { id: string; displayName: string };
}

export interface ScannedMember {
  memberId: string;
  memberCode: string;
  firstName: string;
  tier: TierId;
  balance: number;
}

export interface AwardedPoints {
  entryId: string;
  memberId: string;
  points: number;
  balance: number;
  tier: TierId;
  tierChanged: boolean;
  /** v0.2: the member's first earn unlocked the welcome croissant. */
  welcomeGiftUnlocked?: boolean;
}

export interface UndoneEarn {
  entryId: string;
  reversedEntryId: string;
  memberId: string;
  /** Negative: the points taken back. */
  points: number;
  balance: number;
}

export interface UsedRedemption {
  redemptionId: string;
  memberId: string;
  memberFirstName: string;
  rewardId: string;
  rewardNameEl: string;
  rewardNameEn: string;
  pointsSpent: number;
  usedAt: string;
}

/** Retrying with the same idempotency key is safe and may succeed. */
export function isRetryable(code: string): boolean {
  return code === 'network_error' || code === 'internal_error';
}

export function newIdempotencyKey(): string {
  return globalThis.crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export interface ApiClientOptions {
  /** `apiBaseUrl(NEXT_PUBLIC_SUPABASE_URL)`. */
  baseUrl: string;
  /** Access token of the signed-in device user, or null when signed out. */
  getAccessToken: () => Promise<string | null>;
  /** Publishable key, sent as `apikey` (the Supabase gateway accepts it; the API ignores it). */
  apiKey?: string;
  fetch?: typeof fetch;
  /** Give up after this long and report `network_error` (retry with the same key). */
  timeoutMs?: number;
}

export interface AwardInput {
  storeId: string;
  employeeId: string;
  pin: string;
  memberId: string;
  amountCents: number;
  /** Late points (contract §Late points): the receipt of a purchase made earlier today. */
  receiptNumber?: string;
  idempotencyKey: string;
}

export interface UndoInput {
  entryId: string;
  employeeId: string;
  pin: string;
  idempotencyKey: string;
}

/**
 * Who to look up at the till: what the camera read (or the full `OC1.…`
 * token typed), or the member code printed under the QR (v0.4).
 */
export type ScanInput = { storeId: string; token: string } | { storeId: string; memberCode: string };

export interface UseRedemptionInput {
  storeId: string;
  employeeId: string;
  pin: string;
  code: string;
  idempotencyKey: string;
}

export interface ApiClient {
  verifyPin(input: { storeId: string; employeeId: string; pin: string }): Promise<ApiResponse<VerifiedPin>>;
  scan(input: ScanInput): Promise<ApiResponse<ScannedMember>>;
  award(input: AwardInput): Promise<ApiResponse<AwardedPoints>>;
  undo(input: UndoInput): Promise<ApiResponse<UndoneEarn>>;
  useRedemption(input: UseRedemptionInput): Promise<ApiResponse<UsedRedemption>>;
}

export function apiBaseUrl(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/api`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A POST to one API route with the signed-in user's token; failures come back as codes. */
export type Poster = <T>(route: string, body: Record<string, unknown>) => Promise<ApiResponse<T>>;

export function createPoster(options: ApiClientOptions): Poster {
  const doFetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const timeoutMs = options.timeoutMs ?? 20_000;
  const base = options.baseUrl.replace(/\/+$/, '');

  return async function post<T>(route: string, body: Record<string, unknown>): Promise<ApiResponse<T>> {
    let token: string | null;
    try {
      token = await options.getAccessToken();
    } catch {
      token = null;
    }
    if (!token) return { ok: false, code: 'unauthenticated' };

    const headers: Record<string, string> = {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    };
    if (options.apiKey) headers.apikey = options.apiKey;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await doFetch(`${base}/${route}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      return { ok: false, code: 'network_error' };
    } finally {
      clearTimeout(timer);
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      return { ok: false, code: response.status >= 500 ? 'internal_error' : 'unknown' };
    }
    if (response.ok && isObject(data) && data.ok === true) return data as { ok: true } & T;
    if (isObject(data) && data.ok === false && typeof data.code === 'string') return { ok: false, code: data.code };
    return { ok: false, code: response.status >= 500 ? 'internal_error' : 'unknown' };
  };
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const post = createPoster(options);

  return {
    verifyPin: ({ storeId, employeeId, pin }) => post('staff/verify-pin', { storeId, employeeId, pin }),
    scan: (input) =>
      post('scan', 'memberCode' in input ? { storeId: input.storeId, memberCode: input.memberCode } : { storeId: input.storeId, token: input.token }),
    award: ({ storeId, employeeId, pin, memberId, amountCents, receiptNumber, idempotencyKey }) =>
      post('award', {
        storeId,
        employeeId,
        pin,
        member: { memberId },
        amountCents,
        ...(receiptNumber ? { receiptNumber } : {}),
        idempotencyKey,
      }),
    undo: ({ entryId, employeeId, pin, idempotencyKey }) =>
      post('undo', { entryId, employee: { employeeId, pin }, idempotencyKey }),
    useRedemption: ({ storeId, employeeId, pin, code, idempotencyKey }) =>
      post('redemptions/use', { storeId, employeeId, pin, code, idempotencyKey }),
  };
}

// ---------------------------------------------------------------------------
// Error messages (data/copy/errors.{el,en}.json, docs/copy-deck.md §f2)
// ---------------------------------------------------------------------------

const errorMessages: Record<Locale, Record<string, string>> = { el: errorsEl, en: errorsEn };

export function isKnownErrorCode(code: string): code is ErrorCode {
  return Object.hasOwn(errorsEl, code);
}

/**
 * What to show for an error code, in the console's language. Numbers come
 * from the brand's program config, so a config change needs no release.
 * Any code without a message (e.g. `route_not_found`) shows `unknown`.
 */
export function errorMessage(code: string, locale: Locale, config: ProgramConfig): string {
  const table = errorMessages[locale];
  const template = (isKnownErrorCode(code) ? table[code] : undefined) ?? table.unknown ?? code;
  const { limits } = config;
  return fillTemplate(template, {
    programName: PROGRAM_NAME,
    clubUrl: CLUB_URL,
    supportEmail: SUPPORT_EMAIL,
    maxAmount: formatEuroFromCents(limits.maxAmountCents, locale),
    maxEarns: limits.maxEarnsPerDay,
    minutes:
      code === 'undo_window_passed'
        ? limits.undoWindowMinutes
        : code === 'pin_locked'
          ? limits.pinLockMinutes
          : Math.ceil(limits.minSecondsBetweenEarns / 60),
    minDigits: limits.staffPinMinDigits,
    maxDigits: limits.staffPinMaxDigits,
  });
}
