'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { useState } from 'react';

import { OfficeGate } from '../../../components/office/OfficeProvider';
import styles from '../../../components/office/office.module.css';
import { useLoad } from '../../../components/office/useLoad';
import { useDocumentTitle, useI18n } from '../../../i18n/client';
import { intlLocale } from '../../../i18n/messages';
import { formatEuroFromCents, formatPoints } from '../../../lib/format';
import { loadOfficeStores, loadStoreReport, localMidnight, localMonthOf, type OfficeStore, type OfficeUser } from '../../../lib/office';
import { monthChoices, monthKey, reportCsv, summariseReport } from '../../../lib/report';
import { inLocale } from '../../../lib/store-names';
import page from '../page.module.css';

/** Monthly store report: rewards handed out per reward and per cashier, with their value (v0.6). */
export default function ReportsPage() {
  const { t } = useI18n();
  useDocumentTitle(t('reports.title'));
  return (
    <>
      <div>
        <h1>{t('reports.title')}</h1>
        <p className="intro">{t('reports.intro')}</p>
      </div>
      <OfficeGate need="staff">{({ user, client }) => <Reports user={user} client={client} />}</OfficeGate>
    </>
  );
}

function Reports({ user, client }: { user: OfficeUser; client: SupabaseClient }) {
  const { t, locale } = useI18n();
  const stores = useLoad(() => loadOfficeStores(client, user.brandId), `stores:${user.brandId}`);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [month, setMonth] = useState<string | null>(null);

  if (stores.status === 'loading') return <p role="status">{t('state.loading')}</p>;
  if (stores.status === 'error') {
    return (
      <p className="notice" role="alert">
        {t('state.errorBody')}
      </p>
    );
  }
  const mine = stores.data.filter((s) => user.managedStoreIds === 'all' || user.managedStoreIds.includes(s.id));
  const store = mine.find((s) => s.id === storeId) ?? mine[0] ?? null;
  if (!store) return <p>{t('reports.noStores')}</p>;

  const months = monthChoices(localMonthOf(new Date(), store.timeZone), 13);
  const chosen = months.find((m) => monthKey(m) === month) ?? months[0]!;
  const monthName = (m: { year: number; month: number }) =>
    new Intl.DateTimeFormat(intlLocale[locale], { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(m.year, m.month - 1, 15)));

  return (
    <>
      <div className={styles.toolbar}>
        <label className={styles.field}>
          {t('reports.store')}
          <select className={styles.select} value={store.id} onChange={(e) => setStoreId(e.target.value)}>
            {mine.map((s) => (
              <option key={s.id} value={s.id}>
                {inLocale(s.name, s.nameEn, locale)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          {t('reports.month')}
          <select className={styles.select} value={monthKey(chosen)} onChange={(e) => setMonth(e.target.value)}>
            {months.map((m) => (
              <option key={monthKey(m)} value={monthKey(m)}>
                {monthName(m)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Report key={`${store.id}:${monthKey(chosen)}`} store={store} month={chosen} client={client} />
    </>
  );
}

function Report({ store, month, client }: { store: OfficeStore; month: { year: number; month: number }; client: SupabaseClient }) {
  const { t, locale } = useI18n();
  const from = localMidnight(month.year, month.month, 1, store.timeZone);
  const to = localMidnight(month.year, month.month + 1, 1, store.timeZone);
  const report = useLoad(() => loadStoreReport(client, store.id, from, to), `report:${store.id}:${from.toISOString()}`);

  if (report.status === 'loading') return <p role="status">{t('state.loading')}</p>;
  if (report.status === 'error') {
    return (
      <p className="notice" role="alert">
        {t('state.errorBody')}
      </p>
    );
  }
  const rows = report.data;
  const { totals, byReward, byCashier } = summariseReport(rows);

  function download() {
    const csv = reportCsv(
      rows,
      {
        reward: t('reports.colReward'),
        rewardEn: t('reports.colRewardEn'),
        cashier: t('reports.colCashier'),
        count: t('reports.colCount'),
        gifts: t('reports.colGifts'),
        points: t('reports.colPoints'),
        value: t('reports.colValue'),
      },
      locale,
    );
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${store.code}-${monthKey(month)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const tiles = [
    { label: t('reports.used'), value: formatPoints(totals.used, locale) },
    { label: t('reports.gifts'), value: formatPoints(totals.gifts, locale) },
    { label: t('reports.points'), value: formatPoints(totals.points, locale) },
    { label: t('reports.value'), value: formatEuroFromCents(totals.valueCents, locale) },
  ];

  return (
    <>
      <ul className={page.stats}>
        {tiles.map((tile) => (
          <li key={tile.label} className={page.stat}>
            <span className={page.statLabel}>{tile.label}</span>
            <span className={page.statValue}>{tile.value}</span>
          </li>
        ))}
      </ul>
      <p className={styles.hint}>{t('reports.valueHint')}</p>
      {rows.length === 0 ? (
        <p>{t('reports.empty')}</p>
      ) : (
        <>
          <section className={styles.section} aria-labelledby="by-reward">
            <h2 id="by-reward" className={styles.sectionTitle}>
              {t('reports.byReward')}
            </h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">{t('reports.colReward')}</th>
                    <th scope="col" className="num">
                      {t('reports.colCount')}
                    </th>
                    <th scope="col" className="num">
                      {t('reports.colGifts')}
                    </th>
                    <th scope="col" className="num">
                      {t('reports.colPoints')}
                    </th>
                    <th scope="col" className="num">
                      {t('reports.colValue')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {byReward.map((r) => (
                    <tr key={r.rewardId}>
                      <th scope="row">{locale === 'en' ? r.nameEn : r.nameEl}</th>
                      <td className="num">{formatPoints(r.used, locale)}</td>
                      <td className="num">{formatPoints(r.gifts, locale)}</td>
                      <td className="num">{formatPoints(r.points, locale)}</td>
                      <td className="num">{formatEuroFromCents(r.valueCents, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className={styles.section} aria-labelledby="by-cashier">
            <h2 id="by-cashier" className={styles.sectionTitle}>
              {t('reports.byCashier')}
            </h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">{t('reports.colCashier')}</th>
                    <th scope="col" className="num">
                      {t('reports.colCount')}
                    </th>
                    <th scope="col" className="num">
                      {t('reports.colValue')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {byCashier.map((c) => (
                    <tr key={c.employeeId ?? 'none'}>
                      <th scope="row">{c.name ?? '—'}</th>
                      <td className="num">{formatPoints(c.used, locale)}</td>
                      <td className="num">{formatEuroFromCents(c.valueCents, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <div>
            <button type="button" className="button" onClick={download}>
              {t('reports.download')}
            </button>
          </div>
        </>
      )}
    </>
  );
}
