'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { useState, type FormEvent } from 'react';

import { OfficeGate } from '../../../components/office/OfficeProvider';
import styles from '../../../components/office/office.module.css';
import { useLoad } from '../../../components/office/useLoad';
import { useDocumentTitle, useI18n } from '../../../i18n/client';
import type { MessageKey } from '../../../i18n/messages';
import { errorMessage, newIdempotencyKey } from '../../../lib/api';
import { formatEuroFromCents, formatPoints } from '../../../lib/format';
import {
  loadMemberDetail,
  loadOfficeStores,
  parseMemberQuery,
  searchMembers,
  type MemberRow,
  type OfficeApi,
  type OfficeUser,
} from '../../../lib/office';
import { inLocale } from '../../../lib/store-names';

/** HQ: find a member by code, email, phone or name; see their history; correct points. */
export default function MembersPage() {
  const { t } = useI18n();
  useDocumentTitle(t('members.title'));
  return (
    <>
      <div>
        <h1>{t('members.title')}</h1>
        <p className="intro">{t('members.intro')}</p>
      </div>
      <OfficeGate need="hq">{(ctx) => <Members {...ctx} />}</OfficeGate>
    </>
  );
}

type Props = { user: OfficeUser; client: SupabaseClient; api: OfficeApi };

function useDateFormat() {
  const { locale } = useI18n();
  const tag = locale === 'el' ? 'el-GR' : 'en-GB';
  return {
    date: (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(tag, { timeZone: 'Europe/Athens' }) : '—'),
    dateTime: (iso: string) =>
      new Date(iso).toLocaleString(tag, { timeZone: 'Europe/Athens', dateStyle: 'short', timeStyle: 'short' }),
  };
}

