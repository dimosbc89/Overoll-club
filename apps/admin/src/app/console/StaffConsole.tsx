'use client';

import { useState } from 'react';

import { createTranslate, type Locale } from '../../i18n/messages';
import { formatEuroFromCents } from '../../lib/format';
import { digitKeys, pressKey, type KeypadKey } from '../../lib/keypad';
import styles from './console.module.css';

interface Props {
  locale: Locale;
  /** Largest receipt total, from packages/core (limits.maxAmountCents). */
  maxCents: number;
  maxLabel: string;
}

export function StaffConsole({ locale, maxCents, maxLabel }: Props) {
  const t = createTranslate(locale);
  const [cents, setCents] = useState(0);
  const [status, setStatus] = useState('');
  const press = (key: KeypadKey) => setCents((current) => pressKey(current, key, maxCents));

  return (
    <div className={styles.console}>
      <section className={styles.scan}>
        <p>{t('console.scanHint')}</p>
        {/* Placeholder: camera scanning arrives with the staff console (week 3). */}
        <button type="button" className={styles.scanButton} onClick={() => setStatus(t('console.scanSoon'))}>
          {t('console.scan')}
        </button>
        <p role="status" className={styles.status}>
          {status}
        </p>
      </section>

      <section className={styles.amount} aria-labelledby="amount-label">
        <p id="amount-label" className={styles.amountLabel}>
          {t('console.amount')}
        </p>
        <output className={styles.display} aria-live="polite" aria-labelledby="amount-label">
          {formatEuroFromCents(cents, locale)}
        </output>
        <p className={styles.hint}>{maxLabel}</p>

        <div className={styles.keypad} role="group" aria-label={t('console.keypad')}>
          {digitKeys.map((key) => (
            <button key={key} type="button" className={styles.key} onClick={() => press(key)}>
              {key}
            </button>
          ))}
          <button type="button" className={styles.key} aria-label={t('console.keyBack')} onClick={() => press('back')}>
            ⌫
          </button>
          <button
            type="button"
            className={`${styles.key} ${styles.wide}`}
            aria-label={t('console.keyClear')}
            onClick={() => press('clear')}
          >
            C
          </button>
        </div>

        {/* Placeholder: awarding points is a server function (week 3). */}
        <button type="button" className="button" disabled>
          {t('console.award')}
        </button>
        <p className={styles.hint}>{t('console.placeholder')}</p>
      </section>
    </div>
  );
}
