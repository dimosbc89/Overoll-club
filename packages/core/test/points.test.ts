import { describe, expect, it } from 'vitest';
import {
  canUndo,
  checkEarnLimits,
  defaultConfig as config,
  pointsForPurchase,
  validatePurchaseAmount,
} from '../src/index.js';

describe('pointsForPurchase', () => {
  it('gives 10 points per euro to Classic members, rounded down', () => {
    expect(pointsForPurchase(650, 'classic', config)).toBe(65);
    expect(pointsForPurchase(659, 'classic', config)).toBe(65);
    expect(pointsForPurchase(9, 'classic', config)).toBe(0);
  });

  it('applies the tier multiplier (spec example: €6.40 Gold = 80)', () => {
    expect(pointsForPurchase(640, 'gold', config)).toBe(80);
    expect(pointsForPurchase(640, 'club', config)).toBe(96);
  });

  it('stacks a bonus multiplier on top of the tier', () => {
    expect(pointsForPurchase(640, 'classic', config, 200)).toBe(128);
    expect(pointsForPurchase(640, 'gold', config, 200)).toBe(160);
  });

  it('rejects invalid amounts and bonus multipliers', () => {
    expect(() => pointsForPurchase(0, 'classic', config)).toThrow();
    expect(() => pointsForPurchase(8001, 'classic', config)).toThrow();
    expect(() => pointsForPurchase(6.5, 'classic', config)).toThrow();
    expect(() => pointsForPurchase(650, 'classic', config, 50)).toThrow();
  });
});

describe('validatePurchaseAmount', () => {
  it('accepts up to the €80 limit', () => {
    expect(validatePurchaseAmount(8000, config)).toBeNull();
    expect(validatePurchaseAmount(8001, config)).toBe('amount_over_limit');
    expect(validatePurchaseAmount(-5, config)).toBe('amount_not_positive');
    expect(validatePurchaseAmount(1.5, config)).toBe('amount_not_integer');
  });
});

describe('checkEarnLimits', () => {
  const now = new Date('2026-12-10T10:00:00Z'); // 12:00 in Athens

  it('allows a first earn', () => {
    expect(checkEarnLimits([], now, config)).toBeNull();
  });

  it('blocks a second scan within 2 minutes', () => {
    const last = new Date(now.getTime() - 60_000);
    expect(checkEarnLimits([last], now, config)).toBe('too_soon_after_last_earn');
    const older = new Date(now.getTime() - 121_000);
    expect(checkEarnLimits([older], now, config)).toBeNull();
  });

  it('blocks the 6th earn of the same Athens calendar day', () => {
    const today = [6, 7, 8, 9, 10].map((h) => new Date(Date.UTC(2026, 11, 10, h)));
    expect(checkEarnLimits(today.slice(0, 4), new Date('2026-12-10T11:00:00Z'), config)).toBeNull();
    expect(checkEarnLimits(today, new Date('2026-12-10T11:00:00Z'), config)).toBe('daily_earn_limit_reached');
  });

  it('counts days in Athens time, not UTC', () => {
    // 23:30 UTC on the 9th is 01:30 on the 10th in Athens (UTC+2).
    const lateNight = Array.from({ length: 5 }, (_, i) => new Date(Date.UTC(2026, 11, 9, 22, 10 * i)));
    expect(checkEarnLimits(lateNight, now, config)).toBe('daily_earn_limit_reached');
    const earlierDay = Array.from({ length: 5 }, (_, i) => new Date(Date.UTC(2026, 11, 9, 20, 10 * i)));
    expect(checkEarnLimits(earlierDay, now, config)).toBeNull();
  });
});

describe('canUndo', () => {
  it('allows undo for 10 minutes', () => {
    const created = new Date('2026-12-10T10:00:00Z');
    expect(canUndo(created, new Date('2026-12-10T10:09:59Z'), config)).toBe(true);
    expect(canUndo(created, new Date('2026-12-10T10:10:01Z'), config)).toBe(false);
  });
});
