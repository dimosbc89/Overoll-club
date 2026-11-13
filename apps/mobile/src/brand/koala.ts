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
  // Apple Wallet pass live since 13 Nov 2026 (certificate "Koala Club pass"); Google Wallet waits for publishing access.
  walletInApp: { apple: true },
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
  // Legal entity given by Dimos for Koala, 13 Nov 2026 (docs/koala/README.md).
  legal: {
    tradeName: 'Koala Coffee',
    company: { el: 'ΔΗΜΟΓΕΡΟΝΤΑΣ ΝΙΚΟΛΑΣ (ΑΦΜ 143354407)', en: 'DIMOGERONTAS NIKOLAS (VAT EL143354407)' },
    address: { el: 'Αγίου Δημητρίου 159, 173 43 Άγιος Δημήτριος', en: 'Agiou Dimitriou 159, 173 43 Agios Dimitrios, Greece' },
  },
  // Figma "Koala Club — loyalty app concept" (design system page, 12 Nov 2026).
  v2: {
    colors: {
      app: '#f8f1de',
      surface: '#ffffff',
      sunken: '#eadfc4',
      ink: '#14251f',
      muted: '#4a6359',
      brand: '#026852',
      brandPressed: '#1a473a',
      onBrand: '#ffffff',
      onBrandSoft: '#f8f1de',
      border: '#768a7f',
      borderSubtle: '#eadfc4',
      sun: '#ffc93c',
      sunSoft: '#ffe9a8',
      coral: '#ff7a59',
      coralSoft: '#ffd9cc',
      mint: '#9eddc0',
      mintSoft: '#ddf3e8',
      berry: '#f7a8c4',
      error: '#b42318',
      disabled: '#d9d2c0',
      onDisabled: '#6b6a60',
      wallet: '#111111',
      scrim: 'rgba(20, 37, 31, 0.45)',
    },
    fonts: {
      sticker: { 600: 'PlaypenSans_600SemiBold', 700: 'PlaypenSans_700Bold', 800: 'PlaypenSans_800ExtraBold' },
      webStickerStack: '"Playpen Sans", "Comic Sans MS", system-ui, sans-serif',
      displayBlack: 'MPLUSRounded1c_900Black',
    },
    tiers: {
      classic: { color: 'mint', icon: 'sparkle' },
      gold: { color: 'sun', icon: 'leaf' },
      club: { color: 'brand', icon: 'leaf' },
    },
    art: {
      byCategory: { coffee: 'takeaway-cup', pies: 'pie', sweets: 'cinnamon-roll', food: 'toastie', combos: 'takeaway-cup' },
      fallback: 'mug',
      tile: {
        espresso: 'sun',
        'freddo-espresso': 'mint',
        'freddo-cappuccino': 'sun',
        pie: 'coral',
        muffin: 'sun',
        croissant: 'berry',
        'cinnamon-roll': 'coral',
        toastie: 'mint',
        cake: 'sun',
        'takeaway-cup': 'berry',
        mug: 'cream',
      },
      gift: 'cinnamon-roll',
    },
  },
  copy: { el: koalaEl, en: koalaEn },
};
