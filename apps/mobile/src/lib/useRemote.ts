import type { SupabaseClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';

import { supabaseEnv } from './env';
import { getSupabase } from './supabase';

export type RemoteState<T> =
  | { status: 'not_configured' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: T };

/** Runs a read-only query after mount; `reload` retries after an error. */
export function useRemote<T>(fetcher: (client: SupabaseClient) => Promise<T>) {
  const [state, setState] = useState<RemoteState<T>>(() =>
    supabaseEnv() ? { status: 'loading' } : { status: 'not_configured' },
  );
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const client = getSupabase();
    if (!client) {
      setState({ status: 'not_configured' });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    fetcher(client)
      .then((data) => {
        if (!cancelled) setState({ status: 'ready', data });
      })
      .catch((error: unknown) => {
        if (__DEV__) console.warn('Supabase query failed', error);
        if (!cancelled) setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [fetcher, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, reload };
}
