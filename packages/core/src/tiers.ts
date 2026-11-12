import type { ProgramConfig, TierId, TierRule } from './config.js';
import { addMonthsUtc } from './expiry.js';

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

/** Position of a tier counted from the lowest (0), by threshold. */
export function tierRank(id: TierId, config: ProgramConfig): number {
  const index = sortedTiers(config).findIndex((t) => t.id === id);
  if (index < 0) throw new Error(`Tier "${id}" is not configured`);
  return index;
}
const rank = tierRank;

/** Is `tier` the same as or above `minTier`? Used for rewards limited to "Gold and above". */
export function isTierAtLeast(tier: TierId, minTier: TierId, config: ProgramConfig): boolean {
  return tierRank(tier, config) >= tierRank(minTier, config);
}

/**
 * Ledger kinds that count towards tiers: earn and bonus entries, and the
 * reversals (undo) of those. Redemptions, their refunds, manual adjustments
 * and expiry do not change a member's tier progress.
 */
export const tierLedgerKinds = ['earn', 'bonus', 'reverse'] as const;

export interface LedgerPoints {
  kind: string;
  points: number;
  createdAt: Date;
}

/** Start (exclusive) of the window whose points count for tiers. */
export function tierWindowStart(now: Date, config: ProgramConfig): Date {
  return addMonthsUtc(now, -config.tierWindowMonths);
}

/**
 * Points earned for tier purposes at `now`: entries of the counted kinds
 * created after `tierWindowStart(now)` and not after `now`.
 */
export function pointsEarnedForTier(
  entries: readonly LedgerPoints[],
  now: Date,
  config: ProgramConfig,
): number {
  const from = tierWindowStart(now, config).getTime();
  const to = now.getTime();
  const kinds: readonly string[] = tierLedgerKinds;
  let total = 0;
  for (const e of entries) {
    const t = e.createdAt.getTime();
    if (t > from && t <= to && kinds.includes(e.kind)) total += e.points;
  }
  return total;
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

/**
 * Review days are the anniversaries of joining (12 calendar months apart, in
 * UTC; 29 Feb falls back to 28 Feb). The latest one at or before `now`, or
 * null in the member's first year.
 */
export function latestTierReview(joinedAt: Date, now: Date): Date | null {
  let latest: Date | null = null;
  for (let years = 1; ; years++) {
    const anniversary = addMonthsUtc(joinedAt, 12 * years);
    if (anniversary.getTime() > now.getTime()) return latest;
    latest = anniversary;
  }
}

/** The member's next review day after `now`. */
export function nextTierReview(joinedAt: Date, now: Date): Date {
  for (let years = 1; ; years++) {
    const anniversary = addMonthsUtc(joinedAt, 12 * years);
    if (anniversary.getTime() > now.getTime()) return anniversary;
  }
}

/**
 * Is a review due? Yes when an anniversary has passed that was not reviewed
 * yet (`reviewedAt` is the anniversary the last review was for).
 */
export function isTierReviewDue(joinedAt: Date, reviewedAt: Date | null, now: Date): boolean {
  const latest = latestTierReview(joinedAt, now);
  return latest !== null && (reviewedAt === null || reviewedAt.getTime() < latest.getTime());
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
