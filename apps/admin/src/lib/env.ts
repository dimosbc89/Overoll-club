/**
 * Public configuration. Next.js inlines NEXT_PUBLIC_* at build time, so set
 * them before `next build`. The publishable key is safe to expose: row-level
 * security decides what it can read. The service-role key never goes here.
 */
export interface SupabaseEnv {
  url: string;
  publishableKey: string;
}

export function supabaseEnv(): SupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey) return null;
  return { url, publishableKey };
}

/** The brand this back office manages (multi-brand database). */
export const BRAND_SLUG = 'overoll';
