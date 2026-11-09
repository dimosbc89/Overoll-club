import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { BRAND_SLUG, supabaseEnv } from './env';

// Hand-written row shapes until we generate types (`supabase gen types`).
export interface StoreRow {
  id: string;
  code: string;
  name: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  opening_hours: unknown;
  time_zone: string;
}

export interface RewardRow {
  id: string;
  name_el: string;
  name_en: string;
  shelf_price_cents: number;
  base_cost: number;
}

export type Loaded<T> = { status: 'not_configured' } | { status: 'error' } | { status: 'ready'; data: T };

/**
 * Server-side client with the publishable key: reads public tables only.
 * Placeholder until sign-in: staff sessions (@supabase/ssr) replace it.
 */
function serverClient(): SupabaseClient | null {
  const env = supabaseEnv();
  if (!env) return null;
  return createClient(env.url, env.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function load<T>(query: (client: SupabaseClient) => Promise<T>): Promise<Loaded<T>> {
  const client = serverClient();
  if (!client) return { status: 'not_configured' };
  try {
    return { status: 'ready', data: await query(client) };
  } catch (error) {
    console.error('Supabase query failed', error);
    return { status: 'error' };
  }
}

export function loadStores(): Promise<Loaded<StoreRow[]>> {
  return load(async (client) => {
    const { data, error } = await client
      .from('stores')
      .select('id, code, name, address, city, phone, opening_hours, time_zone, brands!inner(slug)')
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
      phone: row.phone,
      opening_hours: row.opening_hours,
      time_zone: row.time_zone,
    }));
  });
}

export function loadRewards(): Promise<Loaded<RewardRow[]>> {
  return load(async (client) => {
    const { data, error } = await client
      .from('rewards')
      .select('id, name_el, name_en, shelf_price_cents, base_cost, sort_order, brands!inner(slug)')
      .eq('brands.slug', BRAND_SLUG)
      .eq('active', true)
      .order('sort_order')
      .order('base_cost');
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: row.id,
      name_el: row.name_el,
      name_en: row.name_en,
      shelf_price_cents: row.shelf_price_cents,
      base_cost: row.base_cost,
    }));
  });
}
