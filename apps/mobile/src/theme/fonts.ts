import { Platform } from 'react-native';

import { fontStacks } from './tokens';

/**
 * React Native takes one family name, the web takes the full stack.
 * iOS ships Iowan Old Style and Avenir Next; Android falls back to its system
 * serif and Roboto. Greek glyphs: check on device (docs/brand.md, "Type").
 */
export const fonts = {
  serif: Platform.select({ ios: 'Iowan Old Style', android: 'serif', default: fontStacks.serif }),
  sans: Platform.select({ ios: 'Avenir Next', android: 'sans-serif', default: fontStacks.sans }),
} as const;
