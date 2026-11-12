/**
 * What the card and rewards screens show, computed with packages/core (the
 * one place for program rules). Pure: unit-tested without React Native.
 */
import {
  isTierAtLeast,
  nextRewardProgress,
  pointsExpireAt,
  rewardCostForTier,
  tierProgress,
  tierRule,
  type CatalogReward,
  type ProgramConfig,
  type TierId,
} from '@grow-loyalty/core';

import type { GiftRow, RedemptionRow, RewardRow } from './data';
import { availableGift } from './data';

function catalog(rewards: readonly RewardRow[]): CatalogReward[] {
  return rewards.map((r) => ({ id: r.id, baseCost: r.base_cost, minTier: r.min_tier ?? undefined, active: true }));
}

export type NextRewardView =
  | { kind: 'progress'; reward: RewardRow; cost: number; pointsNeeded: number }
  /** They can already afford a reward. */
  | { kind: 'ready' }
  /** No rewards to show (empty catalog). */
  | { kind: 'none' };

export function nextRewardView(balance: number, tier: TierId, rewards: readonly RewardRow[], config: ProgramConfig): NextRewardView {
  const next = nextRewardProgress(balance, tier, catalog(rewards), config);
  if (next) {
    const reward = rewards.find((r) => r.id === next.rewardId);
    if (reward) return { kind: 'progress', reward, cost: next.cost, pointsNeeded: next.pointsNeeded };
  }
  const affordable = rewards.some(
    (r) => (!r.min_tier || isTierAtLeast(tier, r.min_tier, config)) && rewardCostForTier(r.base_cost, tier, config) <= balance,
  );
  return affordable ? { kind: 'ready' } : { kind: 'none' };
}

export type NextTierView =
  | { kind: 'progress'; next: TierId; pointsToNext: number; earned: number; threshold: number }
  | { kind: 'top' };

export function nextTierView(tier: TierId, earned12m: number, config: ProgramConfig): NextTierView {
  const progress = tierProgress(tier, earned12m, config);
  if (!progress.next) return { kind: 'top' };
  return {
    kind: 'progress',
    next: progress.next,
    pointsToNext: progress.pointsToNext,
    earned: Math.max(0, earned12m),
    threshold: tierRule(config, progress.next).threshold,
  };
}

export interface RewardView {
  reward: RewardRow;
  /** What this member pays (tier discount applied). */
  cost: number;
  /** Classic price, shown as "instead of" when the tier pays less. */
  baseCost: number;
  discounted: boolean;
  /** Limited to a higher tier ("Gold and above"). */
  lockedTier: TierId | null;
  canHave: boolean;
  /** Points still missing (0 when they can have it). */
  toGo: number;
}

export function rewardViews(balance: number, tier: TierId, rewards: readonly RewardRow[], config: ProgramConfig): RewardView[] {
  return rewards.map((reward) => {
    const cost = rewardCostForTier(reward.base_cost, tier, config);
    const lockedTier = reward.min_tier && !isTierAtLeast(tier, reward.min_tier, config) ? reward.min_tier : null;
    return {
      reward,
      cost,
      baseCost: reward.base_cost,
      discounted: cost < reward.base_cost,
      lockedTier,
      canHave: !lockedTier && cost <= balance,
      toGo: Math.max(0, cost - balance),
    };
  });
}

/** The welcome gift to offer now: available, and not already waiting on the till as the active code. */
export function redeemableGift(gifts: GiftRow[] | null, active: RedemptionRow | null, now: Date): GiftRow | null {
  const gift = availableGift(gifts, now);
  return gift && active?.gift_id !== gift.id ? gift : null;
}

/**
 * The welcome banner on the card: `ready` when the gift can be redeemed,
 * `locked` before the first purchase, nothing once it has been used or has
 * expired (or when we can't tell).
 */
export function welcomeBanner(
  gifts: GiftRow[] | null,
  hasPurchased: boolean,
  now: Date,
  active: RedemptionRow | null = null,
): 'ready' | 'locked' | null {
  if (redeemableGift(gifts, active, now)) return 'ready';
  if (gifts && gifts.some((g) => g.kind === 'welcome')) return null;
  return hasPurchased ? null : 'locked';
}

/** "Your points are valid until …": 12 months after the last purchase (core `pointsExpireAt`). */
export function pointsValidUntil(lastPurchaseAt: string | null, balance: number, config: ProgramConfig): Date | null {
  if (!lastPurchaseAt || balance <= 0) return null;
  return pointsExpireAt(new Date(lastPurchaseAt), config);
}
