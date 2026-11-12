import { type ProgramConfig, resolveConfig } from '@grow-loyalty/core';
import type { Tx } from '../result.js';

export interface Brand {
  id: string;
  slug: string;
  timeZone: string;
  defaultLocale: 'el' | 'en';
  /** defaultConfig with this brand's overrides (brands.config). */
  config: ProgramConfig;
}

interface BrandRow {
  id: string;
  slug: string;
  time_zone: string;
  default_locale: 'el' | 'en';
  config: unknown;
}

const toBrand = (row: BrandRow): Brand => ({
  id: row.id,
  slug: row.slug,
  timeZone: row.time_zone,
  defaultLocale: row.default_locale,
  // An invalid brands.config throws InvalidConfigError: a setup bug, not a business failure.
  config: resolveConfig(row.config),
});

export async function loadBrand(tx: Tx, brandId: string): Promise<Brand> {
  const [row] = await tx<BrandRow[]>`
    select id, slug, time_zone, default_locale, config from public.brands where id = ${brandId}
  `;
  if (!row) throw new Error(`Brand ${brandId} not found`);
  return toBrand(row);
}

export async function findBrandBySlug(tx: Tx, slug: string): Promise<Brand | null> {
  const [row] = await tx<BrandRow[]>`
    select id, slug, time_zone, default_locale, config from public.brands where slug = ${slug}
  `;
  return row ? toBrand(row) : null;
}
