import { type ProgramConfig, type TierId, tierRule } from './config.js';

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/**
 * Base point cost of a reward from its shelf price.
 * cost = shelf price in € × rewardPriceFactor, rounded to the nearest rewardRoundTo.
 * €2.50 → 350, €3.50 → 500 with the default config.
 */
export function rewardBaseCost(shelfPriceCents: number, config: ProgramConfig): number {
  if (!Number.isInteger(shelfPriceCents) || shelfPriceCents <= 0) {
    throw new Error('shelfPriceCents must be a positive integer');
  }
  const raw = (shelfPriceCents * config.rewardPriceFactor) / 100;
  return Math.max(config.rewardRoundTo, roundTo(raw, config.rewardRoundTo));
}

/** What a member of a given tier pays for a reward with this base cost. */
export function rewardCostForTier(baseCost: number, tier: TierId, config: ProgramConfig): number {
  const { rewardDiscountBp } = tierRule(config, tier);
  const discounted = (baseCost * (10_000 - rewardDiscountBp)) / 10_000;
  return Math.max(config.tierCostRoundTo, roundTo(discounted, config.tierCostRoundTo));
}

export interface CatalogReward {
  id: string;
  baseCost: number;
  /** Lowest tier allowed to redeem it, if limited. */
  minTier?: TierId;
  active: boolean;
}

export interface NextRewardProgress {
  rewardId: string;
  cost: number;
  pointsNeeded: number;
}

const tierOrder: Record<TierId, number> = { classic: 0, gold: 1, club: 2 };

/**
 * The cheapest active reward the member is allowed to redeem but can't afford
 * yet: drives "120 points to your free coffee". Null when they can afford
 * every reward or none are available.
 */
export function nextRewardProgress(
  balance: number,
  tier: TierId,
  catalog: readonly CatalogReward[],
  config: ProgramConfig,
): NextRewardProgress | null {
  const candidates = catalog
    .filter((r) => r.active && (!r.minTier || tierOrder[tier] >= tierOrder[r.minTier]))
    .map((r) => ({ rewardId: r.id, cost: rewardCostForTier(r.baseCost, tier, config) }))
    .filter((r) => r.cost > balance)
    .sort((a, b) => a.cost - b.cost);
  const first = candidates[0];
  if (!first) return null;
  return { ...first, pointsNeeded: first.cost - balance };
}
