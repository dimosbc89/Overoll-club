'use client';

import { useState } from 'react';

import { OfficeGate } from '../../components/office/OfficeProvider';
import styles from '../../components/office/office.module.css';
import { useLoad } from '../../components/office/useLoad';
import { useDocumentTitle, useI18n } from '../../i18n/client';
import { formatPoints } from '../../lib/format';
import { loadDashboard, loadOfficeStores, startOfLocalDay, type OfficeUser } from '../../lib/office';
import { inLocale } from '../../lib/store-names';
import type { SupabaseClient } from '@supabase/supabase-js';
import page from './page.module.css';

type Period = 'today' | 'week';

/** HQ dashboard (the whole network) or a manager's store: today or the last 7 days. */
export default function DashboardPage() {
  const { t } = useI18n();
  useDocumentTitle(t('dashboard.title'));
  return (
    <>
      <div>
        <h1>{t('dashboard.title')}</h1>
        <p className="intro">{t('dashboard.intro')}</p>
      </div>
      <OfficeGate need="staff">{({ user, client }) => <Dashboard user={user} client={client} />}</OfficeGate>
    </>
  );
}

function Dashboard({ user, client }: { user: OfficeUser; client: SupabaseClient }) {
  const { t, locale } = useI18n();
  const [period, setPeriod] = useState<Period>('week');
  const stores = useLoad(() => loadOfficeStores(client, user.brandId), `stores:${user.brandId}`);
  const timeZone = stores.status === 'ready' ? (stores.data[0]?.timeZone ?? 'Europe/Athens') : 'Europe/Athens';
  const since = startOfLocalDay(new Date(), timeZone, period === 'week' ? 6 : 0);
  const sinceKey = since.toISOString();
  const stats = useLoad(() => loadDashboard(client, user, new Date(sinceKey)), `stats:${sinceKey}:${user.id}`);

  if (stats.status === 'loading' || stores.status === 'loading') return <p role="status">{t('state.loading')}</p>;
  if (stats.status === 'error' || stores.status === 'error') {
    return (
      <p className="notice" role="alert">
        {t('state.errorBody')}
      </p>
    );
  }

  const storeName = (id: string | null) => {
    if (!id) return t('dashboard.noStore');
    const s = stores.data.find((x) => x.id === id);
    return s ? inLocale(s.name, s.nameEn, locale) : t('dashboard.unknownStore');
  };
  const total = stats.data.stores.reduce(
    (sum, s) => ({
      netPoints: sum.netPoints + s.netPoints,
      purchases: sum.purchases + s.purchases,
      rewardsUsed: sum.rewardsUsed + s.rewardsUsed,
      membersJoined: sum.membersJoined + s.membersJoined,
    }),
    { netPoints: 0, purchases: 0, rewardsUsed: 0, membersJoined: 0 },
  );
  const tiles: { label: string; value: string }[] = [
    ...(stats.data.members !== null ? [{ label: t('dashboard.members'), value: formatPoints(stats.data.members, locale) }] : []),
    ...(user.hq ? [{ label: t('dashboard.joined'), value: formatPoints(total.membersJoined, locale) }] : []),
    { label: t('dashboard.purchases'), value: formatPoints(total.purchases, locale) },
    { label: t('dashboard.points'), value: formatPoints(total.netPoints, locale) },
    { label: t('dashboard.rewardsUsed'), value: formatPoints(total.rewardsUsed, locale) },
  ];

  return (
    <>
      <div className={styles.periods} role="group" aria-label={t('dashboard.period')}>
        {(['today', 'week'] as const).map((p) => (
          <button key={p} type="button" className={styles.small} aria-pressed={period === p} onClick={() => setPeriod(p)}>
            {t(p === 'today' ? 'dashboard.today' : 'dashboard.week')}
          </button>
        ))}
      </div>
      <ul className={page.stats}>
        {tiles.map((tile) => (
          <li key={tile.label} className={page.stat}>
            <span className={page.statLabel}>{tile.label}</span>
            <span className={page.statValue}>{tile.value}</span>
          </li>
        ))}
      </ul>
      {stats.data.stores.length === 0 ? (
        <p>{t('dashboard.nothingYet')}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">{t('dashboard.colStore')}</th>
                <th scope="col" className="num">
                  {t('dashboard.purchases')}
                </th>
                <th scope="col" className="num">
                  {t('dashboard.points')}
                </th>
                <th scope="col" className="num">
                  {t('dashboard.rewardsUsed')}
                </th>
                {user.hq ? (
                  <th scope="col" className="num">
                    {t('dashboard.joined')}
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {stats.data.stores.map((s) => (
                <tr key={s.storeId ?? 'none'}>
                  <th scope="row">{storeName(s.storeId)}</th>
                  <td className="num">{formatPoints(s.purchases, locale)}</td>
                  <td className="num">{formatPoints(s.netPoints, locale)}</td>
                  <td className="num">{formatPoints(s.rewardsUsed, locale)}</td>
                  {user.hq ? <td className="num">{formatPoints(s.membersJoined, locale)}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
