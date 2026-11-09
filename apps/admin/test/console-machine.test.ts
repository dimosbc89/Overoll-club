import { defaultConfig, resolveConfig } from '@overoll/core';
import { describe, expect, it } from 'vitest';

import type { AwardedPoints } from '../src/lib/api';
import {
  canSubmitAward,
  type ConsoleAction,
  consoleReducer,
  type ConsoleState,
  initialState,
  pendingRequest,
  previewPoints,
  undoAvailable,
} from '../src/lib/console/machine';

const store = { id: 'store-1', name: 'Overoll Χαλάνδρι', timeZone: 'Europe/Athens' };
const employees = [
  { id: 'emp-1', displayName: 'Μαρία' },
  { id: 'emp-2', displayName: 'Νίκος' },
];
const scanned = { memberId: 'mem-1', memberCode: 'ABCD2345', firstName: 'Ελένη', tier: 'gold' as const, balance: 120 };
const token = 'OC1.ABCD2345.12345678';
const T0 = Date.parse('2027-01-05T09:00:00Z');
const MIN = 60_000;

const run = (state: ConsoleState, ...actions: ConsoleAction[]) => actions.reduce(consoleReducer, state);

function signedInDevice(config = defaultConfig): ConsoleState {
  return run(initialState({ configured: true, requestId: 'boot' }), {
    type: 'device/loaded',
    requestId: 'boot',
    context: { store, employees, config },
  });
}

function onTill(config = defaultConfig): ConsoleState {
  return run(
    signedInDevice(config),
    { type: 'cashier/select', employeeId: 'emp-1' },
    { type: 'pin/key', key: '1' },
    { type: 'pin/key', key: '2' },
    { type: 'pin/key', key: '3' },
    { type: 'pin/key', key: '4' },
    { type: 'pin/submit', requestId: 'pin-1' },
    { type: 'pin/verified', requestId: 'pin-1', employee: { id: 'emp-1', displayName: 'Μαρία' } },
  );
}

function withMember(config = defaultConfig): ConsoleState {
  return run(
    onTill(config),
    { type: 'scan/submit', requestId: 'scan-1', text: ` ${token} ` },
    { type: 'scan/succeeded', requestId: 'scan-1', member: scanned },
  );
}

const typeAmount = (state: ConsoleState, digits: string) =>
  run(state, ...[...digits].map((key): ConsoleAction => ({ type: 'amount/key', key: key as '0' })));

const awarded: AwardedPoints = {
  entryId: '901',
  memberId: 'mem-1',
  points: 80,
  balance: 200,
  tier: 'gold',
  tierChanged: false,
  welcomeGiftUnlocked: true,
};

function afterAward(): ConsoleState {
  return run(
    typeAmount(withMember(), '640'),
    { type: 'award/submit', requestId: 'award-1', idempotencyKey: 'key-1', now: T0 },
    { type: 'award/succeeded', requestId: 'award-1', result: awarded },
  );
}

describe('device sign-in', () => {
  it('starts by loading the device, or says Supabase is not configured', () => {
    const state = initialState({ configured: true, requestId: 'boot' });
    expect(state.screen.name).toBe('starting');
    expect(pendingRequest(state)).toEqual({ id: 'boot', kind: 'loadDevice' });
    const bare = initialState({ configured: false, requestId: 'boot' });
    expect(bare.screen.name).toBe('not-configured');
    expect(pendingRequest(bare)).toBeNull();
  });

  it('signs in with an email one-time code, then loads the store', () => {
    let state = run(initialState({ configured: true, requestId: 'boot' }), { type: 'device/signedOut', requestId: 'boot' });
    expect(state.screen).toMatchObject({ name: 'signed-out', step: 'email' });

    state = run(state, { type: 'otp/email', value: ' chalandri@overoll.test ' }, { type: 'otp/send', requestId: 'otp-1' });
    expect(pendingRequest(state)).toEqual({ id: 'otp-1', kind: 'sendCode', email: 'chalandri@overoll.test' });

    state = run(state, { type: 'otp/sent', requestId: 'otp-1' }, { type: 'otp/code', value: '12 34-56' });
    expect(state.screen).toMatchObject({ name: 'signed-out', step: 'code', code: '123456' });

    state = run(state, { type: 'otp/verify', requestId: 'otp-2' });
    expect(pendingRequest(state)).toMatchObject({ kind: 'verifyCode', code: '123456' });
    state = run(state, { type: 'otp/failed', requestId: 'otp-2', error: 'otp_bad_code' });
    expect(state.screen).toMatchObject({ name: 'signed-out', step: 'code', error: 'otp_bad_code', requestId: null });

    state = run(
      state,
      { type: 'otp/code', value: '654321' },
      { type: 'otp/verify', requestId: 'otp-3' },
      { type: 'otp/verified', requestId: 'otp-3', loadRequestId: 'load-2' },
    );
    expect(pendingRequest(state)).toEqual({ id: 'load-2', kind: 'loadDevice' });

    state = run(state, { type: 'device/loaded', requestId: 'load-2', context: { store, employees, config: defaultConfig } });
    expect(state.store).toEqual(store);
    expect(state.screen).toMatchObject({ name: 'pick-cashier', reason: 'start', employeeId: null });
  });

  it('ignores answers to a request that is no longer current', () => {
    const state = initialState({ configured: true, requestId: 'boot' });
    const stale = run(state, { type: 'device/loaded', requestId: 'old', context: { store, employees, config: defaultConfig } });
    expect(stale).toBe(state);
  });

  it('a device without a store_device role cannot go further', () => {
    const state = run(initialState({ configured: true, requestId: 'boot' }), { type: 'device/noStore', requestId: 'boot' });
    expect(state.screen.name).toBe('no-store');
    expect(pendingRequest(state)).toBeNull();
  });

  it('signing out forgets the store and the cashier', () => {
    const state = run(withMember(), { type: 'device/signedOut' });
    expect(state.screen).toMatchObject({ name: 'signed-out', step: 'email' });
    expect(state.store).toBeNull();
    expect(state.cashier).toBeNull();
  });
});

