import { defaultConfig, rewardCostForTier, type ProgramConfig } from '@grow-loyalty/core';

export interface RewardCosts {
  classic: number;
  gold: number;
  club: number;
}

/**
 * Point cost of a reward for each tier. The rule lives in packages/core;
 * this only applies it. TODO: merge the brand's `config` overrides once core
 * exposes a helper for that.
 */
export function rewardCosts(baseCost: number, config: ProgramConfig = defaultConfig): RewardCosts {
  return {
    classic: rewardCostForTier(baseCost, 'classic', config),
    gold: rewardCostForTier(baseCost, 'gold', config),
    club: rewardCostForTier(baseCost, 'club', config),
  };
}
