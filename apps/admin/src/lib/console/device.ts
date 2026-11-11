/**
 * What the till reads directly with the signed-in device user (row-level
 * security, docs/api-contract.md "What the apps read directly"): its store via
 * `staff_roles` (role `store_device`), the brand config, the store's
 * employees and today's activity. Everything that writes goes through the API.
 */
import { InvalidConfigError, localDay, resolveConfig } from '@overoll/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { supabaseEnv } from '../env';
import type { DeviceContext, Employee, StoreInfo } from './machine';
import { brand } from '../brand';

// ---------------------------------------------------------------------------
// Browser client (the device session lives in localStorage)
// ---------------------------------------------------------------------------

let browserClient: SupabaseClient | null = null;

/** The console's Supabase client; null when the env vars are missing. Browser only. */
export function consoleSupabase(): SupabaseClient | null {
  const env = supabaseEnv();
  if (!env) return null;
  browserClient ??= createClient(env.url, env.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: `${brand.slug}-console-auth`,
    },
  });
  return browserClient;
}

// ---------------------------------------------------------------------------
// Sign-in and device context
// ---------------------------------------------------------------------------

export type AuthResult = { ok: true } | { ok: false; code: string };

export type LoadDeviceResult =
  | { status: 'signed-out' }
  | { status: 'no-store' }
  | { status: 'ready'; context: DeviceContext }
  | { status: 'error'; code: string };

export interface DeviceAuth {
  /** Email a one-time code to the device account (created by HQ, never created here). */
  sendCode(email: string): Promise<AuthResult>;
  verifyCode(email: string, code: string): Promise<AuthResult>;
  loadDevice(): Promise<LoadDeviceResult>;
}

interface QueryError {
  code?: string;
  message?: string;
  status?: number;
  name?: string;
}

/** A failed fetch has no Postgres / HTTP code. */
function queryErrorCode(error: QueryError): string {
  return error.code || error.status ? 'unknown' : 'network_error';
}

function authErrorCode(error: QueryError, fallback: string): string {
  if (error.name === 'AuthRetryableFetchError' || error.status === 0) return 'network_error';
  return fallback;
}

export async function loadEmployees(client: SupabaseClient, storeId: string): Promise<Employee[]> {
  const { data, error } = await client
    .from('employees')
    .select('id, display_name')
    .eq('store_id', storeId)
    .eq('active', true)
    .order('display_name');
  if (error) throw error;
  return (data ?? []).map((row: { id: string; display_name: string }) => ({
    id: row.id,
    displayName: row.display_name,
  }));
}

export function supabaseDeviceAuth(client: SupabaseClient): DeviceAuth {
  return {
    async sendCode(email) {
      const { error } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
      return error ? { ok: false, code: authErrorCode(error, 'otp_send_failed') } : { ok: true };
    },

    async verifyCode(email, code) {
      const { error } = await client.auth.verifyOtp({ email, token: code, type: 'email' });
      return error ? { ok: false, code: authErrorCode(error, 'otp_bad_code') } : { ok: true };
    },

    async loadDevice() {
      const { data: sessionData } = await client.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) return { status: 'signed-out' };

      const roles = await client
        .from('staff_roles')
        .select('store_id')
        .eq('user_id', user.id)
        .eq('role', 'store_device')
        .not('store_id', 'is', null)
        .limit(1);
      if (roles.error) return { status: 'error', code: queryErrorCode(roles.error) };
      const storeId = (roles.data?.[0] as { store_id: string } | undefined)?.store_id;
      if (!storeId) return { status: 'no-store' };

      // `*`: name_en exists from v0.4 on; until then the Greek name is shown.
      const store = await client
        .from('stores')
        .select('*, brands(config)')
        .eq('id', storeId)
        .maybeSingle();
      if (store.error) return { status: 'error', code: queryErrorCode(store.error) };
      if (!store.data) return { status: 'no-store' };
      const row = store.data as unknown as {
        id: string;
        name: string;
        name_en?: string | null;
        time_zone: string;
        brands: { config: unknown } | null;
      };

      let config;
      try {
        config = resolveConfig(row.brands?.config ?? {});
      } catch (error) {
        if (error instanceof InvalidConfigError) return { status: 'error', code: 'internal_error' };
        throw error;
      }

      let employees: Employee[];
      try {
        employees = await loadEmployees(client, storeId);
      } catch (error) {
        return { status: 'error', code: queryErrorCode(error as QueryError) };
      }

      const storeInfo: StoreInfo = { id: row.id, name: row.name, nameEn: row.name_en ?? null, timeZone: row.time_zone };
      return { status: 'ready', context: { store: storeInfo, employees, config } };
    },
  };
}

