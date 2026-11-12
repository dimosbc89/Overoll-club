import type { TierId } from '@grow-loyalty/core';

/** The Wallet texts of one language (data/copy/wallet.<locale>.json). */
export interface WalletCopy {
  'label.points': string;
  'label.tier': string;
  'label.member': string;
  'label.nextReward': string;
  /** Apple writes the field's new value as %@. */
  'change.points': string;
  'change.tier': string;
  'change.nextReward': string;
  'back.howTo': string;
  'back.rewards': string;
  'back.expiry': string;
  'back.help': string;
}

export const WALLET_COPY_KEYS: readonly (keyof WalletCopy)[] = [
  'label.points',
  'label.tier',
  'label.member',
  'label.nextReward',
  'change.points',
  'change.tier',
  'change.nextReward',
  'back.howTo',
  'back.rewards',
  'back.expiry',
  'back.help',
];

export type WalletLocale = 'el' | 'en';
export const WALLET_LOCALES: readonly WalletLocale[] = ['el', 'en'];

/**
 * How one brand's pass looks and reads. Built from the brand's files at build
 * time (scripts/build-functions.ts): supabase/projects/<brand>.json,
 * data/<brand>/wallet.json and images, data/copy/wallet.*.json and the app's
 * tier names. Shared code never names a brand.
 */
export interface WalletDesign {
  slug: string;
  programName: string;
  /** The member web app, e.g. https://club.example.gr (no trailing slash). */
  siteUrl: string;
  supportEmail: string;
  colors: { background: string; foreground: string; label: string };
  tiers: Record<TierId, Record<WalletLocale, string>>;
  copy: Record<WalletLocale, WalletCopy>;
  /** Apple pass images by file name: icon.png, icon@2x.png, icon@3x.png, logo.png… */
  appleImages: Record<string, Uint8Array>;
  /** Public HTTPS URL of the square program logo for Google Wallet. */
  googleLogoUrl: string;
}

/** Fill {placeholders}; an unknown one is a bug in the copy, so it throws. */
export function fillWalletText(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = values[key];
    if (value === undefined) throw new Error(`Wallet copy: unknown placeholder {${key}}`);
    return String(value);
  });
}

/** "ABCD2345" → "ABCD 2345", as printed under the app's QR. */
export function groupMemberCode(code: string): string {
  return code.replace(/(.{4})(?=.)/g, '$1 ');
}

/** "#026852" → "rgb(2, 104, 82)" (Apple pass colours). */
export function hexToRgb(hex: string): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`Wallet design: bad colour ${hex}`);
  return `rgb(${parseInt(m[1]!, 16)}, ${parseInt(m[2]!, 16)}, ${parseInt(m[3]!, 16)})`;
}
