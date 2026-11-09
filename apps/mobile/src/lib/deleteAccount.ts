/**
 * Account deletion in the app (copy deck §b6, API `account/delete`, v0.4).
 * Pure TypeScript so the rules run in the unit tests.
 */
import type { ErrorCode } from './api';

/** Upper case, accents and outer spaces off: "διαγραφή " → "ΔΙΑΓΡΑΦΗ". */
function plainWord(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').trim().toUpperCase();
}

/**
 * Has the member typed the confirmation word (`delete.confirmWord`)? Either
 * language's word counts (ΔΙΑΓΡΑΦΗ or DELETE), in any case, with or without
 * accents.
 */
export function confirmWordMatches(typed: string, words: readonly string[]): boolean {
  const value = plainWord(typed);
  return value !== '' && words.some((word) => plainWord(word) === value);
}

/** What the screen does with the answer to `account/delete`. */
export type DeleteOutcome = 'deleted' | 'retry' | 'error';

/**
 * A success means the account is gone. After an attempt that may have reached
 * the server (no connection, server error), a retry that finds the session
 * gone (`unauthenticated`) means the first attempt deleted it.
 */
export function deleteOutcome(result: { ok: true } | { ok: false; code: ErrorCode }, earlierAttemptUnclear: boolean): DeleteOutcome {
  if (result.ok) return 'deleted';
  if (result.code === 'unauthenticated' && earlierAttemptUnclear) return 'deleted';
  return result.code === 'network_error' || result.code === 'internal_error' || result.code === 'unknown' ? 'retry' : 'error';
}
