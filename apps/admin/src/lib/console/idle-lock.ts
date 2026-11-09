import { type ProgramConfig, staffPinSessionExpired } from '@overoll/core';

export interface IdleLock {
  /** The cashier did something (tap, key press, server answer): restart the idle clock. */
  touch(): void;
  stop(): void;
}

export interface IdleLockOptions {
  config: ProgramConfig;
  /** Called at every check once the PIN session has expired (dispatching the lock twice is harmless). */
  onLock: () => void;
  /** How often to check, in ms. */
  intervalMs?: number;
  now?: () => number;
}

/**
 * Locks the till after `limits.staffPinIdleMinutes` without activity
 * (core `staffPinSessionExpired`), so the next person has to type their own PIN.
 */
export function startIdleLock({ config, onLock, intervalMs = 1000, now = Date.now }: IdleLockOptions): IdleLock {
  let lastActivity = now();
  const timer = setInterval(() => {
    if (staffPinSessionExpired(new Date(lastActivity), new Date(now()), config)) onLock();
  }, intervalMs);
  return {
    touch: () => {
      lastActivity = now();
    },
    stop: () => clearInterval(timer),
  };
}
