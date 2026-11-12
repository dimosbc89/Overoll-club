import { brand } from '../brand';
import { koalaArt } from '../brand/koalaArt';
import type { AccentColor } from '../brand/types';

/** Each v2 brand's illustration set (src/brand/<brand>Art.ts), by brand slug. */
const sets: Record<string, Record<string, { viewBox: string; body: string }>> = { koala: koalaArt };

export const art = sets[brand.slug] ?? {};

/** The illustration of a reward: its own `icon`, else one for its category, else the brand's fallback. */
export function rewardArt(reward: { icon?: string | null; category?: string | null }): string {
  const v2 = brand.v2;
  if (!v2) return '';
  if (reward.icon && art[reward.icon]) return reward.icon;
  const byCategory = reward.category ? v2.art.byCategory[reward.category] : undefined;
  return byCategory && art[byCategory] ? byCategory : v2.art.fallback;
}

/** Tile colour behind an illustration. */
export function artTile(name: string): AccentColor {
  return brand.v2?.art.tile[name] ?? 'sun';
}

/** The welcome gift's illustration. */
export function giftArt(): string {
  return brand.v2?.art.gift ?? '';
}
