import type { TierId } from '@overoll/core';
import { storeAccess } from './internal/access.js';
import { loadBrand } from './internal/brand.js';
import * as input from './internal/input.js';
import { memberBalance, memberFromToken } from './internal/members.js';
import { type Db, type Result, fail } from './result.js';

export interface ResolveMemberTokenInput {
  /** The store device (or manager / HQ / platform admin) scanning. */
  callerUserId: string;
  storeId: string;
  /** What the scanner read: OC1.<code>.<otp> (app) or OCW.<code>.<version>.<sig> (Wallet). */
  token: string;
  now?: Date;
}

export type ResolveMemberTokenError =
  | 'invalid_input'
  | 'forbidden'
  | 'invalid_token'
  | 'expired_token'
  | 'old_pass'
  | 'member_not_found';

export interface ResolvedMember {
  memberId: string;
  memberCode: string;
  firstName: string;
  tier: TierId;
  balance: number;
}

export type ResolveMemberTokenResult = Result<ResolvedMember, ResolveMemberTokenError>;

/** Staff scan a member QR: who is this, what tier, how many points. Reads only. */
export async function resolveMemberToken(sql: Db, raw: ResolveMemberTokenInput): Promise<ResolveMemberTokenResult> {
  const parsed = input.parseInput(() => ({
    callerUserId: input.uuid(raw.callerUserId, 'callerUserId'),
    storeId: input.uuid(raw.storeId, 'storeId'),
    token: input.text(raw.token, 'token', 200),
    now: input.now(raw.now),
  }));
  if ('failure' in parsed) return parsed.failure;
  const i = parsed.input;

  return sql.begin(async (tx): Promise<ResolveMemberTokenResult> => {
    const access = await storeAccess(tx, i.callerUserId, i.storeId);
    if (!access || !(access.device || access.manager || access.hq || access.platform)) return fail('forbidden');
    const brand = await loadBrand(tx, access.brandId);

    const found = await memberFromToken(tx, brand.id, i.token, i.now, brand.config);
    if (!found.ok) return found;
    const [member] = await tx<{ member_code: string; first_name: string; tier: TierId }[]>`
      select member_code, first_name, tier from public.members where id = ${found.memberId}
    `;
    if (!member) return fail('member_not_found');
    return {
      ok: true,
      memberId: found.memberId,
      memberCode: member.member_code,
      firstName: member.first_name,
      tier: member.tier,
      balance: await memberBalance(tx, found.memberId),
    };
  });
}
