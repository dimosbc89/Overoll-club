import { defaultConfig } from '@overoll/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import elErrors from '../../../data/copy/errors.el.json';
import enErrors from '../../../data/copy/errors.en.json';
import { ActionSlot, ApiClient, errorMessage, isRetryable, toErrorCode, type ErrorContext } from '../src/lib/api';
import { apiBaseUrl } from '../src/lib/env';

const plain = (text: string) => text.replace(/\s/g, ' ');

interface Call {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** A fetch that records calls and answers from a list (a function = throw / custom). */
function fakeFetch(answers: (Response | (() => Response | Promise<Response>))[]) {
  const calls: Call[] = [];
  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      headers: init?.headers as Record<string, string>,
      body: JSON.parse(String(init?.body)),
    });
    const next = answers.shift();
    if (!next) throw new Error('no more answers');
    return typeof next === 'function' ? next() : next;
  });
  return { calls, impl: impl as unknown as typeof fetch };
}

let keyCounter = 0;
function client(fetchImpl: typeof fetch, token: string | null = 'user-token') {
  return new ApiClient({
    baseUrl: apiBaseUrl('https://example.supabase.co/'),
    getAccessToken: async () => token,
    apiKey: 'sb_publishable_test',
    newKey: () => `key-${++keyCounter}`,
    fetchImpl,
  });
}

const ctx: ErrorContext = {
  config: defaultConfig,
  programName: 'Overoll Club',
  clubUrl: 'club.example.gr',
  supportEmail: 'club-support@growagency.online',
};

afterEach(() => {
  vi.useRealTimers();
});

describe('error codes and messages', () => {
  it('has the same codes in Greek and English, including the app-only ones', () => {
    expect(Object.keys(elErrors).sort()).toEqual(Object.keys(enErrors).sort());
    expect(enErrors).toHaveProperty('network_error');
    expect(enErrors).toHaveProperty('unknown');
  });

  it('maps unknown codes to "unknown"', () => {
    expect(toErrorCode('insufficient_points')).toBe('insufficient_points');
    expect(toErrorCode('route_not_found')).toBe('unknown');
    expect(toErrorCode(42)).toBe('unknown');
    expect(toErrorCode('__proto__')).toBe('unknown');
  });

  it('shows the copy-deck text, never the API message', () => {
    expect(errorMessage('insufficient_points', 'el', ctx)).toBe(elErrors.insufficient_points);
    expect(errorMessage('insufficient_points', 'en', ctx)).toBe(enErrors.insufficient_points);
  });

  it('fills placeholders from the config and settings', () => {
    expect(plain(errorMessage('amount_over_limit', 'el', ctx))).toContain('80,00 €');
    expect(errorMessage('amount_over_limit', 'en', ctx)).toContain('€80.00');
    expect(errorMessage('member_deleted', 'en', ctx)).toContain('club-support@growagency.online');
    expect(errorMessage('store_not_found', 'el', ctx)).toContain('club.example.gr');
    expect(errorMessage('too_soon_after_last_earn', 'en', ctx)).toContain('Wait 2 minutes');
    expect(errorMessage('undo_window_passed', 'en', ctx)).toContain('more than 10 minutes');
    expect(errorMessage('daily_earn_limit_reached', 'en', ctx)).toContain('limit of 5 purchases');
    expect(errorMessage('tier_too_low', 'en', { ...ctx, tier: 'Gold' })).toBe('This reward is for Gold members and above. Keep collecting!');
    for (const code of Object.keys(enErrors) as (keyof typeof enErrors)[]) {
      expect(errorMessage(code, 'el', { ...ctx, tier: 'Gold' }), code).not.toMatch(/\{\w+\}/);
      expect(errorMessage(code, 'en', { ...ctx, tier: 'Gold' }), code).not.toMatch(/\{\w+\}/);
    }
  });

  it('marks connection problems as worth a retry', () => {
    expect(isRetryable('network_error')).toBe(true);
    expect(isRetryable('internal_error')).toBe(true);
    expect(isRetryable('insufficient_points')).toBe(false);
  });
});

