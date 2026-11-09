import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import el from '../src/i18n/el.json';
import en from '../src/i18n/en.json';
import { createTranslate, isLocale, translate } from '../src/i18n/messages';

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('messages', () => {
  it('el and en have exactly the same keys', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(el).sort());
  });

  it('no message is empty and placeholders match across languages', () => {
    for (const [key, greek] of Object.entries(el)) {
      const english = (en as Record<string, string>)[key] ?? '';
      expect(greek.trim(), `el ${key}`).not.toBe('');
      expect(english.trim(), `en ${key}`).not.toBe('');
      expect(placeholders(english), key).toEqual(placeholders(greek));
    }
  });

  it('fills placeholders and defaults to Greek', () => {
    expect(translate('en', 'stores.hours', { open: '08:00', close: '19:00' })).toBe('08:00–19:00');
    expect(createTranslate('el')('nav.stores')).toBe('Καταστήματα');
    expect(translate('el', 'console.maxAmount', { max: '80,00 €' })).toBe('Έως 80,00 €');
  });

  it('recognises supported locales only', () => {
    expect(isLocale('el')).toBe(true);
    expect(isLocale('en')).toBe(true);
    expect(isLocale('fr')).toBe(false);
    expect(isLocale(null)).toBe(false);
  });
});

describe('copy deck §f1 (console labels)', () => {
  const deck = readFileSync(new URL('../../../docs/copy-deck.md', import.meta.url), 'utf8');
  const section = deck.split('### f1. Console labels')[1]?.split('### f2.')[0] ?? '';
  const rows = [...section.matchAll(/^\| `([^`]+)` \| (.*?) \| (.*?) \|\s*$/gm)].map((m) => ({
    key: m[1]!,
    el: m[2]!,
    en: m[3]!,
  }));

  it('finds the table', () => {
    expect(rows.length).toBeGreaterThan(20);
  });

  it('every deck key is in el.json and en.json with the deck text', () => {
    for (const row of rows) {
      expect((el as Record<string, string>)[row.key], `el ${row.key}`).toBe(row.el);
      expect((en as Record<string, string>)[row.key], `en ${row.key}`).toBe(row.en);
    }
  });
});
