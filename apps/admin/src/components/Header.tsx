'use client';

import Link from 'next/link';

import { useI18n } from '../i18n/client';
import { locales } from '../i18n/messages';
import styles from './Header.module.css';
import { Nav } from './Nav';
import { useOffice } from './office/OfficeProvider';
import { brand } from '../lib/brand';

/** Cocoa bar with the pink wordmark (8.5:1), navigation and the language switch. */
export function Header() {
  const { locale, t, setLocale } = useI18n();
  const { session, signOut } = useOffice();
  const user = session.status === 'ready' && !session.user.deviceOnly ? session.user : null;
  const signedIn = session.status === 'ready' || session.status === 'no-access';
  const items = [
    { href: '/', label: t('nav.dashboard') },
    ...(user?.hq ? [{ href: '/members', label: t('nav.members') }] : []),
    ...(user ? [{ href: '/staff', label: t('nav.staff') }] : []),
    { href: '/stores', label: t('nav.stores') },
    { href: '/rewards', label: t('nav.rewards') },
    { href: '/console', label: t('nav.console') },
    ...(signedIn ? [] : [{ href: '/sign-in', label: t('nav.signIn') }]),
  ];

  return (
    <header className={styles.header}>
      <Link href="/" className={styles.brand}>
        {/* Plain <img>: a static SVG needs no image optimisation. */}
        <img src={brand.wordmark.onDark} alt={t('brand.wordmark')} width={brand.wordmark.width} height={brand.wordmark.height} />
      </Link>
      <Nav items={items} label={t('nav.label')} />
      {signedIn ? (
        <button type="button" className={styles.languageButton} onClick={() => void signOut()}>
          {t('nav.signOut')}
        </button>
      ) : null}
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
