'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type LoadState<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T };

/**
 * Runs `load` in the browser whenever `key` changes, and again on `reload()`
 * (after a write). A slower earlier answer never overwrites a newer one.
 */
export function useLoad<T>(load: () => Promise<T>, key: string): LoadState<T> & { reload(): void } {
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' });
  const [round, setRound] = useState(0);
  const latest = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    const ticket = ++latest.current;
    void loadRef
      .current()
      .then((data) => {
        if (ticket === latest.current) setState({ status: 'ready', data });
      })
      .catch((error: unknown) => {
        console.error('back office load failed', error);
        if (ticket === latest.current) setState({ status: 'error' });
      });
  }, [key, round]);

  const reload = useCallback(() => setRound((n) => n + 1), []);
  return { ...state, reload };
}
