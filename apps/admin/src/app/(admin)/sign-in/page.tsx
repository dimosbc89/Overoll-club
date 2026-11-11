'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { useOffice } from '../../../components/office/OfficeProvider';
import styles from '../../../components/office/office.module.css';
import { useDocumentTitle, useI18n } from '../../../i18n/client';
import type { MessageKey } from '../../../i18n/messages';
import { sendSignInCode, verifySignInCode } from '../../../lib/office';

const authErrors: Record<string, MessageKey> = {
  otp_send_failed: 'signIn.error.send',
  otp_bad_code: 'signIn.error.code',
  network_error: 'signIn.error.network',
};

/** HQ admins and store managers: email, then the one-time code sent there. */
export default function SignInPage() {
  const { t } = useI18n();
  useDocumentTitle(t('signIn.title'));
  const router = useRouter();
  const { client, session, refresh, signOut } = useOffice();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);

  if (session.status === 'ready' && !session.user.deviceOnly) {
    return (
      <>
        <h1>{t('signIn.title')}</h1>
        <p className="intro">{t('signIn.signedInAs', { email: session.user.email ?? '' })}</p>
        <div className={styles.actions}>
          <button type="button" className="button" onClick={() => router.push('/')}>
            {t('nav.dashboard')}
          </button>
          <button type="button" className={styles.small} onClick={() => void signOut()}>
            {t('nav.signOut')}
          </button>
        </div>
      </>
    );
  }

  async function submitEmail(event: FormEvent) {
    event.preventDefault();
    if (!client || busy) return;
    setBusy(true);
    setError(null);
    const result = await sendSignInCode(client, email);
    setBusy(false);
    if (result.ok) setStep('code');
    else setError(authErrors[result.code] ?? 'signIn.error.send');
  }

  async function submitCode(event: FormEvent) {
    event.preventDefault();
    if (!client || busy) return;
    setBusy(true);
    setError(null);
    const result = await verifySignInCode(client, email, code);
    if (!result.ok) {
      setBusy(false);
      setError(authErrors[result.code] ?? 'signIn.error.code');
      return;
    }
    await refresh();
    setBusy(false);
    router.push('/');
  }

  return (
    <>
      <div>
        <h1>{t('signIn.title')}</h1>
        <p className="intro">{t(step === 'email' ? 'signIn.body' : 'signIn.codeBody', { email })}</p>
      </div>
      {!client ? (
        <p className="notice" role="status">
          {t('state.notConfiguredBody')}
        </p>
      ) : step === 'email' ? (
        <form className={styles.form} onSubmit={(e) => void submitEmail(e)}>
          <label className={styles.field}>
            {t('signIn.email')}
            <input
              className={styles.input}
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <button type="submit" className="button" disabled={busy || !email.includes('@')}>
            {t(busy ? 'state.sending' : 'signIn.sendCode')}
          </button>
        </form>
      ) : (
        <form className={styles.form} onSubmit={(e) => void submitCode(e)}>
          <label className={styles.field}>
            {t('signIn.code')}
            <input
              className={`${styles.input} ${styles.inputShort}`}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={10}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
          </label>
          <button type="submit" className="button" disabled={busy || code.length < 6}>
            {t(busy ? 'state.sending' : 'signIn.verify')}
          </button>
          <button
            type="button"
            className={styles.small}
            onClick={() => {
              setStep('email');
              setCode('');
              setError(null);
            }}
          >
            {t('signIn.otherEmail')}
          </button>
        </form>
      )}
      {error ? (
        <p className={styles.error} role="alert">
          {t(error)}
        </p>
      ) : null}
    </>
  );
}
