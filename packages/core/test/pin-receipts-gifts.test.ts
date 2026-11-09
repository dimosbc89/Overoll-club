import { describe, expect, it } from 'vitest';
import {
  type WrongPin,
  InvalidConfigError,
  countedWrongPins,
  defaultConfig as config,
  giftStatusAfterCodeReturned,
  giftStatusAt,
  lockAfterWrongPin,
  normalizeReceiptNumber,
  pinLockedUntil,
  resolveConfig,
  wrongPinLookbackStart,
} from '../src/index.js';

const problemsOf = (overrides: unknown): readonly string[] => {
  try {
    resolveConfig(overrides);
  } catch (e) {
    if (e instanceof InvalidConfigError) return e.problems;
    throw e;
  }
  return [];
};

const base = new Date('2027-01-10T09:00:00Z').getTime();
const min = (m: number): Date => new Date(base + m * 60_000);
const wrong = (m: number, lockedUntilMinute?: number): WrongPin => ({
  at: min(m),
  lockedUntil: lockedUntilMinute === undefined ? null : min(lockedUntilMinute),
});

describe('config for v0.2', () => {
  it('has the PIN lockout numbers: 5 wrong PINs, 15 minutes', () => {
    expect(config.limits.pinMaxAttempts).toBe(5);
    expect(config.limits.pinLockMinutes).toBe(15);
    expect(resolveConfig({ limits: { pinMaxAttempts: 3, pinLockMinutes: 30 } }).limits).toMatchObject({
      pinMaxAttempts: 3,
      pinLockMinutes: 30,
      staffPinIdleMinutes: 5,
    });
    expect(problemsOf({ limits: { pinMaxAttempts: 0 } })).toEqual(['limits.pinMaxAttempts: must be between 1 and 100']);
    expect(problemsOf({ limits: { pinLockMinutes: 1.5 } })).toEqual(['limits.pinLockMinutes: must be an integer']);
    expect(problemsOf({ limits: { pinLockMinutes: 2000 } })).toEqual(['limits.pinLockMinutes: must be between 1 and 1440']);
  });

  it('has no welcome reward by default; a brand sets one as a UUID', () => {
    expect(config.welcome.rewardId).toBeUndefined();
    const id = 'a6cd61ff-3c8b-4c37-0b36-2f3e7c0d5a91';
    expect(resolveConfig({ welcome: { rewardId: id } }).welcome).toEqual({ validDays: 30, rewardId: id });
    expect(problemsOf({ welcome: { rewardId: 'butter-croissant' } })).toEqual(['welcome.rewardId: must be a UUID']);
    expect(problemsOf({ welcome: { rewardId: 42 } })).toEqual(['welcome.rewardId: must be a UUID']);
    expect(problemsOf({ welcome: { reward: id } })).toEqual(['welcome.reward: unknown setting']);
  });
});

