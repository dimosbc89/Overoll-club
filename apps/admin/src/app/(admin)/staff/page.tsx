'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { useState, type FormEvent } from 'react';

import { OfficeGate } from '../../../components/office/OfficeProvider';
import styles from '../../../components/office/office.module.css';
import { useLoad } from '../../../components/office/useLoad';
import { useDocumentTitle, useI18n } from '../../../i18n/client';
import type { MessageKey } from '../../../i18n/messages';
import { errorMessage, newIdempotencyKey } from '../../../lib/api';
import {
  loadOfficeStores,
  loadStaff,
  loadStoreEmployees,
  type EmployeeRow,
  type OfficeApi,
  type OfficeStore,
  type OfficeUser,
  type StaffRow,
} from '../../../lib/office';
import { inLocale } from '../../../lib/store-names';

/** Cashiers (with PINs), till devices, store managers and HQ admins. */
export default function StaffPage() {
  const { t } = useI18n();
  useDocumentTitle(t('staff.title'));
  return (
    <>
      <div>
        <h1>{t('staff.title')}</h1>
        <p className="intro">{t('staff.intro')}</p>
      </div>
      <OfficeGate need="staff">{(ctx) => <Staff {...ctx} />}</OfficeGate>
    </>
  );
}

type Props = { user: OfficeUser; client: SupabaseClient; api: OfficeApi };

