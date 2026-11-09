'use client';

import { LoadNotice } from '../../../components/Notice';
import { useDocumentTitle, useI18n } from '../../../i18n/client';
import type { Translate } from '../../../i18n/messages';
import { loadStores, useLoaded, type StoreRow } from '../../../lib/data';
import { todayHours } from '../../../lib/hours';

function todayLabel(store: StoreRow, t: Translate, now: Date): string {
  const today = todayHours(store.opening_hours, now, store.time_zone);
  if (today.kind === 'open') return t('stores.hours', { open: today.open, close: today.close });
  return t(today.kind === 'closed' ? 'stores.closed' : 'stores.unknown');
}

/** Store list from Supabase (active stores, readable with the publishable key). */
export default function StoresPage() {
  const { t } = useI18n();
  useDocumentTitle(t('stores.title'));
  const stores = useLoaded(loadStores);
  const now = new Date();

  return (
    <>
      <div>
        <h1>{t('stores.title')}</h1>
        <p className="intro">{t('stores.intro')}</p>
      </div>
      {stores.status === 'loading' ? (
        <p role="status">{t('state.loading')}</p>
      ) : stores.status !== 'ready' ? (
        <LoadNotice state={stores} t={t} />
      ) : stores.data.length === 0 ? (
        <p>{t('stores.empty')}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">{t('stores.colName')}</th>
                <th scope="col">{t('stores.colCode')}</th>
                <th scope="col">{t('stores.colCity')}</th>
                <th scope="col">{t('stores.colAddress')}</th>
                <th scope="col">{t('stores.colPhone')}</th>
                <th scope="col">{t('stores.colToday')}</th>
              </tr>
            </thead>
            <tbody>
              {stores.data.map((store) => (
                <tr key={store.id}>
                  <th scope="row">{store.name}</th>
                  <td>
                    <code>{store.code}</code>
                  </td>
                  <td>{store.city}</td>
                  <td>{store.address}</td>
                  <td>{store.phone ? <a href={`tel:${store.phone}`}>{store.phone}</a> : null}</td>
                  <td className="nowrap">{todayLabel(store, t, now)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
