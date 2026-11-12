import { defaultConfig } from '@grow-loyalty/core';
import { describe, expect, it, vi } from 'vitest';

import errorsEl from '../../../data/copy/errors.el.json';
import errorsEn from '../../../data/copy/errors.en.json';
import { apiBaseUrl, createApiClient, errorMessage, isRetryable } from '../src/lib/api';
import type { DeviceAuth } from '../src/lib/console/device';
import { type ConsoleAction, consoleReducer, type ConsoleState, initialState, pendingRequest } from '../src/lib/console/machine';
import { runRequest } from '../src/lib/console/runner';

const plain = (text: string) => text.replace(/\s/g, ' ');
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

interface Call {
  url: string;
  init: RequestInit;
  body: Record<string, unknown>;
}

function fakeFetch(...responses: Array<Response | Error>) {
  const calls: Call[] = [];
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {}, body: JSON.parse(String(init?.body ?? '{}')) });
    const next = responses.shift();
    if (!next) throw new Error('no more responses');
    if (next instanceof Error) throw next;
    return next;
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls, spy: fetch };
}

const BASE = apiBaseUrl('https://example.supabase.co/');

describe('API client', () => {
  it('posts JSON to {SUPABASE_URL}/functions/v1/api/<route> with the bearer token', async () => {
    const { fetch, calls } = fakeFetch(
      json(200, { ok: true, entryId: '1', memberId: 'm', points: 64, balance: 64, tier: 'classic', tierChanged: false }),
    );
    const api = createApiClient({ baseUrl: BASE, getAccessToken: async () => 'jwt-1', apiKey: 'pk', fetch });
    const result = await api.award({
      storeId: 's',
      employeeId: 'e',
      pin: '1234',
      memberId: 'm',
      amountCents: 640,
      idempotencyKey: 'key-1',
    });

    expect(BASE).toBe('https://example.supabase.co/functions/v1/api');
    expect(result).toMatchObject({ ok: true, points: 64 });
    expect(calls[0]!.url).toBe('https://example.supabase.co/functions/v1/api/award');
    expect(calls[0]!.init.method).toBe('POST');
    expect(calls[0]!.init.headers).toMatchObject({
      authorization: 'Bearer jwt-1',
      'content-type': 'application/json',
      apikey: 'pk',
    });
    expect(calls[0]!.body).toEqual({
      storeId: 's',
      employeeId: 'e',
      pin: '1234',
      member: { memberId: 'm' },
      amountCents: 640,
      idempotencyKey: 'key-1',
    });
  });

  it('sends late points, undo and redemption bodies as the contract says', async () => {
    const { fetch, calls } = fakeFetch(json(200, { ok: true }), json(200, { ok: true }), json(200, { ok: true }), json(200, { ok: true }));
    const api = createApiClient({ baseUrl: BASE, getAccessToken: async () => 't', fetch });
    await api.award({ storeId: 's', employeeId: 'e', pin: '1', memberId: 'm', amountCents: 1, receiptNumber: 'R-1', idempotencyKey: 'k' });
    await api.undo({ entryId: '9', employeeId: 'e', pin: '1', idempotencyKey: 'u' });
    await api.useRedemption({ storeId: 's', employeeId: 'e', pin: '1', code: 'ABCDEFGH', idempotencyKey: 'r' });
    await api.verifyPin({ storeId: 's', employeeId: 'e', pin: '1' });

    expect(calls.map((c) => c.url.replace(BASE, ''))).toEqual(['/award', '/undo', '/redemptions/use', '/staff/verify-pin']);
    expect(calls[0]!.body).toMatchObject({ receiptNumber: 'R-1' });
    expect(calls[1]!.body).toEqual({ entryId: '9', employee: { employeeId: 'e', pin: '1' }, idempotencyKey: 'u' });
    expect(calls[2]!.body).toEqual({ storeId: 's', employeeId: 'e', pin: '1', code: 'ABCDEFGH', idempotencyKey: 'r' });
    expect(calls[3]!.body).toEqual({ storeId: 's', employeeId: 'e', pin: '1' });
  });

  it('returns business error codes from the API', async () => {
    const { fetch } = fakeFetch(json(422, { ok: false, code: 'amount_over_limit', message: 'Amount over the limit' }));
    const api = createApiClient({ baseUrl: BASE, getAccessToken: async () => 't', fetch });
    const result = await api.scan({ storeId: 's', token: 'x' });
    expect(result).toEqual({ ok: false, code: 'amount_over_limit' });
  });

  it('turns fetch failures and timeouts into network_error', async () => {
    const offline = createApiClient({
      baseUrl: BASE,
      getAccessToken: async () => 't',
      fetch: fakeFetch(new TypeError('Failed to fetch')).fetch,
    });
    expect(await offline.scan({ storeId: 's', token: 'x' })).toEqual({ ok: false, code: 'network_error' });

    const hanging: typeof globalThis.fetch = (_url, init) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
    const slow = createApiClient({ baseUrl: BASE, getAccessToken: async () => 't', fetch: hanging, timeoutMs: 5 });
    expect(await slow.scan({ storeId: 's', token: 'x' })).toEqual({ ok: false, code: 'network_error' });
  });

  it('a server error page is internal_error, anything else unknown', async () => {
    const { fetch } = fakeFetch(
      new Response('<html>Bad gateway</html>', { status: 502 }),
      json(404, { ok: false, code: 'route_not_found' }),
      json(200, 'not an object'),
    );
    const api = createApiClient({ baseUrl: BASE, getAccessToken: async () => 't', fetch });
    expect(await api.scan({ storeId: 's', token: 'x' })).toEqual({ ok: false, code: 'internal_error' });
    expect(await api.scan({ storeId: 's', token: 'x' })).toEqual({ ok: false, code: 'route_not_found' });
    expect(await api.scan({ storeId: 's', token: 'x' })).toEqual({ ok: false, code: 'unknown' });
  });

  it('without a session it does not call the API', async () => {
    const { fetch, spy } = fakeFetch();
    const api = createApiClient({ baseUrl: BASE, getAccessToken: async () => null, fetch });
    expect(await api.scan({ storeId: 's', token: 'x' })).toEqual({ ok: false, code: 'unauthenticated' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('only network and server errors are retryable', () => {
    expect(isRetryable('network_error')).toBe(true);
    expect(isRetryable('internal_error')).toBe(true);
    expect(isRetryable('bad_pin')).toBe(false);
  });
});

describe('error messages (data/copy/errors.*.json)', () => {
  it('maps codes to the shared copy with numbers from the config', () => {
    expect(plain(errorMessage('amount_over_limit', 'el', defaultConfig))).toContain('80,00 €');
    expect(errorMessage('amount_over_limit', 'en', defaultConfig)).toContain('€80.00');
    expect(errorMessage('too_soon_after_last_earn', 'en', defaultConfig)).toContain('Wait 2 minutes');
    expect(errorMessage('undo_window_passed', 'en', defaultConfig)).toContain('more than 10 minutes');
    expect(errorMessage('daily_earn_limit_reached', 'el', defaultConfig)).toContain('των 5 αγορών');
    expect(errorMessage('store_inactive', 'en', defaultConfig)).toContain('Overoll Club');
    expect(errorMessage('bad_pin', 'el', defaultConfig)).toBe(errorsEl.bad_pin);
    expect(errorMessage('network_error', 'en', defaultConfig)).toBe(errorsEn.network_error);
  });

  it('fills {clubUrl} for a deleted account (v0.4)', () => {
    expect(errorMessage('member_deleted', 'en', defaultConfig)).toContain('loyalty.overoll.gr');
    expect(errorMessage('member_deleted', 'el', defaultConfig)).not.toContain('{');
  });

  it('falls back to "unknown" for codes without a message', () => {
    expect(errorMessage('route_not_found', 'el', defaultConfig)).toBe(errorsEl.unknown);
    expect(errorMessage('toString', 'en', defaultConfig)).toBe(errorsEn.unknown);
  });

  it('has a message for every code the console can show', () => {
    const consoleCodes = [
      'invalid_input', 'idempotency_conflict', 'forbidden', 'store_inactive', 'employee_not_found',
      'employee_required', 'bad_pin', 'pin_locked', 'member_not_found', 'member_deleted', 'invalid_token', 'expired_token',
      'old_pass', 'amount_not_integer', 'amount_not_positive', 'amount_over_limit', 'amount_too_small',
      'too_soon_after_last_earn', 'daily_earn_limit_reached', 'receipt_already_used', 'not_found',
      'not_undoable', 'already_undone', 'undo_window_passed', 'already_used', 'cancelled', 'expired',
      'unauthenticated', 'internal_error', 'network_error',
    ];
    for (const code of consoleCodes) {
      expect(errorMessage(code, 'el', defaultConfig), code).not.toBe(errorsEl.unknown);
      expect(errorMessage(code, 'en', defaultConfig), code).not.toBe(errorsEn.unknown);
    }
  });

  it('el and en error files have the same codes and placeholders', () => {
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    expect(Object.keys(errorsEn).sort()).toEqual(Object.keys(errorsEl).sort());
    for (const [code, greek] of Object.entries(errorsEl)) {
      expect(placeholders((errorsEn as Record<string, string>)[code]!), code).toEqual(placeholders(greek));
    }
  });
});

describe('request loop (reducer → runner → API)', () => {
  const store = { id: 'store-1', name: 'Overoll Χαλάνδρι', timeZone: 'Europe/Athens' };
  const auth: DeviceAuth = {
    sendCode: async () => ({ ok: true }),
    verifyCode: async () => ({ ok: true }),
    loadDevice: async () => ({ status: 'signed-out' }),
  };

  function awardingState(): ConsoleState {
    const actions: ConsoleAction[] = [
      { type: 'device/loaded', requestId: 'boot', context: { store, employees: [{ id: 'emp-1', displayName: 'Μαρία' }], config: defaultConfig } },
      { type: 'cashier/select', employeeId: 'emp-1' },
      { type: 'pin/key', key: '1' },
      { type: 'pin/submit', requestId: 'p' },
      { type: 'pin/verified', requestId: 'p', employee: { id: 'emp-1', displayName: 'Μαρία' } },
      { type: 'scan/submit', requestId: 's', text: 'OC1.ABCD2345.12345678' },
      { type: 'scan/succeeded', requestId: 's', member: { memberId: 'mem-1', memberCode: 'ABCD2345', firstName: 'Ελένη', tier: 'classic', balance: 0 } },
      { type: 'amount/key', key: '6' },
      { type: 'amount/key', key: '4' },
      { type: 'amount/key', key: '0' },
      { type: 'award/submit', requestId: 'a1', idempotencyKey: 'key-1', now: 0 },
    ];
    return actions.reduce(consoleReducer, initialState({ configured: true, requestId: 'boot' }));
  }

  it('reuses the idempotency key when an award is retried after a network error', async () => {
    const { fetch, calls } = fakeFetch(
      new TypeError('Failed to fetch'),
      json(200, { ok: true, entryId: '7', memberId: 'mem-1', points: 64, balance: 64, tier: 'classic', tierChanged: false, welcomeGiftUnlocked: true }),
    );
    const api = createApiClient({ baseUrl: BASE, getAccessToken: async () => 't', fetch });
    const deps = { api, auth, newId: () => 'id' };

    let state = awardingState();
    state = consoleReducer(state, await runRequest(pendingRequest(state)!, deps));
    expect(state.screen).toMatchObject({ name: 'error', error: 'network_error', retryable: true });

    state = consoleReducer(state, { type: 'award/retry', requestId: 'a2' });
    state = consoleReducer(state, await runRequest(pendingRequest(state)!, deps));
    expect(state.screen).toMatchObject({ name: 'done', award: { entryId: '7', welcomeGiftUnlocked: true } });

    expect(calls).toHaveLength(2);
    expect(calls[0]!.body.idempotencyKey).toBe('key-1');
    expect(calls[1]!.body.idempotencyKey).toBe('key-1');
    expect(calls[1]!.body).toEqual(calls[0]!.body);
  });

  it('looks a typed member code up with `memberCode` (v0.4)', async () => {
    const { fetch, calls } = fakeFetch(
      json(200, { ok: true, memberId: 'mem-1', memberCode: 'ABCD2345', firstName: 'Ελένη', tier: 'classic', balance: 40 }),
    );
    const api = createApiClient({ baseUrl: BASE, getAccessToken: async () => 't', fetch });
    const onTill: ConsoleAction[] = [
      { type: 'device/loaded', requestId: 'boot', context: { store, employees: [{ id: 'emp-1', displayName: 'Μαρία' }], config: defaultConfig } },
      { type: 'cashier/select', employeeId: 'emp-1' },
      { type: 'pin/key', key: '1' },
      { type: 'pin/submit', requestId: 'p' },
      { type: 'pin/verified', requestId: 'p', employee: { id: 'emp-1', displayName: 'Μαρία' } },
      { type: 'scan/submit', requestId: 's', text: 'abcd 2345', typed: true },
    ];
    let state = onTill.reduce(consoleReducer, initialState({ configured: true, requestId: 'boot' }));
    state = consoleReducer(state, await runRequest(pendingRequest(state)!, { api, auth, newId: () => 'id' }));
    expect(calls[0]!.url).toBe(`${BASE}/scan`);
    expect(calls[0]!.body).toEqual({ storeId: 'store-1', memberCode: 'ABCD2345' });
    expect(state.screen).toMatchObject({ name: 'member', member: { memberId: 'mem-1', balance: 40 } });
  });

  it('turns a thrown error into a failure action instead of hanging the till', async () => {
    const api = createApiClient({ baseUrl: BASE, getAccessToken: async () => { throw new Error('storage'); }, fetch: fakeFetch().fetch });
    const broken: DeviceAuth = { ...auth, loadDevice: async () => { throw new Error('boom'); } };
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const action = await runRequest({ id: 'boot', kind: 'loadDevice' }, { api, auth: broken, newId: () => 'x' });
    expect(action).toEqual({ type: 'device/loadFailed', requestId: 'boot', error: 'network_error' });
    expect(await api.scan({ storeId: 's', token: 'x' })).toEqual({ ok: false, code: 'unauthenticated' });
    errorSpy.mockRestore();
  });
});
