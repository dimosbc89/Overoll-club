import { type ProgramConfig, tierRule } from '@grow-loyalty/core';

import type { BrandDefinition, LegalText } from '../brand';
import type { Locale, Translate } from '../i18n/messages';
import { intlLocale } from '../i18n/messages';
import { formatEuroFromCents, formatPoints } from './format';

/**
 * Privacy policy and terms (`/privacy`, `/terms`): one template per language
 * for every brand (src/legal), filled with the brand's legal details and the
 * numbers of the program config, so a rule change in packages/core shows up
 * in the terms by itself.
 */

/** Date of the current texts (shown as "Last updated"). Change it with the texts. */
export const LEGAL_UPDATED = '2026-11-13';

const inLocale = (text: LegalText, locale: Locale): string => (typeof text === 'string' ? text : text[locale]);

export function legalValues(input: {
  brand: BrandDefinition;
  config: ProgramConfig;
  locale: Locale;
  t: Translate;
  siteHost: string;
  supportEmail: string;
}): Record<string, string> {
  const { brand, config, locale, t, siteHost, supportEmail } = input;
  const gold = tierRule(config, 'gold');
  const club = tierRule(config, 'club');
  const and = locale === 'el' ? ' και ' : ' and ';
  const days = config.expiryReminderDays;
  const [y, m, d] = LEGAL_UPDATED.split('-').map(Number) as [number, number, number];
  return {
    updated: new Intl.DateTimeFormat(locale === 'el' ? 'el-GR' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
      new Date(Date.UTC(y, m - 1, d)),
    ),
    programName: brand.programName,
    brandName: brand.brandName,
    tradeName: brand.legal.tradeName,
    controller: brand.legal.company ? inLocale(brand.legal.company, locale) : brand.legal.tradeName,
    controllerAddress: brand.legal.address ? `, ${inLocale(brand.legal.address, locale)}` : '',
    supportEmail,
    siteHost,
    siteUrl: `https://${siteHost}`,
    minimumAge: String(config.minimumAge),
    pointsPerEuro: formatPoints(config.pointsPerEuro, locale),
    maxAmount:
      config.limits.maxAmountCents % 100 === 0
        ? new Intl.NumberFormat(intlLocale[locale], { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(config.limits.maxAmountCents / 100)
        : formatEuroFromCents(config.limits.maxAmountCents, locale),
    maxEarnsPerDay: String(config.limits.maxEarnsPerDay),
    minMinutesBetweenEarns: String(Math.max(1, Math.round(config.limits.minSecondsBetweenEarns / 60))),
    expiryMonths: String(config.expiryMonths),
    reminderDays: days.length > 1 ? `${days.slice(0, -1).join(', ')}${and}${days.at(-1)}` : String(days[0] ?? ''),
    tierWindowMonths: String(config.tierWindowMonths),
    tierClassic: t('tiers.classic.name'),
    tierGold: t('tiers.gold.name'),
    tierClub: t('tiers.club.name'),
    goldThreshold: formatPoints(gold.threshold, locale),
    clubThreshold: formatPoints(club.threshold, locale),
    goldBonus: String(gold.multiplierPct - 100),
    clubBonus: String(club.multiplierPct - 100),
    goldDiscount: String(gold.rewardDiscountBp / 100),
    clubDiscount: String(club.rewardDiscountBp / 100),
    redemptionMinutes: String(config.redemptionValidMinutes),
    welcomeDays: String(config.welcome.validDays),
  };
}

/** Fills `{name}` placeholders; an unknown placeholder is a bug in the template. */
export function fillLegal(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = values[name];
    if (value === undefined) throw new Error(`Legal text: no value for {${name}}`);
    return value;
  });
}

/** Inline pieces of a paragraph or bullet: plain text, **bold**, [links](url). */
export type Inline = { kind: 'text'; text: string } | { kind: 'bold'; text: string } | { kind: 'link'; text: string; href: string };

export type LegalBlock = { kind: 'heading'; text: string } | { kind: 'paragraph'; parts: Inline[] } | { kind: 'bullets'; items: Inline[][] };

export function parseInline(text: string): Inline[] {
  const parts: Inline[] = [];
  const pattern = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const at = match.index ?? 0;
    if (at > last) parts.push({ kind: 'text', text: text.slice(last, at) });
    if (match[1] !== undefined) parts.push({ kind: 'bold', text: match[1] });
    else parts.push({ kind: 'link', text: match[2]!, href: match[3]! });
    last = at + match[0].length;
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) });
  return parts;
}

/** `## heading`, `- bullet` lines and paragraphs separated by blank lines. */
export function parseLegal(text: string): LegalBlock[] {
  const blocks: LegalBlock[] = [];
  for (const chunk of text.trim().split(/\n\s*\n/)) {
    const lines = chunk.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    if (lines.length === 1 && lines[0]!.startsWith('## ')) {
      blocks.push({ kind: 'heading', text: lines[0]!.slice(3).trim() });
    } else if (lines.every((l) => l.startsWith('- '))) {
      blocks.push({ kind: 'bullets', items: lines.map((l) => parseInline(l.slice(2).trim())) });
    } else {
      blocks.push({ kind: 'paragraph', parts: parseInline(lines.join(' ')) });
    }
  }
  return blocks;
}
