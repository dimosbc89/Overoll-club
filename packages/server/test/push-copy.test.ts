import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatPoints, pushTexts } from '../src/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

/** Rows `| \`push.…\` | When | Ελληνικά | English | Chars |` of docs/copy-deck.md (§d1). */
function deckRows(): Map<string, { el: string; en: string }> {
  const rows = new Map<string, { el: string; en: string }>();
  for (const line of readFileSync(join(root, 'docs/copy-deck.md'), 'utf8').split('\n')) {
    if (!line.startsWith('| `push.')) continue;
    const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split(' | ').map((c) => c.trim());
    const key = /^`([^`]+)`/.exec(cells[0] ?? '')?.[1];
    if (key) rows.set(key, { el: cells[2]!, en: cells[3]! });
  }
  return rows;
}

describe('push texts (data/copy/push.*.json, copy deck §d1)', () => {
  it('Greek and English have the same keys and placeholders', () => {
    expect(Object.keys(pushTexts.en).sort()).toEqual(Object.keys(pushTexts.el).sort());
    for (const [key, greek] of Object.entries(pushTexts.el)) {
      const english = pushTexts.en[key as keyof typeof pushTexts.en];
      expect(greek.trim(), key).not.toBe('');
      expect(placeholders(english), key).toEqual(placeholders(greek));
    }
  });

  it('match the copy deck word for word', () => {
    const deck = deckRows();
    expect([...deck.keys()].sort()).toEqual(Object.keys(pushTexts.el).sort());
    for (const [key, row] of deck) {
      expect(pushTexts.el[key as keyof typeof pushTexts.el], `el ${key}`).toBe(row.el);
      expect(pushTexts.en[key as keyof typeof pushTexts.en], `en ${key}`).toBe(row.en);
    }
  });

  it('have no emoji', () => {
    for (const text of [...Object.values(pushTexts.el), ...Object.values(pushTexts.en)]) {
      expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it('stay within 100 characters with long values, and format points the local way', () => {
    const long = { points: '80', balance: '1.250', store: 'Overoll Νέα Ερυθραία', reward: 'Espresso ή διπλός ελληνικός', tier: 'Eucalyptus', morePct: '50', fewerPct: '30', days: '30', months: '12' };
    for (const text of [...Object.values(pushTexts.el), ...Object.values(pushTexts.en)]) {
      expect(text.replace(/\{(\w+)\}/g, (_, k: string) => long[k as keyof typeof long]).length, text).toBeLessThanOrEqual(100);
    }
    expect(formatPoints(1564, 'el')).toBe('1.564');
    expect(formatPoints(1564, 'en')).toBe('1,564');
  });
});
