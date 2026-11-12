/**
 * Back office for HQ admins and store managers (docs/api-contract.md v0.5).
 *
 * - Sign-in: Supabase Auth, one-time code to email. The session lives in its own
 *   storage key, apart from the till's (`/console`), so a device and an HQ
 *   account can be signed in on the same computer.
 * - Reads go straight to Supabase with the staff session: row-level security
 *   decides what HQ (the brand) or a manager (their store) sees.
 * - Writes go through the API (`createOfficeApi`).
 */
import { type ProgramConfig, type TierId, resolveConfig } from '@grow-loyalty/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { apiBaseUrl, createPoster, type ApiResponse } from './api';
import { brand } from './brand';
import { BRAND_SLUG, supabaseEnv } from './env';

// ---------------------------------------------------------------------------
// Client and session
// ---------------------------------------------------------------------------

let officeClient: SupabaseClient | null = null;

/** The back office's Supabase client; null when the env vars are missing. Browser only. */
export function officeSupabase(): SupabaseClient | null {
  const env = supabaseEnv();
  if (!env) return null;
  officeClient ??= createClient(env.url, env.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: `${brand.slug}-office-auth`,
    },
  });
  return officeClient;
}

export type StaffRoleName = 'platform_admin' | 'hq_admin' | 'store_manager' | 'store_device';

export interface OfficeRole {
  id: string;
  role: StaffRoleName;
  brandId: string | null;
  storeId: string | null;
}

export interface OfficeUser {
  id: string;
  email: string | null;
  /** This back office's brand (brands.slug = the build's brand). */
  brandId: string;
  /** HQ admin of the brand, or a platform admin (GROW): the whole network. */
  hq: boolean;
  /** Stores this user manages (all of them for HQ). */
  managedStoreIds: string[] | 'all';
  /** Only till device roles: belongs on /console, not here. */
  deviceOnly: boolean;
  /** The brand's programme config (error texts, PIN length, limits). */
  config: ProgramConfig;
}

export type OfficeSession =
  | { status: 'not_configured' }
  | { status: 'signed-out' }
  | { status: 'no-access'; email: string | null }
  | { status: 'ready'; user: OfficeUser }
  | { status: 'error' };

export async function loadOfficeSession(client: SupabaseClient): Promise<OfficeSession> {
  const { data } = await client.auth.getSession();
  const authUser = data.session?.user;
  if (!authUser) return { status: 'signed-out' };
  const [roles, brandRow] = await Promise.all([
    client.from('staff_roles').select('id, role, brand_id, store_id').eq('user_id', authUser.id),
    client.from('brands').select('id, config').eq('slug', BRAND_SLUG).maybeSingle(),
  ]);
  if (roles.error || brandRow.error) return { status: 'error' };
  const brandData = brandRow.data as { id: string; config: unknown } | null;
  if (!brandData) return { status: 'error' };
  const brandId = brandData.id;
  let config: ProgramConfig;
  try {
    config = resolveConfig(brandData.config);
  } catch {
    return { status: 'error' };
  }
  const mine: OfficeRole[] = (roles.data ?? []).map((r: { id: string; role: StaffRoleName; brand_id: string | null; store_id: string | null }) => ({
    id: r.id,
    role: r.role,
    brandId: r.brand_id,
    storeId: r.store_id,
  }));
  const hq = mine.some((r) => r.role === 'platform_admin' || (r.role === 'hq_admin' && r.brandId === brandId));
  const managed = mine.filter((r) => r.role === 'store_manager' && r.brandId === brandId && r.storeId).map((r) => r.storeId!);
  const email = authUser.email ?? null;
  if (!hq && managed.length === 0) {
    const devices = mine.some((r) => r.role === 'store_device' && r.brandId === brandId);
    if (devices) return { status: 'ready', user: { id: authUser.id, email, brandId, hq: false, managedStoreIds: [], deviceOnly: true, config } };
    return { status: 'no-access', email };
  }
  return { status: 'ready', user: { id: authUser.id, email, brandId, hq, managedStoreIds: hq ? 'all' : managed, deviceOnly: false, config } };
}

