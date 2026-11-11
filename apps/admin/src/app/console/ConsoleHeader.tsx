'use client';

import { useI18n } from '../../i18n/client';
import { locales } from '../../i18n/messages';
import { shortStoreName } from '../../lib/console/device';
import type { Cashier, StoreInfo } from '../../lib/console/machine';
import { inLocale } from '../../lib/store-names';
import styles from './console.module.css';
import { Button, Initial, type ScreenContext } from './ui';
import { brand } from '../../lib/brand';

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
  const { setLocale } = useI18n();
  return (
    <header className={styles.header}>
      {/* Plain <img>: a static SVG needs no image optimisation. */}
      <img src={brand.wordmark.onLight} alt={t('brand.wordmark')} width={brand.wordmark.width} height={brand.wordmark.height} />
      {store ? <p className={styles.storeName}>{t('console.header', { store: shortStoreName(inLocale(store.name, store.nameEn, locale)) })}</p> : null}
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
      <div role="group" className={styles.language} aria-label={t('language.label')}>
        {locales.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setLocale(option)}
            lang={option}
            aria-pressed={option === locale}
            aria-label={t(option === 'el' ? 'language.el' : 'language.en')}
            className={styles.languageButton}
          >
            {t(option === 'el' ? 'language.elShort' : 'language.enShort')}
          </button>
        ))}
      </div>
    </header>
  );
}
