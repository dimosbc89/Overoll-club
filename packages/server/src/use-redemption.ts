import { isRedemptionExpired, normalizeRedemptionCode } from '@overoll/core';
import { checkEmployee, storeAccess } from './internal/access.js';
import { audit } from './internal/audit.js';
import { idempotent } from './internal/idempotency.js';
import * as input from './internal/input.js';
import { lockMember } from './internal/members.js';
import { type Db, type Result, fail } from './result.js';

export interface UseRedemptionInput {
  /** The store device (or store manager) at the till. */
  callerUserId: string;
  storeId: string;
  employeeId: string;
  pin: string;
  /** Scanned or typed; case, spaces and dashes don't matter. */
  code: string;
  idempotencyKey: string;
  now?: Date;
}

export type UseRedemptionError =
  | 'invalid_input'
  | 'idempotency_conflict'
  | 'forbidden'
  | 'store_inactive'
  | 'employee_not_found'
  | 'bad_pin'
  | 'not_found'
  | 'expired'
  | 'already_used'
  | 'cancelled';

export interface UsedRedemption {
  redemptionId: string;
  memberId: string;
  memberFirstName: string;
  rewardId: string;
  rewardNameEl: string;
  rewardNameEn: string;
  pointsSpent: number;
  /** ISO 8601. */
  usedAt: string;
}

export type UseRedemptionResult = Result<UsedRedemption, UseRedemptionError>;

/**
 * Staff scan the member's code at the till: a pending, unexpired code of this
 * brand is marked used with the store and the cashier. The cashier then rings
 * the item as a 100% discount line on the POS.
 */
export async function useRedemption(sql: Db, raw: UseRedemptionInput): Promise<UseRedemptionResult> {
  const parsed = input.parseInput(() => ({
    callerUserId: input.uuid(raw.callerUserId, 'callerUserId'),
    storeId: input.uuid(raw.storeId, 'storeId'),
    employeeId: input.uuid(raw.employeeId, 'employeeId'),
    pin: input.text(raw.pin, 'pin', 72),
    code: input.text(raw.code, 'code', 40),
    idempotencyKey: input.idempotencyKey(raw.idempotencyKey),
    now: input.now(raw.now),
  }));
  if ('failure' in parsed) return parsed.failure;
  const i = parsed.input;

  return sql.begin(async (tx): Promise<UseRedemptionResult> => {
    const access = await storeAccess(tx, i.callerUserId, i.storeId);
    if (!access || !(access.device || access.manager)) return fail('forbidden');
    if (!access.storeActive) return fail('store_inactive');
    const employeeError = await checkEmployee(tx, i.storeId, i.employeeId, i.pin);
    if (employeeError) return fail(employeeError);
    const code = normalizeRedemptionCode(i.code);
    if (!code) return fail('not_found');

    return idempotent(
      tx,
      {
        brandId: access.brandId,
        key: i.idempotencyKey,
        operation: 'use_redemption',
        actorUserId: i.callerUserId,
        request: { storeId: i.storeId, employeeId: i.employeeId, code },
        now: i.now,
      },
      async (): Promise<UseRedemptionResult> => {
        const [found] = await tx<{ id: string; member_id: string }[]>`
          select id, member_id from public.redemptions where brand_id = ${access.brandId} and code = ${code}
        `;
        if (!found) return fail('not_found');
        const member = await lockMember(tx, found.member_id);
        if (!member) throw new Error(`Redemption ${found.id} has no member`);
        const [redemption] = await tx<
          { status: string; expires_at: Date; points_spent: number; reward_id: string; name_el: string; name_en: string }[]
        >`
          select r.status, r.expires_at, r.points_spent, r.reward_id, w.name_el, w.name_en
          from public.redemptions r join public.rewards w on w.id = r.reward_id
          where r.id = ${found.id}
          for update of r
        `;
        if (!redemption) throw new Error(`Redemption ${found.id} disappeared`);
        if (redemption.status === 'used') return fail('already_used');
        if (redemption.status === 'cancelled') return fail('cancelled');
        // Expired codes get their points back from expireRedemptions.
        if (redemption.status === 'expired' || isRedemptionExpired(redemption.expires_at, i.now)) return fail('expired');

        await tx`
          update public.redemptions
          set status = 'used', used_at = ${i.now}, used_store_id = ${i.storeId}, used_employee_id = ${i.employeeId}
          where id = ${found.id}
        `;
        await audit(tx, {
          brandId: access.brandId,
          actorUserId: i.callerUserId,
          employeeId: i.employeeId,
          action: 'redemption.use',
          entity: 'redemptions',
          entityId: found.id,
          details: { memberId: member.id, rewardId: redemption.reward_id, storeId: i.storeId, pointsSpent: redemption.points_spent },
          at: i.now,
        });
        return {
          ok: true,
          redemptionId: found.id,
          memberId: member.id,
          memberFirstName: member.first_name,
          rewardId: redemption.reward_id,
          rewardNameEl: redemption.name_el,
          rewardNameEn: redemption.name_en,
          pointsSpent: redemption.points_spent,
          usedAt: i.now.toISOString(),
        };
      },
    );
  });
}
