'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { useState, type FormEvent } from 'react';

import { OfficeGate } from '../../../components/office/OfficeProvider';
import styles from '../../../components/office/office.module.css';
import { useLoad } from '../../../components/office/useLoad';
import { useDocumentTitle, useI18n } from '../../../i18n/client';
import { errorMessage, newIdempotencyKey } from '../../../lib/api';
import { PROGRAM_NAME } from '../../../lib/env';
import { loadSentMessages, type MessageInput, type OfficeApi, type OfficeUser } from '../../../lib/office';

/** The core limits (pushMessageLimits): lock screens cut longer lines. */
const MAX_TITLE = 65;
const MAX_BODY = 240;

/** HQ writes a notification (offer, news) to members who said yes to offers by notification (API v0.9). */
export default function MessagesPage() {
  const { t } = useI18n();
  useDocumentTitle(t('messages.title'));
  return (
    <>
      <div>
        <h1>{t('messages.title')}</h1>
        <p className="intro">{t('messages.intro')}</p>
      </div>
      <OfficeGate need="hq">{(ctx) => <Messages {...ctx} />}</OfficeGate>
    </>
  );
}

function Messages({ user, client, api }: { user: OfficeUser; client: SupabaseClient; api: OfficeApi }) {
  const { t, locale } = useI18n();
  const sent = useLoad(() => loadSentMessages(client, user.brandId), `messages:${user.brandId}`);
  const [titleEl, setTitleEl] = useState('');
  const [bodyEl, setBodyEl] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [bodyEn, setBodyEn] = useState('');
  const [busy, setBusy] = useState(false);
  /** The count from a dry run, waiting for "Send". */
  const [confirming, setConfirming] = useState<number | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [key, setKey] = useState(newIdempotencyKey);

  const english = titleEn.trim() !== '' || bodyEn.trim() !== '';
  const fits = (text: string, max: number) => text.trim() !== '' && text.trim().length <= max;
  const ready = fits(titleEl, MAX_TITLE) && fits(bodyEl, MAX_BODY) && (!english || (fits(titleEn, MAX_TITLE) && fits(bodyEn, MAX_BODY)));
  const input: MessageInput = {
    brandId: user.brandId,
    titleEl: titleEl.trim(),
    bodyEl: bodyEl.trim(),
    titleEn: english ? titleEn.trim() : null,
    bodyEn: english ? bodyEn.trim() : null,
  };

  function edit(set: (v: string) => void) {
    return (value: string) => {
      set(value);
      setConfirming(null);
      setMessage(null);
    };
  }

  async function count(event: FormEvent) {
    event.preventDefault();
    if (busy || !ready) return;
    setBusy(true);
    setMessage(null);
    const result = await api.sendMessage({ ...input, dryRun: true });
    setBusy(false);
    if (!result.ok) {
      setMessage({ ok: false, text: errorMessage(result.code, locale, user.config) });
      return;
    }
    setConfirming(result.recipients);
  }

  async function send() {
    if (busy || confirming === null || confirming === 0) return;
    setBusy(true);
    const result = await api.sendMessage({ ...input, idempotencyKey: key });
    setBusy(false);
    if (!result.ok) {
      setMessage({ ok: false, text: errorMessage(result.code, locale, user.config) });
      return;
    }
    setConfirming(null);
    setMessage({ ok: true, text: t('messages.sent', { count: result.recipients }) });
    setTitleEl('');
    setBodyEl('');
    setTitleEn('');
    setBodyEn('');
    setKey(newIdempotencyKey());
    sent.reload();
  }

  const field = (label: string, value: string, set: (v: string) => void, max: number, multiline: boolean, required: boolean) => (
    <label className={styles.field}>
      {label}
      {multiline ? (
        <textarea className={`${styles.input} ${styles.textarea}`} rows={3} required={required} value={value} onChange={(e) => edit(set)(e.target.value)} />
      ) : (
        <input className={styles.input} required={required} value={value} onChange={(e) => edit(set)(e.target.value)} />
      )}
      <span className={value.trim().length > max ? styles.error : styles.muted}>
        {t('messages.count', { count: value.trim().length, max })}
      </span>
    </label>
  );

  const dateTime = (iso: string) =>
    new Date(iso).toLocaleString(locale === 'el' ? 'el-GR' : 'en-GB', { timeZone: 'Europe/Athens', dateStyle: 'short', timeStyle: 'short' });

  return (
    <>
      <section className={styles.section} aria-labelledby="write">
        <form className={styles.editor} onSubmit={(e) => void count(e)}>
          <div className={styles.grid}>
            {field(t('messages.titleEl'), titleEl, setTitleEl, MAX_TITLE, false, true)}
            {field(t('messages.bodyEl'), bodyEl, setBodyEl, MAX_BODY, true, true)}
            {field(t('messages.titleEn'), titleEn, setTitleEn, MAX_TITLE, false, false)}
            {field(t('messages.bodyEn'), bodyEn, setBodyEn, MAX_BODY, true, false)}
          </div>
          <p className={styles.hint}>{t('messages.englishHint')}</p>

          {titleEl.trim() || bodyEl.trim() ? (
            <div className={styles.preview} aria-label={t('messages.preview')}>
              <p className={styles.muted}>
                {t('messages.preview')} · {PROGRAM_NAME}
              </p>
              <p>
                <strong>{titleEl.trim()}</strong>
              </p>
              <p>{bodyEl.trim()}</p>
            </div>
          ) : null}

          {confirming === null ? (
            <div className={styles.actions}>
              <button type="submit" className="button" disabled={busy || !ready}>
                {t('messages.next')}
              </button>
            </div>
          ) : confirming === 0 ? (
            <p className={styles.error} role="alert">
              {t('messages.nobody')}
            </p>
          ) : (
            <div role="group" aria-labelledby="confirm">
              <p id="confirm">{t('messages.confirm', { count: confirming })}</p>
              <div className={styles.actions}>
                <button type="button" className="button" disabled={busy} onClick={() => void send()}>
                  {t('messages.send', { count: confirming })}
                </button>
                <button type="button" className={styles.small} disabled={busy} onClick={() => setConfirming(null)}>
                  {t('messages.cancel')}
                </button>
              </div>
            </div>
          )}
        </form>
        {message ? (
          <p className={message.ok ? styles.success : styles.error} role={message.ok ? 'status' : 'alert'}>
            {message.text}
          </p>
        ) : null}
      </section>

      <section className={styles.section} aria-labelledby="history">
        <h2 id="history" className={styles.sectionTitle}>
          {t('messages.history')}
        </h2>
        {sent.status === 'loading' ? <p role="status">{t('state.loading')}</p> : null}
        {sent.status === 'error' ? (
          <p className="notice" role="alert">
            {t('state.errorBody')}
          </p>
        ) : null}
        {sent.status === 'ready' && sent.data.length === 0 ? <p>{t('messages.none')}</p> : null}
        {sent.status === 'ready' && sent.data.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">{t('messages.colDate')}</th>
                  <th scope="col">{t('messages.colMessage')}</th>
                  <th scope="col">{t('messages.colRecipients')}</th>
                </tr>
              </thead>
              <tbody>
                {sent.data.map((m) => (
                  <tr key={m.id}>
                    <td>{dateTime(m.createdAt)}</td>
                    <td>
                      <strong>{m.titleEl}</strong>
                      <br />
                      <span className={styles.muted}>{m.bodyEl}</span>
                    </td>
                    <td>{m.recipients}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </>
  );
}
