'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { createTranslate, defaultLocale, isLocale, type Locale, type Translate } from './messages';

/**
 * Language for the back office and the till console, chosen in the header switch
 * and kept in this browser (the site is static, so there is no server to remember
 * it). Pages are pre-rendered in Greek; a stored English choice applies on load.
 */
export const LOCALE_STORAGE_KEY = 'overoll_locale';

interface I18n {
  locale: Locale;
  t: Translate;
  setLocale(locale: Locale): void;
}

const I18nContext = createContext<I18n | null>(null);

function storedLocale(): Locale {
  try {
    const value = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(value) ? value : defaultLocale;
  } catch {
    return defaultLocale;
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);

  useEffect(() => {
    setLocaleState(storedLocale());
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // Private mode or storage blocked: the choice lasts for this visit.
    }
  }, []);

  const value = useMemo(() => ({ locale, t: createTranslate(locale), setLocale }), [locale, setLocale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n outside I18nProvider');
  return value;
}

/** Sets the browser tab title in the current language (static pages have no per-request metadata). */
export function useDocumentTitle(title: string): void {
  const { t } = useI18n();
  useEffect(() => {
    document.title = t('meta.pageTitle', { page: title });
  }, [t, title]);
}
