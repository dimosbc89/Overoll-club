import { describe, expect, it } from 'vitest';
import {
  addMonthsUtc,
  arePointsExpired,
  defaultConfig as config,
  expiryReminderDue,
  nextRewardProgress,
  pointsExpireAt,
  qualifyingTier,
  rewardBaseCost,
  rewardCostForTier,
  tierAfterAnnualReview,
  latestTierReview,
  nextTierReview,
  isTierReviewDue,
  tierAfterEarn,
  tierProgress,
} from '../src/index.js';

describe('tiers', () => {
  it('qualifies by points earned in the last 12 months', () => {
    expect(qualifyingTier(0, config)).toBe('classic');
    expect(qualifyingTier(1499, config)).toBe('classic');
    expect(qualifyingTier(1500, config)).toBe('gold');
    expect(qualifyingTier(4000, config)).toBe('club');
  });

  it('moves up instantly and never down after an earn', () => {
    expect(tierAfterEarn('classic', 1500, config)).toBe('gold');
    expect(tierAfterEarn('club', 10, config)).toBe('club');
  });

  it('drops at most one level at the annual review', () => {
    expect(tierAfterAnnualReview('club', 0, config)).toBe('gold');
    expect(tierAfterAnnualReview('gold', 0, config)).toBe('classic');
    expect(tierAfterAnnualReview('gold', 5000, config)).toBe('club');
    expect(tierAfterAnnualReview('club', 4200, config)).toBe('club');
  });

  it('reports progress to the next tier', () => {
    expect(tierProgress('classic', 1200, config)).toEqual({ current: 'classic', next: 'gold', pointsToNext: 300 });
    expect(tierProgress('club', 9000, config)).toEqual({ current: 'club', next: null, pointsToNext: 0 });
  });
});

describe('reward pricing', () => {
  it('prices rewards at shelf price × 140, rounded to 50 (spec examples)', () => {
    expect(rewardBaseCost(250, config)).toBe(350);
    expect(rewardBaseCost(350, config)).toBe(500);
    expect(rewardBaseCost(10, config)).toBe(50); // never free
  });

  it('gives Gold 20% and Club 30% off, rounded to 10', () => {
    expect(rewardCostForTier(350, 'classic', config)).toBe(350);
    expect(rewardCostForTier(350, 'gold', config)).toBe(280);
    expect(rewardCostForTier(500, 'club', config)).toBe(350);
  });

  it('finds the next reward the member can work towards', () => {
    const catalog = [
      { id: 'espresso', baseCost: 300, active: true },
      { id: 'croissant', baseCost: 500, active: true },
      { id: 'secret-menu', baseCost: 400, active: true, minTier: 'gold' as const },
      { id: 'retired', baseCost: 350, active: false },
    ];
    expect(nextRewardProgress(120, 'classic', catalog, config)).toEqual({
      rewardId: 'espresso',
      cost: 300,
      pointsNeeded: 180,
    });
    // Classic can't see the Gold-only reward, so after espresso comes croissant.
    expect(nextRewardProgress(320, 'classic', catalog, config)?.rewardId).toBe('croissant');
    // Gold pays 320 for secret-menu (400 × 0.8) and 400 for croissant.
    expect(nextRewardProgress(300, 'gold', catalog, config)?.rewardId).toBe('secret-menu');
    expect(nextRewardProgress(1000, 'club', catalog, config)).toBeNull();
  });
});

describe('expiry', () => {
  it('adds calendar months and clamps month ends', () => {
    expect(addMonthsUtc(new Date('2026-01-31T10:00:00Z'), 1).toISOString()).toBe('2026-02-28T10:00:00.000Z');
    expect(addMonthsUtc(new Date('2027-12-15T00:00:00Z'), 12).toISOString()).toBe('2028-12-15T00:00:00.000Z');
  });

  it('expires points 12 months after the last purchase', () => {
    const last = new Date('2026-12-10T09:00:00Z');
    expect(pointsExpireAt(last, config).toISOString()).toBe('2027-12-10T09:00:00.000Z');
    expect(arePointsExpired(last, new Date('2027-12-10T08:59:59Z'), config)).toBe(false);
    expect(arePointsExpired(last, new Date('2027-12-10T09:00:00Z'), config)).toBe(true);
  });

  it('sends reminders 30 and 7 days before', () => {
    const last = new Date('2026-12-10T09:00:00Z');
    expect(expiryReminderDue(last, new Date('2027-11-10T08:00:00Z'), config)).toBe(30);
    expect(expiryReminderDue(last, new Date('2027-12-03T08:00:00Z'), config)).toBe(7);
    expect(expiryReminderDue(last, new Date('2027-11-20T08:00:00Z'), config)).toBeNull();
  });
});

describe('tier review days (join anniversaries)', () => {
  const joined = new Date('2027-01-05T09:30:00Z');

  it('none in the first year, then the latest anniversary', () => {
    expect(latestTierReview(joined, new Date('2027-12-31T00:00:00Z'))).toBeNull();
    expect(latestTierReview(joined, new Date('2028-01-05T09:30:00Z'))?.toISOString()).toBe('2028-01-05T09:30:00.000Z');
    expect(latestTierReview(joined, new Date('2030-03-01T00:00:00Z'))?.toISOString()).toBe('2030-01-05T09:30:00.000Z');
    expect(nextTierReview(joined, new Date('2027-06-01T00:00:00Z')).toISOString()).toBe('2028-01-05T09:30:00.000Z');
    expect(nextTierReview(joined, new Date('2028-01-05T09:30:00Z')).toISOString()).toBe('2029-01-05T09:30:00.000Z');
  });

  it('29 February joins are reviewed on 28 February, and on the 29th in leap years', () => {
    const leap = new Date('2028-02-29T12:00:00Z');
    expect(nextTierReview(leap, leap).toISOString()).toBe('2029-02-28T12:00:00.000Z');
    expect(latestTierReview(leap, new Date('2032-03-01T00:00:00Z'))?.toISOString()).toBe('2032-02-29T12:00:00.000Z');
  });

  it('a review is due once per anniversary', () => {
    const now = new Date('2028-01-06T00:00:00Z');
    expect(isTierReviewDue(joined, null, new Date('2027-12-01T00:00:00Z'))).toBe(false);
    expect(isTierReviewDue(joined, null, now)).toBe(true);
    expect(isTierReviewDue(joined, new Date('2028-01-05T09:30:00Z'), now)).toBe(false);
    expect(isTierReviewDue(joined, new Date('2028-01-05T09:30:00Z'), new Date('2029-01-05T09:30:00Z'))).toBe(true);
  });
});
