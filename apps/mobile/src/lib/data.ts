import { defaultConfig, resolveConfig, type ProgramConfig, type TierId } from '@overoll/core';
import type { SupabaseClient } from '@supabase/supabase-js';

import { BRAND_SLUG } from './env';

/*
 * Everything the member app reads directly (docs/api-contract.md, "What the
 * apps read directly"): row-level security limits each table to the member's
 * own rows. Hand-written row shapes until we generate types.
 */

export interface BrandInfo {
  id: string;
  config: ProgramConfig;
}

export interface RewardRow {
  id: string;
  name_el: string;
  name_en: string;
  description_el: string | null;
  description_en: string | null;
  /** Point cost for Classic members (packages/core rewardBaseCost). */
  base_cost: number;
  min_tier: TierId | null;
  sort_order: number;
}

export interface StoreRow {
  id: string;
  code: string;
  name: string;
  address: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  opening_hours: unknown;
  time_zone: string;
}

export interface MemberRow {
  id: string;
  member_code: string;
  first_name: string;
  email: string | null;
  tier: TierId;
  locale: 'el' | 'en';
  created_at: string;
  last_purchase_at: string | null;
}

export interface BalanceRow {
  balance: number;
  /** Points that count for tiers in the last 12 months. */
  earned_12m: number;
  last_earn_at: string | null;
}

export interface SecretRow {
  qr_secret: string;
  pass_version: number;
}

/** `member_gifts` (API contract v0.2): the welcome croissant. */
export interface GiftRow {
  id: string;
  kind: string;
  reward_id: string;
  unlocked_at: string;
  expires_at: string;
  status: 'available' | 'redeemed' | 'expired';
}

export interface RedemptionRow {
  id: string;
  code: string;
  reward_id: string;
  points_spent: number;
  status: 'pending' | 'used' | 'cancelled' | 'expired';
  created_at: string;
  expires_at: string;
  /** Set for a gift's code (column added in v0.2; null before). */
  gift_id: string | null;
}

export interface LedgerRow {
  id: number;
  kind: 'earn' | 'bonus' | 'redeem' | 'refund_redeem' | 'reverse' | 'adjust' | 'expire';
  points: number;
  amount_cents: number | null;
  store_id: string | null;
  redemption_id: string | null;
  created_at: string;
}

/** What the card, rewards and profile screens need; also cached on the device for offline use. */
export interface MemberBundle {
  brand: BrandInfo;
  member: MemberRow;
  balance: BalanceRow;
  secret: SecretRow | null;
  rewards: RewardRow[];
  /** null: the gifts table isn't there yet (server v0.2) or couldn't be read. */
  gifts: GiftRow[] | null;
  activeRedemption: RedemptionRow | null;
  loadedAt: string;
}

/** The brand and its program config (`brands.config` over core `defaultConfig`). */
export async function fetchBrand(client: SupabaseClient): Promise<BrandInfo> {
  const { data, error } = await client.from('brands').select('id, config').eq('slug', BRAND_SLUG).single();
  if (error) throw error;
  let config: ProgramConfig;
  try {
    config = resolveConfig(data.config);
  } catch (problem) {
    // A bad config is HQ's bug; the server refuses to work with it as well.
    if (__DEV__) console.warn('Invalid brand config, using defaults', problem);
    config = defaultConfig;
  }
  return { id: data.id, config };
}

const rewardColumns = 'id, name_el, name_en, description_el, description_en, base_cost, min_tier, sort_order';

/** Active rewards of this brand, in catalog order. Readable without signing in. */
export async function fetchRewards(client: SupabaseClient): Promise<RewardRow[]> {
  const { data, error } = await client
    .from('rewards')
    .select(`${rewardColumns}, brands!inner(slug)`)
    .eq('brands.slug', BRAND_SLUG)
    .eq('active', true)
    .order('sort_order')
    .order('base_cost');
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    name_el: row.name_el,
    name_en: row.name_en,
    description_el: row.description_el ?? null,
    description_en: row.description_en ?? null,
    base_cost: row.base_cost,
    min_tier: row.min_tier ?? null,
    sort_order: row.sort_order,
  }));
}

const storeColumns = 'id, code, name, address, city, latitude, longitude, opening_hours, time_zone';

/** Active stores of this brand, by name. */
export async function fetchStores(client: SupabaseClient): Promise<StoreRow[]> {
  const { data, error } = await client
    .from('stores')
    .select(`${storeColumns}, brands!inner(slug)`)
    .eq('brands.slug', BRAND_SLUG)
    .eq('active', true)
    .order('name');
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    address: row.address,
    city: row.city,
    latitude: row.latitude,
    longitude: row.longitude,
    opening_hours: row.opening_hours,
    time_zone: row.time_zone,
  }));
}

/** The store of a counter QR (`?store=<code>`), if it is active. */
export async function fetchStoreByCode(client: SupabaseClient, code: string): Promise<{ code: string; name: string } | null> {
  if (!/^[a-z0-9-]{1,64}$/.test(code)) return null;
  const { data, error } = await client
    .from('stores')
    .select('code, name, brands!inner(slug)')
    .eq('brands.slug', BRAND_SLUG)
    .eq('code', code)
    .eq('active', true)
    .maybeSingle();
  if (error) throw error;
  return data ? { code: data.code, name: data.name } : null;
}