export type AuthResult = { ok: true } | { ok: false; code: string };

function authCode(error: { name?: string; status?: number }, fallback: string): string {
  return error.name === 'AuthRetryableFetchError' || error.status === 0 ? 'network_error' : fallback;
}

/**
 * Email a one-time code. Staff accounts get their role from HQ (staff/add) or,
 * for a brand's first HQ admin, from GROW. Signing in creates a bare Auth user
 * when the email is new (as joining from the member app does): it has no role,
 * so it sees "no access" until someone gives it one.
 */
export async function sendSignInCode(client: SupabaseClient, email: string): Promise<AuthResult> {
  const { error } = await client.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: true } });
  return error ? { ok: false, code: authCode(error, 'otp_send_failed') } : { ok: true };
}

export async function verifySignInCode(client: SupabaseClient, email: string, code: string): Promise<AuthResult> {
  const { error } = await client.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'email' });
  return error ? { ok: false, code: authCode(error, 'otp_bad_code') } : { ok: true };
}

// ---------------------------------------------------------------------------
// API (writes)
// ---------------------------------------------------------------------------

export interface EmployeeView {
  id: string;
  storeId: string;
  displayName: string;
  active: boolean;
}

export interface StaffView {
  id: string;
  userId: string;
  role: 'hq_admin' | 'store_manager' | 'store_device';
  brandId: string;
  storeId: string | null;
  email: string | null;
}

export interface AdjustedPoints {
  entryId: string;
  memberId: string;
  points: number;
  balance: number;
}

export interface OfficeApi {
  createEmployee(input: { storeId: string; displayName: string; pin: string; idempotencyKey: string }): Promise<ApiResponse<{ employee: EmployeeView }>>;
  updateEmployee(input: { employeeId: string; displayName?: string; active?: boolean; pin?: string }): Promise<ApiResponse<{ employee: EmployeeView }>>;
  addStaff(
    input: { role: 'store_device' | 'store_manager'; storeId: string; email: string } | { role: 'hq_admin'; brandId: string; email: string },
  ): Promise<ApiResponse<{ staff: StaffView; created: boolean }>>;
  removeStaff(staffId: string): Promise<ApiResponse<{ removed: StaffView }>>;
  adjustPoints(input: { memberId: string; points: number; reason: string; idempotencyKey: string }): Promise<ApiResponse<AdjustedPoints>>;
  createStore(input: StoreInput & { brandId: string; code: string; name: string; idempotencyKey: string }): Promise<ApiResponse<{ store: Omit<CatalogStore, 'timeZone'> }>>;
  updateStore(input: StoreInput & { storeId: string; active?: boolean }): Promise<ApiResponse<{ store: Omit<CatalogStore, 'timeZone'> }>>;
  createReward(
    input: RewardInput & { brandId: string; nameEl: string; nameEn: string; shelfPriceCents: number; idempotencyKey: string },
  ): Promise<ApiResponse<{ reward: CatalogReward }>>;
  updateReward(input: RewardInput & { rewardId: string; active?: boolean }): Promise<ApiResponse<{ reward: CatalogReward }>>;
}

// ---------------------------------------------------------------------------
// Stores and reward catalog (HQ, v0.6): same shapes as packages/server/src/catalog.ts
// ---------------------------------------------------------------------------

export type OpeningHours = Partial<Record<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun', string>>;

export interface CatalogStore {
  id: string;
  brandId: string;
  code: string;
  name: string;
  nameEn: string | null;
  address: string | null;
  addressEn: string | null;
  city: string | null;
  country: 'GR' | 'CY';
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  openingHours: OpeningHours;
  active: boolean;
  timeZone: string;
}

export interface StoreInput {
  name?: string;
  nameEn?: string | null;
  address?: string | null;
  addressEn?: string | null;
  city?: string | null;
  country?: 'GR' | 'CY';
  phone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  openingHours?: OpeningHours;
}

export type TierName = 'classic' | 'gold' | 'club';

