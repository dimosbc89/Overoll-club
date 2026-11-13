import { describe, expect, it } from 'vitest';
import {
  type CatalogReward,
  defaultConfig as config,
  earnNotice,
  isPushToken,
  resolveConfig,
} from '../src/index.js';

// Base costs: 350 (espresso), 500 (cappuccino), 1000 (pie, gold and above).
const catalog: CatalogReward[] = [
  { id: 'espresso', baseCost: 350, active: true },
  { id: 'cappuccino', baseCost: 500, active: true },
  { id: 'pie', baseCost: 1000, active: true, minTier: 'gold' },
  { id: 'old', baseCost: 100, active: false },
];
const base = { tierBefore: 'classic' as const, tierAfter: 'classic' as const, welcomeGiftUnlocked: false, catalog };

describe('earnNotice (push after points at the till)', () => {
  it('says only the points when no new reward is within reach', () => {
    expect(earnNotice({ ...base, points: 40, balanceAfter: 200 }, config)).toEqual({ kind: 'points' });
    // Already affordable before this purchase: nothing new.
    expect(earnNotice({ ...base, points: 40, balanceAfter: 440 }, config)).toEqual({ kind: 'points' });
  });

  it('announces the dearest reward the purchase made affordable', () => {
    expect(earnNotice({ ...base, points: 60, balanceAfter: 360 }, config)).toEqual({
      kind: 'reward_ready',
      rewardId: 'espresso',
      cost: 350,
    });
    expect(earnNotice({ ...base, points: 300, balanceAfter: 520 }, config)).toEqual({
      kind: 'reward_ready',
      rewardId: 'cappuccino',
      cost: 500,
    });
  });

  it('ignores inactive rewards and rewards above the member’s tier', () => {
    expect(earnNotice({ ...base, points: 900, balanceAfter: 1100 }, config)).toEqual({
      kind: 'reward_ready',
      rewardId: 'cappuccino',
      cost: 500,
    });
  });

  it('puts the welcome gift first, then a new tier', () => {
    expect(earnNotice({ ...base, points: 60, balanceAfter: 360, welcomeGiftUnlocked: true }, config)).toEqual({
      kind: 'welcome_gift',
    });
    expect(earnNotice({ ...base, tierAfter: 'gold', points: 60, balanceAfter: 360 }, config)).toEqual({
      kind: 'tier_up',
      tier: 'gold',
    });
  });

  it('prices rewards at the new tier after a tier change it does not announce', () => {
    // Gold pays 20% fewer points: the pie costs 800 at gold.
    const n = earnNotice({ ...base, tierBefore: 'gold', tierAfter: 'gold', points: 100, balanceAfter: 820 }, config);
    expect(n).toEqual({ kind: 'reward_ready', rewardId: 'pie', cost: 800 });
  });
});

describe('push tokens and settings', () => {
  it('accepts Expo push tokens only', () => {
    expect(isPushToken('ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]')).toBe(true);
    expect(isPushToken('ExpoPushToken[abcDEF123_-abc]')).toBe(true);
    expect(isPushToken('ExponentPushToken[short]')).toBe(false);
    expect(isPushToken('fcm-token-abc')).toBe(false);
    expect(isPushToken(42)).toBe(false);
  });

  it('holds "points added" for a minute by default, configurable per brand', () => {
    expect(config.notifications.earnDelaySeconds).toBe(60);
    expect(resolveConfig({ notifications: { earnDelaySeconds: 0 } }).notifications.earnDelaySeconds).toBe(0);
    expect(() => resolveConfig({ notifications: { earnDelaySeconds: -1 } })).toThrow(/earnDelaySeconds/);
    expect(() => resolveConfig({ notifications: { other: 1 } })).toThrow(/unknown setting/);
  });
});
