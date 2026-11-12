import { describe, expect, it } from 'vitest';

import { localMidnight, localMonthOf, type ReportRow } from '../src/lib/office';
import { monthChoices, monthKey, reportCsv, summariseReport } from '../src/lib/report';

const row = (over: Partial<ReportRow>): ReportRow => ({
  rewardId: 'espresso',
  rewardNameEl: 'Εσπρέσο',
  rewardNameEn: 'Espresso',
  employeeId: 'maria',
  employeeName: 'Μαρία',
  used: 1,
  gifts: 0,
  points: 300,
  valueCents: 220,
  ...over,
});

describe('monthly store report', () => {
  const rows = [
    row({ used: 3, points: 900, valueCents: 660 }),
    row({ employeeId: 'nikos', employeeName: 'Νίκος', used: 1, points: 300, valueCents: 220 }),
    row({ rewardId: 'roll', rewardNameEl: 'Ρολό κανέλας', rewardNameEn: 'Cinnamon roll', employeeId: 'nikos', employeeName: 'Νίκος', used: 4, gifts: 4, points: 0, valueCents: 1400 }),
  ];

  it('adds up totals, per reward (catalog order) and per cashier (most first)', () => {
    const { totals, byReward, byCashier } = summariseReport(rows);
    expect(totals).toEqual({ used: 8, gifts: 4, points: 1200, valueCents: 2280 });
    expect(byReward.map((r) => [r.nameEn, r.used, r.valueCents])).toEqual([
      ['Espresso', 4, 880],
      ['Cinnamon roll', 4, 1400],
    ]);
    expect(byCashier.map((c) => [c.name, c.used, c.valueCents])).toEqual([
      ['Νίκος', 5, 1620],
      ['Μαρία', 3, 660],
    ]);
    expect(summariseReport([]).totals).toEqual({ used: 0, gifts: 0, points: 0, valueCents: 0 });
  });

  it('CSV: Greek uses ; and decimal commas, English , and points; quotes when needed', () => {
    const headers = { reward: 'Δώρο', rewardEn: 'Reward', cashier: 'Ταμίας', count: 'Δόθηκαν', gifts: 'Καλωσορίσματος', points: 'Πόντοι', value: 'Αξία' };
    const el = reportCsv(rows.slice(0, 1), headers, 'el');
    expect(el.startsWith('﻿Δώρο;Reward;Ταμίας;')).toBe(true);
    expect(el).toContain('Εσπρέσο;Espresso;Μαρία;3;0;900;6,60\r\n');
    const en = reportCsv([row({ rewardNameEn: 'Coffee, large', valueCents: 1205 })], headers, 'en');
    expect(en).toContain('"Coffee, large",Μαρία,1,0,300,12.05');
  });

  it('month choices go back across the new year', () => {
    expect(monthChoices({ year: 2027, month: 2 }, 3).map(monthKey)).toEqual(['2027-02', '2027-01', '2026-12']);
  });

  it('month bounds are local midnights in Athens, summer time included', () => {
    expect(localMidnight(2027, 1, 1, 'Europe/Athens').toISOString()).toBe('2026-12-31T22:00:00.000Z');
    expect(localMidnight(2027, 7, 1, 'Europe/Athens').toISOString()).toBe('2027-06-30T21:00:00.000Z');
    expect(localMidnight(2026, 13, 1, 'Europe/Athens').toISOString()).toBe('2026-12-31T22:00:00.000Z');
    expect(localMonthOf(new Date('2026-11-30T22:30:00Z'), 'Europe/Athens')).toEqual({ year: 2026, month: 12 });
  });
});
