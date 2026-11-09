import type { TierId } from '@overoll/core';
import { storeAccess } from './internal/access.js';
import { loadBrand } from './internal/brand.js';
import * as input from './internal/input.js';
import { InputError } from './internal/input.js';
import { memberBalance, memberFromCode, memberFromToken } from './internal/members.js';
import { type Db, type Result, fail } from './result.js';

export interface ResolveMemberTokenInput {
  /** The store device (or manager / HQ / platform admin) scanning. */
  callerUserId: string;
  storeId: string;
  /**
   * What the scanner read: OC1.<code>.<otp> (app) or OCW.<code>.<version>.<sig>
   * (Wallet). Send either this or `memberCode`.
   */
  token?: string | null;
  /**
   * The member code printed under the QR, typed by the cashier when the card
   * won't scan ("ABCD 2345"; case, spaces, dashes and Greek look-alike
   * capitals don't matter, core `normalizeMemberCode`).
   */
  memberCode?: string | null;
  now?: Date;
}

export type ResolveMemberTokenError =
  | 'invalid_input'
  | 'forbidden'
  | 'invalid_token'
  | 'expired_token'
  | 'old_pass'
  | 'member_not_found'
  | 'member_deleted';

export interface ResolvedMember {
  memberId: string;
  memberCode: string;
  firstName: string;
  tier: TierId;
  balance: number;
}

export type ResolveMemberTokenResult = Result<ResolvedMember, ResolveMemberTokenError>;

function parse(raw: ResolveMemberTokenInput) {
  const hasToken = raw.token !== undefined && raw.token !== null;
  const hasCode = raw.memberCode !== undefined && raw.memberCode !== null;
  if (hasToken === hasCode) throw new InputError('Send either token or memberCode');
  const member: { token: string } | { memberCode: string } = hasToken
    ? { token: input.text(raw.token, 'token', 200) }
    : { memberCode: input.text(raw.memberCode, 'memberCode', 40) };
  return {
    callerUserId: input.uuid(raw.callerUserId, 'callerUserId'),
    storeId: input.uuid(raw.storeId, 'storeId'),
    member,
    now: input.now(raw.now),
  };
}

/**
 * Staff scan a member QR, or type the member code under it: who is this,
 * what tier, how many points. Reads only. A typed code identifies the member
 * without proof (the code is printed on the card): the console shows the
 * first name to check, and points are all it can lead to.
 */
export async function resolveMemberToken(sql: Db, raw: ResolveMemberTokenInput): Promise<ResolveMemberTokenResult> {
  const parsed = input.parseInput(() => parse(raw));
  if ('failure' in parsed) return parsed.failure;
  const i = parsed.input;

  return sql.begin(async (tx): Promise<ResolveMemberTokenResult> => {
    const access = await storeAccess(tx, i.callerUserId, i.storeId);
    if (!access || !(access.device || access.manager || access.hq || access.platform)) return fail('forbidden');
    const brand = await loadBrand(tx, access.brandId);

    const found =
      'token' in i.member
        ? await memberFromToken(tx, brand.id, i.member.token, i.now, brand.config)
        : await memberFromCode(tx, brand.id, i.member.memberCode);
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
