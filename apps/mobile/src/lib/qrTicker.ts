import { createRotatingToken, type ProgramConfig } from '@grow-loyalty/core';
import { useEffect, useState } from 'react';

/** Milliseconds until the next QR time step starts (steps are aligned to the epoch, as on the server). */
export function msUntilNextStep(nowMs: number, stepSeconds: number): number {
  const step = stepSeconds * 1000;
  return step - (((nowMs % step) + step) % step);
}

/** Fire this long after a step boundary, so a timer that wakes a hair early still lands in the new step. */
const SAFETY_MS = 25;

export interface TokenTickerOptions {
  memberCode: string;
  secret: string;
  config: ProgramConfig;
  /** Called at once and at the start of every new time step. */
  onToken: (token: string) => void;
  now?: () => number;
}

/**
 * Keeps the rotating member QR current: a new core `createRotatingToken`
 * value at every `qr.stepSeconds` boundary. Needs no network, only the
 * member code and secret loaded once. Returns `stop`.
 */
export function startTokenTicker({ memberCode, secret, config, onToken, now = Date.now }: TokenTickerOptions): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let last: string | null = null;

  const tick = () => {
    if (stopped) return;
    const at = now();
    const token = createRotatingToken(memberCode, secret, new Date(at), config);
    if (token !== last) {
      last = token;
      onToken(token);
    }
    timer = setTimeout(tick, msUntilNextStep(at, config.qr.stepSeconds) + SAFETY_MS);
  };

  tick();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

/** The member QR value, refreshed every step; null until the secret is known. */
export function useRotatingToken(
  memberCode: string | null | undefined,
  secret: string | null | undefined,
  config: ProgramConfig,
): string | null {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    if (!memberCode || !secret) {
      setToken(null);
      return;
    }
    return startTokenTicker({ memberCode, secret, config, onToken: setToken });
  }, [memberCode, secret, config]);
  return token;
}
