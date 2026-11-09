import type postgres from 'postgres';
import { type Failure, type Tx, fail } from '../result.js';

export interface IdempotencyScope {
  brandId: string;
  key: string;
  operation: string;
  actorUserId: string;
  /** The request without secrets (PINs, tokens); a reused key must match it. */
  request: Record<string, string | number | boolean | null>;
  now: Date;
}

/**
 * Run `work` at most once per (brand, key). The key is locked for the rest of
 * the transaction (a concurrent retry waits, then sees the stored result).
 * A successful result is stored with the writes it made; a retry returns it
 * unchanged. Failures are not stored: they wrote nothing, so a retry simply
 * runs again.
 */
export async function idempotent<R extends { ok: boolean }>(
  tx: Tx,
  scope: IdempotencyScope,
  work: () => Promise<R>,
): Promise<R | Failure<'idempotency_conflict'>> {
  const fingerprint = JSON.stringify(scope.request);
  await tx`select pg_advisory_xact_lock(hashtextextended(${`idempotency:${scope.brandId}:${scope.key}`}, 0))`;
  const [stored] = await tx<
    { operation: string; actor_user_id: string | null; fingerprint: string; result: R }[]
  >`
    select operation, actor_user_id, fingerprint, result
    from private.idempotency_keys
    where brand_id = ${scope.brandId} and key = ${scope.key}
  `;
  if (stored) {
    if (
      stored.operation !== scope.operation ||
      stored.actor_user_id !== scope.actorUserId ||
      stored.fingerprint !== fingerprint
    ) {
      return fail('idempotency_conflict', 'This idempotency key was already used for a different request');
    }
    return stored.result;
  }
  const result = await work();
  if (result.ok) {
    await tx`
      insert into private.idempotency_keys (brand_id, key, operation, actor_user_id, fingerprint, result, created_at)
      values (${scope.brandId}, ${scope.key}, ${scope.operation}, ${scope.actorUserId}, ${fingerprint},
        ${tx.json(result as unknown as postgres.JSONValue)}, ${scope.now})
    `;
  }
  return result;
}

/** Ledger idempotency keys are namespaced by operation so client keys can't collide with job keys. */
export const ledgerKey = (operation: string, key: string): string => `${operation}:${key}`;
