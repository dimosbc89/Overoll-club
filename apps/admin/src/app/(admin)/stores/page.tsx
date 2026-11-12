'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { useState, type FormEvent } from 'react';

import { LoadNotice } from '../../../components/Notice';
import { OfficeGate, useOffice } from '../../../components/office/OfficeProvider';
import styles from '../../../components/office/office.module.css';
import { useLoad } from '../../../components/office/useLoad';
import { useDocumentTitle, useI18n } from '../../../i18n/client';
import type { MessageKey, Translate } from '../../../i18n/messages';
import { errorMessage, newIdempotencyKey } from '../../../lib/api';
import { editorWeekdays, hoursToRows, normaliseStoreCode, parseCoordinate, rowsToHours, type HoursRow } from '../../../lib/catalog';
import { loadStores, useLoaded, type StoreRow } from '../../../lib/data';
import { todayHours } from '../../../lib/hours';
import { loadCatalogStores, type CatalogStore, type OfficeApi, type OfficeUser, type StoreInput } from '../../../lib/office';
import { inLocale } from '../../../lib/store-names';

function todayLabel(store: { opening_hours: unknown; time_zone: string }, t: Translate, now: Date): string {
  const today = todayHours(store.opening_hours, now, store.time_zone);
  if (today.kind === 'open') return t('stores.hours', { open: today.open, close: today.close });
  return t(today.kind === 'closed' ? 'stores.closed' : 'stores.unknown');
}

/** Store list; HQ admins also edit stores, open new ones and close them (v0.6). */
export default function StoresPage() {
  const { t } = useI18n();
  useDocumentTitle(t('stores.title'));
  const { session } = useOffice();
  const hq = session.status === 'ready' && session.user.hq && !session.user.deviceOnly;

  return (
    <>
      <div>
        <h1>{t('stores.title')}</h1>
        <p className="intro">{t(hq ? 'stores.introHq' : 'stores.intro')}</p>
      </div>
      {session.status === 'loading' ? (
        <p role="status">{t('state.loading')}</p>
      ) : hq ? (
        <OfficeGate need="hq">{(ctx) => <StoreEditor {...ctx} />}</OfficeGate>
      ) : (
        <PublicStores />
      )}
    </>
  );
}

