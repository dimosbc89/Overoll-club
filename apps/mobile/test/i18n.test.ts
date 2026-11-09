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
    expect(translate('en', 'rewards.cost', { points: 350 })).toBe('350 points');
    expect(createTranslate('el')('tabs.card')).toBe('Κάρτα');
    expect(translate('el', 'stores.today', { open: '08:00', close: '19:00' })).toBe('Σήμερα 08:00–19:00');
  });

  it('recognises supported locales only', () => {
    expect(isLocale('el')).toBe(true);
    expect(isLocale('en')).toBe(true);
    expect(isLocale('fr')).toBe(false);
    expect(isLocale(null)).toBe(false);
  });
});
