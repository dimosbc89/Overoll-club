import type { Locale } from '../i18n/messages';

/**
 * Store names and addresses are stored in Greek (`stores.name`, `address`)
 * and English (`name_en`, `address_en`, v0.4): the English one in English
 * when it is filled in, else the Greek one.
 */
export function inLocale(greek: string, english: string | null | undefined, locale: Locale): string {
  return locale === 'en' && english?.trim() ? english : greek;
}
