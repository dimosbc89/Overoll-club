/**
 * Same helper as apps/mobile/src/lib/hours.ts: keep the two in step.
 *
 * Store opening hours. `stores.opening_hours` is jsonb keyed by weekday
 * ("mon".."sun") with "HH:MM-HH:MM" values, e.g. {"mon": "08:00-19:00"}.
 * A day that is missing, or set to "closed", means closed that day.
 */
export const weekdays = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type Weekday = (typeof weekdays)[number];

export type TodayHours =
  | { kind: 'open'; open: string; close: string }
  | { kind: 'closed' }
  /** No usable hours at all (empty or malformed data). */
  | { kind: 'unknown' };

const RANGE = /^([01]\d|2[0-3]):([0-5]\d)\s*-\s*([01]\d|2[0-4]):([0-5]\d)$/;

function isWeekday(value: string): value is Weekday {
  return (weekdays as readonly string[]).includes(value);
}

/** Weekday of `date` in the store's time zone (falls back to the device's). */
export function weekdayIn(date: Date, timeZone: string): Weekday {
  try {
    const name = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone })
      .format(date)
      .slice(0, 3)
      .toLowerCase();
    if (isWeekday(name)) return name;
  } catch {
    // Unknown time zone or no Intl time-zone support: use the device's day.
  }
  return weekdays[date.getDay()] ?? 'mon';
}

export function todayHours(openingHours: unknown, now: Date, timeZone = 'Europe/Athens'): TodayHours {
  if (!openingHours || typeof openingHours !== 'object' || Array.isArray(openingHours)) {
    return { kind: 'unknown' };
  }
  const table = openingHours as Record<string, unknown>;
  if (!weekdays.some((day) => typeof table[day] === 'string')) return { kind: 'unknown' };

  const value = table[weekdayIn(now, timeZone)];
  if (typeof value !== 'string' || value.trim().toLowerCase() === 'closed') return { kind: 'closed' };

  const match = RANGE.exec(value.trim());
  if (!match) return { kind: 'unknown' };
  return { kind: 'open', open: `${match[1]}:${match[2]}`, close: `${match[3]}:${match[4]}` };
}
