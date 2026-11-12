/**
 * Form helpers for the HQ store and reward editors (back office v0.6). The
 * server validates everything again; these only turn form fields into the
 * API's shapes and back. Money stays integer cents: "2,50" → 250, never a float.
 */

/** Weekday keys in `stores.opening_hours`, Monday first as on a Greek calendar. */
export const editorWeekdays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type EditorWeekday = (typeof editorWeekdays)[number];

export interface HoursRow {
  day: EditorWeekday;
  closed: boolean;
  /** "HH:MM" from an <input type="time">, or "" when not set. */
  open: string;
  close: string;
}

const RANGE = /^(\d{2}:\d{2})-(\d{2}:\d{2})$/;

/** Stored hours → one form row per weekday. Unknown or missing days start empty (open, no times). */
export function hoursToRows(openingHours: unknown): HoursRow[] {
  const table = openingHours && typeof openingHours === 'object' && !Array.isArray(openingHours) ? (openingHours as Record<string, unknown>) : {};
  return editorWeekdays.map((day) => {
    const value = typeof table[day] === 'string' ? (table[day] as string).trim().toLowerCase() : '';
    if (value === 'closed') return { day, closed: true, open: '', close: '' };
    const match = RANGE.exec(value.replace(/\s+/g, ''));
    return { day, closed: false, open: match?.[1] ?? '', close: match?.[2] ?? '' };
  });
}

export type HoursProblem = { day: EditorWeekday; problem: 'missing' | 'order' };

/**
 * Form rows → the API's `openingHours`. A day with neither time is left out
 * (unknown); a closed day is "closed". Returns the first problem instead when
 * a day has one time only or closes before it opens (24:00 aside).
 */
export function rowsToHours(rows: readonly HoursRow[]): { hours: Partial<Record<EditorWeekday, string>> } | HoursProblem {
  const hours: Partial<Record<EditorWeekday, string>> = {};
  for (const row of rows) {
    if (row.closed) {
      hours[row.day] = 'closed';
      continue;
    }
    if (!row.open && !row.close) continue;
    if (!row.open || !row.close) return { day: row.day, problem: 'missing' };
    const close = row.close === '00:00' ? '24:00' : row.close;
    if (close !== '24:00' && close <= row.open) return { day: row.day, problem: 'order' };
    hours[row.day] = `${row.open}-${close}`;
  }
  return { hours };
}

/** "2,50", "2.5", "€ 3", "12" → cents; null when it isn't a price with at most 2 decimals. */
export function parseEuroToCents(text: string): number | null {
  const cleaned = text.replace(/€/g, '').replace(/\s/g, '');
  const match = /^(\d{1,4})(?:[.,](\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const euros = Number(match[1]);
  const cents = Number((match[2] ?? '').padEnd(2, '0'));
  const total = euros * 100 + cents;
  return total > 0 ? total : null;
}

/** Cents → the editable text: "2,50" in Greek, "2.50" in English (no currency sign). */
export function centsToEuroInput(cents: number, locale: 'el' | 'en'): string {
  if (!Number.isInteger(cents)) throw new Error('cents must be an integer');
  const text = `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
  return locale === 'el' ? text.replace('.', ',') : text;
}

/** "37.9838" or "37,9838" → number; "" → null; anything else → undefined (invalid). */
export function parseCoordinate(text: string, limit: number): number | null | undefined {
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  if (!/^-?\d{1,3}(\.\d{1,8})?$/.test(t)) return undefined;
  const n = Number(t);
  return Math.abs(n) <= limit ? n : undefined;
}

/** Store code typed by HQ: lower case, spaces and underscores to dashes. */
export function normaliseStoreCode(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-');
}
