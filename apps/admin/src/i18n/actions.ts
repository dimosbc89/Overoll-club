'use server';

import { cookies } from 'next/headers';

import { isLocale } from './messages';
import { LOCALE_COOKIE } from './server';

/** Header language switch. Setting the cookie re-renders the current page. */
export async function setLocale(formData: FormData): Promise<void> {
  const locale = formData.get('locale');
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  });
}
