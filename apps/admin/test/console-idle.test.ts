import { defaultConfig, resolveConfig } from '@overoll/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startIdleLock } from '../src/lib/console/idle-lock';
import { type ConsoleAction, consoleReducer, initialState } from '../src/lib/console/machine';

const MIN = 60_000;

describe('PIN idle lock (core staffPinSessionExpired)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-01-05T09:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('locks after limits.staffPinIdleMinutes (5) without activity', () => {
    const onLock = vi.fn();
    const lock = startIdleLock({ config: defaultConfig, onLock });
    vi.advanceTimersByTime(5 * MIN - 1000);
    expect(onLock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(onLock).toHaveBeenCalledTimes(1);
    lock.stop();
  });

  it('any activity restarts the clock', () => {
    const onLock = vi.fn();
    const lock = startIdleLock({ config: defaultConfig, onLock });
    vi.advanceTimersByTime(4 * MIN);
    lock.touch();
    vi.advanceTimersByTime(4 * MIN);
    expect(onLock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(MIN);
    expect(onLock).toHaveBeenCalled();
    lock.stop();
  });

  it('follows the brand config and stops when asked', () => {
    const onLock = vi.fn();
    const lock = startIdleLock({ config: resolveConfig({ limits: { staffPinIdleMinutes: 1 } }), onLock });
    vi.advanceTimersByTime(MIN);
    expect(onLock).toHaveBeenCalledTimes(1);
    lock.stop();
    vi.advanceTimersByTime(10 * MIN);
    expect(onLock).toHaveBeenCalledTimes(1);
  });

  it('locking the till forgets the PIN', () => {
    const store = { id: 'store-1', name: 'Overoll Χαλάνδρι', timeZone: 'Europe/Athens' };
    const actions: ConsoleAction[] = [
      { type: 'device/loaded', requestId: 'boot', context: { store, employees: [{ id: 'emp-1', displayName: 'Μαρία' }], config: defaultConfig } },
      { type: 'cashier/select', employeeId: 'emp-1' },
      { type: 'pin/key', key: '4' },
      { type: 'pin/submit', requestId: 'p' },
      { type: 'pin/verified', requestId: 'p', employee: { id: 'emp-1', displayName: 'Μαρία' } },
    ];
    let state = actions.reduce(consoleReducer, initialState({ configured: true, requestId: 'boot' }));
    expect(state.cashier?.pin).toBe('4');

    const lock = startIdleLock({ config: state.config, onLock: () => (state = consoleReducer(state, { type: 'idle/lock' })) });
    vi.advanceTimersByTime(5 * MIN);
    lock.stop();

    expect(state.cashier).toBeNull();
    expect(state.screen).toMatchObject({ name: 'pick-cashier', reason: 'idle', employeeId: 'emp-1', pin: '' });
    expect(JSON.stringify(state)).not.toContain('"pin":"4"');
  });
});
