import { audit } from './internal/audit.js';
import { idempotent, ledgerKey } from './internal/idempotency.js';
import * as input from './internal/input.js';
import { lockMember, memberBalance } from './internal/members.js';
import { type Db, type Result, fail } from './result.js';

export interface CancelRedemptionInput {
  /** The member's own signed-in user. */
  callerUserId: string;
  redemptionId: string;
  idempotencyKey: string;
  now?: Date;
}

export type CancelRedemptionError =
  | 'invalid_input'
  | 'idempotency_conflict'
  | 'forbidden'
  | 'not_found'
  | 'already_used'
  | 'cancelled'
  | 'expired';

export interface CancelledRedemption {
  redemptionId: string;
  pointsRefunded: number;
  balance: number;
}

export type CancelRedemptionResult = Result<CancelledRedemption, CancelRedemptionError>;

/** The member cancels a pending code and gets the points back. */
export async function cancelRedemption(sql: Db, raw: CancelRedemptionInput): Promise<CancelRedemptionResult> {
  const parsed = input.parseInput(() => ({
    callerUserId: input.uuid(raw.callerUserId, 'callerUserId'),
    redemptionId: input.uuid(raw.redemptionId, 'redemptionId'),
    idempotencyKey: input.idempotencyKey(raw.idempotencyKey),
    now: input.now(raw.now),
  }));
  if ('failure' in parsed) return parsed.failure;
  const i = parsed.input;

  return sql.begin(async (tx): Promise<CancelRedemptionResult> => {
    const [found] = await tx<{ brand_id: string; member_id: string; user_id: string | null }[]>`
      select r.brand_id, r.member_id, m.user_id
      from public.redemptions r join public.members m on m.id = r.member_id
      where r.id = ${i.redemptionId}
    `;
    if (!found) return fail('not_found');
    if (found.user_id !== i.callerUserId) return fail('forbidden');

    return idempotent(
      tx,
      {
        brandId: found.brand_id,
        key: i.idempotencyKey,
        operation: 'cancel_redemption',
        actorUserId: i.callerUserId,
        request: { redemptionId: i.redemptionId },
        now: i.now,
      },
      async (): Promise<CancelRedemptionResult> => {
        await lockMember(tx, found.member_id);
        const [redemption] = await tx<{ status: string; points_spent: number }[]>`
          select status, points_spent from public.redemptions where id = ${i.redemptionId} for update
        `;
        if (!redemption) return fail('not_found');
        if (redemption.status === 'used') return fail('already_used');
        if (redemption.status === 'cancelled') return fail('cancelled');
        if (redemption.status === 'expired') return fail('expired', 'The code expired and the points were already returned');

        await tx`
          update public.redemptions set status = 'cancelled', cancelled_at = ${i.now} where id = ${i.redemptionId}
        `;
        await tx`
          insert into public.ledger_entries (
            brand_id, member_id, kind, points, redemption_id, idempotency_key, created_by, created_at
          ) values (
            ${found.brand_id}, ${found.member_id}, 'refund_redeem', ${redemption.points_spent}, ${i.redemptionId},
            ${ledgerKey('cancel_redemption', i.idempotencyKey)}, ${i.callerUserId}, ${i.now}
          )
        `;
        await audit(tx, {
          brandId: found.brand_id,
          actorUserId: i.callerUserId,
          action: 'redemption.cancel',
          entity: 'redemptions',
          entityId: i.redemptionId,
          details: { memberId: found.member_id, pointsRefunded: redemption.points_spent },
          at: i.now,
        });
        return {
          ok: true,
          redemptionId: i.redemptionId,
          pointsRefunded: redemption.points_spent,
          balance: await memberBalance(tx, found.member_id),
        };
      },
    );
  });
}