describe('ApiClient', () => {
  it('posts JSON with the bearer token, apikey and idempotency key', async () => {
    const { calls, impl } = fakeFetch([json(200, { ok: true, redemptionId: 'r1', code: 'K7MP2QXH' })]);
    const result = await client(impl).action('redemptions/create', { memberId: 'm1', rewardId: 'w1' }).send();
    expect(result).toEqual({ ok: true, data: { redemptionId: 'r1', code: 'K7MP2QXH' } });
    expect(calls[0]!.url).toBe('https://example.supabase.co/functions/v1/api/redemptions/create');
    expect(calls[0]!.headers.authorization).toBe('Bearer user-token');
    expect(calls[0]!.headers.apikey).toBe('sb_publishable_test');
    expect(calls[0]!.headers['content-type']).toBe('application/json');
    expect(calls[0]!.body).toMatchObject({ memberId: 'm1', rewardId: 'w1' });
    expect(typeof calls[0]!.body.idempotencyKey).toBe('string');
  });

  it('maps API error codes, unknown codes and bare HTTP failures', async () => {
    const { impl } = fakeFetch([
      json(422, { ok: false, code: 'insufficient_points', message: 'Not enough points' }),
      json(422, { ok: false, code: 'something_new' }),
      new Response('<html>Bad gateway</html>', { status: 502 }),
      new Response('nope', { status: 401 }),
      new Response('teapot', { status: 418 }),
      json(500, { ok: false, code: 'internal_error' }),
    ]);
    const api = client(impl);
    const codes = [];
    for (let i = 0; i < 6; i++) {
      const r = await api.action('join', { firstName: 'Ελένη' }).send();
      codes.push(r.ok ? 'ok' : r.code);
    }
    expect(codes).toEqual(['insufficient_points', 'unknown', 'internal_error', 'unauthenticated', 'unknown', 'internal_error']);
  });

  it('turns a failed connection into network_error', async () => {
    const { impl } = fakeFetch([
      () => {
        throw new TypeError('Network request failed');
      },
    ]);
    expect(await client(impl).action('join', {}).send()).toEqual({ ok: false, code: 'network_error' });
  });

  it('gives up after the timeout with network_error', async () => {
    vi.useFakeTimers();
    const impl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
    ) as unknown as typeof fetch;
    const api = new ApiClient({ baseUrl: 'https://x/api', getAccessToken: async () => 't', newKey: () => 'k', fetchImpl: impl, timeoutMs: 5000 });
    const pending = api.action('join', {}).send();
    await vi.advanceTimersByTimeAsync(5000);
    expect(await pending).toEqual({ ok: false, code: 'network_error' });
  });

  it('does not call the API when signed out', async () => {
    const { calls, impl } = fakeFetch([]);
    expect(await client(impl, null).action('join', {}).send()).toEqual({ ok: false, code: 'unauthenticated' });
    expect(calls).toHaveLength(0);
  });

  it('cannot let the body override the idempotency key', async () => {
    const { calls, impl } = fakeFetch([json(200, { ok: true })]);
    const action = client(impl).action('join', { idempotencyKey: 'evil' });
    await action.send();
    expect(calls[0]!.body.idempotencyKey).toBe(action.idempotencyKey);
  });
});

describe('idempotency keys', () => {
  it('reuses the key of an action on every retry', async () => {
    const { calls, impl } = fakeFetch([
      () => {
        throw new TypeError('offline');
      },
      json(500, { ok: false, code: 'internal_error' }),
      json(200, { ok: true, redemptionId: 'r1' }),
    ]);
    const action = client(impl).action('redemptions/create', { memberId: 'm1', rewardId: 'w1' });
    expect((await action.send()).ok).toBe(false);
    expect((await action.send()).ok).toBe(false);
    expect((await action.send()).ok).toBe(true);
    expect(action.attempts).toBe(3);
    const keys = calls.map((c) => c.body.idempotencyKey);
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBe(action.idempotencyKey);
  });

  it('gives each new action its own key', () => {
    const api = client(fakeFetch([]).impl);
    expect(api.action('join', {}).idempotencyKey).not.toBe(api.action('join', {}).idempotencyKey);
  });

  it('ActionSlot: same request = same key until it succeeds; a changed request gets a new key', async () => {
    const { calls, impl } = fakeFetch([
      () => {
        throw new TypeError('offline');
      },
      json(200, { ok: true }),
      json(200, { ok: true }),
      json(422, { ok: false, code: 'insufficient_points' }),
    ]);
    const api = client(impl);
    const slot = new ActionSlot(() => api);
    const body = { memberId: 'm1', rewardId: 'w1' };

    await slot.send('redemptions/create', body); // network error
    await slot.send('redemptions/create', { ...body }); // retry, same request → same key
    await slot.send('redemptions/create', body); // after success: a new action
    await slot.send('redemptions/create', { memberId: 'm1', rewardId: 'w2' }); // different reward

    const keys = calls.map((c) => c.body.idempotencyKey);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[1]);
    expect(keys[3]).not.toBe(keys[2]);
  });

  it('ActionSlot keeps the key after a business error (nothing was written)', async () => {
    const { calls, impl } = fakeFetch([json(422, { ok: false, code: 'email_taken' }), json(200, { ok: true })]);
    const slot = new ActionSlot(() => client(impl));
    await slot.send('join', { firstName: 'Νίκος' });
    await slot.send('join', { firstName: 'Νίκος' });
    expect(calls[1]!.body.idempotencyKey).toBe(calls[0]!.body.idempotencyKey);
  });
});