/** "Overoll Χαλάνδρι" → "Χαλάνδρι" (the brand's name is already in the header's wordmark). */
export function shortStoreName(name: string): string {
  const prefix = new RegExp(`^${brand.brandName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+`, 'i');
  return name.replace(prefix, '') || name;
}

// ---------------------------------------------------------------------------
// Today's activity
// ---------------------------------------------------------------------------

export interface LedgerRow {
  id: string | number;
  kind: string;
  points: number;
  amount_cents: number | null;
  employee_id: string | null;
  created_at: string;
}

export interface UsedRedemptionRow {
  id: string;
  used_at: string | null;
  used_employee_id: string | null;
  rewards: { name_el: string; name_en: string } | null;
}

export type ActivityItem =
  | {
      id: string;
      type: 'ledger';
      kind: string;
      at: string;
      points: number;
      amountCents: number | null;
      employeeName: string | null;
    }
  | {
      id: string;
      type: 'redemption';
      at: string;
      rewardNameEl: string | null;
      rewardNameEn: string | null;
      employeeName: string | null;
    };

/**
 * Today's entries at the store, newest first. "Today" is the store's calendar
 * day (core `localDay`), so a till open past midnight starts a new list.
 */
export function buildActivity(
  ledger: readonly LedgerRow[],
  redemptions: readonly UsedRedemptionRow[],
  employees: readonly Employee[],
  timeZone: string,
  now: Date,
): ActivityItem[] {
  const today = localDay(now, timeZone);
  const isToday = (iso: string) => localDay(new Date(iso), timeZone) === today;
  const names = new Map(employees.map((e) => [e.id, e.displayName]));
  const nameOf = (id: string | null) => (id ? names.get(id) ?? null : null);

  const items: ActivityItem[] = [
    ...ledger
      .filter((row) => isToday(row.created_at))
      .map((row): ActivityItem => ({
        id: `l:${row.id}`,
        type: 'ledger',
        kind: row.kind,
        at: row.created_at,
        points: row.points,
        amountCents: row.amount_cents,
        employeeName: nameOf(row.employee_id),
      })),
    ...redemptions
      .filter((row): row is UsedRedemptionRow & { used_at: string } => row.used_at !== null && isToday(row.used_at))
      .map((row): ActivityItem => ({
        id: `r:${row.id}`,
        type: 'redemption',
        at: row.used_at,
        rewardNameEl: row.rewards?.name_el ?? null,
        rewardNameEn: row.rewards?.name_en ?? null,
        employeeName: nameOf(row.used_employee_id),
      })),
  ];
  return items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

/** A local day lasts at most 25 h; read a little more and filter by calendar day. */
const LOOKBACK_MS = 26 * 3_600_000;

export async function loadTodayActivity(
  client: SupabaseClient,
  store: StoreInfo,
  employees: readonly Employee[],
  now: Date,
): Promise<ActivityItem[]> {
  const since = new Date(now.getTime() - LOOKBACK_MS).toISOString();
  const [ledger, redemptions] = await Promise.all([
    client
      .from('ledger_entries')
      .select('id, kind, points, amount_cents, employee_id, created_at')
      .eq('store_id', store.id)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(500),
    client
      .from('redemptions')
      .select('id, used_at, used_employee_id, rewards(name_el, name_en)')
      .eq('used_store_id', store.id)
      .eq('status', 'used')
      .gte('used_at', since)
      .order('used_at', { ascending: false })
      .limit(200),
  ]);
  if (ledger.error) throw ledger.error;
  if (redemptions.error) throw redemptions.error;
  return buildActivity(
    (ledger.data ?? []) as LedgerRow[],
    (redemptions.data ?? []) as unknown as UsedRedemptionRow[],
    employees,
    store.timeZone,
    now,
  );
}
