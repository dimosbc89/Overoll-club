import { brand } from '../brand';

/**
 * Public configuration. Expo inlines EXPO_PUBLIC_* at build time, but only
 * when written out as `process.env.EXPO_PUBLIC_...`, so keep these literal.
 * The publishable key is safe in the app: row-level security decides access.
 */
export interface SupabaseEnv {
  url: string;
  publishableKey: string;
}

export function supabaseEnv(): SupabaseEnv | null {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey) return null;
  return { url, publishableKey };
}

/** The HTTP API (Edge Function `api`) under the Supabase project URL. */
export function apiBaseUrl(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/api`;
}

/** The club site and web app (the brand's siteUrl in production builds, scripts/build-web.ts). */
export function clubUrlSetting(): string | null {
  return process.env.EXPO_PUBLIC_CLUB_URL?.trim() || null;
}

/** The brand this app belongs to (src/brand, picked at build time with EXPO_PUBLIC_BRAND). */
export const BRAND_SLUG = brand.slug;