/** Active stores, readable without signing in. */
function PublicStores() {
  const { t, locale } = useI18n();
  const stores = useLoaded(loadStores);
  const now = new Date();

  if (stores.status === 'loading') return <p role="status">{t('state.loading')}</p>;
  if (stores.status !== 'ready') return <LoadNotice state={stores} t={t} />;
  if (stores.data.length === 0) return <p>{t('stores.empty')}</p>;
  return (
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
          {stores.data.map((store: StoreRow) => (
            <tr key={store.id}>
              <th scope="row">{inLocale(store.name, store.name_en, locale)}</th>
              <td>
                <code>{store.code}</code>
              </td>
              <td>{store.city}</td>
              <td>{store.address ? inLocale(store.address, store.address_en, locale) : null}</td>
              <td>{store.phone ? <a href={`tel:${store.phone}`}>{store.phone}</a> : null}</td>
              <td className="nowrap">{todayLabel(store, t, now)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HQ editor
// ---------------------------------------------------------------------------

type Ctx = { user: OfficeUser; client: SupabaseClient; api: OfficeApi };
type Message = { ok: boolean; text: string };

function StoreEditor({ user, client, api }: Ctx) {
  const { t, locale } = useI18n();
  const stores = useLoad(() => loadCatalogStores(client, user.brandId), `catalog-stores:${user.brandId}`);
  const [form, setForm] = useState<{ store: CatalogStore | null } | null>(null);
  const [closing, setClosing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const now = new Date();

  async function setActive(store: CatalogStore, active: boolean) {
    setBusy(true);
    setMessage(null);
    const result = await api.updateStore({ storeId: store.id, active });
    setBusy(false);
    setClosing(null);
    const name = inLocale(store.name, store.nameEn, locale);
    if (!result.ok) {
      setMessage({ ok: false, text: errorMessage(result.code, locale, user.config) });
      return;
    }
    setMessage({ ok: true, text: t(active ? 'stores.reopened' : 'stores.closedDone', { name }) });
    stores.reload();
  }

  if (stores.status === 'loading') return <p role="status">{t('state.loading')}</p>;
  if (stores.status === 'error') {
    return (
      <p className="notice" role="alert">
        {t('state.errorBody')}
      </p>
    );
  }

  return (
    <section className={styles.section} aria-label={t('stores.title')}>
      {stores.data.length === 0 ? (
        <p>{t('stores.empty')}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">{t('stores.colName')}</th>
                <th scope="col">{t('stores.colCode')}</th>
                <th scope="col">{t('stores.colCity')}</th>
                <th scope="col">{t('stores.colToday')}</th>
                <th scope="col">{t('catalog.colStatus')}</th>
                <th scope="col">{t('catalog.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {stores.data.map((store) => {
                const name = inLocale(store.name, store.nameEn, locale);
                return (
                  <tr key={store.id}>
                    <th scope="row" className={store.active ? undefined : styles.muted}>
                      {name}
                    </th>
                    <td>
                      <code>{store.code}</code>
                    </td>
                    <td>{store.city}</td>
                    <td className="nowrap">{todayLabel({ opening_hours: store.openingHours, time_zone: store.timeZone }, t, now)}</td>
                    <td>
                      <span className={styles.tag}>{t(store.active ? 'stores.statusActive' : 'stores.statusInactive')}</span>
                    </td>
                    <td>
                      {closing === store.id ? (
                        <div className={styles.actions} role="group" aria-label={t('stores.close')}>
                          <span>{t('stores.closeWarning', { name })}</span>
                          <button type="button" className={styles.small} disabled={busy} onClick={() => void setActive(store, false)}>
                            {t('stores.closeConfirm')}
                          </button>
                          <button type="button" className={styles.small} onClick={() => setClosing(null)}>
                            {t('catalog.cancel')}
                          </button>
                        </div>
                      ) : (
                        <div className={styles.actions}>
                          <button
                            type="button"
                            className={styles.small}
                            disabled={busy}
                            onClick={() => {
                              setMessage(null);
                              setForm({ store });
                            }}
                          >
                            {t('catalog.edit')}
                          </button>
                          {store.active ? (
                            <button type="button" className={styles.small} disabled={busy} onClick={() => setClosing(store.id)}>
                              {t('stores.close')}
                            </button>
                          ) : (
                            <button type="button" className={styles.small} disabled={busy} onClick={() => void setActive(store, true)}>
                              {t('stores.reopen')}
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {message ? (
        <p className={message.ok ? styles.success : styles.error} role={message.ok ? 'status' : 'alert'}>
          {message.text}
        </p>
      ) : null}
      {form ? (
        <StoreForm
          key={form.store?.id ?? 'new'}
          store={form.store}
          user={user}
          api={api}
          onDone={(done) => {
            setForm(null);
            setMessage(done);
            stores.reload();
          }}
          onCancel={() => setForm(null)}
        />
      ) : (
        <div>
          <button
            type="button"
            className="button"
            onClick={() => {
              setMessage(null);
              setForm({ store: null });
            }}
          >
            {t('stores.add')}
          </button>
        </div>
      )}
    </section>
  );
}

function StoreForm({
  store,
  user,
  api,
  onDone,
  onCancel,
}: {
  store: CatalogStore | null;
  user: OfficeUser;
  api: OfficeApi;
  onDone(message: Message): void;
  onCancel(): void;
}) {
  const { t, locale } = useI18n();
  const [code, setCode] = useState('');
  const [name, setName] = useState(store?.name ?? '');
  const [nameEn, setNameEn] = useState(store?.nameEn ?? '');
  const [address, setAddress] = useState(store?.address ?? '');
  const [addressEn, setAddressEn] = useState(store?.addressEn ?? '');
  const [city, setCity] = useState(store?.city ?? '');
  const [phone, setPhone] = useState(store?.phone ?? '');
  const [country, setCountry] = useState<'GR' | 'CY'>(store?.country ?? 'GR');
  const [latitude, setLatitude] = useState(store?.latitude == null ? '' : String(store.latitude));
  const [longitude, setLongitude] = useState(store?.longitude == null ? '' : String(store.longitude));
  const [rows, setRows] = useState<HoursRow[]>(() => hoursToRows(store?.openingHours ?? {}));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [createKey] = useState(newIdempotencyKey);
  const titleId = `store-form-${store?.id ?? 'new'}`;

  const setRow = (day: HoursRow['day'], change: Partial<HoursRow>) => setRows((all) => all.map((r) => (r.day === day ? { ...r, ...change } : r)));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setProblem(null);
    const hours = rowsToHours(rows);
    if (!('hours' in hours)) {
      const day = t(`stores.day.${hours.day}` as MessageKey);
      setProblem(t(hours.problem === 'missing' ? 'stores.hoursMissing' : 'stores.hoursOrder', { day }));
      return;
    }
    const lat = parseCoordinate(latitude, 90);
    const lng = parseCoordinate(longitude, 180);
    if (lat === undefined || lng === undefined || (lat === null) !== (lng === null)) {
      setProblem(t('stores.coordsInvalid'));
      return;
    }
    const fields: StoreInput = {
      name,
      nameEn: nameEn.trim() || null,
      address: address.trim() || null,
      addressEn: addressEn.trim() || null,
      city: city.trim() || null,
      phone: phone.trim() || null,
      country,
      latitude: lat,
      longitude: lng,
      openingHours: hours.hours,
    };
    setBusy(true);
    const result = store
      ? await api.updateStore({ storeId: store.id, ...fields })
      : await api.createStore({ ...fields, brandId: user.brandId, code: normaliseStoreCode(code), name, idempotencyKey: createKey });
    setBusy(false);
    if (!result.ok) {
      setProblem(errorMessage(result.code, locale, user.config));
      return;
    }
    const shown = inLocale(result.store.name, result.store.nameEn, locale);
    onDone({ ok: true, text: t(store ? 'stores.saved' : 'stores.created', { name: shown }) });
  }

  return (
    <form className={`${styles.form} ${styles.editor}`} aria-labelledby={titleId} onSubmit={(e) => void submit(e)} noValidate>
      <h2 id={titleId} className={styles.sectionTitle}>
        {store ? t('stores.formEdit', { name: inLocale(store.name, store.nameEn, locale) }) : t('stores.formNew')}
      </h2>
      {store ? (
        <p className={styles.hint}>{t('stores.codeFixed', { code: store.code })}</p>
      ) : (
        <label className={styles.field}>
          {t('stores.fieldCode')}
          <input
            className={styles.input}
            required
            maxLength={40}
            autoCapitalize="none"
            spellCheck={false}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            aria-describedby="store-code-hint"
          />
          <span id="store-code-hint" className={styles.hint}>
            {t('stores.codeHint')}
          </span>
        </label>
      )}
      <div className={styles.grid}>
        <label className={styles.field}>
          {t('stores.fieldName')}
          <input className={styles.input} lang="el" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className={styles.field}>
          {t('stores.fieldNameEn')}
          <input className={styles.input} lang="en" maxLength={80} value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
        </label>
        <label className={styles.field}>
          {t('stores.fieldAddress')}
          <input className={styles.input} lang="el" maxLength={160} value={address} onChange={(e) => setAddress(e.target.value)} />
        </label>
        <label className={styles.field}>
          {t('stores.fieldAddressEn')}
          <input className={styles.input} lang="en" maxLength={160} value={addressEn} onChange={(e) => setAddressEn(e.target.value)} />
        </label>
        <label className={styles.field}>
          {t('stores.colCity')}
          <input className={styles.input} maxLength={80} value={city} onChange={(e) => setCity(e.target.value)} />
        </label>
        <label className={styles.field}>
          {t('stores.colPhone')}
          <input className={styles.input} type="tel" maxLength={30} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label className={styles.field}>
          {t('stores.fieldCountry')}
          <select className={styles.select} value={country} onChange={(e) => setCountry(e.target.value === 'CY' ? 'CY' : 'GR')}>
            <option value="GR">{t('stores.countryGR')}</option>
            <option value="CY">{t('stores.countryCY')}</option>
          </select>
        </label>
        <label className={styles.field}>
          {t('stores.fieldLatitude')}
          <input className={styles.input} inputMode="decimal" value={latitude} onChange={(e) => setLatitude(e.target.value)} aria-describedby="store-coords-hint" />
        </label>
        <label className={styles.field}>
          {t('stores.fieldLongitude')}
          <input className={styles.input} inputMode="decimal" value={longitude} onChange={(e) => setLongitude(e.target.value)} aria-describedby="store-coords-hint" />
        </label>
      </div>
      <p id="store-coords-hint" className={styles.hint}>
        {t('stores.coordsHint')}
      </p>

      <fieldset className={styles.hours}>
        <legend className={styles.legend}>{t('stores.hoursTitle')}</legend>
        <p className={styles.hint}>{t('stores.hoursHint')}</p>
        {editorWeekdays.map((day) => {
          const row = rows.find((r) => r.day === day)!;
          const dayName = t(`stores.day.${day}` as MessageKey);
          return (
            <div key={day} className={styles.hoursRow} role="group" aria-label={dayName}>
              <span className={styles.hoursDay}>{dayName}</span>
              <label className={styles.inline}>
                <input type="checkbox" checked={row.closed} onChange={(e) => setRow(day, { closed: e.target.checked })} />
                {t('stores.dayClosed')}
              </label>
              <label className={styles.inline}>
                {t('stores.opens')}
                <input
                  className={`${styles.input} ${styles.inputTime}`}
                  type="time"
                  disabled={row.closed}
                  value={row.open}
                  onChange={(e) => setRow(day, { open: e.target.value })}
                />
              </label>
              <label className={styles.inline}>
                {t('stores.closes')}
                <input
                  className={`${styles.input} ${styles.inputTime}`}
                  type="time"
                  disabled={row.closed}
                  value={row.close}
                  onChange={(e) => setRow(day, { close: e.target.value })}
                />
              </label>
            </div>
          );
        })}
      </fieldset>

      {problem ? (
        <p className={styles.error} role="alert">
          {problem}
        </p>
      ) : null}
      <div className={styles.actions}>
        <button type="submit" className="button" disabled={busy || !name.trim() || (!store && !code.trim())}>
          {t('catalog.save')}
        </button>
        <button type="button" className={styles.small} onClick={onCancel}>
          {t('catalog.cancel')}
        </button>
      </div>
    </form>
  );
}
