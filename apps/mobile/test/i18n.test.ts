import { describe, expect, it } from 'vitest';

import deckText from '../../../docs/copy-deck.md?raw';
import el from '../src/i18n/el.json';
import en from '../src/i18n/en.json';
import { createTranslate, isLocale, pluralKey, translate } from '../src/i18n/messages';

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

/** Rows `| \`key\` | Ελληνικά | English |` of docs/copy-deck.md. */
function copyDeck(): Map<string, { el: string; en: string }> {
  const rows = new Map<string, { el: string; en: string }>();
  for (const line of deckText.split('\n')) {
    if (!line.startsWith('| `')) continue;
    const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split(' | ').map((c: string) => c.trim());
    const key = /^`([^`]+)`/.exec(cells[0] ?? '')?.[1];
    if (key && cells.length >= 3) rows.set(key, { el: cells[1]!, en: cells[2]! });
  }
  return rows;
}

/** App keys from before the copy deck (its rule: they keep their current text). */
const preDeckKeys = new Set([
  'brand.wordmark', 'meta.pageTitle', 'tabs.card', 'tabs.rewards', 'tabs.stores', 'tabs.profile',
  'card.points', 'card.pointsA11y', 'rewards.title', 'rewards.intro', 'rewards.cost', 'rewards.empty',
  'stores.title', 'stores.today', 'stores.closedToday', 'stores.hoursUnknown', 'stores.openMapsHint', 'stores.empty',
  'profile.title', 'profile.language', 'language.el', 'language.en',
  'state.loading', 'state.notConfiguredTitle', 'state.notConfiguredBody', 'state.errorTitle', 'state.errorBody', 'state.retry',
]);

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

  it('uses the copy deck texts word for word, and every new key is in the deck', () => {
    const deck = copyDeck();
    for (const key of Object.keys(el) as (keyof typeof el)[]) {
      const row = deck.get(key);
      if (!row) {
        expect(preDeckKeys.has(key), `${key} is missing from docs/copy-deck.md`).toBe(true);
        continue;
      }
      expect(el[key], `el ${key}`).toBe(row.el);
      expect(en[key], `en ${key}`).toBe(row.en);
    }
  });

  it('has no emoji', () => {
    for (const text of [...Object.values(el), ...Object.values(en)]) {
      expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it('fills placeholders and defaults to Greek', () => {
    expect(translate('en', 'rewards.cost', { points: 350 })).toBe('350 points');
    expect(createTranslate('el')('tabs.card')).toBe('Κάρτα');
    expect(translate('el', 'stores.today', { open: '08:00', close: '19:00' })).toBe('Σήμερα 08:00–19:00');
  });

  it('fills shared placeholders from defaults, params win', () => {
    const t = createTranslate('el', { programName: 'Overoll Club' });
    expect(t('join.welcome.title')).toBe('Καλώς ήρθες στο Overoll Club!');
    expect(t('join.welcome.title', { programName: 'Overoll Παρέα' })).toBe('Καλώς ήρθες στο Overoll Παρέα!');
  });

  it('picks .one for exactly 1', () => {
    expect(pluralKey('card.nextReward', 1)).toBe('card.nextReward.one');
    expect(pluralKey('card.nextReward', 60)).toBe('card.nextReward.other');
    expect(pluralKey('rewards.balance', 0)).toBe('rewards.balance.other');
    expect(translate('el', pluralKey('rewards.balance', 1))).toBe('Έχεις 1 πόντο');
  });

  it('never greets by name in Greek (vocative, copy deck notes)', () => {
    expect(translate('el', 'card.hello', { firstName: 'Νίκος' })).toBe('Νίκος');
    expect(translate('en', 'card.hello', { firstName: 'Nikos' })).toBe('Hello, Nikos');
  });

  it('recognises supported locales only', () => {
    expect(isLocale('el')).toBe(true);
    expect(isLocale('en')).toBe(true);
    expect(isLocale('fr')).toBe(false);
    expect(isLocale(null)).toBe(false);
  });
});
