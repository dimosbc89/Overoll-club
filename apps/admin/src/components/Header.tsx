'use client';

import Link from 'next/link';

import { useI18n } from '../i18n/client';
import { locales } from '../i18n/messages';
import styles from './Header.module.css';
import { Nav } from './Nav';
import { brand } from '../lib/brand';

/** Cocoa bar with the pink wordmark (8.5:1), navigation and the language switch. */
export function Header() {
  const { locale, t, setLocale } = useI18n();
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
        <img src={brand.wordmark.onDark} alt={t('brand.wordmark')} width={brand.wordmark.width} height={brand.wordmark.height} />
      </Link>
      <Nav items={items} label={t('nav.label')} />
      <div role="group" className={styles.language} aria-label={t('language.label')}>
        {locales.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setLocale(option)}
            lang={option}
            aria-pressed={option === locale}
            className={styles.languageButton}
          >
            {t(option === 'el' ? 'language.el' : 'language.en')}
          </button>
        ))}
      </div>
    </header>
  );
}
