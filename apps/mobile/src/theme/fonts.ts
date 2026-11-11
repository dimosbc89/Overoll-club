import { Platform, type TextStyle } from 'react-native';

import { brand, type FontWeight } from '../brand';
import { colors } from './tokens';

/**
 * The brand's fonts (src/brand; files in ./fontAssets.ts, loaded by the root layout). Each
 * weight is its own family name; on native the weight comes from the family alone
 * (setting fontWeight as well makes Android fall back to the system font). The web
 * gets a stack and the weight, so the first paint before the font arrives looks right.
 * Body text (labels, buttons, inputs) uses `font`; headings and big numbers `displayFont`.
 */
export type Weight = FontWeight;

function face(families: Record<Weight, string>, stack: string, weight: Weight): TextStyle {
  if (Platform.OS === 'web') {
    return { fontFamily: `${families[weight]}, ${stack}`, fontWeight: String(weight) as TextStyle['fontWeight'] };
  }
  return { fontFamily: families[weight] };
}

export function font(weight: Weight): TextStyle {
  return face(brand.fonts.body, brand.fonts.webBodyStack, weight);
}

export function displayFont(weight: Weight): TextStyle {
  return face(brand.fonts.display, brand.fonts.webDisplayStack, weight);
}

/** Text styles from the designs (size / line height / weight). */
export const type = {
  display: { ...displayFont(800), fontSize: 34, lineHeight: 38, letterSpacing: -0.5, color: colors.text },
  title: { ...displayFont(800), fontSize: 30, lineHeight: 36, letterSpacing: -0.45, color: colors.text },
  heading: { ...displayFont(800), fontSize: 26, lineHeight: 32, letterSpacing: -0.26, color: colors.text },
  lead: { ...font(500), fontSize: 17, lineHeight: 26, color: colors.text },
  body: { ...font(500), fontSize: 15, lineHeight: 22, color: colors.text },
  bodyStrong: { ...font(700), fontSize: 15, lineHeight: 22, color: colors.text },
  label: { ...font(700), fontSize: 14, lineHeight: 20, color: colors.text },
  small: { ...font(500), fontSize: 13, lineHeight: 18, color: colors.textMuted },
  caption: { ...font(500), fontSize: 12, lineHeight: 17, color: colors.text },
} satisfies Record<string, TextStyle>;
