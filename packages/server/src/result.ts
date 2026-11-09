import type { EarnLimitError, PurchaseError } from '@overoll/core';
import type postgres from 'postgres';

/**
 * A postgres.js v3 instance created without `types` or `transform` options
 * (rows come back with snake_case columns, int8 as string), connected with a
 * role that bypasses row-level security (the service role). Every operation
 * checks the caller's rights itself.
 */
export type Db = postgres.Sql<{}>;
export type Tx = postgres.TransactionSql<{}>;

/** Every expected business failure an operation can return. */
export type ErrorCode =
  // input and retries
  | 'invalid_input'
  | 'idempotency_conflict'
  // who is calling
  | 'forbidden'
  | 'store_inactive'
  | 'employee_not_found'
  | 'employee_required'
  | 'bad_pin'
  | 'pin_locked'
  // joining
  | 'brand_not_found'
  | 'store_not_found'
  | 'referral_not_found'
  | 'email_taken'
  | 'phone_taken'
  | 'member_deleted'
  // member QR
  | 'member_not_found'
  | 'invalid_token'
  | 'expired_token'
  | 'old_pass'
  // earning (amount and fraud limits come from @overoll/core)
  | PurchaseError
  | 'amount_too_small'
  | EarnLimitError
  | 'receipt_already_used'
  // undo
  | 'not_found'
  | 'not_undoable'
  | 'already_undone'
  | 'undo_window_passed'
  // rewards and redemption codes
  | 'reward_not_found'
  | 'reward_unavailable'
  | 'tier_too_low'
  | 'insufficient_points'
  | 'already_used'
  | 'cancelled'
  | 'expired'
  // gifts (welcome croissant)
  | 'gift_not_found'
  | 'gift_used'
  | 'gift_expired';

export interface Failure<C extends ErrorCode = ErrorCode> {
  ok: false;
  code: C;
  message?: string;
}

/** `{ ok: true, ...data }` or a typed failure. Successful results are plain JSON. */
export type Result<T extends object, C extends ErrorCode> = ({ ok: true } & T) | Failure<C>;

export function fail<C extends ErrorCode>(code: C, message?: string): Failure<C> {
  return message === undefined ? { ok: false, code } : { ok: false, code, message };
}
