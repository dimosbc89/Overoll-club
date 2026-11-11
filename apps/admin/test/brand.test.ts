import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import el from '../src/i18n/el.json';
import { brands, resolveBrand } from '../src/lib/brand';

const app = join(__dirname, '..');
const root = join(app, '../..');
const projectSlugs = readdirSync(join(root, 'supabase/projects'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.slice(0, -5))
  .sort();

describe('back office brands', () => {
  it('one brand for every Supabase project', () => {
    expect(Object.keys(brands).sort()).toEqual(projectSlugs);
    for (const [slug, b] of Object.entries(brands)) expect(b.slug).toBe(slug);
  });

  it('defaults to overoll and refuses an unknown brand', () => {
    expect(resolveBrand('').slug).toBe('overoll');
    expect(() => resolveBrand('nope')).toThrow(/Unknown brand/);
  });

  for (const b of Object.values(brands)) {
    it(`${b.slug}: logo files exist in public/ or public-brands/${b.slug}/`, () => {
      for (const file of [b.wordmark.onDark, b.wordmark.onLight]) {
        const found = existsSync(join(app, 'public', file)) || existsSync(join(app, 'public-brands', b.slug, file));
        expect(found, file).toBe(true);
      }
    });

    it(`${b.slug}: copy overrides use known keys in both languages`, () => {
      for (const lang of ['el', 'en'] as const) {
        for (const key of Object.keys(b.copy[lang])) expect(Object.keys(el), `${lang}: ${key}`).toContain(key);
      }
      expect(Object.keys(b.copy.el).sort()).toEqual(Object.keys(b.copy.en).sort());
    });

    if (b.slug !== 'overoll') {
      it(`${b.slug}: has a palette in src/app/brands.css`, async () => {
        const { readFileSync } = await import('node:fs');
        const css = readFileSync(join(app, 'src/app/brands.css'), 'utf8');
        expect(css).toContain(`html[data-brand='${b.slug}'] {`);
        expect(css).toContain(`html[data-brand='${b.slug}'] [data-console] {`);
      });
    }
  }
});
