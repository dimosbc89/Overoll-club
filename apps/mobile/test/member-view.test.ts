import { defaultConfig } from '@grow-loyalty/core';
import { describe, expect, it } from 'vitest';

import type { GiftRow, RewardRow } from '../src/lib/data';
import { nextRewardView, nextTierView, pointsValidUntil, redeemableGift, rewardViews, welcomeBanner } from '../src/lib/memberView';

const reward = (id: string, base_cost: number, min_tier: RewardRow['min_tier'] = null): RewardRow => ({
  id,
  name_el: id,
  name_en: id,
  description_el: null,
  description_en: null,
  base_cost,
  min_tier,
  sort_order: 0,
  category: null,
  icon: null,
});

const catalog = [reward('espresso', 300), reward('coffee', 400), reward('box', 1950), reward('gold-only', 500, 'gold')];

describe('next reward', () => {
  it('points to the cheapest reward not yet affordable (core nextRewardProgress)', () => {
    const view = nextRewardView(240, 'classic', catalog, defaultConfig);
    expect(view).toMatchObject({ kind: 'progress', cost: 300, pointsNeeded: 60 });
    if (view.kind === 'progress') expect(view.reward.id).toBe('espresso');
  });

  it('uses the tier price', () => {
    // Gold pays 20% less: espresso 240, coffee 320.
    expect(nextRewardView(250, 'gold', catalog, defaultConfig)).toMatchObject({ kind: 'progress', cost: 320, pointsNeeded: 70 });
  });

  it('says "ready" when everything left is affordable, "none" without rewards', () => {
    expect(nextRewardView(5000, 'classic', catalog, defaultConfig)).toEqual({ kind: 'ready' });
    expect(nextRewardView(100, 'classic', [], defaultConfig)).toEqual({ kind: 'none' });
  });
});

describe('reward list', () => {
  it('shows tier costs, "x to go" and tier limits', () => {
    const views = rewardViews(400, 'classic', catalog, defaultConfig);
    expect(views.map((v) => [v.reward.id, v.cost, v.canHave, v.toGo, v.lockedTier])).toEqual([
      ['espresso', 300, true, 0, null],
      ['coffee', 400, true, 0, null],
      ['box', 1950, false, 1550, null],
      ['gold-only', 500, false, 100, 'gold'],
    ]);
    const club = rewardViews(400, 'club', catalog, defaultConfig);
    expect(club.map((v) => [v.cost, v.discounted])).toEqual([
      [210, true],
      [280, true],
      [1370, true],
      [350, true],
    ]);
    expect(club[3]!.canHave).toBe(true);
  });
});

describe('next tier', () => {
  it('counts points earned in 12 months towards the next tier', () => {
    expect(nextTierView('classic', 900, defaultConfig)).toEqual({ kind: 'progress', next: 'gold', pointsToNext: 600, earned: 900, threshold: 1500 });
    expect(nextTierView('gold', 1500, defaultConfig)).toMatchObject({ next: 'club', pointsToNext: 2500 });
    expect(nextTierView('club', 9000, defaultConfig)).toEqual({ kind: 'top' });
  });
});

describe('welcome banner', () => {
  const now = new Date('2026-12-10T10:00:00Z');
  const gift = (status: GiftRow['status'], expires_at = '2027-01-08T10:00:00Z'): GiftRow => ({
    id: 'g1',
    kind: 'welcome',
    reward_id: 'butter-croissant',
    unlocked_at: '2026-12-09T10:00:00Z',
    expires_at,
    status,
  });

  it('is "ready" while the gift can be redeemed', () => {
    expect(welcomeBanner([gift('available')], true, now)).toBe('ready');
  });

  it('is "locked" before the first purchase, also while the gifts table is missing', () => {
    expect(welcomeBanner([], false, now)).toBe('locked');
    expect(welcomeBanner(null, false, now)).toBe('locked');
  });

  it('is not offered again while its code is the active one', () => {
    const active = { id: 'x', code: 'K7MP2QXH', reward_id: 'butter-croissant', points_spent: 0, status: 'pending' as const, created_at: '', expires_at: '', gift_id: 'g1' };
    expect(redeemableGift([gift('available')], active, now)).toBeNull();
    expect(welcomeBanner([gift('available')], true, now, active)).toBeNull();
    expect(redeemableGift([gift('available')], { ...active, gift_id: null }, now)?.id).toBe('g1');
  });

  it('disappears once used or expired, or when we cannot tell', () => {
    expect(welcomeBanner([gift('redeemed')], true, now)).toBeNull();
    expect(welcomeBanner([gift('available', '2026-12-01T00:00:00Z')], true, now)).toBeNull();
    expect(welcomeBanner(null, true, now)).toBeNull();
  });
});

describe('points expiry line', () => {
  it('is 12 months after the last purchase, only with points', () => {
    expect(pointsValidUntil('2026-11-09T10:00:00Z', 80, defaultConfig)?.toISOString()).toBe('2027-11-09T10:00:00.000Z');
    expect(pointsValidUntil('2026-11-09T10:00:00Z', 0, defaultConfig)).toBeNull();
    expect(pointsValidUntil(null, 80, defaultConfig)).toBeNull();
  });
});
