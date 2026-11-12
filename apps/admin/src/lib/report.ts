import type { Locale } from '../i18n/messages';
import type { ReportRow } from './office';

/**
 * The monthly store report (back office v0.6), from `store_report` rows (one
 * per reward and cashier): totals, per reward, per cashier, and a CSV file.
 * Counts and cents stay integers; euros appear only when formatted.
 */

export interface ReportTotals {
  used: number;
  gifts: number;
  points: number;
  valueCents: number;
}

export interface RewardLine extends ReportTotals {
  rewardId: string;
  nameEl: string;
  nameEn: string;
}

export interface CashierLine extends ReportTotals {
  employeeId: string | null;
  name: string | null;
}

const zero = (): ReportTotals => ({ used: 0, gifts: 0, points: 0, valueCents: 0 });
const add = (into: ReportTotals, row: ReportTotals) => {
  into.used += row.used;
  into.gifts += row.gifts;
  into.points += row.points;
  into.valueCents += row.valueCents;
};

export function summariseReport(rows: readonly ReportRow[]): { totals: ReportTotals; byReward: RewardLine[]; byCashier: CashierLine[] } {
  const totals = zero();
  const rewards = new Map<string, RewardLine>();
  const cashiers = new Map<string, CashierLine>();
  for (const row of rows) {
    add(totals, row);
    const r = rewards.get(row.rewardId) ?? { rewardId: row.rewardId, nameEl: row.rewardNameEl, nameEn: row.rewardNameEn, ...zero() };
    add(r, row);
    rewards.set(row.rewardId, r);
    const key = row.employeeId ?? '';
    const c = cashiers.get(key) ?? { employeeId: row.employeeId, name: row.employeeName, ...zero() };
    add(c, row);
    cashiers.set(key, c);
  }
  // Rewards keep the catalog order the rows come in; cashiers by most handed out.
  const byCashier = [...cashiers.values()].sort((a, b) => b.used - a.used || (a.name ?? '').localeCompare(b.name ?? ''));
  return { totals, byReward: [...rewards.values()], byCashier };
}

/** Months to pick from, newest first, starting with the month of `current`. */
export function monthChoices(current: { year: number; month: number }, count: number): { year: number; month: number }[] {
  const out: { year: number; month: number }[] = [];
  let { year, month } = current;
  for (let i = 0; i < count; i++) {
    out.push({ year, month });
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }
  return out;
}

export const monthKey = (m: { year: number; month: number }) => `${m.year}-${String(m.month).padStart(2, '0')}`;

/** Cents as a plain number for spreadsheets: "2,50" (Greek) or "2.50" (English). */
function centsCell(cents: number, locale: Locale): string {
  const text = `${Math.trunc(cents / 100)}.${String(Math.abs(cents % 100)).padStart(2, '0')}`;
  return locale === 'el' ? text.replace('.', ',') : text;
}

function cell(value: string, sep: string): string {
  return /["\n\r]/.test(value) || value.includes(sep) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * CSV for Excel or Google Sheets, one line per reward and cashier. Greek uses
 * ";" between columns and decimal commas (what Excel expects in Greece);
 * English uses "," and points. Starts with a byte-order mark so Greek opens right.
 */
export function reportCsv(
  rows: readonly ReportRow[],
  headers: { reward: string; rewardEn: string; cashier: string; count: string; gifts: string; points: string; value: string },
  locale: Locale,
): string {
  const sep = locale === 'el' ? ';' : ',';
  const lines = [
    [headers.reward, headers.rewardEn, headers.cashier, headers.count, headers.gifts, headers.points, headers.value],
    ...rows.map((r) => [
      r.rewardNameEl,
      r.rewardNameEn,
      r.employeeName ?? '',
      String(r.used),
      String(r.gifts),
      String(r.points),
      centsCell(r.valueCents, locale),
    ]),
  ];
  return '﻿' + lines.map((line) => line.map((v) => cell(v, sep)).join(sep)).join('\r\n') + '\r\n';
}
