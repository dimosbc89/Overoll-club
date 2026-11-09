import {
  type TierId,
  isTierAtLeast,
  redemptionCodeFromBytes,
  redemptionCodeLength,
  redemptionExpiresAt,
  rewardCostForTier,
} from '@overoll/core';
import { audit } from './internal/audit.js';
import { loadBrand } from './internal/brand.js';
import { idempotent, ledgerKey } from './internal/idempotency.js';
import * as input from './internal/input.js';
import { lockMember, memberBalance } from './internal/members.js';
import { type Db, type Result, fail } from './result.js';

export interface CreateRedemptionInput {
  /** The member's own signed-in user. */
  callerUserId: string;
  memberId: string;
  rewardId: string;
  idempotencyKey: string;
  now?: Date;
}

export type CreateRedemptionError =
  | 'invalid_input'
  | 'idempotency_conflict'
  | 'forbidden'
  | 'member_not_found'
  | 'reward_not_found'
  | 'reward_unavailable'
  | 'tier_too_low'
  | 'insufficient_points';

export interface CreatedRedemption {
  redemptionId: string;
  /** 8 characters to show at the till. */
  code: string;
  rewardId: string;
  pointsSpent: number;
  /** ISO 8601. */
  expiresAt: string;
  balance: number;
}

export type CreateRedemptionResult = Result<CreatedRedemption, CreateRedemptionError>;

/** Random bytes from Web Crypto (Node, Deno, browsers alike). */
function newCode(): string {
  return redemptionCodeFromBytes(globalThis.crypto.getRandomValues(new Uint8Array(redemptionCodeLength)));
}

/**
 * The member picks a reward: points are taken now (tier discount from core)
 * and a single-use code is created, valid for `redemptionValidMinutes`.
 */
export async function createRedemption(sql: Db, raw: CreateRedemptionInput): Promise<CreateRedemptionResult> {
  const parsed = input.parseInput(() => ({
    callerUserId: input.uuid(raw.callerUserId, 'callerUserId'),
    memberId: input.uuid(raw.memberId, 'memberId'),
    rewardId: input.uuid(raw.rewardId, 'rewardId'),
    idempotencyKey: input.idempotencyKey(raw.idempotencyKey),
    now: input.now(raw.now),
  }));
  if ('failure' in parsed) return parsed.failure;
  const i = parsed.input;

  return sql.begin(async (tx): Promise<CreateRedemptionResult> => {
    const [owner] = await tx<{ brand_id: string; user_id: string | null; deleted_at: Date | null }[]>`
      select brand_id, user_id, deleted_at from public.members where id = ${i.memberId}
    `;
    if (!owner || owner.deleted_at) return fail('member_not_found');
    if (owner.user_id !== i.callerUserId) return fail('forbidden');
    const brand = await loadBrand(tx, owner.brand_id);

    return idempotent(
      tx,
      {
        brandId: brand.id,
        key: i.idempotencyKey,
        operation: 'create_redemption',
        actorUserId: i.callerUserId,
        request: { memberId: i.memberId, rewardId: i.rewardId },
        now: i.now,
      },
      async (): Promise<CreateRedemptionResult> => {
        const member = await lockMember(tx, i.memberId);
        if (!member) return fail('member_not_found');
        const [reward] = await tx<{ id: string; base_cost: number; min_tier: TierId | null; active: boolean }[]>`
          select id, base_cost, min_tier, active from public.rewards
          where id = ${i.rewardId} and brand_id = ${brand.id}
        `;
        if (!reward) return fail('reward_not_found');
        if (!reward.active) return fail('reward_unavailable');
        if (reward.min_tier && !isTierAtLeast(member.tier, reward.min_tier, brand.config)) {
          return fail('tier_too_low', `This reward needs ${reward.min_tier} or above`);
        }
        const cost = rewardCostForTier(reward.base_cost, member.tier, brand.config);
        const balance = await memberBalance(tx, member.id);
        if (balance < cost) return fail('insufficient_points', `Costs ${cost} points, balance is ${balance}`);

        const expiresAt = redemptionExpiresAt(i.now, brand.config);
        let redemption: { id: string; code: string } | undefined;
        for (let attempt = 0; attempt < 5 && !redemption; attempt++) {
          [redemption] = await tx<{ id: string; code: string }[]>`
            insert into public.redemptions (brand_id, member_id, reward_id, code, points_spent, status, created_at, expires_at)
            values (${brand.id}, ${member.id}, ${reward.id}, ${newCode()}, ${cost}, 'pending', ${i.now}, ${expiresAt})
            on conflict (brand_id, code) do nothing
            returning id, code
          `;
        }
        if (!redemption) throw new Error('Could not find a free redemption code');

        await tx`
          insert into public.ledger_entries (
            brand_id, member_id, kind, points, redemption_id, idempotency_key, created_by, created_at
          ) values (
            ${brand.id}, ${member.id}, 'redeem', ${-cost}, ${redemption.id},
            ${ledgerKey('redeem', i.idempotencyKey)}, ${i.callerUserId}, ${i.now}
          )
        `;
        await audit(tx, {
          brandId: brand.id,
          actorUserId: i.callerUserId,
          action: 'redemption.create',
          entity: 'redemptions',
          entityId: redemption.id,
          details: { memberId: member.id, rewardId: reward.id, pointsSpent: cost, tier: member.tier },
          at: i.now,
        });
        return {
          ok: true,
          redemptionId: redemption.id,
          code: redemption.code,
          rewardId: reward.id,
          pointsSpent: cost,
          expiresAt: expiresAt.toISOString(),
          balance: await memberBalance(tx, member.id),
        };
      },
    );
  });
}
