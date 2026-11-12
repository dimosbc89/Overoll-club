import { describe, expect, it } from 'vitest';

import {
  centsToEuroInput,
  hoursToRows,
  normaliseStoreCode,
  parseCoordinate,
  parseEuroToCents,
  rowsToHours,
} from '../src/lib/catalog';

describe('store hours form', () => {
  it('turns stored hours into one row per weekday, Monday first', () => {
    const rows = hoursToRows({ mon: '08:00-19:00', sun: 'closed', tue: 'nonsense' });
    expect(rows.map((r) => r.day)).toEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
    expect(rows[0]).toEqual({ day: 'mon', closed: false, open: '08:00', close: '19:00' });
    expect(rows[1]).toEqual({ day: 'tue', closed: false, open: '', close: '' });
    expect(rows[6]).toEqual({ day: 'sun', closed: true, open: '', close: '' });
    expect(hoursToRows(null)).toHaveLength(7);
  });

  it('round-trips, leaves empty days out and reads 00:00 as midnight', () => {
    const rows = hoursToRows({ mon: '08:00-19:00', sun: 'closed' });
    rows[4] = { day: 'fri', closed: false, open: '18:00', close: '00:00' };
    expect(rowsToHours(rows)).toEqual({ hours: { mon: '08:00-19:00', fri: '18:00-24:00', sun: 'closed' } });
  });

  it('names the first day with one time only or closing before opening', () => {
    const rows = hoursToRows({});
    rows[2] = { day: 'wed', closed: false, open: '09:00', close: '' };
    expect(rowsToHours(rows)).toEqual({ day: 'wed', problem: 'missing' });
    rows[2] = { day: 'wed', closed: false, open: '19:00', close: '08:00' };
    expect(rowsToHours(rows)).toEqual({ day: 'wed', problem: 'order' });
    rows[2] = { day: 'wed', closed: true, open: '19:00', close: '08:00' };
    expect(rowsToHours(rows)).toEqual({ hours: { wed: 'closed' } });
  });
});

describe('price, coordinates and store code fields', () => {
  it('reads euros as integer cents, Greek or English decimals', () => {
    expect(parseEuroToCents('2,50')).toBe(250);
    expect(parseEuroToCents('2.5')).toBe(250);
    expect(parseEuroToCents('€ 3')).toBe(300);
    expect(parseEuroToCents('0,05')).toBe(5);
    expect(parseEuroToCents('12,345')).toBeNull();
    expect(parseEuroToCents('0')).toBeNull();
    expect(parseEuroToCents('-2')).toBeNull();
    expect(parseEuroToCents('abc')).toBeNull();
    expect(centsToEuroInput(250, 'el')).toBe('2,50');
    expect(centsToEuroInput(1205, 'en')).toBe('12.05');
  });

  it('coordinates: number, empty or invalid', () => {
    expect(parseCoordinate('37,9838', 90)).toBe(37.9838);
    expect(parseCoordinate(' ', 90)).toBeNull();
    expect(parseCoordinate('91', 90)).toBeUndefined();
    expect(parseCoordinate('37°58′', 90)).toBeUndefined();
  });

  it('store codes go lower case with dashes', () => {
    expect(normaliseStoreCode('  Agios Dimitrios ')).toBe('agios-dimitrios');
    expect(normaliseStoreCode('Glyfada__2')).toBe('glyfada-2');
  });
});
