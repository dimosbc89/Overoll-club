import { type ProgramConfig, type TierId, parseToken, verifyToken } from '@overoll/core';
import { type Failure, type Tx, fail } from '../result.js';

export interface LockedMember {
  id: string;
  brand_id: string;
  user_id: string | null;
  member_code: string;
  first_name: string;
  tier: TierId;
  deleted_at: Date | null;
}

/**
 * Lock the member row for the rest of the transaction. Every operation that
 * checks limits or balances takes this lock first, so concurrent calls for
 * the same member run one after the other.
 */
export async function lockMember(tx: Tx, memberId: string): Promise<LockedMember | null> {
  const [row] = await tx<LockedMember[]>`
    select id, brand_id, user_id, member_code, first_name, tier, deleted_at
    from public.members
    where id = ${memberId}
    for update
  `;
  return row ?? null;
}

/** Current balance, from the member_balances view (sum of the ledger). */
export async function memberBalance(tx: Tx, memberId: string): Promise<number> {
  const [row] = await tx<{ balance: number }[]>`
    select balance from public.member_balances where member_id = ${memberId}
  `;
  return row?.balance ?? 0;
}

export type TokenFailure = 'invalid_token' | 'expired_token' | 'old_pass' | 'member_not_found';

/**
 * Verify a scanned member QR (rotating OC1. or Wallet OCW.) against the
 * member's secret and pass version. Members of other brands are not found.
 */
export async function memberFromToken(
  tx: Tx,
  brandId: string,
  raw: string,
  now: Date,
  config: ProgramConfig,
): Promise<{ ok: true; memberId: string } | Failure<TokenFailure>> {
  const token = parseToken(raw);
  if (!token) return fail('invalid_token');
  const [row] = await tx<{ id: string; qr_secret: string; pass_version: number }[]>`
    select m.id, s.qr_secret, s.pass_version
    from public.members m
    join public.member_secrets s on s.member_id = m.id
    where m.member_code = ${token.memberCode} and m.brand_id = ${brandId} and m.deleted_at is null
  `;
  if (!row) return fail('member_not_found');
  // The app and the Wallet pass sign with the qr_secret text as stored.
  const check = verifyToken(token, row.qr_secret, row.pass_version, now, config);
  if (check === 'invalid') return fail('invalid_token');
  if (check === 'expired') return fail('expired_token');
  if (check === 'old_pass') return fail('old_pass');
  return { ok: true, memberId: row.id };
}
