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

/** The brand this app belongs to (multi-brand database, one brand per app). */
export const BRAND_SLUG = 'overoll';
