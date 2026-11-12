import { type ProgramConfig, type TierId, normalizeMemberCode, parseToken, verifyToken } from '@grow-loyalty/core';
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

export type TokenFailure = 'invalid_token' | 'expired_token' | 'old_pass' | 'member_not_found' | 'member_deleted';

/**
 * Verify a scanned member QR (rotating OC1. or Wallet OCW.) against the
 * member's secret and pass version. Members of other brands are not found; a
 * deleted member (no secret any more) is `member_deleted`.
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
  const [row] = await tx<{ id: string; deleted_at: Date | null; qr_secret: string | null; pass_version: number | null }[]>`
    select m.id, m.deleted_at, s.qr_secret, s.pass_version
    from public.members m
    left join public.member_secrets s on s.member_id = m.id
    where m.member_code = ${token.memberCode} and m.brand_id = ${brandId}
  `;
  if (!row) return fail('member_not_found');
  if (row.deleted_at) return fail('member_deleted');
  if (row.qr_secret === null || row.pass_version === null) return fail('member_not_found');
  // The app and the Wallet pass sign with the qr_secret text as stored.
  const check = verifyToken(token, row.qr_secret, row.pass_version, now, config);
  if (check === 'invalid') return fail('invalid_token');
  if (check === 'expired') return fail('expired_token');
  if (check === 'old_pass') return fail('old_pass');
  return { ok: true, memberId: row.id };
}

export type MemberCodeFailure = 'invalid_token' | 'member_not_found' | 'member_deleted';

/**
 * The member code typed at the till (core `normalizeMemberCode`: case,
 * spaces, dashes and Greek look-alike capitals don't matter). It only
 * identifies the member: no secret is checked, the cashier checks the name.
 * Something that can't be a member code is `invalid_token`.
 */
export async function memberFromCode(
  tx: Tx,
  brandId: string,
  raw: string,
): Promise<{ ok: true; memberId: string } | Failure<MemberCodeFailure>> {
  const code = normalizeMemberCode(raw);
  if (!code) return fail('invalid_token', 'Not a member code');
  const [row] = await tx<{ id: string; deleted_at: Date | null }[]>`
    select id, deleted_at from public.members where member_code = ${code} and brand_id = ${brandId}
  `;
  if (!row) return fail('member_not_found');
  if (row.deleted_at) return fail('member_deleted');
  return { ok: true, memberId: row.id };
}
