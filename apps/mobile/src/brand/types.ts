/**
 * What makes one brand's app look and sound like that brand. The app is the same
 * code for every brand; scripts/build-web.ts (and the native build) picks one with
 * EXPO_PUBLIC_BRAND, which must match a supabase/projects/<brand>.json.
 *
 * Pure data (font files are in src/theme/fontAssets.ts), so tests and every platform can share it.
 */

/** A logo drawn from SVG paths (react-native-svg), in the viewBox `x y width height`. */
export interface LogoShape {
  x?: number;
  y?: number;
  width: number;
  height: number;
  /** Every path drawn with the even-odd rule (holes)… */
  evenOdd?: boolean;
  /** …or only these paths (by index). */
  evenOddPaths?: readonly number[];
  paths: readonly string[];
}

/**
 * Colours by role. Every text colour is checked against the backgrounds it sits on
 * (test/brand.test.ts): 4.5:1 for text, 3:1 for outlines and large text.
 */
export interface BrandColors {
  /** Page background. */
  background: string;
  /** Cards, sheets, inputs, the tab bar. */
  surface: string;
  text: string;
  textMuted: string;
  /** Dividers, input borders, empty progress tracks. */
  line: string;
  /** Dimmed backdrop behind sheets. */
  scrim: string;
  /** The top of the landing and join screens. */
  header: string;
  onHeader: string;
  /** The member card and the redemption-code panel. */
  card: string;
  onCard: string;
  /** The welcome-gift panel and banner. */
  gift: string;
  onGift: string;
  /** Filled buttons, primary tags, icon circles. */
  primary: string;
  onPrimary: string;
  /** Outline buttons, checkboxes, outlined rows. */
  outline: string;
  /** Links, prices, progress fills, error text, icons on light backgrounds. */
  accent: string;
  /** Pressed or selected buttons, accent tags, checked boxes. */
  pressed: string;
  onPressed: string;
  /** Logo on the page background, and on the header. */
  logo: string;
  logoOnHeader: string;
  /** Browser / status bar colour. */
  themeColor: string;
}

export interface BrandShapeStyle {
  /** Border on cards and filled buttons (0 = none, the soft shadow alone). */
  borderWidth: number;
  /** Colour of that border. */
  borderColor: string;
  /** Hard offset shadow (sticker look) instead of the soft one. */
  offsetShadow: boolean;
  /** Outline buttons and outlined rows. */
  outlineWidth: number;
}

export type FontWeight = 500 | 700 | 800;

export interface BrandFonts {
  /** Family name per weight for body text (labels, buttons, inputs). */
  body: Record<FontWeight, string>;
  /** Family name per weight for headings and big numbers. */
  display: Record<FontWeight, string>;
  /** CSS fallbacks after the family on the web, e.g. "Manrope, system-ui, sans-serif". */
  webBodyStack: string;
  webDisplayStack: string;
}

export type GiftIcon = 'croissant' | 'cup';

/** Accent fills of the v2 design (tiles, stickers, thumbs). */
export type AccentColor = 'sun' | 'coral' | 'mint' | 'berry' | 'cream' | 'brand';

/**
 * The v2 design (fixed header with the logo, bottom navigation with an active
 * pill, onboarding in steps, sticker-style cards): colours, the sticker font,
 * the brand's illustrations and what each tier and reward looks like. A brand
 * without it keeps the classic screens.
 */
export interface BrandV2 {
  colors: {
    /** Page background. */
    app: string;
    /** White cards, inputs, the bottom bar. */
    surface: string;
    /** Locked rewards, dividers. */
    sunken: string;
    ink: string;
    muted: string;
    brand: string;
    brandPressed: string;
    onBrand: string;
    onBrandSoft: string;
    /** Input borders (3:1). */
    border: string;
    /** Bottom bar top line, history dividers. */
    borderSubtle: string;
    sun: string;
    sunSoft: string;
    coral: string;
    coralSoft: string;
    mint: string;
    mintSoft: string;
    berry: string;
    error: string;
    disabled: string;
    onDisabled: string;
    /** Placeholder "Add to Wallet" buttons. */
    wallet: string;
    scrim: string;
  };
  fonts: {
    /** Sticker / handwritten face by weight (600 hand, 700 small, 800 stickers). */
    sticker: Record<600 | 700 | 800, string>;
    webStickerStack: string;
    /** Heaviest display weight (the big points number). */
    displayBlack: string;
  };
  /** Tier sticker per tier: fill and icon. */
  tiers: Record<'classic' | 'gold' | 'club', { color: AccentColor; icon: 'sparkle' | 'leaf' }>;
  /** Illustration for a reward without its own `icon`, by category; and the tile colour of each illustration. */
  art: { byCategory: Record<string, string>; fallback: string; tile: Record<string, AccentColor>; gift: string };
}

/** Text of the legal details: the same in every language, or one per language. */
export type LegalText = string | { el: string; en: string };

export interface BrandDefinition {
  /** Matches supabase/projects/<slug>.json and `brands.slug`. */
  slug: string;
  /** "Overoll Club"; fills {programName}. */
  programName: string;
  /** "Overoll"; fills {brandName}. */
  brandName: string;
  /** Support address until the brand's own goes live; fills {supportEmail}. */
  supportEmail: string;
  /**
   * Wallet passes that work for this brand, so the store apps may show the
   * button (each its own platform's: Apple on iOS, Google on Android). Switch
   * one on only after its pass downloads for real: store review refuses
   * "coming soon" buttons. The web app always shows both.
   */
  walletInApp?: { apple?: boolean; google?: boolean };
  colors: BrandColors;
  shape: BrandShapeStyle;
  fonts: BrandFonts;
  logo: {
    mark: LogoShape;
    /** The brand's own wordmark; without one the mark is shown with `wordmarkText`. */
    wordmark?: LogoShape;
    /** Mark and wordmark together (landing and join header). */
    full?: LogoShape;
    wordmarkText: string;
    /** Wide lockups need more width than the Overoll shapes the screens were sized for. */
    widthScale?: number;
  };
  giftIcon: GiftIcon;
  /**
   * Who runs the programme, for the privacy policy and terms (src/legal):
   * the trade name, and the legal entity and address once the brand confirms
   * them (null until then: the pages show the trade name and a draft notice).
   * Company and address are one string, or one per language.
   */
  legal: { tradeName: string; company: LegalText | null; address: LegalText | null };
  /** The v2 screens (src/v2); without it the classic ones. */
  v2?: BrandV2;
  /** Copy that differs from the shared el/en files (same keys). */
  copy: { el: Record<string, string>; en: Record<string, string> };
}
