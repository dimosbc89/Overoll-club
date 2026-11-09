/**
 * Overoll design-system tokens (the design canvas `theme.css`, from the Overoll
 * design system). Pure data (no react-native import) so tests and every
 * platform can share it.
 *
 * Contrast rules:
 * - ink on pink, cream or white: fine for any text.
 * - plum-deep on white or cream (~6:1): links, prices, small bold text.
 * - pink is a surface colour only: nothing a person must read is pink.
 * - white text only on plum-deep (pressed buttons, plum tags).
 */
export const colors = {
  /** Primary surface: buttons, the member card, the code panel. */
  pink: '#ebabc5',
  /** Outlines (outline buttons, number circles). */
  plum: '#b2688a',
  /** Links, prices, progress fills, pressed buttons, plum tags. */
  plumDeep: '#924b6d',
  /** Page background. */
  cream: '#f9f0e9',
  /** Surfaces: cards, sheets, the QR box. */
  white: '#ffffff',
  /** Text. */
  ink: '#48423e',
  /** Secondary text. */
  inkMuted: '#6b6560',
  /** Dividers, empty progress tracks. */
  line: '#e4dbd4',
  /** Dimmed backdrop behind sheets. */
  scrim: 'rgba(72, 66, 62, 0.45)',
} as const;

export type ColorToken = keyof typeof colors;

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
