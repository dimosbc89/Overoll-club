import { Platform, type TextStyle, type ViewStyle } from 'react-native';

import { brand, type BrandDefinition } from '../brand';
import type { AccentColor, BrandV2 } from '../brand/types';
import { displayFont, font } from '../theme/fonts';

/**
 * Tokens of the v2 design (Figma "Koala Club — loyalty app concept": design system
 * page). Only brands with `v2` use these screens (`isV2`); every value comes from
 * the brand's definition, so the screens stay brand-neutral.
 */
export const isV2 = !!brand.v2;

function v2Of(b: BrandDefinition): BrandV2 {
  if (!b.v2) throw new Error(`Brand ${b.slug} has no v2 design`);
  return b.v2;
}

// Classic brands never render v2 screens; their tokens fall back to Koala-like
// neutrals so importing this module is always safe.
const design: BrandV2 | null = brand.v2 ?? null;

export const c: BrandV2['colors'] = design?.colors ?? {
  app: brand.colors.background,
  surface: brand.colors.surface,
  sunken: brand.colors.line,
  ink: brand.colors.text,
  muted: brand.colors.textMuted,
  brand: brand.colors.primary,
  brandPressed: brand.colors.pressed,
  onBrand: brand.colors.onPrimary,
  onBrandSoft: brand.colors.onPrimary,
  border: brand.colors.outline,
  borderSubtle: brand.colors.line,
  sun: brand.colors.card,
  sunSoft: brand.colors.surface,
  coral: brand.colors.gift,
  coralSoft: brand.colors.surface,
  mint: brand.colors.card,
  mintSoft: brand.colors.surface,
  berry: brand.colors.gift,
  error: brand.colors.accent,
  disabled: brand.colors.line,
  onDisabled: brand.colors.textMuted,
  wallet: '#111111',
  scrim: brand.colors.scrim,
};

export function accent(color: AccentColor): string {
  return color === 'cream' ? c.app : color === 'brand' ? c.brand : c[color];
}

/** Text on an accent fill: white on the brand green, ink on everything else. */
export function onAccent(color: AccentColor): string {
  return color === 'brand' ? c.onBrand : c.ink;
}

export const space = { 2: 2, 4: 4, 8: 8, 12: 12, 16: 16, 20: 20, 24: 24, 32: 32, 40: 40, 48: 48, 64: 64 } as const;

export const radius = { sm: 12, md: 16, lg: 20, xl: 28, pill: 999 } as const;

/** Column width of the designs; the web centres it. */
export const columnWidth = 480;

function sticker(weight: 600 | 700 | 800): TextStyle {
  const fonts = design?.fonts;
  if (!fonts) return font(weight === 600 ? 700 : weight);
  if (Platform.OS === 'web') {
    return { fontFamily: `${fonts.sticker[weight]}, ${fonts.webStickerStack}`, fontWeight: String(weight) as TextStyle['fontWeight'] };
  }
  return { fontFamily: fonts.sticker[weight] };
}

function black(): TextStyle {
  const family = design?.fonts.displayBlack;
  if (!family) return displayFont(800);
  if (Platform.OS === 'web') return { fontFamily: `${family}, ${brand.fonts.webDisplayStack}`, fontWeight: '900' };
  return { fontFamily: family };
}

/** Text styles (koala/* in Figma): size / line height / weight / tracking. */
export const t = {
  displayXl: { ...black(), fontSize: 56, lineHeight: 60, letterSpacing: -0.56, color: c.brand },
  displayL: { ...displayFont(800), fontSize: 34, lineHeight: 40, letterSpacing: -1, color: c.ink },
  displayM: { ...displayFont(800), fontSize: 26, lineHeight: 32, letterSpacing: -0.13, color: c.ink },
  displayS: { ...displayFont(800), fontSize: 20, lineHeight: 26, color: c.ink },
  title: { ...displayFont(800), fontSize: 17, lineHeight: 22, color: c.ink },
  bodyL: { ...font(500), fontSize: 17, lineHeight: 26, color: c.ink },
  bodyM: { ...font(500), fontSize: 15, lineHeight: 22, color: c.ink },
  bodyMStrong: { ...font(700), fontSize: 15, lineHeight: 22, color: c.ink },
  bodyS: { ...font(500), fontSize: 13, lineHeight: 18, color: c.muted },
  bodySStrong: { ...font(700), fontSize: 13, lineHeight: 18, color: c.ink },
  button: { ...font(800), fontSize: 16, lineHeight: 20, color: c.onBrand },
  nav: { ...font(700), fontSize: 12, lineHeight: 16, color: c.muted },
  overline: { ...font(800), fontSize: 12, lineHeight: 16, letterSpacing: 0.96, color: c.brand, textTransform: 'uppercase' },
  code: { ...font(800), fontSize: 26, lineHeight: 32, letterSpacing: 3.12, color: c.ink },
  sticker: { ...sticker(800), fontSize: 15, lineHeight: 18, color: c.ink },
  stickerS: { ...sticker(700), fontSize: 12, lineHeight: 15, color: c.ink },
  hand: { ...sticker(600), fontSize: 15, lineHeight: 20, color: c.brand },
} satisfies Record<string, TextStyle>;

/** Hard drop shadow straight down (koala/pop), or 1 px when pressed (koala/pop-pressed). */
export function pop(offset = 4): ViewStyle {
  return Platform.OS === 'web'
    ? ({ boxShadow: `0px ${offset}px 0px ${c.ink}` } as ViewStyle)
    : { shadowColor: c.ink, shadowOpacity: 1, shadowRadius: 0, shadowOffset: { width: 0, height: offset }, elevation: offset > 1 ? 4 : 1 };
}

/** Ink outline + pop: cards, buttons, stickers. */
export function raised(offset = 4): ViewStyle {
  return { borderWidth: 2, borderColor: c.ink, ...pop(offset) };
}

/** Soft upward shadow of the bottom sheet (koala/sheet). */
export const sheetShadow: ViewStyle =
  Platform.OS === 'web'
    ? ({ boxShadow: '0px -6px 24px rgba(20, 37, 31, 0.18)' } as ViewStyle)
    : { shadowColor: c.ink, shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: -6 }, elevation: 12 };

export { v2Of };
