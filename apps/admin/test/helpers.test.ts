import { describe, expect, it } from 'vitest';

import { formatEuroFromCents, formatPoints } from '../src/lib/format';
import { todayHours } from '../src/lib/hours';
import { pressKey, type KeypadKey } from '../src/lib/keypad';
import { rewardCosts } from '../src/lib/reward-costs';

// Intl uses a no-break space in "2,20 €".
const plain = (text: string) => text.replace(/\s/g, ' ');

describe('formatEuroFromCents', () => {
  it('formats integer cents per language', () => {
    expect(plain(formatEuroFromCents(1400, 'el'))).toBe('14,00 €');
    expect(formatEuroFromCents(1400, 'en')).toBe('€14.00');
    expect(formatPoints(1950, 'el')).toBe('1.950');
  });

  it('rejects fractional cents', () => {
    expect(() => formatEuroFromCents(0.1, 'en')).toThrow();
  });
});

describe('todayHours', () => {
  it('reads the weekday in the store time zone', () => {
    const hours = { mon: '07:00-19:00', sun: '08:00-17:00' };
    // Sunday 23:30 UTC = Monday 01:30 in Athens.
    const now = new Date('2026-11-08T23:30:00Z');
    expect(todayHours(hours, now, 'Europe/Athens')).toEqual({ kind: 'open', open: '07:00', close: '19:00' });
    expect(todayHours(hours, new Date('2026-11-10T10:00:00Z'))).toEqual({ kind: 'closed' });
    expect(todayHours('nope', now)).toEqual({ kind: 'unknown' });
  });
});

describe('keypad', () => {
  const type = (keys: KeypadKey[], max = 8000) => keys.reduce((cents, key) => pressKey(cents, key, max), 0);

  it('builds integer cents like a card terminal', () => {
    expect(type(['6', '4', '0'])).toBe(640);
    expect(type(['5', '00'])).toBe(500);
    expect(type(['6', '4', '0', 'back'])).toBe(64);
    expect(type(['6', '4', 'clear'])).toBe(0);
    expect(type(['back'])).toBe(0);
  });

  it('ignores keys that would pass the maximum', () => {
    expect(type(['8', '0', '0', '0'])).toBe(8000);
    expect(type(['8', '0', '0', '0', '1'])).toBe(8000);
    expect(type(['9', '00', '0'])).toBe(900);
  });
});

describe('rewardCosts (rule from @overoll/core)', () => {
  it('applies the tier discounts from the program spec', () => {
    // Espresso: base 300 → Gold 20% off = 240, Club 30% off = 210.
    expect(rewardCosts(300)).toEqual({ classic: 300, gold: 240, club: 210 });
    // Croissant box: base 1950 → 1560 and 1365 rounded to the nearest 10 = 1370.
    expect(rewardCosts(1950)).toEqual({ classic: 1950, gold: 1560, club: 1370 });
  });
});
