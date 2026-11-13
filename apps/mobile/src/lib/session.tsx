import { defaultConfig, type ProgramConfig } from '@grow-loyalty/core';
import type { Session } from '@supabase/supabase-js';
import * as Crypto from 'expo-crypto';
import { useFocusEffect } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useI18n } from '../i18n/I18nProvider';
import { ApiClient, errorMessage, type ErrorCode } from './api';
import { clearCachedBundles, loadCachedBundle, saveCachedBundle } from './cache';
import { fetchBrand, fetchMemberBundle, type MemberBundle, type RedemptionRow } from './data';
import { apiBaseUrl, supabaseEnv } from './env';
import { clubUrl, PROGRAM_NAME, SUPPORT_EMAIL } from './program';
import { forgetPush, onPushReceived, syncPush } from './push';
import { getSupabase } from './supabase';

export type AuthState =
  | { status: 'not_configured' }
  | { status: 'loading' }
  | { status: 'signed_out' }
  | { status: 'signed_in'; session: Session };

export type MemberState =
  /** Not signed in (or still finding out). */
  | { status: 'idle' }
  | { status: 'loading' }
  /** Signed in but not a member yet: finish joining. */
  | { status: 'none' }
  /** `offline`: shown from the device cache, the network refresh hasn't succeeded (yet). */
  | { status: 'ready'; data: MemberBundle; offline: boolean }
  | { status: 'error' };

interface SessionValue {
  auth: AuthState;
  member: MemberState;
  /** The brand's program config; core defaults until it has loaded. */
  config: ProgramConfig;
  api: ApiClient | null;
  /** Reload the member data from the server (keeps showing the current data meanwhile). */
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  /** After `redemptions/create`: show the code right away. */
  applyRedemption: (redemption: RedemptionRow, balance: number) => void;
  /** After cancel / use / expiry of the active code. */
  clearRedemption: (balance?: number) => void;
  /** Error code → message in the current language, placeholders filled. */
  errorText: (code: ErrorCode, tier?: string) => string;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { locale } = useI18n();
  const [auth, setAuth] = useState<AuthState>(() => (supabaseEnv() ? { status: 'loading' } : { status: 'not_configured' }));
  const [member, setMember] = useState<MemberState>({ status: 'idle' });
  const [brandConfig, setBrandConfig] = useState<ProgramConfig | null>(null);
  const loadSeq = useRef(0);
  /** The user this phone last registered for push (once per sign-in). */
  const pushSynced = useRef<string | null>(null);
  const memberRef = useRef(member);
  memberRef.current = member;

  // Auth: the first event is INITIAL_SESSION (from storage, works offline).
  useEffect(() => {
    const client = getSupabase();
    if (!client) {
      setAuth({ status: 'not_configured' });
      return;
    }
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      setAuth(session ? { status: 'signed_in', session } : { status: 'signed_out' });
    });
    fetchBrand(client)
      .then((brand) => setBrandConfig(brand.config))
      .catch(() => {});
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = auth.status === 'signed_in' ? auth.session.user.id : null;

  /**
   * Member data for a signed-in user from the server; with `fromCache` the
   * device copy is shown first (offline card). Only the latest load applies.
   */
  const load = useCallback(async (uid: string, fromCache: boolean) => {
    const client = getSupabase();
    if (!client) return;
    const seq = ++loadSeq.current;
    const stale = () => seq !== loadSeq.current;
    let cached: MemberBundle | null = null;
    if (fromCache) {
      cached = await loadCachedBundle(uid);
      if (stale()) return;
      setMember(cached ? { status: 'ready', data: cached, offline: true } : { status: 'loading' });
    }
    try {
      const result = await fetchMemberBundle(client, uid, new Date());
      if (stale()) return;
      if (result.kind === 'none') {
        setBrandConfig(result.brand.config);
        setMember({ status: 'none' });
        void clearCachedBundles();
        return;
      }
      setBrandConfig(result.bundle.brand.config);
      setMember({ status: 'ready', data: result.bundle, offline: false });
      void saveCachedBundle(uid, result.bundle);
    } catch (error) {
      if (__DEV__) console.warn('Loading member data failed', error);
      if (stale()) return;
      const current = memberRef.current;
      if (current.status === 'ready') setMember({ ...current, offline: true });
      else setMember({ status: 'error' });
    }
  }, []);