export interface CatalogReward {
  id: string;
  brandId: string;
  nameEl: string;
  nameEn: string;
  descriptionEl: string | null;
  descriptionEn: string | null;
  category: string;
  shelfPriceCents: number;
  baseCost: number;
  minTier: TierName | null;
  active: boolean;
  sortOrder: number;
}

export interface RewardInput {
  nameEl?: string;
  nameEn?: string;
  descriptionEl?: string | null;
  descriptionEn?: string | null;
  category?: string;
  shelfPriceCents?: number;
  minTier?: TierName | null;
  sortOrder?: number;
}

/** Every store of the brand, closed ones too (HQ reads them through row-level security). */
export async function loadCatalogStores(client: SupabaseClient, brandId: string): Promise<CatalogStore[]> {
  const { data, error } = await client.from('stores').select('*').eq('brand_id', brandId).order('name');
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    brandId: r.brand_id,
    code: r.code,
    name: r.name,
    nameEn: r.name_en ?? null,
    address: r.address ?? null,
    addressEn: r.address_en ?? null,
    city: r.city ?? null,
    country: r.country,
    phone: r.phone ?? null,
    latitude: r.latitude ?? null,
    longitude: r.longitude ?? null,
    openingHours: (r.opening_hours ?? {}) as OpeningHours,
    active: r.active,
    timeZone: r.time_zone,
  }));
}

/** The whole catalog in the members' order, switched-off rewards too. */
export async function loadCatalogRewards(client: SupabaseClient, brandId: string): Promise<CatalogReward[]> {
  const { data, error } = await client
    .from('rewards')
    .select('id, brand_id, name_el, name_en, description_el, description_en, category, shelf_price_cents, base_cost, min_tier, active, sort_order')
    .eq('brand_id', brandId)
    .order('sort_order')
    .order('base_cost');
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    brandId: r.brand_id,
    nameEl: r.name_el,
    nameEn: r.name_en,
    descriptionEl: r.description_el ?? null,
    descriptionEn: r.description_en ?? null,
    category: r.category,
    shelfPriceCents: r.shelf_price_cents,
    baseCost: r.base_cost,
    minTier: r.min_tier ?? null,
    active: r.active,
    sortOrder: r.sort_order,
  }));
}

export function createOfficeApi(client: SupabaseClient): OfficeApi | null {
  const env = supabaseEnv();
  if (!env) return null;
  const post = createPoster({
    baseUrl: apiBaseUrl(env.url),
    apiKey: env.publishableKey,
    getAccessToken: async () => (await client.auth.getSession()).data.session?.access_token ?? null,
  });
  return {
    createEmployee: (input) => post('staff/employees/create', { ...input }),
    updateEmployee: (input) => post('staff/employees/update', { ...input }),
    addStaff: (input) => post('staff/add', { ...input }),
    removeStaff: (staffId) => post('staff/remove', { staffId }),
    adjustPoints: (input) => post('points/adjust', { ...input }),
    createStore: (input) => post('stores/create', { ...input }),
    updateStore: (input) => post('stores/update', { ...input }),
    createReward: (input) => post('rewards/create', { ...input }),
    updateReward: (input) => post('rewards/update', { ...input }),
  };
}

// ---------------------------------------------------------------------------
// Reads (row-level security)
// ---------------------------------------------------------------------------

export interface OfficeStore {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  active: boolean;
  timeZone: string;
}

export async function loadOfficeStores(client: SupabaseClient, brandId: string): Promise<OfficeStore[]> {
  const { data, error } = await client.from('stores').select('*').eq('brand_id', brandId).order('name');
  if (error) throw error;
  return (data ?? []).map((r: { id: string; code: string; name: string; name_en?: string | null; active: boolean; time_zone: string }) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    nameEn: r.name_en ?? null,
    active: r.active,
    timeZone: r.time_zone,
  }));
}

export interface StoreStats {
  storeId: string | null;
  netPoints: number;
  purchases: number;
  rewardsUsed: number;
  membersJoined: number;
}

