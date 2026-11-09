/**
 * Overoll brand tokens from docs/brand.md. Pure data (no react-native import)
 * so tests and both platforms can share it.
 *
 * Contrast rules (WCAG, docs/brand.md):
 * - cocoa on pink 8.5:1 and ink on cream 11.9:1: fine for any text.
 * - mauve on cream ~3.5:1: large text (18 pt+) or icons only.
 * - white on pink 1.9:1: never.
 */
export const colors = {
  /** Primary: buttons, member card, progress. Text on it is always cocoa. */
  pink: '#ebabc5',
  /** Selected states, chips. */
  pinkLight: '#f7c7cb',
  /** App background. */
  cream: '#f6f1e8',
  /** Cards, dividers. */
  butter: '#e7d8bd',
  /** Card surfaces on cream. */
  white: '#fffaf2',
  /** Headings, text on pink, header bar. */
  cocoa: '#321c1b',
  /** Body text. */
  ink: '#402927',
  /** Links and secondary accent: large text or icons only. */
  mauve: '#b2688a',
  /** Success (points added). */
  green: '#a1ba7f',
} as const;

export type ColorToken = keyof typeof colors;

/** Font stacks from the website. On native only the first family is used (see fonts.ts). */
export const fontStacks = {
  serif: '"Iowan Old Style", Baskerville, "Palatino Linotype", Georgia, serif',
  sans: '"Avenir Next", Avenir, "Helvetica Neue", Arial, sans-serif',
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 24,
} as const;

/** Smallest touch target (WCAG 2.5.5 / Apple HIG). */
export const minTouch = 44;

/** Widest content column on the web app. */
export const maxContentWidth = 640;