function Staff({ user, client, api }: Props) {
  const { t, locale } = useI18n();
  const stores = useLoad(() => loadOfficeStores(client, user.brandId), `stores:${user.brandId}`);
  const [storeId, setStoreId] = useState<string | null>(null);

  if (stores.status === 'loading') return <p role="status">{t('state.loading')}</p>;
  if (stores.status === 'error') {
    return (
      <p className="notice" role="alert">
        {t('state.errorBody')}
      </p>
    );
  }
  const mine = stores.data.filter((s) => user.managedStoreIds === 'all' || user.managedStoreIds.includes(s.id));
  const selected = mine.find((s) => s.id === storeId) ?? mine[0] ?? null;

  return (
    <>
      <label className={styles.field}>
        {t('staff.store')}
        <select className={styles.select} value={selected?.id ?? ''} onChange={(e) => setStoreId(e.target.value)}>
          {mine.map((s) => (
            <option key={s.id} value={s.id}>
              {inLocale(s.name, s.nameEn, locale)}
              {s.active ? '' : ` (${t('staff.storeClosed')})`}
            </option>
          ))}
        </select>
      </label>
      {selected ? (
        <>
          <Cashiers key={`c:${selected.id}`} store={selected} user={user} client={client} api={api} />
          {user.hq ? <StoreAccounts key={`a:${selected.id}`} store={selected} user={user} client={client} api={api} /> : null}
        </>
      ) : (
        <p>{t('staff.noStores')}</p>
      )}
      {user.hq ? <HqAdmins user={user} client={client} api={api} /> : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Cashiers
// ---------------------------------------------------------------------------

function Cashiers({ store, user, client, api }: Props & { store: OfficeStore }) {
  const { t, locale } = useI18n();
  const employees = useLoad(() => loadStoreEmployees(client, store.id), `employees:${store.id}`);
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [editing, setEditing] = useState<{ id: string; field: 'name' | 'pin'; value: string } | null>(null);
  const [addKey, setAddKey] = useState(newIdempotencyKey);
  const { staffPinMinDigits: minDigits, staffPinMaxDigits: maxDigits } = user.config.limits;

  async function add(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage(null);
    const result = await api.createEmployee({ storeId: store.id, displayName: name, pin, idempotencyKey: addKey });
    setBusy(false);
    if (!result.ok) {
      setMessage({ ok: false, text: errorMessage(result.code, locale, user.config) });
      return;
    }
    setMessage({ ok: true, text: t('staff.cashierAdded', { name: result.employee.displayName }) });
    setName('');
    setPin('');
    setAddKey(newIdempotencyKey());
    employees.reload();
  }

  async function update(employee: EmployeeRow, change: { displayName?: string; active?: boolean; pin?: string }) {
    setBusy(true);
    setMessage(null);
    const result = await api.updateEmployee({ employeeId: employee.id, ...change });
    setBusy(false);
    if (!result.ok) {
      setMessage({ ok: false, text: errorMessage(result.code, locale, user.config) });
      return;
    }
    setEditing(null);
    setMessage({
      ok: true,
      text: t(change.pin ? 'staff.pinChanged' : change.active === false ? 'staff.cashierOff' : 'staff.saved', {
        name: result.employee.displayName,
      }),
    });
    employees.reload();
  }

  return (
    <section className={styles.section} aria-labelledby="cashiers">
      <h2 id="cashiers" className={styles.sectionTitle}>
        {t('staff.cashiers')}
      </h2>
      <p className={styles.hint}>{t('staff.cashiersHint', { minDigits, maxDigits })}</p>
      {employees.status === 'loading' ? (
        <p role="status">{t('state.loading')}</p>
      ) : employees.status === 'error' ? (
        <p className="notice" role="alert">
          {t('state.errorBody')}
        </p>
      ) : employees.data.length === 0 ? (
        <p>{t('staff.noCashiers')}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">{t('staff.colName')}</th>
                <th scope="col">{t('staff.colStatus')}</th>
                <th scope="col">{t('staff.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {employees.data.map((e) => (
                <tr key={e.id}>
                  <th scope="row" className={e.active ? undefined : styles.muted}>
                    {e.displayName}
                  </th>
                  <td>
                    <span className={styles.tag}>{t(e.active ? 'staff.active' : 'staff.inactive')}</span>
                  </td>
                  <td>
                    {editing?.id === e.id ? (
                      <form
                        className={styles.actions}
                        onSubmit={(ev) => {
                          ev.preventDefault();
                          void update(e, editing.field === 'pin' ? { pin: editing.value } : { displayName: editing.value });
                        }}
                      >
                        <input
                          className={`${styles.input} ${styles.inputShort}`}
                          aria-label={t(editing.field === 'pin' ? 'staff.newPin' : 'staff.colName')}
                          inputMode={editing.field === 'pin' ? 'numeric' : undefined}
                          type={editing.field === 'pin' ? 'password' : 'text'}
                          autoComplete="off"
                          maxLength={editing.field === 'pin' ? maxDigits : 40}
                          value={editing.value}
                          onChange={(ev) =>
                            setEditing({
                              ...editing,
                              value: editing.field === 'pin' ? ev.target.value.replace(/\D/g, '') : ev.target.value,
                            })
                          }
                          autoFocus
                        />
                        <button type="submit" className={styles.small} disabled={busy || !editing.value.trim()}>
                          {t('staff.save')}
                        </button>
                        <button type="button" className={styles.small} onClick={() => setEditing(null)}>
                          {t('staff.cancel')}
                        </button>
                      </form>
                    ) : (
                      <div className={styles.actions}>
                        <button type="button" className={styles.small} disabled={busy} onClick={() => setEditing({ id: e.id, field: 'pin', value: '' })}>
                          {t('staff.newPin')}
                        </button>
                        <button
                          type="button"
                          className={styles.small}
                          disabled={busy}
                          onClick={() => setEditing({ id: e.id, field: 'name', value: e.displayName })}
                        >
                          {t('staff.rename')}
                        </button>
                        <button type="button" className={styles.small} disabled={busy} onClick={() => void update(e, { active: !e.active })}>
                          {t(e.active ? 'staff.switchOff' : 'staff.switchOn')}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form className={styles.form} onSubmit={(e) => void add(e)}>
        <label className={styles.field}>
          {t('staff.colName')}
          <input className={styles.input} maxLength={40} required value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className={styles.field}>
          {t('staff.pin')}
          <input
            className={`${styles.input} ${styles.inputShort}`}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={maxDigits}
            required
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          />
        </label>
        <button type="submit" className="button" disabled={busy || !name.trim() || pin.length < minDigits}>
          {t('staff.addCashier')}
        </button>
      </form>
      {message ? (
        <p className={message.ok ? styles.success : styles.error} role={message.ok ? 'status' : 'alert'}>
          {message.text}
        </p>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Till devices and managers of a store (HQ)
// ---------------------------------------------------------------------------

function useStaffList(client: SupabaseClient, brandId: string, key: string) {
  return useLoad(() => loadStaff(client, brandId), `staff:${brandId}:${key}`);
}

function StaffTable({
  rows,
  busy,
  onRemove,
}: {
  rows: StaffRow[];
  busy: boolean;
  onRemove(row: StaffRow): void;
}) {
  const { t, locale } = useI18n();
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">{t('staff.colEmail')}</th>
            <th scope="col">{t('staff.colRole')}</th>
            <th scope="col">{t('staff.colSince')}</th>
            <th scope="col">{t('staff.colActions')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <th scope="row">{r.email ?? <span className={styles.muted}>{r.userId.slice(0, 8)}</span>}</th>
              <td>
                <span className={styles.tag}>{t(`staff.role.${r.role}` as MessageKey)}</span>
              </td>
              <td className="nowrap">{new Date(r.createdAt).toLocaleDateString(locale === 'el' ? 'el-GR' : 'en-GB')}</td>
              <td>
                <button type="button" className={styles.small} disabled={busy} onClick={() => onRemove(r)}>
                  {t('staff.remove')}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StoreAccounts({ store, user, client, api }: Props & { store: OfficeStore }) {
  const { t, locale } = useI18n();
  const staff = useStaffList(client, user.brandId, store.id);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'store_device' | 'store_manager'>('store_device');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function add(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage(null);
    const result = await api.addStaff({ role, storeId: store.id, email });
    setBusy(false);
    if (!result.ok) {
      setMessage({ ok: false, text: errorMessage(result.code, locale, user.config) });
      return;
    }
    setMessage({ ok: true, text: t(result.created ? 'staff.accountAdded' : 'staff.accountExists', { email: result.staff.email ?? email }) });
    setEmail('');
    staff.reload();
  }

  async function remove(row: StaffRow) {
    setBusy(true);
    setMessage(null);
    const result = await api.removeStaff(row.id);
    setBusy(false);
    if (!result.ok) {
      setMessage({ ok: false, text: errorMessage(result.code, locale, user.config) });
      return;
    }
    setMessage({ ok: true, text: t('staff.accountRemoved', { email: row.email ?? '' }) });
    staff.reload();
  }

  const rows = staff.status === 'ready' ? staff.data.filter((r) => r.storeId === store.id) : [];
  return (
    <section className={styles.section} aria-labelledby="accounts">
      <h2 id="accounts" className={styles.sectionTitle}>
        {t('staff.accounts')}
      </h2>
      <p className={styles.hint}>{t('staff.accountsHint')}</p>
      {staff.status === 'loading' ? (
        <p role="status">{t('state.loading')}</p>
      ) : staff.status === 'error' ? (
        <p className="notice" role="alert">
          {t('state.errorBody')}
        </p>
      ) : rows.length === 0 ? (
        <p>{t('staff.noAccounts')}</p>
      ) : (
        <StaffTable rows={rows} busy={busy} onRemove={(r) => void remove(r)} />
      )}
      <form className={styles.form} onSubmit={(e) => void add(e)}>
        <label className={styles.field}>
          {t('staff.colEmail')}
          <input className={styles.input} type="email" autoComplete="off" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className={styles.field}>
          {t('staff.colRole')}
          <select className={styles.select} value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
            <option value="store_device">{t('staff.role.store_device')}</option>
            <option value="store_manager">{t('staff.role.store_manager')}</option>
          </select>
        </label>
        <button type="submit" className="button" disabled={busy || !email.includes('@')}>
          {t('staff.addAccount')}
        </button>
      </form>
      {message ? (
        <p className={message.ok ? styles.success : styles.error} role={message.ok ? 'status' : 'alert'}>
          {message.text}
        </p>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// HQ admins
// ---------------------------------------------------------------------------

function HqAdmins({ user, client, api }: Props) {
  const { t, locale } = useI18n();
  const staff = useStaffList(client, user.brandId, 'hq');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function add(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage(null);
    const result = await api.addStaff({ role: 'hq_admin', brandId: user.brandId, email });
    setBusy(false);
    if (!result.ok) {
      setMessage({ ok: false, text: errorMessage(result.code, locale, user.config) });
      return;
    }
    setMessage({ ok: true, text: t(result.created ? 'staff.accountAdded' : 'staff.accountExists', { email: result.staff.email ?? email }) });
    setEmail('');
    staff.reload();
  }

  async function remove(row: StaffRow) {
    setBusy(true);
    setMessage(null);
    const result = await api.removeStaff(row.id);
    setBusy(false);
    if (!result.ok) {
      setMessage({ ok: false, text: errorMessage(result.code, locale, user.config) });
      return;
    }
    setMessage({ ok: true, text: t('staff.accountRemoved', { email: row.email ?? '' }) });
    staff.reload();
  }

  const rows = staff.status === 'ready' ? staff.data.filter((r) => r.role === 'hq_admin') : [];
  return (
    <section className={styles.section} aria-labelledby="hq">
      <h2 id="hq" className={styles.sectionTitle}>
        {t('staff.hqAdmins')}
      </h2>
      <p className={styles.hint}>{t('staff.hqHint')}</p>
      {staff.status === 'ready' && rows.length ? <StaffTable rows={rows} busy={busy} onRemove={(r) => void remove(r)} /> : null}
      <form className={styles.form} onSubmit={(e) => void add(e)}>
        <label className={styles.field}>
          {t('staff.colEmail')}
          <input className={styles.input} type="email" autoComplete="off" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <button type="submit" className="button" disabled={busy || !email.includes('@')}>
          {t('staff.addHq')}
        </button>
      </form>
      {message ? (
        <p className={message.ok ? styles.success : styles.error} role={message.ok ? 'status' : 'alert'}>
          {message.text}
        </p>
      ) : null}
    </section>
  );
}
