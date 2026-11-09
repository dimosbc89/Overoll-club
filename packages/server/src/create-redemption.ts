import {
  type TierId,
  giftStatusAt,
  isTierAtLeast,
  redemptionCodeFromBytes,
  redemptionCodeLength,
  redemptionExpiresAt,
  rewardCostForTier,
} from '@overoll/core';
import { audit } from './internal/audit.js';
import { type Brand, loadBrand } from './internal/brand.js';
import { expireGift, lockGift } from './internal/gifts.js';
import { idempotent, ledgerKey } from './internal/idempotency.js';
import * as input from './internal/input.js';
import { InputError } from './internal/input.js';
import { type LockedMember, lockMember, memberBalance } from './internal/members.js';
import { type Db, type Result, type Tx, fail } from './result.js';

export interface CreateRedemptionInput {
  /** The member's own signed-in user. */
  callerUserId: string;
  memberId: string;
  /** A reward bought with points. Send either this or `giftId`. */
  rewardId?: string | null;
  /** One of the member's gifts (`member_gifts.id`, e.g. the welcome croissant): 0 points. */
  giftId?: string | null;
  idempotencyKey: string;
  now?: Date;
}

export type CreateRedemptionError =
  | 'invalid_input'
  | 'idempotency_conflict'
  | 'forbidden'
  | 'member_not_found'
  | 'member_deleted'
  | 'reward_not_found'
  | 'reward_unavailable'
  | 'tier_too_low'
  | 'insufficient_points'
  | 'gift_not_found'
  | 'gift_used'
  | 'gift_expired';

export interface CreatedRedemption {
  redemptionId: string;
  /** 8 characters to show at the till. */
  code: string;
  rewardId: string;
  /** The welcome gift this code redeems; null for a reward bought with points. */
  giftId: string | null;
  /** 0 for a gift. */
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

function parse(raw: CreateRedemptionInput) {
  const hasReward = raw.rewardId !== undefined && raw.rewardId !== null;
  const hasGift = raw.giftId !== undefined && raw.giftId !== null;
  if (hasReward === hasGift) throw new InputError('Send either rewardId or giftId');
  const target: { rewardId: string } | { giftId: string } = hasReward
    ? { rewardId: input.uuid(raw.rewardId, 'rewardId') }
    : { giftId: input.uuid(raw.giftId, 'giftId') };
  return {
    callerUserId: input.uuid(raw.callerUserId, 'callerUserId'),
    memberId: input.uuid(raw.memberId, 'memberId'),
    target,
    idempotencyKey: input.idempotencyKey(raw.idempotencyKey),
    now: input.now(raw.now),
  };
}

/** Insert a pending code with a fresh random code (retried on the rare clash). */
async function insertCode(
  tx: Tx,
  row: { brandId: string; memberId: string; rewardId: string; giftId: string | null; pointsSpent: number; now: Date; expiresAt: Date },
): Promise<{ id: string; code: string }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const [redemption] = await tx<{ id: string; code: string }[]>`
      insert into public.redemptions (brand_id, member_id, reward_id, gift_id, code, points_spent, status, created_at, expires_at)
      values (${row.brandId}, ${row.memberId}, ${row.rewardId}, ${row.giftId}, ${newCode()}, ${row.pointsSpent}, 'pending',
        ${row.now}, ${row.expiresAt})
      on conflict (brand_id, code) do nothing
      returning id, code
    `;
    if (redemption) return redemption;
  }
  throw new Error('Could not find a free redemption code');
}

/**
 * The member picks a reward: points are taken now (tier discount from core)
 * and a single-use code is created, valid for `redemptionValidMinutes`.
 *
 * With `giftId` instead: the member's own gift, `available` and not past its
 * expiry, becomes `redeemed` and gets a code for its reward, for 0 points and
 * without a ledger entry (no tier, catalog or active check: the gift was
 * promised). Cancelling the code, or the code expiring, gives the gift back.
 */
