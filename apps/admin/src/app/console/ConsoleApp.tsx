'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import { createTranslate, type Locale, type MessageKey } from '../../i18n/messages';
import { type ApiClient, apiBaseUrl, createApiClient, errorMessage, newIdempotencyKey } from '../../lib/api';
import { consoleSupabase, type DeviceAuth, loadEmployees, supabaseDeviceAuth } from '../../lib/console/device';
import { type IdleLock, startIdleLock } from '../../lib/console/idle-lock';
import { consoleReducer, type ConsoleAction, initialState, pendingRequest } from '../../lib/console/machine';
import { runRequest } from '../../lib/console/runner';
import { supabaseEnv } from '../../lib/env';
import styles from './console.module.css';
import { ConsoleHeader } from './ConsoleHeader';
import { DeviceErrorScreen, NoStoreScreen, NotConfiguredScreen, SignInScreen, StartingScreen } from './DeviceScreens';
import {
  AmountScreen,
  AwardErrorScreen,
  DoneScreen,
  PickCashierScreen,
  RedeemedScreen,
  RedeemScreen,
  ScanScreen,
} from './TillScreens';
import { TodayPanel } from './TodayPanel';
import type { ScreenContext } from './ui';

interface Services {
  client: SupabaseClient;
  api: ApiClient;
  auth: DeviceAuth;
}

/** Sign-in errors that are not API codes. */
const authMessages: Record<string, MessageKey> = {
  otp_send_failed: 'console.device.sendFailed',
  otp_bad_code: 'console.device.badCode',
};

/** Current time, ticking every second while `active` (undo countdown). */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

/**
 * The staff console: a client-side app for the till tablet. State lives in
 * `consoleReducer` (lib/console/machine.ts); this component runs the server
 * calls the state asks for, the idle lock and the screens.
 */
export function ConsoleApp({ locale }: { locale: Locale }) {
  const [state, dispatch] = useReducer(consoleReducer, undefined, () =>
    initialState({ configured: supabaseEnv() !== null, requestId: 'boot' }),
  );

  const services = useRef<Services | null>(null);
  const getServices = useCallback((): Services | null => {
    if (services.current) return services.current;
    const env = supabaseEnv();
    const client = consoleSupabase();
    if (!env || !client) return null;
    services.current = {
      client,
      auth: supabaseDeviceAuth(client),
      api: createApiClient({
        baseUrl: apiBaseUrl(env.url),
        apiKey: env.publishableKey,
        getAccessToken: async () => (await client.auth.getSession()).data.session?.access_token ?? null,
      }),
    };
    return services.current;
  }, []);

  const idle = useRef<IdleLock | null>(null);

  // Run the request the state is waiting for, once per request id.
  const pending = useMemo(() => pendingRequest(state), [state]);
  const started = useRef(new Set<string>());
  useEffect(() => {
    if (!pending || started.current.has(pending.id)) return;
    const svc = getServices();
    if (!svc) return;
    started.current.add(pending.id);
    idle.current?.touch();
    void runRequest(pending, { api: svc.api, auth: svc.auth, newId: newIdempotencyKey }).then((action) => {
      idle.current?.touch();
      dispatch(action);
    });
  }, [pending, getServices]);

  // Signed out elsewhere (refresh token revoked, sign-out in another tab).
  useEffect(() => {
    const svc = getServices();
    if (!svc) return;
    const { data } = svc.client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') dispatch({ type: 'device/signedOut' });
    });
    return () => data.subscription.unsubscribe();
  }, [getServices]);

  // Idle lock: the PIN is forgotten after limits.staffPinIdleMinutes without a tap or key.
  const hasCashier = state.cashier !== null;
  useEffect(() => {
    if (!hasCashier) return;
    const lock = startIdleLock({ config: state.config, onLock: () => dispatch({ type: 'idle/lock' }) });
    idle.current = lock;
    const touch = () => lock.touch();
    window.addEventListener('pointerdown', touch, { passive: true });
    window.addEventListener('keydown', touch);
    return () => {
      lock.stop();
      idle.current = null;
      window.removeEventListener('pointerdown', touch);
      window.removeEventListener('keydown', touch);
    };
  }, [hasCashier, state.config]);

  // Staff lists change during the day: refresh them whenever the till asks who's on.
  const screen = state.screen;
  const refreshStaff = screen.name === 'pick-cashier' && screen.reason !== 'start';
  const storeId = state.store?.id ?? null;
  useEffect(() => {
    const svc = getServices();
    if (!refreshStaff || !storeId || !svc) return;
    loadEmployees(svc.client, storeId)
      .then((employees) => dispatch({ type: 'employees/loaded', employees }))
      .catch(() => undefined);
  }, [refreshStaff, storeId, getServices]);

  const now = useNow(screen.name === 'done');

  const ctx: ScreenContext = useMemo(() => {
    const t = createTranslate(locale);
    return {
      t,
      locale,
      config: state.config,
      dispatch: (action: ConsoleAction) => dispatch(action),
      newId: newIdempotencyKey,
      message: (code: string) => {
        const key = authMessages[code];
        return key ? t(key) : errorMessage(code, locale, state.config);
      },
    };
  }, [locale, state.config]);

  const signOut = async () => {
    const svc = getServices();
    await svc?.client.auth.signOut().catch(() => undefined);
    dispatch({ type: 'device/signedOut' });
  };

  const body = (() => {
    if (state.todayOpen && state.store) {
      return <TodayPanel ctx={ctx} client={services.current?.client ?? null} store={state.store} employees={state.employees} />;
    }
    switch (screen.name) {
      case 'starting':
        return <StartingScreen ctx={ctx} />;
      case 'not-configured':
        return <NotConfiguredScreen ctx={ctx} />;
      case 'signed-out':
        return <SignInScreen ctx={ctx} screen={screen} />;
      case 'no-store':
        return <NoStoreScreen ctx={ctx} onSignOut={signOut} />;
      case 'device-error':
        return <DeviceErrorScreen ctx={ctx} error={screen.error} onSignOut={signOut} />;
      case 'pick-cashier':
        return <PickCashierScreen ctx={ctx} screen={screen} employees={state.employees} onSignOut={signOut} />;
      case 'idle':
        return <ScanScreen ctx={ctx} screen={screen} />;
      case 'member':
      case 'amount':
      case 'awarding':
        return <AmountScreen ctx={ctx} screen={screen} />;
      case 'done':
        return <DoneScreen ctx={ctx} state={state} now={now} />;
      case 'error':
        return <AwardErrorScreen ctx={ctx} screen={screen} />;
      case 'redeem':
        return <RedeemScreen ctx={ctx} screen={screen} />;
      case 'redeemed':
        return <RedeemedScreen ctx={ctx} screen={screen} />;
    }
  })();

  return (
    <>
      <ConsoleHeader
        ctx={ctx}
        store={state.store}
        cashier={state.cashier}
        todayOpen={state.todayOpen}
        busy={pending !== null}
      />
      <main id="main" className={styles.main}>
        {body}
      </main>
    </>
  );
}
