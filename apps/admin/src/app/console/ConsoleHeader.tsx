'use client';

import { setLocale } from '../../i18n/actions';
import { locales } from '../../i18n/messages';
import { shortStoreName } from '../../lib/console/device';
import type { Cashier, StoreInfo } from '../../lib/console/machine';
import styles from './console.module.css';
import { Button, Initial, type ScreenContext } from './ui';

interface Props {
  ctx: ScreenContext;
  store: StoreInfo | null;
  cashier: Cashier | null;
  todayOpen: boolean;
  busy: boolean;
}

/** White bar: wordmark, "Store · Till", the cashier, Switch cashier, Today's activity, language. */
export function ConsoleHeader({ ctx, store, cashier, todayOpen, busy }: Props) {
  const { t, locale, dispatch } = ctx;
  return (
    <header className={styles.header}>
      {/* Plain <img>: a static SVG needs no image optimisation. */}
      <img src="/overoll-wordmark.svg" alt={t('brand.wordmark')} width={104} height={28} />
      {store ? <p className={styles.storeName}>{t('console.header', { store: shortStoreName(store.name) })}</p> : null}
      <div className={styles.spacer} />
      {cashier ? (
        <>
          <div className={styles.cashier}>
            <Initial name={cashier.displayName} />
            {cashier.displayName}
          </div>
          <Button size="small" disabled={busy} onClick={() => dispatch({ type: 'cashier/switch' })}>
            {t('console.employee.switch')}
          </Button>
          <Button
            size="small"
            aria-pressed={todayOpen}
            onClick={() => dispatch({ type: todayOpen ? 'today/close' : 'today/open' })}
          >
            {t('console.today')}
          </Button>
        </>
      ) : null}
      <form action={setLocale} className={styles.language} aria-label={t('language.label')}>
        {locales.map((option) => (
          <button
            key={option}
            type="submit"
            name="locale"
            value={option}
            lang={option}
            aria-pressed={option === locale}
            aria-label={t(option === 'el' ? 'language.el' : 'language.en')}
            className={styles.languageButton}
          >
            {t(option === 'el' ? 'language.elShort' : 'language.enShort')}
          </button>
        ))}
      </form>
    </header>
  );
}
