'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useI18n } from '../../i18n/client';
import {
  createOfficeApi,
  loadOfficeSession,
  officeSupabase,
  type OfficeApi,
  type OfficeSession,
  type OfficeUser,
} from '../../lib/office';

type SessionState = OfficeSession | { status: 'loading' };

interface OfficeContextValue {
  session: SessionState;
  client: SupabaseClient | null;
  api: OfficeApi | null;
  refresh(): Promise<void>;
  signOut(): Promise<void>;
}

const OfficeContext = createContext<OfficeContextValue | null>(null);

/** The signed-in HQ admin or store manager, for every back-office page and the header. */
export function OfficeProvider({ children }: { children: ReactNode }) {
  const [client] = useState<SupabaseClient | null>(() => (typeof window === 'undefined' ? null : officeSupabase()));
  const [session, setSession] = useState<SessionState>({ status: 'loading' });
  const api = useMemo(() => (client ? createOfficeApi(client) : null), [client]);

  const refresh = useCallback(async () => {
    if (!client) {
      setSession({ status: 'not_configured' });
      return;
    }
    try {
      setSession(await loadOfficeSession(client));
    } catch {
      setSession({ status: 'error' });
    }
  }, [client]);

  useEffect(() => {
    void refresh();
    if (!client) return;
    const { data } = client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') void refresh();
    });
    return () => data.subscription.unsubscribe();
  }, [client, refresh]);

  const signOut = useCallback(async () => {
    await client?.auth.signOut();
    await refresh();
  }, [client, refresh]);

  const value = useMemo(() => ({ session, client, api, refresh, signOut }), [session, client, api, refresh, signOut]);
  return <OfficeContext.Provider value={value}>{children}</OfficeContext.Provider>;
}

export function useOffice(): OfficeContextValue {
  const value = useContext(OfficeContext);
  if (!value) throw new Error('useOffice outside OfficeProvider');
  return value;
}

/**
 * Shows the page only to a signed-in HQ admin (`need="hq"`) or to HQ and store
 * managers (`need="staff"`); everyone else gets the reason and the next step.
 */
export function OfficeGate({
  need,
  children,
}: {
  need: 'hq' | 'staff';
  children: (ctx: { user: OfficeUser; client: SupabaseClient; api: OfficeApi }) => ReactNode;
}) {
  const { t } = useI18n();
  const { session, client, api, signOut } = useOffice();

  if (session.status === 'loading') return <p role="status">{t('state.loading')}</p>;
  if (session.status === 'not_configured' || !client || !api) {
    return (
      <p className="notice" role="status">
        {t('state.notConfiguredBody')}
      </p>
    );
  }
  if (session.status === 'error') {
    return (
      <p className="notice" role="alert">
        {t('state.errorBody')}
      </p>
    );
  }
  if (session.status === 'signed-out') {
    return (
      <div className="notice">
        <span className="notice-title">{t('office.signedOut.title')}</span>
        <span>{t('office.signedOut.body')}</span>
        <Link href="/sign-in" className="button">
          {t('nav.signIn')}
        </Link>
      </div>
    );
  }
  if (session.status === 'no-access') {
    return (
      <div className="notice" role="alert">
        <span className="notice-title">{t('office.noAccess.title')}</span>
        <span>{t('office.noAccess.body', { email: session.email ?? '' })}</span>
        <button type="button" className="button" onClick={() => void signOut()}>
          {t('nav.signOut')}
        </button>
      </div>
    );
  }
  const { user } = session;
  if (user.deviceOnly) {
    return (
      <div className="notice" role="alert">
        <span className="notice-title">{t('office.device.title')}</span>
        <span>{t('office.device.body')}</span>
        <Link href="/console" className="button">
          {t('nav.console')}
        </Link>
      </div>
    );
  }
  if (need === 'hq' && !user.hq) {
    return (
      <p className="notice" role="alert">
        {t('office.hqOnly')}
      </p>
    );
  }
  return <>{children({ user, client, api })}</>;
}