export interface DashboardData {
  stores: StoreStats[];
  /** Members not deleted (HQ only; null for managers, who can't read members). */
  members: number | null;
}

export async function loadDashboard(client: SupabaseClient, user: OfficeUser, since: Date): Promise<DashboardData> {
  const stats = await client.rpc('dashboard_stats', { p_since: since.toISOString() });
  if (stats.error) throw stats.error;
  let members: number | null = null;
  if (user.hq) {
    const count = await client
      .from('members')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', user.brandId)
      .is('deleted_at', null);
    if (count.error) throw count.error;
    members = count.count ?? 0;
  }
  const rows = (stats.data ?? []) as {
    store_id: string | null;
    net_points: number | string;
    purchases: number | string;
    rewards_used: number | string;
    members_joined: number | string;
  }[];
  return {
    members,
    stores: rows.map((r) => ({
      storeId: r.store_id,
      netPoints: Number(r.net_points),
      purchases: Number(r.purchases),
      rewardsUsed: Number(r.rewards_used),
      membersJoined: Number(r.members_joined),
    })),
  };
}

export interface EmployeeRow {
  id: string;
  storeId: string;
  displayName: string;
  active: boolean;
}

export async function loadStoreEmployees(client: SupabaseClient, storeId: string): Promise<EmployeeRow[]> {
  const { data, error } = await client
    .from('employees')
    .select('id, store_id, display_name, active')
    .eq('store_id', storeId)
    .order('active', { ascending: false })
    .order('display_name');
  if (error) throw error;
  return (data ?? []).map((r: { id: string; store_id: string; display_name: string; active: boolean }) => ({
    id: r.id,
    storeId: r.store_id,
    displayName: r.display_name,
    active: r.active,
  }));
}

export interface StaffRow {
  id: string;
  userId: string;
  role: StaffRoleName;
  storeId: string | null;
  email: string | null;
  createdAt: string;
}

/** The brand's staff accounts (HQ reads them all; a manager reads their own row only). */
export async function loadStaff(client: SupabaseClient, brandId: string): Promise<StaffRow[]> {
  const { data, error } = await client
    .from('staff_roles')
    .select('id, user_id, role, store_id, email, created_at')
    .eq('brand_id', brandId)
    .order('created_at');
  if (error) throw error;
  return (data ?? []).map((r: { id: string; user_id: string; role: StaffRoleName; store_id: string | null; email: string | null; created_at: string }) => ({
    id: r.id,
    userId: r.user_id,
    role: r.role,
    storeId: r.store_id,
    email: r.email,
    createdAt: r.created_at,
  }));
}

export interface MemberRow {
  id: string;
  memberCode: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  tier: TierId;
  createdAt: string;
  lastPurchaseAt: string | null;
  deletedAt: string | null;
  joinedStoreId: string | null;
  balance: number;
}

const memberColumns = 'id, member_code, first_name, last_name, email, phone, tier, created_at, last_purchase_at, deleted_at, joined_store_id';

type RawMember = {
  id: string;
  member_code: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  tier: TierId;
  created_at: string;
  last_purchase_at: string | null;
  deleted_at: string | null;
  joined_store_id: string | null;
};

async function withBalances(client: SupabaseClient, rows: RawMember[]): Promise<MemberRow[]> {
  if (!rows.length) return [];
  const { data, error } = await client
    .from('member_balances')
    .select('member_id, balance')
    .in(
      'member_id',
      rows.map((r) => r.id),
    );
  if (error) throw error;
  const balances = new Map((data ?? []).map((b: { member_id: string; balance: number }) => [b.member_id, b.balance]));
  return rows.map((r) => ({
    id: r.id,
    memberCode: r.member_code,
    firstName: r.first_name,
    lastName: r.last_name,
    email: r.email,
    phone: r.phone,
    tier: r.tier,
    createdAt: r.created_at,
    lastPurchaseAt: r.last_purchase_at,
    deletedAt: r.deleted_at,
    joinedStoreId: r.joined_store_id,
    balance: balances.get(r.id) ?? 0,
  }));
}