describe('cashier and PIN', () => {
  it('verifies the PIN for the picked name and keeps it in memory', () => {
    let state = run(
      signedInDevice(),
      { type: 'pin/key', key: '1' }, // no name yet: ignored
      { type: 'cashier/select', employeeId: 'emp-2' },
      { type: 'pin/key', key: '0' },
      { type: 'pin/key', key: '7' },
      { type: 'pin/key', key: 'back' },
      { type: 'pin/key', key: '9' },
      { type: 'pin/submit', requestId: 'pin-1' },
    );
    expect(pendingRequest(state)).toEqual({ id: 'pin-1', kind: 'verifyPin', storeId: 'store-1', employeeId: 'emp-2', pin: '09' });

    state = run(state, { type: 'pin/failed', requestId: 'pin-1', error: 'bad_pin' });
    expect(state.screen).toMatchObject({ name: 'pick-cashier', pin: '', error: 'bad_pin', requestId: null });
    expect(state.cashier).toBeNull();

    state = run(
      state,
      { type: 'pin/key', key: '4' },
      { type: 'pin/submit', requestId: 'pin-2' },
      { type: 'pin/verified', requestId: 'pin-2', employee: { id: 'emp-2', displayName: 'Νίκος' } },
    );
    expect(state.cashier).toEqual({ employeeId: 'emp-2', displayName: 'Νίκος', pin: '4' });
    expect(state.screen).toMatchObject({ name: 'idle', mode: 'camera' });
  });

  it('shows pin_locked like any other PIN error', () => {
    const state = run(
      signedInDevice(),
      { type: 'cashier/select', employeeId: 'emp-1' },
      { type: 'pin/key', key: '5' },
      { type: 'pin/submit', requestId: 'p' },
      { type: 'pin/failed', requestId: 'p', error: 'pin_locked' },
    );
    expect(state.screen).toMatchObject({ name: 'pick-cashier', error: 'pin_locked' });
  });

  it('the idle lock forgets the PIN and keeps the name picked', () => {
    const state = run(typeAmount(withMember(), '640'), { type: 'today/open' }, { type: 'idle/lock' });
    expect(state.cashier).toBeNull();
    expect(state.todayOpen).toBe(false);
    expect(state.screen).toMatchObject({ name: 'pick-cashier', reason: 'idle', employeeId: 'emp-1', pin: '' });
    expect(pendingRequest(state)).toBeNull();
  });

  it('"Switch cashier" forgets the PIN and the name', () => {
    const state = run(withMember(), { type: 'cashier/switch' });
    expect(state.cashier).toBeNull();
    expect(state.screen).toMatchObject({ name: 'pick-cashier', reason: 'switch', employeeId: null });
  });

  it('does not lock in the middle of an award', () => {
    const awarding = run(typeAmount(withMember(), '640'), {
      type: 'award/submit',
      requestId: 'a',
      idempotencyKey: 'k',
      now: T0,
    });
    expect(run(awarding, { type: 'idle/lock' })).toBe(awarding);
    expect(run(awarding, { type: 'cashier/switch' })).toBe(awarding);
  });
});