function toRedemption(row: Record<string, unknown>): RedemptionRow {
  return {
    id: row.id as string,
    code: row.code as string,
    reward_id: row.reward_id as string,
    points_spent: row.points_spent as number,
    status: row.status as RedemptionRow['status'],
    created_at: row.created_at as string,
    expires_at: row.expires_at as string,
    gift_id: (row.gift_id as string | null | undefined) ?? null,
  };
}

/** The member's pending code that hasn't expired, if any (shown again when they come back). */
export async function fetchActiveRedemption(client: SupabaseClient, memberId: string, now: Date): Promise<RedemptionRow | null> {
  // `*`: `gift_id` only exists from server v0.2 on.
  const { data, error } = await client
    .from('redemptions')
    .select('*')
    .eq('member_id', memberId)
    .eq('status', 'pending')
    .gt('expires_at', now.toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? toRedemption(data) : null;
}

/** One redemption of the member (the code screen polls it to see "used"). */
export async function fetchRedemption(client: SupabaseClient, id: string): Promise<RedemptionRow | null> {
  const { data, error } = await client.from('redemptions').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? toRedemption(data) : null;
}

/**
 * The member's gifts. `member_gifts` arrives with server v0.2: until then
 * (or on any read problem) this returns null and the app shows no gift.
 */
export async function fetchGifts(client: SupabaseClient, memberId: string): Promise<GiftRow[] | null> {
  try {
    const { data, error } = await client
      .from('member_gifts')
      .select('id, kind, reward_id, unlocked_at, expires_at, status')
      .eq('member_id', memberId)
      .order('unlocked_at', { ascending: false });
    if (error) return null;
    return (data ?? []) as GiftRow[];
  } catch {
    return null;
  }
}

/** The welcome gift the member can redeem now, if any. */
export function availableGift(gifts: GiftRow[] | null, now: Date): GiftRow | null {
  return (
    gifts?.find((g) => g.kind === 'welcome' && g.status === 'available' && Date.parse(g.expires_at) > now.getTime()) ?? null
  );
}

export type MemberLookup = { kind: 'member'; bundle: MemberBundle } | { kind: 'none'; brand: BrandInfo };

/** Everything for a signed-in user, or `none` when they haven't joined (or deleted their account). */
export async function fetchMemberBundle(client: SupabaseClient, userId: string, now: Date): Promise<MemberLookup> {
  const brand = await fetchBrand(client);
  const { data: member, error } = await client
    .from('members')
    .select('id, member_code, first_name, email, tier, locale, created_at, last_purchase_at, deleted_at')
    .eq('brand_id', brand.id)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!member || member.deleted_at) return { kind: 'none', brand };

  const [balance, secret, rewards, gifts, activeRedemption] = await Promise.all([
    client.from('member_balances').select('balance, earned_12m, last_earn_at').eq('member_id', member.id).maybeSingle(),
    client.from('member_secrets').select('qr_secret, pass_version').eq('member_id', member.id).maybeSingle(),
    fetchRewards(client),
    fetchGifts(client, member.id),
    fetchActiveRedemption(client, member.id, now),
  ]);
  if (balance.error) throw balance.error;
  if (secret.error) throw secret.error;

  return {
    kind: 'member',
    bundle: {
      brand,
      member: {
        id: member.id,
        member_code: member.member_code,
        first_name: member.first_name,
        email: member.email ?? null,
        tier: member.tier,
        locale: member.locale,
        created_at: member.created_at,
        last_purchase_at: member.last_purchase_at ?? null,
      },
      balance: balance.data ?? { balance: 0, earned_12m: 0, last_earn_at: null },
      secret: secret.data ?? null,
      rewards,
      gifts,
      activeRedemption,
      loadedAt: now.toISOString(),
    },
  };
}

export interface HistoryItem extends LedgerRow {
  storeName: string | null;
  reward: { name_el: string; name_en: string } | null;
}

/** The last 50 ledger entries, with store and reward names joined in on the device. */
export async function fetchHistory(client: SupabaseClient, memberId: string, rewards: RewardRow[]): Promise<HistoryItem[]> {
  const { data, error } = await client
    .from('ledger_entries')
    .select('id, kind, points, amount_cents, store_id, redemption_id, created_at')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  const rows = (data ?? []) as LedgerRow[];

  const redemptionIds = [...new Set(rows.map((r) => r.redemption_id).filter((id): id is string => !!id))];
  const [stores, redemptions] = await Promise.all([
    fetchStores(client).catch(() => [] as StoreRow[]),
    redemptionIds.length
      ? client.from('redemptions').select('*').in('id', redemptionIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
  ]);
  if (redemptions.error) throw redemptions.error;
  const storeName = new Map(stores.map((s) => [s.id, s.name]));
  const redemptionById = new Map((redemptions.data ?? []).map((r) => [r.id as string, toRedemption(r)]));
  const rewardById = new Map(rewards.map((r) => [r.id, r]));

  return rows.map((row) => {
    const redemption = row.redemption_id ? redemptionById.get(row.redemption_id) : undefined;
    const reward = redemption ? rewardById.get(redemption.reward_id) : undefined;
    return {
      ...row,
      storeName: row.store_id ? (storeName.get(row.store_id) ?? null) : null,
      reward: reward ? { name_el: reward.name_el, name_en: reward.name_en } : null,
    };
  });
}
