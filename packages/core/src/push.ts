import type { ProgramConfig, TierId } from './config.js';
import { type CatalogReward, rewardCostForTier } from './rewards.js';
import { isTierAtLeast } from './tiers.js';

/**
 * Push notifications: which message a purchase sends, and the limits of the
 * tokens and HQ messages the server accepts. The texts themselves live in
 * data/copy/push.<lang>.json (copy deck §m); the server fills them in.
 */

/** What to tell a member after points were added at the till, most important first. */
export type EarnNotice =
  /** This was the first purchase and it unlocked the welcome gift. */
  | { kind: 'welcome_gift' }
  /** The purchase moved the member up a tier. */
  | { kind: 'tier_up'; tier: TierId }
  /** The new balance pays for a reward the old one didn't (the dearest such reward). */
  | { kind: 'reward_ready'; rewardId: string; cost: number }
  /** Just the points. */
  | { kind: 'points' };

export interface EarnNoticeInput {
  points: number;
  balanceAfter: number;
  tierBefore: TierId;
  tierAfter: TierId;
  welcomeGiftUnlocked: boolean;
  catalog: readonly CatalogReward[];
}

export function earnNotice(input: EarnNoticeInput, config: ProgramConfig): EarnNotice {
  if (input.welcomeGiftUnlocked) return { kind: 'welcome_gift' };
  if (input.tierAfter !== input.tierBefore && isTierAtLeast(input.tierAfter, input.tierBefore, config)) {
    return { kind: 'tier_up', tier: input.tierAfter };
  }
  const balanceBefore = input.balanceAfter - input.points;
  const allowed = (r: CatalogReward, tier: TierId) => r.active && (!r.minTier || isTierAtLeast(tier, r.minTier, config));
  const ready = input.catalog
    .filter((r) => allowed(r, input.tierAfter))
    .map((r) => ({
      rewardId: r.id,
      cost: rewardCostForTier(r.baseCost, input.tierAfter, config),
      affordableBefore:
        allowed(r, input.tierBefore) && rewardCostForTier(r.baseCost, input.tierBefore, config) <= balanceBefore,
    }))
    .filter((r) => r.cost <= input.balanceAfter && !r.affordableBefore)
    .sort((a, b) => b.cost - a.cost || a.rewardId.localeCompare(b.rewardId));
  const best = ready[0];
  return best ? { kind: 'reward_ready', rewardId: best.rewardId, cost: best.cost } : { kind: 'points' };
}

/** An Expo push token as the member app registers it. */
export const pushTokenPattern = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,200}\]$/;

export function isPushToken(value: unknown): value is string {
  return typeof value === 'string' && pushTokenPattern.test(value);
}

/** HQ messages: the most a title and a text may hold (lock screens cut longer ones). */
export const pushMessageLimits = { title: 65, body: 240 } as const;
