import { Platform, type TextStyle } from 'react-native';

import { colors } from './tokens';

/**
 * Manrope (stand-in for Gilroy in the Overoll design system; covers Greek),
 * loaded in the root layout with expo-font. Each weight is its own family
 * name; on native the weight comes from the family alone (setting fontWeight
 * as well makes Android fall back to the system font). The web gets a stack
 * and the weight, so the first paint before the font arrives looks right.
 */
export const fontAssets = {
  Manrope_500Medium: require('@expo-google-fonts/manrope/500Medium/Manrope_500Medium.ttf'),
  Manrope_700Bold: require('@expo-google-fonts/manrope/700Bold/Manrope_700Bold.ttf'),
  Manrope_800ExtraBold: require('@expo-google-fonts/manrope/800ExtraBold/Manrope_800ExtraBold.ttf'),
} as const;

export type Weight = 500 | 700 | 800;

const family: Record<Weight, keyof typeof fontAssets> = {
  500: 'Manrope_500Medium',
  700: 'Manrope_700Bold',
  800: 'Manrope_800ExtraBold',
};

export function font(weight: Weight): TextStyle {
  if (Platform.OS === 'web') {
    return { fontFamily: `${family[weight]}, Manrope, system-ui, sans-serif`, fontWeight: String(weight) as TextStyle['fontWeight'] };
  }
  return { fontFamily: family[weight] };
}

/** Text styles from the designs (size / line height / weight). */
export const type = {
  display: { ...font(800), fontSize: 34, lineHeight: 38, letterSpacing: -0.5, color: colors.ink },
  title: { ...font(800), fontSize: 30, lineHeight: 36, letterSpacing: -0.45, color: colors.ink },
  heading: { ...font(800), fontSize: 26, lineHeight: 32, letterSpacing: -0.26, color: colors.ink },
  lead: { ...font(500), fontSize: 17, lineHeight: 26, color: colors.ink },
  body: { ...font(500), fontSize: 15, lineHeight: 22, color: colors.ink },
  bodyStrong: { ...font(700), fontSize: 15, lineHeight: 22, color: colors.ink },
  label: { ...font(700), fontSize: 14, lineHeight: 20, color: colors.ink },
  small: { ...font(500), fontSize: 13, lineHeight: 18, color: colors.inkMuted },
  caption: { ...font(500), fontSize: 12, lineHeight: 17, color: colors.ink },
} satisfies Record<string, TextStyle>;
