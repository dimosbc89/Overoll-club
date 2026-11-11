import { brand } from './brand';

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

/** The brand this back office manages (src/lib/brand.ts, picked at build time). */
export const BRAND_SLUG = brand.slug;

/** Program name, fills `{programName}`. */
export const PROGRAM_NAME = brand.programName;

/** Support address (GROW's test address until the brand's own), fills `{supportEmail}`. */
export const SUPPORT_EMAIL = brand.supportEmail;

/** The club site and member web app, fills `{clubUrl}`: the build's setting, else the brand's. */
export const CLUB_URL = (process.env.NEXT_PUBLIC_CLUB_URL?.trim() || brand.clubUrl).replace(/^https?:\/\//, '').replace(/\/+$/, '');
