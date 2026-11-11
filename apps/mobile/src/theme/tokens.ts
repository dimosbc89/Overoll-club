/**
 * Design tokens. Colours and the card/button shape come from the brand this build
 * belongs to (src/brand, EXPO_PUBLIC_BRAND); spacing, radii and sizes are shared.
 * Pure data (no react-native import) so tests and every platform can share it.
 *
 * Colours are named by role, and test/brand.test.ts checks every text colour against
 * the backgrounds it sits on for every brand:
 * - text / textMuted on background or surface; onX on X (header, card, gift, primary, pressed).
 * - accent on background or surface: links, prices, error text (4.5:1).
 * - outline: borders only (3:1). Nothing a person must read is in primary/header/card colour.
 */
import { brand } from '../brand';

export const colors = brand.colors;

/** Card and button shape: border and shadow style of the brand. */
export const shape = brand.shape;

export type ColorToken = keyof typeof colors;

/** QR codes are always dark on white, whatever the brand, so every scanner reads them. */
export const qr = { dark: '#000000', light: '#ffffff' } as const;

export const space = {
  xs: 4,
  sm: 8,
  ms: 12,
  md: 16,
  mdl: 20,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  /** Cards. */
  md: 16,
  /** Panels: the member card, the code panel, sheets. */
  lg: 28,
  /** Pills: buttons, tags. */
  full: 9999,
} as const;

/** Buttons and inputs. */
export const controlHeight = 48;

/** Smallest touch target (WCAG 2.5.5 / Apple HIG). */
export const minTouch = 44;

/** Widest content column on the web app (the designs are 390 wide). */
export const maxContentWidth = 480;
