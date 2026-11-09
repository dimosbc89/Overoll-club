import 'server-only';

import { cookies } from 'next/headers';

import { createTranslate, defaultLocale, isLocale, type Locale, type Translate } from './messages';

export const LOCALE_COOKIE = 'overoll_locale';

/** Language chosen in the header switch (cookie), Greek by default. */
export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : defaultLocale;
}

export async function getI18n(): Promise<{ locale: Locale; t: Translate }> {
  const locale = await getLocale();
  return { locale, t: createTranslate(locale) };
}
