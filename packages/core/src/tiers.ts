import type { ProgramConfig, TierId, TierRule } from './config.js';

function sortedTiers(config: ProgramConfig): TierRule[] {
  return [...config.tiers].sort((a, b) => a.threshold - b.threshold);
}

/** The tier a member qualifies for with this many points earned in the last 12 months. */
export function qualifyingTier(points12m: number, config: ProgramConfig): TierId {
  let result = sortedTiers(config)[0];
  if (!result) throw new Error('No tiers configured');
  for (const tier of sortedTiers(config)) {
    if (points12m >= tier.threshold) result = tier;
  }
  return result.id;
}

function rank(id: TierId, config: ProgramConfig): number {
  const index = sortedTiers(config).findIndex((t) => t.id === id);
  if (index < 0) throw new Error(`Tier "${id}" is not configured`);
  return index;
}

/** After an earn: members move up instantly, never down. */
export function tierAfterEarn(current: TierId, points12m: number, config: ProgramConfig): TierId {
  const qualified = qualifyingTier(points12m, config);
  return rank(qualified, config) > rank(current, config) ? qualified : current;
}

/** Yearly review on the join anniversary: drop at most one level. */
export function tierAfterAnnualReview(
  current: TierId,
  points12m: number,
  config: ProgramConfig,
): TierId {
  const tiers = sortedTiers(config);
  const qualifiedRank = rank(qualifyingTier(points12m, config), config);
  const currentRank = rank(current, config);
  if (qualifiedRank >= currentRank) return tiers[qualifiedRank]!.id;
  return tiers[currentRank - 1]!.id;
}

export interface TierProgress {
  current: TierId;
  next: TierId | null;
  /** Points still needed to reach `next`; 0 when already at the top. */
  pointsToNext: number;
}

/** What the member sees on the "tiers" screen. */
export function tierProgress(current: TierId, points12m: number, config: ProgramConfig): TierProgress {
  const tiers = sortedTiers(config);
  const next = tiers[rank(current, config) + 1];
  if (!next) return { current, next: null, pointsToNext: 0 };
  return { current, next: next.id, pointsToNext: Math.max(0, next.threshold - points12m) };
}
