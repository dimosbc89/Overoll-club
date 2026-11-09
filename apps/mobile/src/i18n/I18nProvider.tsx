import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { clubUrl, clubUrlStatic, PROGRAM_NAME, SUPPORT_EMAIL } from '../lib/program';
import { createTranslate, defaultLocale, isLocale, type Locale, type MessageParams, type Translate } from './messages';

const STORAGE_KEY = 'overoll.locale';

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translate;
}

function globalParams(club: string): MessageParams {
  return { programName: PROGRAM_NAME, clubUrl: club, supportEmail: SUPPORT_EMAIL };
}

const I18nContext = createContext<I18nValue>({
  locale: defaultLocale,
  setLocale: () => {},
  t: createTranslate(defaultLocale, globalParams(clubUrlStatic())),
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);
  // The web app's own host is only known in the browser: fill it in after
  // mount so the static HTML and the first client render match.
  const [club, setClub] = useState(clubUrlStatic);
  useEffect(() => setClub(clubUrl()), []);

  // Restore the saved choice after mount (also keeps static web rendering in Greek).
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (!cancelled && isLocale(saved)) setLocaleState(saved);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Web app: keep <html lang> in step so screen readers use the right voice.
  useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({ locale, setLocale, t: createTranslate(locale, globalParams(club)) }),
    [locale, setLocale, club],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}
