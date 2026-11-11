import { describe, expect, it } from 'vitest';

import { brands, resolveBrand } from '../src/brand';
import type { BrandColors } from '../src/brand/types';
import el from '../src/i18n/el.json';

/** WCAG relative luminance contrast of two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(bl!);
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** [text colour, background, minimum ratio]: every pair the screens draw (logos are exempt, WCAG 1.4.3). */
const pairs: [keyof BrandColors, keyof BrandColors, number][] = [
  ['text', 'background', 4.5],
  ['text', 'surface', 4.5],
  ['textMuted', 'background', 4.5],
  ['textMuted', 'surface', 4.5],
  ['accent', 'background', 4.5],
  ['accent', 'surface', 4.5],
  ['onHeader', 'header', 4.5],
  ['onCard', 'card', 4.5],
  ['onGift', 'gift', 4.5],
  ['onPrimary', 'primary', 4.5],
  ['onPressed', 'pressed', 4.5],
  ['outline', 'background', 3],
  ['outline', 'surface', 3],
  ['accent', 'card', 3], // progress fill on the code panel
];

const projectFiles = import.meta.glob<{ brand: string }>('../../../supabase/projects/*.json', { eager: true, import: 'default' });
const projectSlugs = Object.values(projectFiles)
  .map((p) => p.brand)
  .sort();

describe('brands', () => {
  it('one app brand for every Supabase project, and the other way round', () => {
    expect(Object.keys(brands).sort()).toEqual(projectSlugs);
    for (const [slug, b] of Object.entries(brands)) expect(b.slug).toBe(slug);
  });

  it('defaults to overoll and refuses an unknown brand', () => {
    expect(resolveBrand(undefined).slug).toBe('overoll');
    expect(resolveBrand('koala').slug).toBe('koala');
    expect(() => resolveBrand('nope')).toThrow(/Unknown brand/);
  });

  for (const b of Object.values(brands)) {
    describe(b.slug, () => {
      it.each(pairs)('%s on %s reaches %s:1', (fg, bg, min) => {
        expect(contrast(b.colors[fg], b.colors[bg])).toBeGreaterThanOrEqual(min);
      });

      it('copy overrides use known keys and keep the same placeholders', () => {
        const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
        for (const lang of ['el', 'en'] as const) {
          for (const [key, text] of Object.entries(b.copy[lang])) {
            expect(Object.keys(el), `${b.slug}.${lang}: ${key}`).toContain(key);
            const known = new Set(['programName', 'brandName', 'clubUrl', 'supportEmail', ...ph((el as Record<string, string>)[key]!)]);
            for (const name of ph(text)) expect(known, `${b.slug}.${lang}: ${key} {${name}}`).toContain(name);
          }
          expect(Object.keys(b.copy.el).sort()).toEqual(Object.keys(b.copy.en).sort());
        }
      });

      it('names its tiers in both languages or not at all', () => {
        const tierKeys = Object.keys(b.copy.el).filter((k) => k.startsWith('tiers.'));
        expect(tierKeys.length === 0 || tierKeys.length === 3).toBe(true);
      });
    });
  }
});
