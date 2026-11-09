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
  return new Intl.NumberFormat(intlLocale[locale], { maximumFractionDigits: 0 }).format(points);
}
