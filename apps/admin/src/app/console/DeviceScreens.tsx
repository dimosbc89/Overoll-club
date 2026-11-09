'use client';

import type { FormEvent, ReactNode } from 'react';

import type { Screen } from '../../lib/console/machine';
import styles from './console.module.css';
import { Alert, Button, type ScreenContext } from './ui';

type SignedOut = Extract<Screen, { name: 'signed-out' }>;

function CenterCard({ children }: { children: ReactNode }) {
  return (
    <div className={styles.center}>
      <section className={`${styles.card} ${styles.narrow}`}>{children}</section>
    </div>
  );
}

export function StartingScreen({ ctx }: { ctx: ScreenContext }) {
  return (
    <CenterCard>
      <p className={styles.eyebrow} role="status">
        {ctx.t('console.loading')}
      </p>
    </CenterCard>
  );
}

export function NotConfiguredScreen({ ctx }: { ctx: ScreenContext }) {
  return (
    <CenterCard>
      <h1 className={styles.title}>{ctx.t('state.notConfiguredTitle')}</h1>
      <p className={styles.body}>{ctx.t('state.notConfiguredBody')}</p>
    </CenterCard>
  );
}

/** The store manager signs the till in once: device email → one-time code. */
export function SignInScreen({ ctx, screen }: { ctx: ScreenContext; screen: SignedOut }) {
  const { t, dispatch, newId } = ctx;
  const busy = screen.requestId !== null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    dispatch(screen.step === 'email' ? { type: 'otp/send', requestId: newId() } : { type: 'otp/verify', requestId: newId() });
  };

  return (
    <CenterCard>
      <h1 className={styles.title}>{t('console.device.title')}</h1>
      <p className={styles.body}>{t('console.device.body')}</p>
      <form onSubmit={submit} className={styles.column}>
        {screen.step === 'email' ? (
          <div className={styles.field}>
            <label htmlFor="device-email" className={styles.label}>
              {t('console.device.email')}
            </label>
            <input
              id="device-email"
              className={styles.input}
              type="email"
              autoComplete="username"
              inputMode="email"
              required
              value={screen.email}
              disabled={busy}
              onChange={(e) => dispatch({ type: 'otp/email', value: e.target.value })}
            />
          </div>
        ) : (
          <div className={styles.field}>
            <p className={styles.note} role="status">
              {t('console.device.codeSent', { email: screen.email.trim() })}
            </p>
            <label htmlFor="device-code" className={styles.label}>
              {t('console.device.code')}
            </label>
            <input
              id="device-code"
              className={`${styles.input} ${styles.codeInput}`}
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={screen.code}
              disabled={busy}
              onChange={(e) => dispatch({ type: 'otp/code', value: e.target.value })}
            />
          </div>
        )}
        {screen.error ? <Alert>{ctx.message(screen.error)}</Alert> : null}
        <Button type="submit" variant="filled" size="huge" disabled={busy}>
          {busy ? t('console.loading') : t(screen.step === 'email' ? 'console.device.send' : 'console.device.verify')}
        </Button>
        {screen.step === 'code' ? (
          <button type="button" className={styles.link} disabled={busy} onClick={() => dispatch({ type: 'otp/back' })}>
            {t('console.device.otherEmail')}
          </button>
        ) : null}
      </form>
    </CenterCard>
  );
}

export function NoStoreScreen({ ctx, onSignOut }: { ctx: ScreenContext; onSignOut: () => void }) {
  return (
    <CenterCard>
      <h1 className={styles.title}>{ctx.t('console.device.title')}</h1>
      <Alert>{ctx.t('console.device.noStore')}</Alert>
      <Button size="tall" onClick={onSignOut}>
        {ctx.t('console.device.signOut')}
      </Button>
    </CenterCard>
  );
}

export function DeviceErrorScreen({
  ctx,
  error,
  onSignOut,
}: {
  ctx: ScreenContext;
  error: string;
  onSignOut: () => void;
}) {
  return (
    <CenterCard>
      <h1 className={styles.title}>{ctx.t('state.errorTitle')}</h1>
      <Alert>{ctx.message(error)}</Alert>
      <div className={styles.pair}>
        <Button size="tall" onClick={onSignOut}>
          {ctx.t('console.device.signOut')}
        </Button>
        <Button
          variant="filled"
          size="tall"
          onClick={() => ctx.dispatch({ type: 'device/retry', requestId: ctx.newId() })}
        >
          {ctx.t('console.retry')}
        </Button>
      </div>
    </CenterCard>
  );
}
