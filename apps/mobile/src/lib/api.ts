/**
 * Client for the HTTP API (Edge Function `api`, docs/api-contract.md).
 *
 * - Base URL: `{EXPO_PUBLIC_SUPABASE_URL}/functions/v1/api`; every call is a
 *   POST with a JSON body and the member's access token as bearer.
 * - Every write carries an idempotency key. One user action = one key: an
 *   `ApiAction` makes its key once and sends the same key on every retry, so
 *   a retry after a network error can never redeem or join twice.
 * - Failures come back as an error code from `data/copy/errors.*.json`
 *   (anything else becomes `unknown`; no connection becomes `network_error`).
 *   The API's English `message` is developer text and is never shown.
 *
 * Pure TypeScript (no React Native imports) so it runs in the unit tests.
 */
import type { ProgramConfig } from '@overoll/core';

import elErrors from '../../../../data/copy/errors.el.json';
import enErrors from '../../../../data/copy/errors.en.json';
import type { Locale } from '../i18n/messages';
import { formatEuroFromCents } from './format';

export type ErrorCode = keyof typeof enErrors;

const errorTexts: Record<Locale, Record<ErrorCode, string>> = { el: elErrors, en: enErrors };

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(enErrors, value);
}

/** Any code from the server, mapped to one we have a message for. */
export function toErrorCode(value: unknown): ErrorCode {
  return isErrorCode(value) ? value : 'unknown';
}

/** Worth offering "try again" with the same action (and so the same key). */
export function isRetryable(code: ErrorCode): boolean {
  return code === 'network_error' || code === 'internal_error' || code === 'unknown';
}

export interface ErrorContext {
  config: ProgramConfig;
  programName: string;
  clubUrl: string;
  supportEmail: string;
  /** Display name of the tier for `tier_too_low`. */
  tier?: string;
}

/** Values for the placeholders in the error texts (copy deck §f2, "Fill"). */
export function errorParams(code: ErrorCode, locale: Locale, ctx: ErrorContext): Record<string, string> {
  const { limits } = ctx.config;
  const minutes =
    code === 'too_soon_after_last_earn'
      ? Math.ceil(limits.minSecondsBetweenEarns / 60)
      : code === 'undo_window_passed'
        ? limits.undoWindowMinutes
        : ctx.config.redemptionValidMinutes;
  return {
    programName: ctx.programName,
    clubUrl: ctx.clubUrl,
    supportEmail: ctx.supportEmail,
    maxAmount: formatEuroFromCents(limits.maxAmountCents, locale),
    maxEarns: String(limits.maxEarnsPerDay),
    minutes: String(minutes),
    tier: ctx.tier ?? '',
  };
}

/** The message a person sees for an error code, in their language. */
export function errorMessage(code: ErrorCode, locale: Locale, ctx: ErrorContext): string {
  const template = errorTexts[locale][code] ?? errorTexts.el[code] ?? errorTexts[locale].unknown;
  const params = errorParams(code, locale, ctx);
  return template.replace(/\{(\w+)\}/g, (match, name: string) => params[name] ?? match);
}

export type ApiRoute = 'join' | 'redemptions/create' | 'redemptions/cancel' | 'account/delete';

export type ApiResult<T> = { ok: true; data: T } | { ok: false; code: ErrorCode };

export type ApiBody = Record<string, unknown>;

export interface ApiClientOptions {
  /** `{supabaseUrl}/functions/v1/api` (see `apiBaseUrl`). */
  baseUrl: string;
  /** The signed-in member's access token, or null when signed out. */
  getAccessToken: () => Promise<string | null>;
  /** Publishable key, sent as `apikey` for the Supabase gateway. */
  apiKey?: string;
  /** A fresh UUID per user action. */
  newKey: () => string;
  fetchImpl?: typeof fetch;
  /** Give up and report `network_error` after this long (default 20 s). */
  timeoutMs?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class ApiClient {
  constructor(private readonly options: ApiClientOptions) {}

  /** Start one user action; send it (and retry it) with `action.send()`. */
  action<T>(route: ApiRoute, body: ApiBody): ApiAction<T> {
    return new ApiAction<T>(this, route, body, this.options.newKey());
  }

  /** One POST. Prefer `action()`, which owns the idempotency key. */
  async post<T>(route: ApiRoute, body: ApiBody, idempotencyKey: string): Promise<ApiResult<T>> {
    const { baseUrl, getAccessToken, apiKey, fetchImpl = globalThis.fetch, timeoutMs = 20_000 } = this.options;

    let token: string | null;
    try {
      token = await getAccessToken();
    } catch {
      token = null;
    }
    if (!token) return { ok: false, code: 'unauthenticated' };

    const headers: Record<string, string> = {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    };
    if (apiKey) headers.apikey = apiKey;

    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = setTimeout(() => controller?.abort(), timeoutMs);
    let response: Response;
    let payload: unknown = null;
    try {
      response = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}/${route}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...body, idempotencyKey }),
        signal: controller?.signal,
      });
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
    } catch {
      // Offline, DNS, TLS, CORS or our timeout: the request may or may not
      // have arrived, which is exactly what the idempotency key is for.
      return { ok: false, code: 'network_error' };
    } finally {
      clearTimeout(timer);
    }

    if (response.ok && isRecord(payload) && payload.ok === true) {
      const { ok: _ok, ...data } = payload;
      return { ok: true, data: data as T };
    }
    if (isRecord(payload) && typeof payload.code === 'string') return { ok: false, code: toErrorCode(payload.code) };
    if (response.status === 401) return { ok: false, code: 'unauthenticated' };
    if (response.status >= 500) return { ok: false, code: 'internal_error' };
    return { ok: false, code: 'unknown' };
  }
}

/** One user action (join, redeem, cancel): a fixed body and one idempotency key. */
export class ApiAction<T> {
  attempts = 0;

  constructor(
    private readonly client: ApiClient,
    readonly route: ApiRoute,
    readonly body: ApiBody,
    readonly idempotencyKey: string,
  ) {}

  /** Send, or send again after a failure: always with the same key. */
  send(): Promise<ApiResult<T>> {
    this.attempts += 1;
    return this.client.post<T>(this.route, this.body, this.idempotencyKey);
  }
}

/**
 * Keeps the current action of a screen: asking again for the same route and
 * body gives back the same action (same key), until it succeeded. A changed
 * body is a different request, so it gets a new action and key (the server
 * would refuse the old key with `idempotency_conflict`).
 */
export class ActionSlot<T> {
  private current: { signature: string; action: ApiAction<T> } | null = null;

  constructor(private readonly client: () => ApiClient) {}

  get(route: ApiRoute, body: ApiBody): ApiAction<T> {
    const signature = `${route} ${JSON.stringify(body)}`;
    if (this.current?.signature !== signature) {
      this.current = { signature, action: this.client().action<T>(route, body) };
    }
    return this.current.action;
  }

  /** Send the action for this request; a success frees the slot for the next one. */
  async send(route: ApiRoute, body: ApiBody): Promise<ApiResult<T>> {
    const action = this.get(route, body);
    const result = await action.send();
    if (result.ok && this.current?.action === action) this.current = null;
    return result;
  }

  reset(): void {
    this.current = null;
  }
}
