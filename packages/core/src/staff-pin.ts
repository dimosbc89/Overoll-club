import type { ProgramConfig } from './config.js';

/**
 * PIN guessing protection for cashiers. The server stores every wrong PIN
 * (and forgets them once the right PIN is typed); these functions decide
 * whether the employee is locked. With the default config: 5 wrong PINs for
 * one employee within 15 minutes lock that employee for 15 minutes.
 *
 * - The wrong PIN that reaches `pinMaxAttempts` starts the lock (it carries
 *   `lockedUntil`). While locked, PINs are not checked at all, so they neither
 *   count nor extend the lock.
 * - After a lock, counting starts again from zero.
 * - Only wrong PINs from the last `pinLockMinutes` count.
 */

/** A wrong PIN as stored by the server; `lockedUntil` is set on the one that locked the employee. */
export interface WrongPin {
  at: Date;
  lockedUntil: Date | null;
}

const lockMs = (config: ProgramConfig): number => config.limits.pinLockMinutes * 60_000;

/** Earliest wrong PIN the functions below need to see at `now`; older ones can be left out of the query. */
export function wrongPinLookbackStart(now: Date, config: ProgramConfig): Date {
  return new Date(now.getTime() - lockMs(config));
}

/** When the lock in force at `now` ends, or null when the employee is not locked. */
export function pinLockedUntil(wrongPins: readonly WrongPin[], now: Date): Date | null {
  const t = now.getTime();
  let until: number | null = null;
  for (const w of wrongPins) {
    if (!w.lockedUntil || w.at.getTime() > t) continue;
    const end = w.lockedUntil.getTime();
    if (end > t && (until === null || end > until)) until = end;
  }
  return until === null ? null : new Date(until);
}

/** Wrong PINs that count towards a lock at `now`: from the last `pinLockMinutes`, after the last lock started. */
export function countedWrongPins(wrongPins: readonly WrongPin[], now: Date, config: ProgramConfig): number {
  const t = now.getTime();
  const from = t - lockMs(config);
  let lastLock = Number.NEGATIVE_INFINITY;
  for (const w of wrongPins) {
    const at = w.at.getTime();
    if (w.lockedUntil && at <= t && at > lastLock) lastLock = at;
  }
  return wrongPins.filter((w) => {
    const at = w.at.getTime();
    return at > from && at <= t && at > lastLock;
  }).length;
}

/**
 * One more wrong PIN at `now` (not locked at the moment): the end of the lock
 * it starts, or null when the employee may still try again.
 */
export function lockAfterWrongPin(previous: readonly WrongPin[], now: Date, config: ProgramConfig): Date | null {
  if (countedWrongPins(previous, now, config) + 1 < config.limits.pinMaxAttempts) return null;
  return new Date(now.getTime() + lockMs(config));
}

export type StaffPinProblem = 'pin_format' | 'pin_too_simple';

/**
 * Whether HQ or a store manager may give a cashier this PIN: only digits,
 * `limits.staffPinMinDigits`–`limits.staffPinMaxDigits` long, and not one any
 * colleague would guess (one repeated digit, or a run up or down such as 1234
 * or 9876). Null when the PIN is fine.
 */
export function staffPinProblem(pin: string, config: ProgramConfig): StaffPinProblem | null {
  const { staffPinMinDigits: min, staffPinMaxDigits: max } = config.limits;
  if (!/^[0-9]+$/.test(pin) || pin.length < min || pin.length > max) return 'pin_format';
  const digits = [...pin].map(Number);
  const steps = digits.slice(1).map((d, i) => d - digits[i]!);
  if (steps.every((s) => s === 0) || steps.every((s) => s === 1) || steps.every((s) => s === -1)) return 'pin_too_simple';
  return null;
}
