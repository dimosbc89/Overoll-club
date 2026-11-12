import type { BrandDefinition } from './types';
import { logo, mark, wordmark } from './overollPaths';

/** Overoll Croissanterie: the Overoll design system (docs/brand.md, docs/design-v2.md). */
export const overoll: BrandDefinition = {
  slug: 'overoll',
  programName: 'Overoll Club',
  brandName: 'Overoll',
  supportEmail: 'club-support@growagency.online',
  colors: {
    background: '#f9f0e9',
    surface: '#ffffff',
    text: '#48423e',
    textMuted: '#6b6560',
    line: '#e4dbd4',
    scrim: 'rgba(72, 66, 62, 0.45)',
    header: '#ebabc5',
    onHeader: '#48423e',
    card: '#ebabc5',
    onCard: '#48423e',
    gift: '#ebabc5',
    onGift: '#48423e',
    primary: '#ebabc5',
    onPrimary: '#48423e',
    outline: '#b2688a',
    accent: '#924b6d',
    pressed: '#924b6d',
    onPressed: '#ffffff',
    logo: '#ebabc5',
    logoOnHeader: '#ffffff',
    themeColor: '#ebabc5',
  },
  shape: { borderWidth: 0, borderColor: 'transparent', offsetShadow: false, outlineWidth: 1.5 },
  fonts: {
    // Manrope: stand-in for Gilroy in the Overoll design system; covers Greek.
    body: { 500: 'Manrope_500Medium', 700: 'Manrope_700Bold', 800: 'Manrope_800ExtraBold' },
    display: { 500: 'Manrope_500Medium', 700: 'Manrope_700Bold', 800: 'Manrope_800ExtraBold' },
    webBodyStack: 'Manrope, system-ui, sans-serif',
    webDisplayStack: 'Manrope, system-ui, sans-serif',
  },
  logo: { mark, wordmark, full: logo, wordmarkText: 'Overoll' },
  giftIcon: 'croissant',
  // Legal entity to confirm with Overoll (copy deck, question 4).
  legal: { tradeName: 'Overoll Croissanterie', company: null, address: null },
  copy: { el: {}, en: {} },
};
