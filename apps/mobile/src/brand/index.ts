import { koala } from './koala';
import { overoll } from './overoll';
import type { BrandDefinition } from './types';

export type { BrandColors, BrandDefinition, FontWeight, LegalText, LogoShape } from './types';

export const brands: Record<string, BrandDefinition> = { overoll, koala };

/**
 * The brand this build belongs to. Expo inlines EXPO_PUBLIC_* at build time only when
 * written out literally; scripts/build-web.ts sets it from `--brand`. Default: overoll.
 */
export function resolveBrand(slug: string | undefined): BrandDefinition {
  const key = slug?.trim() || 'overoll';
  const found = brands[key];
  if (!found) throw new Error(`Unknown brand "${key}": add it to apps/mobile/src/brand`);
  return found;
}

export const brand: BrandDefinition = resolveBrand(process.env.EXPO_PUBLIC_BRAND);
