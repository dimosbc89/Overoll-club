import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { supabaseEnv } from './env';

let client: SupabaseClient | null | undefined;

/**
 * Shared Supabase client, created on first use, or null when the env is not
 * set (screens then show the "not configured" state). Never call it during
 * render: static web rendering runs without a browser.
 */
export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const env = supabaseEnv();
  client = env
    ? createClient(env.url, env.publishableKey, {
        auth: {
          storage: AsyncStorage,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: Platform.OS === 'web',
        },
      })
    : null;
  return client;
}