  useEffect(() => {
    if (!userId) {
      loadSeq.current += 1;
      setMember(auth.status === 'loading' ? { status: 'loading' } : { status: 'idle' });
      return;
    }
    void load(userId, true);
  }, [userId, auth.status, load]);

  const refresh = useCallback(() => (userId ? load(userId, false) : Promise.resolve()), [userId, load]);

  // Never touch the Supabase client during render: static web rendering runs
  // in Node without storage. The token is read only when a call is made.
  const api = useMemo(() => {
    const env = supabaseEnv();
    if (!env) return null;
    return new ApiClient({
      baseUrl: apiBaseUrl(env.url),
      apiKey: env.publishableKey,
      newKey: () => Crypto.randomUUID(),
      getAccessToken: async () => {
        const client = getSupabase();
        return client ? ((await client.auth.getSession()).data.session?.access_token ?? null) : null;
      },
    });
  }, []);

  const signOut = useCallback(async () => {
    const client = getSupabase();
    // While still signed in: this phone stops getting the member's notifications.
    if (api) await forgetPush(api);
    await clearCachedBundles();
    setMember({ status: 'idle' });
    // Local scope: works offline; the refresh token is dropped from this device.
    await client?.auth.signOut({ scope: 'local' }).catch(() => {});
    setAuth({ status: 'signed_out' });
    pushSynced.current = null;
  }, [api]);

  // Push (v0.9): once the member's data is in from the server, register this
  // phone (asks for permission once per install); a message that arrives while
  // the app is open means the points changed.
  const memberOnline = member.status === 'ready' && !member.offline;
  useEffect(() => {
    if (!memberOnline || !userId || !api || pushSynced.current === userId) return;
    pushSynced.current = userId;
    void syncPush(api);
  }, [memberOnline, userId, api]);
  useEffect(() => onPushReceived(() => void refresh()), [refresh]);

  const updateBundle = useCallback(
    (change: (bundle: MemberBundle) => MemberBundle) => {
      const current = memberRef.current;
      if (current.status !== 'ready') return;
      const data = change(current.data);
      setMember({ ...current, data });
      if (userId) void saveCachedBundle(userId, data);
    },
    [userId],
  );

  const applyRedemption = useCallback(
    (redemption: RedemptionRow, balance: number) =>
      updateBundle((b) => ({
        ...b,
        activeRedemption: redemption,
        balance: { ...b.balance, balance },
        gifts: b.gifts?.map((g) => (g.id === redemption.gift_id ? { ...g, status: 'redeemed' as const } : g)) ?? null,
      })),
    [updateBundle],
  );

  const clearRedemption = useCallback(
    (balance?: number) =>
      updateBundle((b) => ({
        ...b,
        activeRedemption: null,
        balance: balance === undefined ? b.balance : { ...b.balance, balance },
      })),
    [updateBundle],
  );

  const config = (member.status === 'ready' ? member.data.brand.config : brandConfig) ?? defaultConfig;

  const errorText = useCallback(
    (code: ErrorCode, tier?: string) =>
      errorMessage(code, locale, { config, programName: PROGRAM_NAME, clubUrl: clubUrl(), supportEmail: SUPPORT_EMAIL, tier }),
    [config, locale],
  );

  const value = useMemo<SessionValue>(
    () => ({ auth, member, config, api, refresh, signOut, applyRedemption, clearRedemption, errorText }),
    [auth, member, config, api, refresh, signOut, applyRedemption, clearRedemption, errorText],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession outside SessionProvider');
  return value;
}

/** Reload the member data when a screen comes back into view and the data is over 30 seconds old. */
export function useRefreshOnFocus(): void {
  const { member, refresh } = useSession();
  const loadedAt = member.status === 'ready' ? member.data.loadedAt : null;
  useFocusEffect(
    useCallback(() => {
      if (loadedAt && Date.now() - Date.parse(loadedAt) > 30_000) void refresh();
    }, [loadedAt, refresh]),
  );
}
