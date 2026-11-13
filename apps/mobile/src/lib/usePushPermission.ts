import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { enablePush, pushPermission, type PushPermission } from './push';
import { useSession } from './session';

/**
 * The phone's notification permission for Profile, checked again when the
 * app comes back (the member may have changed it in the phone's settings),
 * and the action behind "Turn on notifications". Always `unavailable` on the web.
 */
export function usePushPermission(): { permission: PushPermission; enable: () => Promise<void> } {
  const { api } = useSession();
  const [permission, setPermission] = useState<PushPermission>('unavailable');

  useEffect(() => {
    let alive = true;
    const check = () =>
      void pushPermission().then((p) => {
        if (alive) setPermission(p);
      });
    check();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);

  const enable = useCallback(async () => {
    if (api) setPermission(await enablePush(api));
  }, [api]);

  return { permission, enable };
}

/** Show "notifications are off" in Profile: the phone can have them but doesn't. */
export const pushIsOff = (permission: PushPermission): boolean => permission === 'denied' || permission === 'undetermined';
