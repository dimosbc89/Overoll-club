import { describe, expect, it } from 'vitest';

import { formatEuroFromCents, formatPoints } from '../src/lib/format';
import { todayHours } from '../src/lib/hours';
import { digitKeys, pressKey, pressPinKey, type KeypadKey, type PinKey } from '../src/lib/keypad';
import { rewardCosts } from '../src/lib/reward-costs';
import { inLocale } from '../src/lib/store-names';
import { shortStoreName } from '../src/lib/console/device';

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

  it('has the 12 keys of the console design: 1–9, 00, 0 and delete', () => {
    expect([...digitKeys, 'back']).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'back']);
  });
});

describe('PIN pad', () => {
  const type = (keys: PinKey[], max?: number) => keys.reduce((pin, key) => pressPinKey(pin, key, max), '');

  it('keeps the PIN as a string, leading zeros included', () => {
    expect(type(['0', '4', '2', '7'])).toBe('0427');
    expect(type(['1', '2', 'back'])).toBe('1');
    expect(type(['1', '2', 'clear', '3'])).toBe('3');
    expect(type(['back'])).toBe('');
  });

  it('stops at the maximum length', () => {
    expect(type(['1', '2', '3', '4', '5'], 4)).toBe('1234');
    expect(type(Array.from({ length: 20 }, () => '9' as PinKey))).toHaveLength(12);
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

describe('store names (v0.4)', () => {
  it('shows the English name in English and falls back to the Greek one', () => {
    expect(inLocale('Overoll Χαλάνδρι', 'Overoll Chalandri', 'en')).toBe('Overoll Chalandri');
    expect(inLocale('Overoll Χαλάνδρι', 'Overoll Chalandri', 'el')).toBe('Overoll Χαλάνδρι');
    expect(inLocale('Overoll Χαλάνδρι', null, 'en')).toBe('Overoll Χαλάνδρι');
    expect(inLocale('Overoll Χαλάνδρι', ' ', 'en')).toBe('Overoll Χαλάνδρι');
    expect(shortStoreName(inLocale('Overoll Χαλάνδρι', 'Overoll Chalandri', 'en'))).toBe('Chalandri');
  });
});
