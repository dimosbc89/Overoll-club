'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';

import { intlLocale } from '../../i18n/messages';
import { type ActivityItem, loadTodayActivity } from '../../lib/console/device';
import type { Employee, StoreInfo } from '../../lib/console/machine';
import { formatEuroFromCents, formatPoints } from '../../lib/format';
import styles from './console.module.css';
import { Alert, Button, type ScreenContext } from './ui';

type Loaded = { status: 'loading' } | { status: 'error' } | { status: 'ready'; items: ActivityItem[] };

/** Today's ledger entries and used reward codes at this store, newest first (read with the device session). */
export function TodayPanel({
  ctx,
  client,
  store,
  employees,
}: {
  ctx: ScreenContext;
  client: SupabaseClient | null;
  store: StoreInfo;
  employees: readonly Employee[];
}) {
  const { t, locale, dispatch } = ctx;
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });

  const load = useCallback(async () => {
    if (!client) return setLoaded({ status: 'error' });
    setLoaded({ status: 'loading' });
    try {
      setLoaded({ status: 'ready', items: await loadTodayActivity(client, store, employees, new Date()) });
    } catch (error) {
      console.error('today activity', error);
      setLoaded({ status: 'error' });
    }
  }, [client, store, employees]);

  useEffect(() => {
    void load();
  }, [load]);

  const time = new Intl.DateTimeFormat(intlLocale[locale], { hour: '2-digit', minute: '2-digit', timeZone: store.timeZone });
  const what = (item: ActivityItem): string => {
    if (item.type === 'redemption') {
      const reward = (locale === 'el' ? item.rewardNameEl : item.rewardNameEn) ?? t('dashboard.noValue');
      return t('console.redeem.reward', { reward });
    }
    if (item.kind === 'earn') return t('console.today.earn');
    if (item.kind === 'reverse') return t('console.undo');
    return t('console.today.other');
  };
  const signed = (points: number) =>
    points > 0 ? `+${formatPoints(points, locale)}` : `−${formatPoints(Math.abs(points), locale)}`;

  return (
    <section className={styles.today} aria-labelledby="today-title">
      <div className={styles.todayHead}>
        <h1 id="today-title" className={styles.title}>
          {t('console.today')}
        </h1>
        <Button size="small" onClick={() => void load()} disabled={loaded.status === 'loading'}>
          {t('console.today.refresh')}
        </Button>
        <Button variant="filled" size="small" onClick={() => dispatch({ type: 'today/close' })}>
          {t('console.today.close')}
        </Button>
      </div>
      {loaded.status === 'loading' ? (
        <p className={styles.eyebrow} role="status">
          {t('console.loading')}
        </p>
      ) : null}
      {loaded.status === 'error' ? <Alert>{t('state.errorBody')}</Alert> : null}
      {loaded.status === 'ready' && loaded.items.length === 0 ? <p className={styles.body}>{t('console.today.empty')}</p> : null}
      {loaded.status === 'ready' && loaded.items.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{t('console.today.colTime')}</th>
                <th scope="col">{t('console.today.colWhat')}</th>
                <th scope="col" className={styles.num}>
                  {t('console.today.colAmount')}
                </th>
                <th scope="col" className={styles.num}>
                  {t('console.today.colPoints')}
                </th>
                <th scope="col">{t('console.today.colCashier')}</th>
              </tr>
            </thead>
            <tbody>
              {loaded.items.map((item) => (
                <tr key={item.id}>
                  <td className={styles.nowrap}>{time.format(new Date(item.at))}</td>
                  <td>{what(item)}</td>
                  <td className={styles.num}>
                    {item.type === 'ledger' && item.amountCents !== null
                      ? formatEuroFromCents(item.amountCents, locale)
                      : t('dashboard.noValue')}
                  </td>
                  <td className={styles.num}>
                    {item.type === 'ledger' ? (
                      <span className={item.points > 0 ? styles.plus : styles.minus}>{signed(item.points)}</span>
                    ) : (
                      t('dashboard.noValue')
                    )}
                  </td>
                  <td>{item.employeeName ?? t('dashboard.noValue')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
