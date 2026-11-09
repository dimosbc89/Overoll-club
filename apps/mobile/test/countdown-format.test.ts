import { describe, expect, it } from 'vitest';

import { formatCountdown, formatDayMonth, formatSignedPoints, groupCode, remainingMs } from '../src/lib/format';

describe('countdown', () => {
  it('formats mm:ss and rounds up so 00:00 means over', () => {
    expect(formatCountdown(15 * 60_000)).toBe('15:00');
    expect(formatCountdown(14 * 60_000 + 32_000)).toBe('14:32');
    expect(formatCountdown(59_001)).toBe('01:00');
    expect(formatCountdown(999)).toBe('00:01');
    expect(formatCountdown(0)).toBe('00:00');
    expect(formatCountdown(-5000)).toBe('00:00');
  });

  it('counts down to expiresAt and never goes negative', () => {
    const now = new Date('2026-11-09T10:00:00.000Z');
    expect(remainingMs('2026-11-09T10:15:00.000Z', now)).toBe(900_000);
    expect(remainingMs(new Date('2026-11-09T10:00:30.500Z'), now)).toBe(30_500);
    expect(remainingMs('2026-11-09T09:59:00.000Z', now)).toBe(0);
    expect(formatCountdown(remainingMs('2026-11-09T10:14:32.000Z', now))).toBe('14:32');
  });
});

describe('codes and points', () => {
  it('groups codes in fours for reading out', () => {
    expect(groupCode('K7MP2QXH')).toBe('K7MP 2QXH');
    expect(groupCode('K7MP 2QXH')).toBe('K7MP 2QXH');
    expect(groupCode('ABCDEFGHJK')).toBe('ABCD EFGH JK');
  });

  it('signs ledger amounts with a real minus', () => {
    expect(formatSignedPoints(80, 'el')).toBe('+80');
    expect(formatSignedPoints(-1950, 'el')).toBe('−1.950');
    expect(formatSignedPoints(-1950, 'en')).toBe('−1,950');
  });
});

describe('dates', () => {
  it('writes {date} as day and month in Athens time', () => {
    // 22:30 UTC on 16 Jan is already 17 Jan in Athens.
    expect(formatDayMonth('2027-01-16T22:30:00Z', 'el')).toBe('17 Ιανουαρίου');
    expect(formatDayMonth('2027-01-16T22:30:00Z', 'en')).toBe('17 January');
  });
});