function Members(props: Props) {
  const { t, locale } = useI18n();
  const { user, client } = props;
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const parsed = parseMemberQuery(query);
  const results = useLoad(() => searchMembers(client, user.brandId, parsed), `search:${query}`);
  const { date } = useDateFormat();

  function submit(event: FormEvent) {
    event.preventDefault();
    setQuery(text);
    setSelected(null);
  }

  if (selected) return <MemberDetailView {...props} memberId={selected} onBack={() => setSelected(null)} />;

  return (
    <>
      <form className={styles.toolbar} role="search" onSubmit={submit}>
        <label className={styles.field}>
          {t('members.search')}
          <input className={styles.input} type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('members.searchHint')} />
        </label>
        <button type="submit" className="button" disabled={text.trim().length < 2}>
          {t('members.find')}
        </button>
      </form>
      {!parsed ? null : results.status === 'loading' ? (
        <p role="status">{t('state.loading')}</p>
      ) : results.status === 'error' ? (
        <p className="notice" role="alert">
          {t('state.errorBody')}
        </p>
      ) : results.data.length === 0 ? (
        <p role="status">{t('members.none')}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">{t('members.colName')}</th>
                <th scope="col">{t('members.colCode')}</th>
                <th scope="col">{t('members.colContact')}</th>
                <th scope="col">{t('members.colTier')}</th>
                <th scope="col" className="num">
                  {t('members.colBalance')}
                </th>
                <th scope="col">{t('members.colJoined')}</th>
              </tr>
            </thead>
            <tbody>
              {results.data.map((m) => (
                <tr key={m.id}>
                  <th scope="row">
                    <button type="button" className={styles.linkButton} onClick={() => setSelected(m.id)}>
                      {fullName(m)}
                    </button>
                  </th>
                  <td>
                    <code>{m.memberCode}</code>
                  </td>
                  <td>{m.email ?? m.phone ?? '—'}</td>
                  <td>{t(`tier.${m.tier}` as MessageKey)}</td>
                  <td className="num">{formatPoints(m.balance, locale)}</td>
                  <td className="nowrap">{date(m.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

const fullName = (m: MemberRow) => [m.firstName, m.lastName].filter(Boolean).join(' ') || '—';

const kindKeys: Record<string, MessageKey> = {
  earn: 'members.kind.earn',
  bonus: 'members.kind.bonus',
  redeem: 'members.kind.redeem',
  refund_redeem: 'members.kind.refund_redeem',
  reverse: 'members.kind.reverse',
  adjust: 'members.kind.adjust',
  expire: 'members.kind.expire',
};

function MemberDetailView({ user, client, api, memberId, onBack }: Props & { memberId: string; onBack(): void }) {
  const { t, locale } = useI18n();
  const detail = useLoad(() => loadMemberDetail(client, memberId), `member:${memberId}`);
  const stores = useLoad(() => loadOfficeStores(client, user.brandId), `stores:${user.brandId}`);
  const { date, dateTime } = useDateFormat();
  const [direction, setDirection] = useState<'add' | 'remove'>('add');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [key, setKey] = useState(newIdempotencyKey);

  const storeName = (id: string | null) => {
    if (!id || stores.status !== 'ready') return '—';
    const s = stores.data.find((x) => x.id === id);
    return s ? inLocale(s.name, s.nameEn, locale) : '—';
  };

  async function adjust(event: FormEvent) {
    event.preventDefault();
    const points = Number(amount) * (direction === 'add' ? 1 : -1);
    if (busy || !Number.isInteger(points) || points === 0) return;
    setBusy(true);
    setMessage(null);
    const result = await api.adjustPoints({ memberId, points, reason, idempotencyKey: key });
    setBusy(false);
    if (!result.ok) {
      setMessage({ ok: false, text: errorMessage(result.code, locale, user.config) });
      return;
    }
    setMessage({ ok: true, text: t('members.adjusted', { points: formatPoints(result.points, locale), balance: formatPoints(result.balance, locale) }) });
    setAmount('');
    setReason('');
    setKey(newIdempotencyKey());
    detail.reload();
  }

  if (detail.status === 'loading') return <p role="status">{t('state.loading')}</p>;
  if (detail.status === 'error' || !detail.data) {
    return (
      <p className="notice" role="alert">
        {t('state.errorBody')}
      </p>
    );
  }
  const { member, ledger } = detail.data;
  const amountOk = /^[1-9][0-9]{0,5}$/.test(amount);

  return (
    <>
      <div className={styles.actions}>
        <button type="button" className={styles.small} onClick={onBack}>
          {t('members.back')}
        </button>
      </div>
      <section className={styles.section} aria-labelledby="member">
        <h2 id="member" className={styles.sectionTitle}>
          {fullName(member)}
        </h2>
        <dl className={styles.detail}>
          <div>
            <dt>{t('members.colBalance')}</dt>
            <dd>
              <strong>{formatPoints(member.balance, locale)}</strong>
            </dd>
          </div>
          <div>
            <dt>{t('members.colTier')}</dt>
            <dd>{t(`tier.${member.tier}` as MessageKey)}</dd>
          </div>
          <div>
            <dt>{t('members.colCode')}</dt>
            <dd>
              <code>{member.memberCode}</code>
            </dd>
          </div>
          <div>
            <dt>{t('members.colContact')}</dt>
            <dd>{[member.email, member.phone].filter(Boolean).join(' · ') || '—'}</dd>
          </div>
          <div>
            <dt>{t('members.colJoined')}</dt>
            <dd>
              {date(member.createdAt)} · {storeName(member.joinedStoreId)}
            </dd>
          </div>
          <div>
            <dt>{t('members.lastPurchase')}</dt>
            <dd>{date(member.lastPurchaseAt)}</dd>
          </div>
        </dl>
      </section>

      <section className={styles.section} aria-labelledby="adjust">
        <h2 id="adjust" className={styles.sectionTitle}>
          {t('members.adjust')}
        </h2>
        <p className={styles.hint}>{t('members.adjustHint')}</p>
        <form className={styles.form} onSubmit={(e) => void adjust(e)}>
          <label className={styles.field}>
            {t('members.direction')}
            <select className={styles.select} value={direction} onChange={(e) => setDirection(e.target.value as typeof direction)}>
              <option value="add">{t('members.add')}</option>
              <option value="remove">{t('members.takeBack')}</option>
            </select>
          </label>
          <label className={styles.field}>
            {t('members.points')}
            <input
              className={`${styles.input} ${styles.inputShort}`}
              inputMode="numeric"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
            />
          </label>
          <label className={styles.field}>
            {t('members.reason')}
            <input className={styles.input} maxLength={200} required value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <button type="submit" className="button" disabled={busy || !amountOk || !reason.trim()}>
            {t('members.save')}
          </button>
        </form>
        {message ? (
          <p className={message.ok ? styles.success : styles.error} role={message.ok ? 'status' : 'alert'}>
            {message.text}
          </p>
        ) : null}
      </section>

      <section className={styles.section} aria-labelledby="history">
        <h2 id="history" className={styles.sectionTitle}>
          {t('members.history')}
        </h2>
        {ledger.length === 0 ? (
          <p>{t('members.noHistory')}</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">{t('members.colWhen')}</th>
                  <th scope="col">{t('members.colWhat')}</th>
                  <th scope="col">{t('members.colStore')}</th>
                  <th scope="col" className="num">
                    {t('members.points')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((l) => (
                  <tr key={l.id}>
                    <td className="nowrap">{dateTime(l.createdAt)}</td>
                    <td>
                      {t(kindKeys[l.kind] ?? 'members.kind.adjust')}
                      {l.amountCents !== null ? ` · ${formatEuroFromCents(l.amountCents, locale)}` : ''}
                      {l.kind === 'adjust' && l.reason ? <span className={styles.muted}> · {l.reason}</span> : null}
                    </td>
                    <td>{storeName(l.storeId)}</td>
                    <td className="num">
                      {l.points > 0 ? '+' : ''}
                      {formatPoints(l.points, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
