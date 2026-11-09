import type { Locale } from '../i18n/messages';

/**
 * Store names and addresses are stored in Greek (`stores.name`, `address`)
 * and English (`name_en`, `address_en`, v0.4): the English one in English
 * when it is filled in, else the Greek one.
 */
export function inLocale(greek: string, english: string | null | undefined, locale: Locale): string {
  return locale === 'en' && english?.trim() ? english : greek;
}

/** A store's name and address for the current language. */
export function localStore<T extends { name: string; name_en?: string | null; address: string | null; address_en?: string | null }>(
  store: T,
  locale: Locale,
): T {
  return {
    ...store,
    name: inLocale(store.name, store.name_en, locale),
    address: store.address === null ? null : inLocale(store.address, store.address_en, locale),
  };
}
