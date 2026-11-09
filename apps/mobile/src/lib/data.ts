import type { SupabaseClient } from '@supabase/supabase-js';

import { BRAND_SLUG } from './env';

// Hand-written row shapes until we generate types (`supabase gen types`).
export interface RewardRow {
  id: string;
  name_el: string;
  name_en: string;
  /** Point cost for Classic members (packages/core rewardBaseCost). */
  base_cost: number;
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

/** Active rewards of this brand, in catalog order. Readable with the publishable key. */
export async function fetchRewards(client: SupabaseClient): Promise<RewardRow[]> {
  const { data, error } = await client
    .from('rewards')
    .select('id, name_el, name_en, base_cost, sort_order, brands!inner(slug)')
    .eq('brands.slug', BRAND_SLUG)
    .eq('active', true)
    .order('sort_order')
    .order('base_cost');
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    name_el: row.name_el,
    name_en: row.name_en,
    base_cost: row.base_cost,
    sort_order: row.sort_order,
  }));
}

/** Active stores of this brand, by name. */
export async function fetchStores(client: SupabaseClient): Promise<StoreRow[]> {
  const { data, error } = await client
    .from('stores')
    .select('id, code, name, address, city, latitude, longitude, opening_hours, time_zone, brands!inner(slug)')
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
