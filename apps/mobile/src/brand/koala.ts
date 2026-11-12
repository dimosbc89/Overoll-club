import koalaEl from './koala.el.json';
import koalaEn from './koala.en.json';
import { mark, wordmark } from './koalaPaths';
import type { BrandDefinition } from './types';

/**
 * Koala Coffee: Figma "Koala Club — loyalty app concept" (green and cream from the
 * official koala mark, sun / coral accents, ink outlines with a sticker shadow).
 * Display type: M PLUS Rounded 1c, subset to Latin + Greek (assets/fonts, OFL).
 */
export const koala: BrandDefinition = {
  slug: 'koala',
  programName: 'Koala Club',
  brandName: 'Koala',
  supportEmail: 'hello@koalacoffee.gr',
  colors: {
    background: '#f8f1de',
    surface: '#fffcf4',
    text: '#18261f',
    textMuted: '#44534c',
    line: '#e2d6bb',
    scrim: 'rgba(24, 38, 31, 0.45)',
    header: '#026852',
    onHeader: '#f8f1de',
    card: '#ffc93c',
    onCard: '#18261f',
    gift: '#ff7a59',
    onGift: '#18261f',
    primary: '#026852',
    onPrimary: '#f8f1de',
    outline: '#18261f',
    accent: '#026852',
    pressed: '#014a3a',
    onPressed: '#f8f1de',
    logo: '#026852',
    logoOnHeader: '#f8f1de',
    themeColor: '#026852',
  },
  shape: { borderWidth: 2, borderColor: '#18261f', offsetShadow: true, outlineWidth: 2 },
  fonts: {
    body: { 500: 'Manrope_500Medium', 700: 'Manrope_700Bold', 800: 'Manrope_800ExtraBold' },
    display: { 500: 'MPLUSRounded1c_700Bold', 700: 'MPLUSRounded1c_700Bold', 800: 'MPLUSRounded1c_800ExtraBold' },
    webBodyStack: 'Manrope, system-ui, sans-serif',
    webDisplayStack: '"M PLUS Rounded 1c", system-ui, sans-serif',
  },
  logo: { mark, wordmark, wordmarkText: 'koala coffee', widthScale: 1.75 },
  giftIcon: 'cup',
  // Legal entity to confirm with Koala (vrisko lists "KOALA - ΔΗΜΟΓΕΡΟΝΤΑ ΕΕ" for Αργυρούπολη; docs/koala/README.md).
  legal: { tradeName: 'Koala Coffee', company: null, address: null },
  copy: { el: koalaEl, en: koalaEn },
};
