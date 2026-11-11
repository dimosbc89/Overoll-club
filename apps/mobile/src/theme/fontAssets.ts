import { brand } from '../brand';

/**
 * Font files for every family a brand names (src/brand), by family name. Only the
 * current brand's families are loaded (expo-font), so the other files are never fetched.
 * Kept apart from the brand definitions because `require` of a font only works in the
 * app bundle, not in unit tests.
 */
const files: Record<string, number> = {
  Manrope_500Medium: require('@expo-google-fonts/manrope/500Medium/Manrope_500Medium.ttf'),
  Manrope_700Bold: require('@expo-google-fonts/manrope/700Bold/Manrope_700Bold.ttf'),
  Manrope_800ExtraBold: require('@expo-google-fonts/manrope/800ExtraBold/Manrope_800ExtraBold.ttf'),
  // M PLUS Rounded 1c (OFL), subset to Latin + Greek: assets/fonts/MPLUSRounded1c-OFL.txt
  MPLUSRounded1c_700Bold: require('../../assets/fonts/MPLUSRounded1c_700Bold_latin-greek.ttf'),
  MPLUSRounded1c_800ExtraBold: require('../../assets/fonts/MPLUSRounded1c_800ExtraBold_latin-greek.ttf'),
};

export const fontFamilies = [...new Set([...Object.values(brand.fonts.body), ...Object.values(brand.fonts.display)])];

export const fontAssets: Record<string, number> = Object.fromEntries(
  fontFamilies.map((family) => {
    const file = files[family];
    if (file === undefined) throw new Error(`No font file for ${family}: add it to src/theme/fontAssets.ts`);
    return [family, file];
  }),
);