describe('scan', () => {
  it('looks up a member token and shows the member panel', () => {
    let state = run(onTill(), { type: 'scan/submit', requestId: 'scan-1', text: ` ${token} ` });
    expect(pendingRequest(state)).toEqual({ id: 'scan-1', kind: 'scan', storeId: 'store-1', token });
    state = run(state, { type: 'scan/succeeded', requestId: 'scan-1', member: scanned });
    expect(state.screen).toMatchObject({
      name: 'member',
      amountCents: 0,
      member: { memberId: 'mem-1', firstName: 'Ελένη', tier: 'gold', balance: 120 },
    });
  });

  it('shows scan errors and lets the cashier try again', () => {
    const state = run(
      onTill(),
      { type: 'scan/submit', requestId: 's', text: token },
      { type: 'scan/failed', requestId: 's', error: 'expired_token' },
    );
    expect(state.screen).toMatchObject({ name: 'idle', error: 'expired_token', requestId: null });
    expect(pendingRequest(state)).toBeNull();
  });

  it('a redemption code scanned on the scan screen opens redeem', () => {
    const state = run(onTill(), { type: 'scan/submit', requestId: 's', text: 'abcd-efgh' });
    expect(state.screen).toMatchObject({ name: 'redeem', input: 'ABCDEFGH' });
    expect(pendingRequest(state)).toBeNull();
  });
});

describe('amount and preview', () => {
  it('builds integer cents on the keypad and moves member → amount → member', () => {
    let state = typeAmount(withMember(), '640');
    expect(state.screen).toMatchObject({ name: 'amount', amountCents: 640 });
    state = run(state, { type: 'amount/key', key: 'back' }, { type: 'amount/key', key: 'back' }, { type: 'amount/key', key: 'back' });
    expect(state.screen).toMatchObject({ name: 'member', amountCents: 0 });
  });

  it('caps the amount at the brand config maximum', () => {
    expect(typeAmount(withMember(), '80001').screen).toMatchObject({ amountCents: 8000 });
    const small = resolveConfig({ limits: { maxAmountCents: 5000 } });
    expect(typeAmount(withMember(small), '6000').screen).toMatchObject({ amountCents: 600 });
  });

  it('previews points with core pointsForPurchase for the member tier', () => {
    expect(previewPoints(640, 'gold', defaultConfig)).toBe(80); // spec §3 example
    expect(previewPoints(640, 'classic', defaultConfig)).toBe(64);
    expect(previewPoints(0, 'gold', defaultConfig)).toBeNull();
    expect(previewPoints(8001, 'gold', defaultConfig)).toBeNull();
    expect(previewPoints(5, 'classic', defaultConfig)).toBe(0);
    expect(canSubmitAward(typeAmount(withMember(), '5').screen, defaultConfig)).toBe(false);
    expect(canSubmitAward(typeAmount(withMember(), '640').screen, defaultConfig)).toBe(true);
  });
});

