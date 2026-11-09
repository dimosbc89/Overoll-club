import Link from 'next/link';

import { setLocale } from '../i18n/actions';
import { locales, type Locale, type Translate } from '../i18n/messages';
import styles from './Header.module.css';
import { Nav } from './Nav';

/** Cocoa bar with the pink wordmark (8.5:1), navigation and the language switch. */
export function Header({ locale, t }: { locale: Locale; t: Translate }) {
  const items = [
    { href: '/', label: t('nav.dashboard') },
    { href: '/stores', label: t('nav.stores') },
    { href: '/rewards', label: t('nav.rewards') },
    { href: '/console', label: t('nav.console') },
    { href: '/sign-in', label: t('nav.signIn') },
  ];

  return (
    <header className={styles.header}>
      <Link href="/" className={styles.brand}>
        {/* Plain <img>: a static SVG needs no image optimisation. */}
        <img src="/overoll-wordmark.svg" alt={t('brand.wordmark')} width={104} height={28} />
      </Link>
      <Nav items={items} label={t('nav.label')} />
      <form action={setLocale} className={styles.language} aria-label={t('language.label')}>
        {locales.map((option) => (
          <button
            key={option}
            type="submit"
            name="locale"
            value={option}
            lang={option}
            aria-pressed={option === locale}
            className={styles.languageButton}
          >
            {t(option === 'el' ? 'language.el' : 'language.en')}
          </button>
        ))}
      </form>
    </header>
  );
}
