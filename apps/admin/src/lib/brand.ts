/**
 * The brand this back office belongs to: same code for every brand, picked at build time
 * with NEXT_PUBLIC_BRAND (scripts/build-web.ts --brand). Must match a
 * supabase/projects/<brand>.json. Colours: src/app/brands.css (only for brands other
 * than Overoll, whose palette is the default in globals.css and the console styles).
 */
export interface AdminBrand {
  slug: string;
  programName: string;
  /** "Overoll": shortened from store names in the till header. */
  brandName: string;
  supportEmail: string;
  /** Club site when the build gives none (NEXT_PUBLIC_CLUB_URL). */
  clubUrl: string;
  /** Logo files in public/ (or public-brands/<brand>/): on the dark header, on light bars. */
  wordmark: { onDark: string; onLight: string; width: number; height: number };
  themeColor: string;
  /** Texts that differ from the shared el/en files (same keys; test/brand.test.ts). */
  copy: { el: Record<string, string>; en: Record<string, string> };
}

const overoll: AdminBrand = {
  slug: 'overoll',
  programName: 'Overoll Club',
  brandName: 'Overoll',
  supportEmail: 'club-support@growagency.online',
  clubUrl: 'loyalty.overoll.gr',
  wordmark: { onDark: '/overoll-wordmark.svg', onLight: '/overoll-wordmark.svg', width: 104, height: 28 },
  themeColor: '#f5b0b4',
  copy: { el: {}, en: {} },
};

const koala: AdminBrand = {
  slug: 'koala',
  programName: 'Koala Club',
  brandName: 'Koala',
  supportEmail: 'club-support@growagency.online',
  clubUrl: 'koala-club.pages.dev',
  wordmark: { onDark: '/koala-lockup-cream.svg', onLight: '/koala-lockup-green.svg', width: 206, height: 28 },
  themeColor: '#026852',
  copy: {
    el: {
      'brand.wordmark': 'Koala Coffee',
      'meta.appTitle': 'Koala Club · Διαχείριση',
      'meta.pageTitle': '{page} · Koala Club',
      'dashboard.intro': 'Όλο το δίκτυο του Koala Club με μια ματιά.',
      'console.award.firstPurchase': 'Πρώτη αγορά! Το cinnamon roll καλωσορίσματος ξεκλειδώθηκε. Πες το στον πελάτη.',
    },
    en: {
      'brand.wordmark': 'Koala Coffee',
      'meta.appTitle': 'Koala Club · Back office',
      'meta.pageTitle': '{page} · Koala Club',
      'dashboard.intro': 'The whole Koala Club network at a glance.',
      'console.award.firstPurchase': 'First purchase! The welcome cinnamon roll is now unlocked. Let them know.',
    },
  },
};

export const brands: Record<string, AdminBrand> = { overoll, koala };

export function resolveBrand(slug: string | undefined): AdminBrand {
  const key = slug?.trim() || 'overoll';
  const found = brands[key];
  if (!found) throw new Error(`Unknown brand "${key}": add it to apps/admin/src/lib/brand.ts`);
  return found;
}

/** Next.js inlines NEXT_PUBLIC_* at build time; keep it written out literally. */
export const brand: AdminBrand = resolveBrand(process.env.NEXT_PUBLIC_BRAND);