describe('award', () => {
  it('sends the award with the cashier PIN and an idempotency key', () => {
    const state = run(typeAmount(withMember(), '640'), {
      type: 'award/submit',
      requestId: 'award-1',
      idempotencyKey: 'key-1',
      now: T0,
    });
    expect(state.screen.name).toBe('awarding');
    expect(pendingRequest(state)).toEqual({
      id: 'award-1',
      kind: 'award',
      input: { storeId: 'store-1', employeeId: 'emp-1', pin: '1234', memberId: 'mem-1', amountCents: 640, idempotencyKey: 'key-1' },
    });
  });

  it('shows the result with the new balance and tier', () => {
    const state = afterAward();
    expect(state.screen).toMatchObject({
      name: 'done',
      award: { points: 80, welcomeGiftUnlocked: true },
      member: { balance: 200, tier: 'gold' },
      awardedAt: T0,
    });
  });

  it('retries after a network error with the SAME idempotency key', () => {
    let state = run(typeAmount(withMember(), '640'), {
      type: 'award/submit',
      requestId: 'award-1',
      idempotencyKey: 'key-1',
      now: T0,
    });
    state = run(state, { type: 'award/failed', requestId: 'award-1', error: 'network_error' });
    expect(state.screen).toMatchObject({ name: 'error', retryable: true, error: 'network_error' });

    state = run(state, { type: 'award/retry', requestId: 'award-2' });
    const retry = pendingRequest(state);
    expect(retry).toMatchObject({ id: 'award-2', kind: 'award', input: { idempotencyKey: 'key-1' } });

    // Back to the keypad and "Add points" again with the same amount: still the same key.
    state = run(
      state,
      { type: 'award/failed', requestId: 'award-2', error: 'internal_error' },
      { type: 'error/back' },
      { type: 'award/submit', requestId: 'award-3', idempotencyKey: 'key-2', now: T0 + MIN },
    );
    expect(pendingRequest(state)).toMatchObject({ input: { idempotencyKey: 'key-1' } });

    // The undo window counts from the first attempt.
    state = run(state, { type: 'award/succeeded', requestId: 'award-3', result: awarded });
    expect(state.screen).toMatchObject({ name: 'done', awardedAt: T0 });
  });

  it('takes a fresh key once the amount changes or after a business error', () => {
    let state = run(
      typeAmount(withMember(), '640'),
      { type: 'award/submit', requestId: 'a1', idempotencyKey: 'key-1', now: T0 },
      { type: 'award/failed', requestId: 'a1', error: 'network_error' },
      { type: 'error/back' },
      { type: 'amount/key', key: '0' },
      { type: 'award/submit', requestId: 'a2', idempotencyKey: 'key-2', now: T0 },
    );
    expect(pendingRequest(state)).toMatchObject({ input: { amountCents: 6400, idempotencyKey: 'key-2' } });

    state = run(state, { type: 'award/failed', requestId: 'a2', error: 'too_soon_after_last_earn' });
    expect(state.screen).toMatchObject({ name: 'error', retryable: false });
    expect(run(state, { type: 'award/retry', requestId: 'x' })).toBe(state);
    state = run(state, { type: 'error/back' }, { type: 'award/submit', requestId: 'a3', idempotencyKey: 'key-3', now: T0 });
    expect(pendingRequest(state)).toMatchObject({ input: { idempotencyKey: 'key-3' } });
  });

  it('late points need a receipt number and send it trimmed', () => {
    let state = run(typeAmount(withMember(), '640'), { type: 'late/toggle' });
    expect(canSubmitAward(state.screen, defaultConfig)).toBe(false);
    expect(run(state, { type: 'award/submit', requestId: 'a', idempotencyKey: 'k', now: T0 })).toBe(state);

    state = run(
      state,
      { type: 'late/receipt', value: '  A-12/7 ' },
      { type: 'award/submit', requestId: 'a', idempotencyKey: 'k', now: T0 },
    );
    expect(pendingRequest(state)).toMatchObject({ input: { receiptNumber: 'A-12/7', amountCents: 640 } });

    // Closing the toggle sends no receipt number.
    const plain = run(
      typeAmount(withMember(), '640'),
      { type: 'late/toggle' },
      { type: 'late/receipt', value: 'R1' },
      { type: 'late/toggle' },
      { type: 'award/submit', requestId: 'b', idempotencyKey: 'k2', now: T0 },
    );
    const request = pendingRequest(plain);
    expect(request?.kind === 'award' && 'receiptNumber' in request.input).toBe(false);
  });
});

describe('undo', () => {
  it('is available while core canUndo is true', () => {
    const state = afterAward();
    expect(undoAvailable(state, T0 + 10 * MIN)).toBe(true);
    expect(undoAvailable(state, T0 + 10 * MIN + 1)).toBe(false);
  });

  it('asks, then undoes with the cashier PIN and returns to the member', () => {
    let state = run(afterAward(), { type: 'undo/ask', now: T0 + MIN });
    expect(state.screen).toMatchObject({ name: 'done', undo: { phase: 'confirm' } });
    state = run(state, { type: 'undo/submit', requestId: 'u1', idempotencyKey: 'undo-1', now: T0 + MIN });
    expect(pendingRequest(state)).toEqual({
      id: 'u1',
      kind: 'undo',
      input: { entryId: '901', employeeId: 'emp-1', pin: '1234', idempotencyKey: 'undo-1' },
    });

    state = run(state, { type: 'undo/failed', requestId: 'u1', error: 'network_error' });
    state = run(
      state,
      { type: 'undo/ask', now: T0 + 2 * MIN },
      { type: 'undo/submit', requestId: 'u2', idempotencyKey: 'undo-2', now: T0 + 2 * MIN },
    );
    expect(pendingRequest(state)).toMatchObject({ input: { idempotencyKey: 'undo-1' } });

    state = run(state, {
      type: 'undo/succeeded',
      requestId: 'u2',
      result: { entryId: '902', reversedEntryId: '901', memberId: 'mem-1', points: -80, balance: 120 },
    });
    expect(state.screen).toMatchObject({ name: 'member', notice: 'undone', amountCents: 0, member: { balance: 120 } });
  });

  it('refuses once the window has passed', () => {
    const late = run(afterAward(), { type: 'undo/ask', now: T0 + 11 * MIN });
    expect(late.screen).toMatchObject({ undo: { phase: 'idle', error: 'undo_window_passed' } });

    const confirmTooLate = run(
      afterAward(),
      { type: 'undo/ask', now: T0 + 9 * MIN },
      { type: 'undo/submit', requestId: 'u', idempotencyKey: 'k', now: T0 + 11 * MIN },
    );
    expect(pendingRequest(confirmTooLate)).toBeNull();
    expect(confirmTooLate.screen).toMatchObject({ undo: { error: 'undo_window_passed' } });
  });

  it('"Next customer" goes back to scanning', () => {
    expect(run(afterAward(), { type: 'next' }).screen).toMatchObject({ name: 'idle', mode: 'camera' });
  });
});

