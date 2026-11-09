/**
 * Late points: a member who forgot their card gets the points later the same
 * day at the same store; the cashier types the receipt number so one receipt
 * earns points once per store per calendar day (brand time zone).
 *
 * Receipt numbers are letters, digits, "-" and "/", 1–40 characters.
 * Normalised before they are compared, so the same receipt typed slightly
 * differently still counts once:
 * - spaces around it are dropped, letters are upper-cased, accents removed;
 * - Greek capitals that look like Latin ones (Α Β Ε Ζ Η Ι Κ Μ Ν Ο Ρ Τ Υ Χ)
 *   become the Latin letter, so a Greek or a Latin keyboard gives the same text.
 */
import { localDay } from './points.js';

export const receiptNumberMaxLength = 40;

const greekLookalikes: Readonly<Record<string, string>> = {
  Α: 'A', Β: 'B', Ε: 'E', Ζ: 'Z', Η: 'H', Ι: 'I', Κ: 'K', Μ: 'M', Ν: 'N', Ο: 'O', Ρ: 'P', Τ: 'T', Υ: 'Y', Χ: 'X',
};

const receiptPattern = new RegExp(`^[A-Z0-9Α-Ω/-]{1,${receiptNumberMaxLength}}$`);

/**
 * Earliest earn that `receiptUsedToday` needs to see for `now`: a local
 * calendar day lasts at most 25 hours (DST change).
 */
export function receiptLookbackStart(now: Date): Date {
  return new Date(now.getTime() - 26 * 3_600_000);
}

/**
 * Has this receipt already earned points today at this store? `usedAt` = the
 * times of this store's earns with the same (normalised) number that were not
 * undone; "today" is `now`'s calendar day in `timeZone`.
 */
export function receiptUsedToday(usedAt: readonly Date[], now: Date, timeZone = 'Europe/Athens'): boolean {
  const today = localDay(now, timeZone);
  return usedAt.some((d) => localDay(d, timeZone) === today);
}

/** The receipt number as stored and compared, or null if it can't be a receipt number. */
export function normalizeReceiptNumber(raw: string): string | null {
  const text = raw
    .trim()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/[ΑΒΕΖΗΙΚΜΝΟΡΤΥΧ]/g, (c) => greekLookalikes[c] ?? c);
  return receiptPattern.test(text) ? text : null;
}
