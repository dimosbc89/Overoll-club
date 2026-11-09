import { describe, expect, it } from 'vitest';

import { formatEuroFromCents, formatPoints } from '../src/lib/format';
import { todayHours, weekdayIn } from '../src/lib/hours';
import { mapsUrl } from '../src/lib/maps';

// Intl uses a no-break space in "2,20 €".
const plain = (text: string) => text.replace(/\s/g, ' ');

describe('formatEuroFromCents', () => {
  it('formats integer cents per language', () => {
    expect(plain(formatEuroFromCents(220, 'el'))).toBe('2,20 €');
    expect(formatEuroFromCents(220, 'en')).toBe('€2.20');
    expect(plain(formatEuroFromCents(140000, 'el'))).toBe('1.400,00 €');
    expect(formatEuroFromCents(0, 'en')).toBe('€0.00');
  });

  it('rejects fractional cents', () => {
    expect(() => formatEuroFromCents(2.5, 'el')).toThrow();
  });

  it('formats points as integers', () => {
    expect(formatPoints(1500, 'el')).toBe('1.500');
    expect(formatPoints(1500, 'en')).toBe('1,500');
  });
});

describe('todayHours', () => {
  const kolonaki = {
    mon: '08:00-19:30', tue: '08:00-19:30', wed: '08:00-19:30', thu: '08:00-19:30',
    fri: '08:00-19:30', sat: '08:00-18:00', sun: '08:00-17:00',
  };

  it('uses the weekday in the store time zone', () => {
    // Sunday 23:30 UTC is already Monday 01:30 in Athens.
    const late = new Date('2026-11-08T23:30:00Z');
    expect(weekdayIn(late, 'Europe/Athens')).toBe('mon');
    expect(weekdayIn(late, 'UTC')).toBe('sun');
    expect(todayHours(kolonaki, late, 'Europe/Athens')).toEqual({ kind: 'open', open: '08:00', close: '19:30' });
    expect(todayHours(kolonaki, late, 'UTC')).toEqual({ kind: 'open', open: '08:00', close: '17:00' });
  });

  it('treats a missing day or "closed" as closed', () => {
    const saturday = new Date('2026-11-14T10:00:00Z');
    expect(todayHours({ mon: '08:00-19:00' }, saturday)).toEqual({ kind: 'closed' });
    expect(todayHours({ ...kolonaki, sat: 'closed' }, saturday)).toEqual({ kind: 'closed' });
  });

  it('is unknown for empty or malformed data', () => {
    const now = new Date('2026-11-09T10:00:00Z');
    expect(todayHours({}, now)).toEqual({ kind: 'unknown' });
    expect(todayHours(null, now)).toEqual({ kind: 'unknown' });
    expect(todayHours({ mon: 'morning' }, now)).toEqual({ kind: 'unknown' });
  });
});

describe('mapsUrl', () => {
  const store = { name: 'Overoll Χαλάνδρι', address: 'Κατσουλιέρη 10', latitude: 38.02, longitude: 23.8 };

  it('opens the right maps app per platform', () => {
    expect(mapsUrl(store, 'ios')).toBe(
      `https://maps.apple.com/?ll=38.02,23.8&q=${encodeURIComponent('Overoll Χαλάνδρι')}`,
    );
    expect(mapsUrl(store, 'android')).toMatch(/^geo:38\.02,23\.8\?q=38\.02,23\.8\(/);
    expect(mapsUrl(store, 'web')).toBe('https://www.google.com/maps/search/?api=1&query=38.02,23.8');
  });

  it('falls back to the address without coordinates', () => {
    const url = mapsUrl({ ...store, latitude: null, longitude: null }, 'web');
    expect(url).toBe(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('Overoll Χαλάνδρι, Κατσουλιέρη 10')}`,
    );
  });
});