describe('redeem', () => {
  it('uses a scanned or typed code with the cashier PIN', () => {
    let state = run(onTill(), { type: 'redeem/open' });
    expect(state.screen).toMatchObject({ name: 'redeem', mode: 'camera', input: '' });

    state = run(state, { type: 'redeem/detected', requestId: 'r0', text: 'abcd efgh' });
    expect(state.screen).toMatchObject({ name: 'redeem', input: 'ABCDEFGH', error: null });

    state = run(state, { type: 'redeem/submit', requestId: 'r1', idempotencyKey: 'rk-1', now: T0 });
    expect(pendingRequest(state)).toEqual({
      id: 'r1',
      kind: 'redeem',
      input: { storeId: 'store-1', employeeId: 'emp-1', pin: '1234', code: 'ABCDEFGH', idempotencyKey: 'rk-1' },
    });

    state = run(
      state,
      { type: 'redeem/failed', requestId: 'r1', error: 'network_error' },
      { type: 'redeem/submit', requestId: 'r2', idempotencyKey: 'rk-2', now: T0 },
    );
    expect(pendingRequest(state)).toMatchObject({ input: { idempotencyKey: 'rk-1' } });

    state = run(state, {
      type: 'redeem/succeeded',
      requestId: 'r2',
      result: {
        redemptionId: 'red-1',
        memberId: 'mem-1',
        memberFirstName: 'Ελένη',
        rewardId: 'rew-1',
        rewardNameEl: 'Espresso ή διπλός ελληνικός',
        rewardNameEn: 'Espresso or double Greek coffee',
        pointsSpent: 300,
        usedAt: '2027-01-05T09:00:00Z',
      },
    });
    expect(state.screen).toMatchObject({ name: 'redeemed', result: { rewardNameEn: 'Espresso or double Greek coffee' } });
    expect(run(state, { type: 'next' }).screen.name).toBe('idle');
  });

  it('does not send something that is not a code', () => {
    const state = run(
      onTill(),
      { type: 'redeem/open' },
      { type: 'redeem/input', value: 'ABC' },
      { type: 'redeem/submit', requestId: 'r', idempotencyKey: 'k', now: T0 },
    );
    expect(pendingRequest(state)).toBeNull();
    expect(state.screen).toMatchObject({ error: 'not_found' });
  });

  it('a member card shown on the redeem screen looks the member up', () => {
    const state = run(onTill(), { type: 'redeem/open' }, { type: 'redeem/detected', requestId: 's', text: token });
    expect(pendingRequest(state)).toEqual({ id: 's', kind: 'scan', storeId: 'store-1', token });
  });

  it('a redemption error keeps the screen open with a fresh key next time', () => {
    const state = run(
      onTill(),
      { type: 'redeem/open', code: 'ABCDEFGH' },
      { type: 'redeem/submit', requestId: 'r1', idempotencyKey: 'k1', now: T0 },
      { type: 'redeem/failed', requestId: 'r1', error: 'already_used' },
      { type: 'redeem/submit', requestId: 'r2', idempotencyKey: 'k2', now: T0 },
    );
    expect(pendingRequest(state)).toMatchObject({ input: { idempotencyKey: 'k2' } });
  });
});

describe("today's activity", () => {
  it('opens over the till and closes without losing the screen', () => {
    const before = typeAmount(withMember(), '640');
    const open = run(before, { type: 'today/open' });
    expect(open.todayOpen).toBe(true);
    const closed = run(open, { type: 'today/close' });
    expect(closed.todayOpen).toBe(false);
    expect(closed.screen).toEqual(before.screen);
  });
});
