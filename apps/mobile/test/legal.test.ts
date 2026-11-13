import { defaultConfig, resolveConfig } from '@grow-loyalty/core';
import { describe, expect, it } from 'vitest';

import { brands } from '../src/brand';
import { createTranslate } from '../src/i18n/messages';
import { privacy } from '../src/legal/privacy';
import { terms } from '../src/legal/terms';
import { fillLegal, legalValues, parseInline, parseLegal } from '../src/lib/legal';

/** The app's texts with the brand's own copy on top (as the brand's build has them). */
const tFor = (slug: string, locale: 'el' | 'en') => {
  const base = createTranslate(locale);
  const own = brands[slug]!.copy[locale];
  return ((key: string, params?: Record<string, string>) => own[key] ?? base(key as never, params)) as ReturnType<typeof createTranslate>;
};

const values = (slug: string, locale: 'el' | 'en', config = defaultConfig) =>
  legalValues({
    brand: brands[slug]!,
    config,
    locale,
    t: tFor(slug, locale),
    siteHost: 'club.koalacoffee.gr',
    supportEmail: brands[slug]!.supportEmail,
  });

describe('privacy policy and terms', () => {
  it('every placeholder of every text has a value, for every brand and language', () => {
    for (const slug of Object.keys(brands)) {
      for (const locale of ['el', 'en'] as const) {
        for (const doc of [privacy, terms]) {
          const text = fillLegal(doc[locale], values(slug, locale));
          expect(text).not.toMatch(/\{\w+\}/);
          expect(parseLegal(text).length).toBeGreaterThan(10);
        }
      }
    }
  });

  it('Greek and English have the same sections and links', () => {
    for (const doc of [privacy, terms]) {
      const shape = (locale: 'el' | 'en') => {
        const blocks = parseLegal(fillLegal(doc[locale], values('koala', locale)));
        return {
          kinds: blocks.map((b) => (b.kind === 'bullets' ? `bullets:${b.items.length}` : b.kind)),
          links: blocks.flatMap((b) => (b.kind === 'paragraph' ? [b.parts] : b.kind === 'bullets' ? b.items : [])).flat().filter((p) => p.kind === 'link').map((p) => (p.kind === 'link' ? p.href : '')),
        };
      };
      expect(shape('en')).toEqual(shape('el'));
    }
  });

  it('the terms carry the numbers of the program config', () => {
    const el = fillLegal(terms.el, values('koala', 'el')).replace(/\u00a0/g, ' ');
    expect(el).toContain('10 πόντους για κάθε 1 €');
    expect(el).toContain('έως 80 € ανά απόδειξη, έως 5 αγορές');
    expect(el).toContain('Koala: με 1.500 πόντους μέσα σε 12 μήνες. 25% περισσότεροι');
    expect(el).toContain('Eucalyptus: με 4.000 πόντους');
    expect(el).toContain('υπενθύμιση 30 και 7 μέρες πριν');
    expect(el).toContain('ισχύει 15 λεπτά');
    const changed = resolveConfig({ pointsPerEuro: 12, expiryMonths: 18 });
    const en = fillLegal(terms.en, values('overoll', 'en', changed)).replace(/\u00a0/g, ' ');
    expect(fillLegal(terms.en, values('koala', 'en'))).toContain('up to €80 per receipt');
    expect(en).toContain('You get 12 points for every €1');
    expect(en).toContain('Points expire 18 months after your last purchase');
    expect(en).toContain('Gold: at 1,500 points within 12 months');
  });

  it('names Koala\'s legal entity, in each language', () => {
    expect(fillLegal(privacy.el, values('koala', 'el'))).toContain(
      'Υπεύθυνος επεξεργασίας είναι ΔΗΜΟΓΕΡΟΝΤΑΣ ΝΙΚΟΛΑΣ (ΑΦΜ 143354407), Αγίου Δημητρίου 159, 173 43 Άγιος Δημήτριος.',
    );
    expect(fillLegal(terms.en, values('koala', 'en'))).toContain(
      'run by DIMOGERONTAS NIKOLAS (VAT EL143354407), Agiou Dimitriou 159, 173 43 Agios Dimitrios, Greece.',
    );
  });

  it('names the trade name while the company is not confirmed, the company once it is', () => {
    const koala = brands.koala!;
    const draft = legalValues({
      brand: { ...koala, legal: { ...koala.legal, company: null, address: null } },
      config: defaultConfig,
      locale: 'el',
      t: createTranslate('el'),
      siteHost: 'club.koalacoffee.gr',
      supportEmail: koala.supportEmail,
    });
    expect(fillLegal(privacy.el, draft)).toContain('Υπεύθυνος επεξεργασίας είναι Koala Coffee.');
    const confirmed = legalValues({
      brand: { ...koala, legal: { ...koala.legal, company: 'ΕΤΑΙΡΕΙΑ ΕΕ', address: 'Οδός 1, Αθήνα' } },
      config: defaultConfig,
      locale: 'el',
      t: createTranslate('el'),
      siteHost: 'club.koalacoffee.gr',
      supportEmail: koala.supportEmail,
    });
    expect(fillLegal(privacy.el, confirmed)).toContain('Υπεύθυνος επεξεργασίας είναι ΕΤΑΙΡΕΙΑ ΕΕ, Οδός 1, Αθήνα.');
  });

  it('parses bold and links, and refuses unknown placeholders', () => {
    expect(parseInline('a **b** [c](mailto:x@y.gr) d')).toEqual([
      { kind: 'text', text: 'a ' },
      { kind: 'bold', text: 'b' },
      { kind: 'text', text: ' ' },
      { kind: 'link', text: 'c', href: 'mailto:x@y.gr' },
      { kind: 'text', text: ' d' },
    ]);
    expect(() => fillLegal('{nope}', {})).toThrow(/nope/);
  });
});