export async function createRedemption(sql: Db, raw: CreateRedemptionInput): Promise<CreateRedemptionResult> {
  const parsed = input.parseInput(() => parse(raw));
  if ('failure' in parsed) return parsed.failure;
  const i = parsed.input;

  return sql.begin(async (tx): Promise<CreateRedemptionResult> => {
    const [owner] = await tx<{ brand_id: string; user_id: string | null; deleted_at: Date | null }[]>`
      select brand_id, user_id, deleted_at from public.members where id = ${i.memberId}
    `;
    if (!owner) return fail('member_not_found');
    if (owner.deleted_at) return fail('member_deleted');
    if (owner.user_id !== i.callerUserId) return fail('forbidden');
    const brand = await loadBrand(tx, owner.brand_id);
    const target = i.target;

    return idempotent(
      tx,
      {
        brandId: brand.id,
        key: i.idempotencyKey,
        operation: 'create_redemption',
        actorUserId: i.callerUserId,
        request: { memberId: i.memberId, ...target },
        now: i.now,
      },
      async (): Promise<CreateRedemptionResult> => {
        const member = await lockMember(tx, i.memberId);
        if (!member) return fail('member_not_found');
        // Deleted while this call waited for the member lock.
        if (member.deleted_at) return fail('member_deleted');
        if ('giftId' in target) return redeemGift(tx, brand, member, target.giftId, i);

        const [reward] = await tx<{ id: string; base_cost: number; min_tier: TierId | null; active: boolean }[]>`
          select id, base_cost, min_tier, active from public.rewards
          where id = ${target.rewardId} and brand_id = ${brand.id}
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
        const redemption = await insertCode(tx, {
          brandId: brand.id,
          memberId: member.id,
          rewardId: reward.id,
          giftId: null,
          pointsSpent: cost,
          now: i.now,
          expiresAt,
        });
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
          giftId: null,
          pointsSpent: cost,
          expiresAt: expiresAt.toISOString(),
          balance: await memberBalance(tx, member.id),
        };
      },
    );
  });
}

/** The gift branch of createRedemption, under the member lock. */
async function redeemGift(
  tx: Tx,
  brand: Brand,
  member: LockedMember,
  giftId: string,
  i: { callerUserId: string; now: Date },
): Promise<CreateRedemptionResult> {
  const brandId = brand.id;
  const gift = await lockGift(tx, giftId);
  // Someone else's gift looks the same as no gift.
  if (!gift || gift.brand_id !== brandId || gift.member_id !== member.id) return fail('gift_not_found');
  const status = giftStatusAt(gift.status, gift.expires_at, i.now);
  if (status === 'redeemed') return fail('gift_used', 'This gift already has a code, or it was used');
  if (status === 'expired') {
    // Marked at read time; the expiry job would do the same later.
    if (gift.status === 'available') await expireGift(tx, gift, i.now);
    return fail('gift_expired');
  }

  const expiresAt = redemptionExpiresAt(i.now, brand.config);
  const redemption = await insertCode(tx, {
    brandId,
    memberId: member.id,
    rewardId: gift.reward_id,
    giftId: gift.id,
    pointsSpent: 0,
    now: i.now,
    expiresAt,
  });
  await tx`update public.member_gifts set status = 'redeemed', redemption_id = ${redemption.id} where id = ${gift.id}`;
  await audit(tx, {
    brandId,
    actorUserId: i.callerUserId,
    action: 'redemption.create',
    entity: 'redemptions',
    entityId: redemption.id,
    details: { memberId: member.id, rewardId: gift.reward_id, giftId: gift.id, pointsSpent: 0, tier: member.tier },
    at: i.now,
  });
  return {
    ok: true,
    redemptionId: redemption.id,
    code: redemption.code,
    rewardId: gift.reward_id,
    giftId: gift.id,
    pointsSpent: 0,
    expiresAt: expiresAt.toISOString(),
    balance: await memberBalance(tx, member.id),
  };
}
