import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

import { BRAND_SLUG, supabaseEnv } from './env';

// Hand-written row shapes until we generate types (`supabase gen types`).
export interface StoreRow {
  id: string;
  code: string;
  /** Greek; `name_en` / `address_en` English (v0.4, null until filled in). */
  name: string;
  name_en: string | null;
  address: string | null;
  address_en: string | null;
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
 * Browser client with the publishable key: reads public tables only.
 * Placeholder until HQ sign-in (week 4): staff sessions replace it.
 */
function publicClient(): SupabaseClient | null {
  const env = supabaseEnv();
  if (!env) return null;
  return createClient(env.url, env.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function load<T>(query: (client: SupabaseClient) => Promise<T>): Promise<Loaded<T>> {
  const client = publicClient();
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
      // `*`: name_en / address_en exist from v0.4 on (Greek shown until then).
      .select('*, brands!inner(slug)')
      .eq('brands.slug', BRAND_SLUG)
      .eq('active', true)
      .order('name');
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      name_en: row.name_en ?? null,
      address: row.address,
      address_en: row.address_en ?? null,
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

/** Runs a loader once in the browser; `loading` until it settles. */
export function useLoaded<T>(loader: () => Promise<Loaded<T>>): Loaded<T> | { status: 'loading' } {
  const [state, setState] = useState<Loaded<T> | { status: 'loading' }>({ status: 'loading' });
  useEffect(() => {
    let live = true;
    void loader().then((result) => {
      if (live) setState(result);
    });
    return () => {
      live = false;
    };
  }, [loader]);
  return state;
}
