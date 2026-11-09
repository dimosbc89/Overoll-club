import { describe, expect, it } from 'vitest';

import { buildActivity, shortStoreName } from '../src/lib/console/device';

const employees = [
  { id: 'emp-1', displayName: 'Μαρία' },
  { id: 'emp-2', displayName: 'Νίκος' },
];

describe("today's activity", () => {
  // 10:00 on 5 January in Athens (UTC+2).
  const now = new Date('2027-01-05T08:00:00Z');

  it('keeps today in the store time zone, newest first, with cashier names', () => {
    const items = buildActivity(
      [
        { id: 1, kind: 'earn', points: 64, amount_cents: 640, employee_id: 'emp-1', created_at: '2027-01-04T21:59:00Z' }, // 23:59 yesterday
        { id: 2, kind: 'earn', points: 80, amount_cents: 640, employee_id: 'emp-1', created_at: '2027-01-04T22:01:00Z' }, // 00:01 today
        { id: 3, kind: 'reverse', points: -80, amount_cents: null, employee_id: 'emp-2', created_at: '2027-01-05T07:30:00Z' },
      ],
      [
        {
          id: 'red-1',
          used_at: '2027-01-05T07:45:00Z',
          used_employee_id: 'emp-2',
          rewards: { name_el: 'Espresso ή διπλός ελληνικός', name_en: 'Espresso or double Greek coffee' },
        },
        { id: 'red-2', used_at: '2027-01-04T08:00:00Z', used_employee_id: 'emp-1', rewards: null },
      ],
      employees,
      'Europe/Athens',
      now,
    );

    expect(items.map((i) => i.id)).toEqual(['r:red-1', 'l:3', 'l:2']);
    expect(items[0]).toMatchObject({ type: 'redemption', rewardNameEn: 'Espresso or double Greek coffee', employeeName: 'Νίκος' });
    expect(items[1]).toMatchObject({ type: 'ledger', kind: 'reverse', points: -80, employeeName: 'Νίκος' });
    expect(items[2]).toMatchObject({ type: 'ledger', kind: 'earn', amountCents: 640, employeeName: 'Μαρία' });
  });

  it('shows no name for an employee who is no longer on the list', () => {
    const [item] = buildActivity(
      [{ id: 9, kind: 'earn', points: 10, amount_cents: 100, employee_id: 'gone', created_at: '2027-01-05T07:00:00Z' }],
      [],
      employees,
      'Europe/Athens',
      now,
    );
    expect(item).toMatchObject({ employeeName: null });
  });

  it('drops the brand from the store name in the header', () => {
    expect(shortStoreName('Overoll Χαλάνδρι')).toBe('Χαλάνδρι');
    expect(shortStoreName('Overoll')).toBe('Overoll');
    expect(shortStoreName('Χαλάνδρι')).toBe('Χαλάνδρι');
  });
});
