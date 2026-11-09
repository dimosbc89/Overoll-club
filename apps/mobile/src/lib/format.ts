import { intlLocale, type Locale } from '../i18n/messages';

/**
 * Money is integer cents everywhere; it becomes euros only here, for display.
 * el: "2,20 €", en: "€2.20".
 */
export function formatEuroFromCents(cents: number, locale: Locale): string {
  if (!Number.isInteger(cents)) throw new Error('cents must be an integer');
  return new Intl.NumberFormat(intlLocale[locale], { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

/** Points are integers: el "1.500", en "1,500". */
export function formatPoints(points: number, locale: Locale): string {
  if (!Number.isInteger(points)) throw new Error('points must be an integer');
  return new Intl.NumberFormat(intlLocale[locale], { maximumFractionDigits: 0, useGrouping: true }).format(points);
}

/** A ledger amount with its sign: "+80", "−350" (a real minus sign). */
export function formatSignedPoints(points: number, locale: Locale): string {
  const abs = formatPoints(Math.abs(points), locale);
  return points < 0 ? `−${abs}` : `+${abs}`;
}

/**
 * Copy deck `{date}`: day and month, e.g. el "17 Ιανουαρίου", en "17 January",
 * in Athens time (the program's calendar).
 */
export function formatDayMonth(date: Date | string, locale: Locale, timeZone = 'Europe/Athens'): string {
  const value = typeof date === 'string' ? new Date(date) : date;
  try {
    return new Intl.DateTimeFormat(intlLocale[locale], { day: 'numeric', month: 'long', timeZone }).format(value);
  } catch {
    return new Intl.DateTimeFormat(intlLocale[locale], { day: 'numeric', month: 'long' }).format(value);
  }
}

/** Short date and time for history rows: el "9/11, 14:05". */
export function formatDateTime(date: Date | string, locale: Locale, timeZone = 'Europe/Athens'): string {
  const value = typeof date === 'string' ? new Date(date) : date;
  const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false };
  try {
    return new Intl.DateTimeFormat(intlLocale[locale], { ...options, timeZone }).format(value);
  } catch {
    return new Intl.DateTimeFormat(intlLocale[locale], options).format(value);
  }
}

/** Milliseconds left until `expiresAt` (never negative). */
export function remainingMs(expiresAt: Date | string, now: Date): number {
  const end = typeof expiresAt === 'string' ? Date.parse(expiresAt) : expiresAt.getTime();
  return Math.max(0, end - now.getTime());
}

/**
 * Countdown as `mm:ss` (copy deck `{time}`). Rounds up, so the display shows
 * 00:00 only once the time is really over.
 */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** Member and redemption codes in groups of 4 for reading out: "K7MP 2QXH". */
export function groupCode(code: string, size = 4): string {
  const clean = code.replace(/\s+/g, '');
  const groups: string[] = [];
  for (let i = 0; i < clean.length; i += size) groups.push(clean.slice(i, i + size));
  return groups.join(' ');
}