/** What the search box holds: a member code, an email, a phone number or a name. */
export type MemberQuery =
  | { kind: 'code'; value: string }
  | { kind: 'email'; value: string }
  | { kind: 'phone'; value: string }
  | { kind: 'name'; value: string }
  | null;

/** PostgREST `ilike` patterns: escape the wildcards a person may type. */
const likeText = (s: string) => s.replace(/[\\%_,()]/g, (c) => `\\${c}`);

export function parseMemberQuery(raw: string): MemberQuery {
  const q = raw.trim();
  if (q.length < 2) return null;
  if (q.includes('@')) return { kind: 'email', value: q.toLowerCase() };
  const compact = q.replace(/[\s-]/g, '');
  if (/^\+?[0-9]{6,15}$/.test(compact)) return { kind: 'phone', value: compact };
  if (/^[A-Za-z0-9]{8}$/.test(compact) && /[0-9]/.test(compact)) return { kind: 'code', value: compact.toUpperCase() };
  return { kind: 'name', value: q };
}

export async function searchMembers(client: SupabaseClient, brandId: string, query: MemberQuery): Promise<MemberRow[]> {
  if (!query) return [];
  let request = client.from('members').select(memberColumns).eq('brand_id', brandId).is('deleted_at', null).limit(25);
  if (query.kind === 'code') request = request.eq('member_code', query.value);
  else if (query.kind === 'email') request = request.ilike('email', `%${likeText(query.value)}%`);
  else if (query.kind === 'phone') request = request.ilike('phone', `%${likeText(query.value.replace(/^\+/, ''))}%`);
  else {
    const words = query.value.split(/\s+/).filter(Boolean).slice(0, 2);
    const first = likeText(words[0] ?? '');
    request =
      words.length > 1
        ? request.ilike('first_name', `%${first}%`).ilike('last_name', `%${likeText(words[1]!)}%`)
        : request.or(`first_name.ilike.%${first}%,last_name.ilike.%${first}%`);
  }
  const { data, error } = await request.order('created_at', { ascending: false });
  if (error) throw error;
  return withBalances(client, (data ?? []) as RawMember[]);
}

export interface LedgerItem {
  id: string;
  kind: string;
  points: number;
  amountCents: number | null;
  storeId: string | null;
  reason: string | null;
  createdAt: string;
}

export interface MemberDetail {
  member: MemberRow;
  ledger: LedgerItem[];
}

export async function loadMemberDetail(client: SupabaseClient, memberId: string): Promise<MemberDetail | null> {
  const { data, error } = await client.from('members').select(memberColumns).eq('id', memberId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [member] = await withBalances(client, [data as RawMember]);
  const ledger = await client
    .from('ledger_entries')
    .select('id, kind, points, amount_cents, store_id, reason, created_at')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (ledger.error) throw ledger.error;
  return {
    member: member!,
    ledger: (ledger.data ?? []).map(
      (r: { id: string | number; kind: string; points: number; amount_cents: number | null; store_id: string | null; reason: string | null; created_at: string }) => ({
        id: String(r.id),
        kind: r.kind,
        points: r.points,
        amountCents: r.amount_cents,
        storeId: r.store_id,
        reason: r.reason,
        createdAt: r.created_at,
      }),
    ),
  };
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

/** Offset of `timeZone` from UTC at `at`, in milliseconds (Athens: +2 h or +3 h). */
function zoneOffsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/**
 * Midnight that starts the day `daysBack` days before today, in `timeZone`:
 * 0 = today, 6 = the last seven days including today.
 */
export function startOfLocalDay(now: Date, timeZone: string, daysBack = 0): Date {
  const local = new Date(now.getTime() + zoneOffsetMs(now, timeZone));
  const midnightLocalAsUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - daysBack);
  // Use the offset at that midnight itself (a summer-time change may lie in between).
  const guess = new Date(midnightLocalAsUtc - zoneOffsetMs(new Date(midnightLocalAsUtc), timeZone));
  return new Date(midnightLocalAsUtc - zoneOffsetMs(guess, timeZone));
}