describe('PIN lockout', () => {
  it('locks on the 5th wrong PIN within 15 minutes, for 15 minutes from then', () => {
    const four = [wrong(0), wrong(1), wrong(2), wrong(3)];
    expect(lockAfterWrongPin(four.slice(0, 3), min(3), config)).toBeNull();
    expect(lockAfterWrongPin(four, min(4), config)).toEqual(min(19));
    const locked = [...four, wrong(4, 19)];
    expect(pinLockedUntil(locked, min(4))).toEqual(min(19));
    expect(pinLockedUntil(locked, new Date(min(19).getTime() - 1))).toEqual(min(19));
    expect(pinLockedUntil(locked, min(19))).toBeNull();
  });

  it('counts only wrong PINs from the last 15 minutes (sliding window)', () => {
    // 0, 10, 14, 16, 17: at minute 17 the one at 0 no longer counts → 4.
    const pins = [wrong(0), wrong(10), wrong(14), wrong(16)];
    expect(countedWrongPins(pins, min(17), config)).toBe(3);
    expect(lockAfterWrongPin(pins, min(17), config)).toBeNull();
    // At 18 the window (3, 18] holds 10, 14, 16, 17 → the 5th locks.
    expect(lockAfterWrongPin([...pins, wrong(17)], min(18), config)).toEqual(min(33));
    // Exactly 15 minutes old is outside the window.
    expect(countedWrongPins([wrong(0)], min(15), config)).toBe(0);
    expect(countedWrongPins([wrong(0)], new Date(min(15).getTime() - 1), config)).toBe(1);
  });

  it('starts counting again after a lock', () => {
    const history = [wrong(0), wrong(1), wrong(2), wrong(3), wrong(4, 19)];
    expect(countedWrongPins(history, min(19), config)).toBe(0);
    const after = [...history, wrong(19.5), wrong(20), wrong(21), wrong(22)];
    expect(countedWrongPins(after, min(23), config)).toBe(4);
    expect(lockAfterWrongPin(after, min(23), config)).toEqual(min(38));
  });

  it('ignores entries after `now` and needs only the last 15 minutes from the database', () => {
    expect(pinLockedUntil([wrong(30, 45)], min(10))).toBeNull();
    expect(countedWrongPins([wrong(30)], min(10), config)).toBe(0);
    expect(wrongPinLookbackStart(min(20), config)).toEqual(min(5));
  });

  it('follows the config', () => {
    const strict = resolveConfig({ limits: { pinMaxAttempts: 2, pinLockMinutes: 60 } });
    expect(lockAfterWrongPin([], min(0), strict)).toBeNull();
    expect(lockAfterWrongPin([wrong(0)], min(50), strict)).toEqual(min(110));
    expect(lockAfterWrongPin([], min(0), resolveConfig({ limits: { pinMaxAttempts: 1 } }))).toEqual(min(15));
  });
});

describe('receipt numbers', () => {
  it('accepts letters, digits, "-" and "/" up to 40 characters', () => {
    expect(normalizeReceiptNumber('12345')).toBe('12345');
    expect(normalizeReceiptNumber(' a-123/7 ')).toBe('A-123/7');
    expect(normalizeReceiptNumber('X'.repeat(40))).toBe('X'.repeat(40));
    expect(normalizeReceiptNumber('X'.repeat(41))).toBeNull();
    expect(normalizeReceiptNumber('')).toBeNull();
    expect(normalizeReceiptNumber('   ')).toBeNull();
    expect(normalizeReceiptNumber('12 34')).toBeNull();
    expect(normalizeReceiptNumber('12;drop')).toBeNull();
    expect(normalizeReceiptNumber('№12')).toBeNull();
  });

  it('gives the same text for a Greek or a Latin keyboard, with or without accents', () => {
    expect(normalizeReceiptNumber('ΑΒΓ-12')).toBe('ABΓ-12');
    expect(normalizeReceiptNumber('αβγ-12')).toBe('ABΓ-12');
    expect(normalizeReceiptNumber('abΓ-12')).toBe('ABΓ-12');
    expect(normalizeReceiptNumber('ά-1')).toBe('A-1');
    expect(normalizeReceiptNumber('ΤΠΥ/ΔΣ')).toBe('TΠY/ΔΣ');
    expect(normalizeReceiptNumber('ς1')).toBe('Σ1');
  });
});

describe('gift status', () => {
  const expires = new Date('2027-02-04T09:00:00Z');
  it('an available gift is expired from its expiry time on', () => {
    expect(giftStatusAt('available', expires, new Date(expires.getTime() - 1))).toBe('available');
    expect(giftStatusAt('available', expires, expires)).toBe('expired');
    expect(giftStatusAt('redeemed', expires, new Date('2027-03-01T00:00:00Z'))).toBe('redeemed');
    expect(giftStatusAt('expired', expires, new Date('2027-01-01T00:00:00Z'))).toBe('expired');
  });
  it('a returned code makes the gift available again only before its expiry', () => {
    expect(giftStatusAfterCodeReturned(expires, new Date(expires.getTime() - 1))).toBe('available');
    expect(giftStatusAfterCodeReturned(expires, expires)).toBe('expired');
  });
});
