/**
 * Google Wallet: the brand's loyalty class, the member's loyalty object, the
 * "Add to Google Wallet" link (a signed JWT that creates both on save) and the
 * object updates. Runtime-neutral: WebCrypto (RS256) and fetch.
 */
import { WALLET_LOCALES, type WalletDesign, type WalletLocale, fillWalletText } from './design.js';
import type { WalletPassData } from './pass-data.js';

export interface GoogleServiceAccount {
  client_email: string;
  private_key: string;
}

export interface GoogleSetup {
  /** Issuer id from the Google Pay & Wallet Console. */
  issuerId: string;
  serviceAccount: GoogleServiceAccount;
  fetch?: typeof fetch;
}

type Localized = {
  defaultValue: { language: string; value: string };
  translatedValues: { language: string; value: string }[];
};

const encoder = new TextEncoder();

function localized(values: Record<WalletLocale, string>): Localized {
  const [first, ...rest] = WALLET_LOCALES;
  return {
    defaultValue: { language: first!, value: values[first!] },
    translatedValues: rest.map((language) => ({ language, value: values[language] })),
  };
}

const perLocale = (pick: (locale: WalletLocale) => string): Record<WalletLocale, string> =>
  Object.fromEntries(WALLET_LOCALES.map((l) => [l, pick(l)])) as Record<WalletLocale, string>;

/** Google ids allow letters, digits, '.', '_' and '-'. */
export const googleClassId = (issuerId: string, design: WalletDesign) => `${issuerId}.${design.slug}-club`;
export const googleObjectId = (issuerId: string, design: WalletDesign, memberId: string) =>
  `${issuerId}.${design.slug}-${memberId}`;

export function googleLoyaltyClass(pass: Pick<WalletPassData, 'brandName' | 'config'>, design: WalletDesign, issuerId: string) {
  const values = {
    programName: design.programName,
    clubUrl: design.siteUrl.replace(/^https?:\/\//, ''),
    supportEmail: design.supportEmail,
    termsUrl: `${design.siteUrl}/terms`,
    expiryMonths: pass.config.expiryMonths,
  };
  const text = (key: 'back.howTo' | 'back.rewards' | 'back.expiry' | 'back.help') =>
    perLocale((l) => fillWalletText(design.copy[l][key], values));
  return {
    id: googleClassId(issuerId, design),
    issuerName: pass.brandName,
    programName: design.programName,
    programLogo: {
      sourceUri: { uri: design.googleLogoUrl },
      contentDescription: localized(perLocale(() => design.programName)),
    },
    hexBackgroundColor: design.colors.background,
    countryCode: 'GR',
    reviewStatus: 'UNDER_REVIEW',
    multipleDevicesAndHoldersAllowedStatus: 'ONE_USER_ALL_DEVICES',
    localizedAccountNameLabel: localized(perLocale((l) => design.copy[l]['label.member'])),
    homepageUri: { uri: design.siteUrl, description: design.programName },
    textModulesData: (['back.howTo', 'back.rewards', 'back.expiry', 'back.help'] as const).map((key) => {
      const body = text(key);
      return { id: key.replace('back.', ''), body: body.el, localizedBody: localized(body) };
    }),
  };
}

export function googleLoyaltyObject(pass: WalletPassData, design: WalletDesign, issuerId: string) {
  const tierNames = design.tiers[pass.tier];
  const modules = [
    {
      id: 'tier',
      header: design.copy.el['label.tier'],
      localizedHeader: localized(perLocale((l) => design.copy[l]['label.tier'])),
      body: tierNames.el,
      localizedBody: localized(tierNames),
    },
  ];
  if (pass.nextReward) {
    const names = { el: pass.nextReward.nameEl, en: pass.nextReward.nameEn };
    modules.push({
      id: 'nextReward',
      header: design.copy.el['label.nextReward'],
      localizedHeader: localized(perLocale((l) => design.copy[l]['label.nextReward'])),
      body: names.el,
      localizedBody: localized(names),
    });
  }
  return {
    id: googleObjectId(issuerId, design, pass.memberId),
    classId: googleClassId(issuerId, design),
    state: 'ACTIVE',
    accountId: pass.memberCode,
    accountName: pass.firstName,
    loyaltyPoints: {
      label: design.copy.el['label.points'],
      localizedLabel: localized(perLocale((l) => design.copy[l]['label.points'])),
      balance: { int: pass.points },
    },
    barcode: { type: 'QR_CODE', value: pass.barcode, alternateText: pass.barcodeText },
    textModulesData: modules,
  };
}

function base64url(data: Uint8Array | string): string {
  const bytes = typeof data === 'string' ? encoder.encode(data) : data;
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToDer(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const binary = atob(body);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

const keyCache = new Map<string, Promise<CryptoKey>>();

function signingKey(account: GoogleServiceAccount): Promise<CryptoKey> {
  let key = keyCache.get(account.client_email);
  if (!key) {
    key = crypto.subtle.importKey(
      'pkcs8',
      pemToDer(account.private_key) as Uint8Array<ArrayBuffer>,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    keyCache.set(account.client_email, key);
  }
  return key;
}

export async function signJwt(account: GoogleServiceAccount, claims: Record<string, unknown>): Promise<string> {
  const head = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(claims));
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', await signingKey(account), encoder.encode(`${head}.${body}`));
  return `${head}.${body}.${base64url(new Uint8Array(signature))}`;
}

/** The "Add to Google Wallet" link: saving creates the class (first time) and the member's object. */
export async function googleSaveUrl(pass: WalletPassData, design: WalletDesign, setup: GoogleSetup, now: Date): Promise<string> {
  const jwt = await signJwt(setup.serviceAccount, {
    iss: setup.serviceAccount.client_email,
    aud: 'google',
    typ: 'savetowallet',
    iat: Math.floor(now.getTime() / 1000),
    origins: [design.siteUrl],
    payload: {
      loyaltyClasses: [googleLoyaltyClass(pass, design, setup.issuerId)],
      loyaltyObjects: [googleLoyaltyObject(pass, design, setup.issuerId)],
    },
  });
  return `https://pay.google.com/gp/v/save/${jwt}`;
}

let tokenCache: { email: string; token: string; until: number } | null = null;

/** OAuth access token of the service account (scope wallet_object.issuer), cached for its lifetime. */
export async function googleAccessToken(setup: GoogleSetup, now: Date): Promise<string> {
  const at = Math.floor(now.getTime() / 1000);
  if (tokenCache && tokenCache.email === setup.serviceAccount.client_email && tokenCache.until > at + 60) return tokenCache.token;
  const assertion = await signJwt(setup.serviceAccount, {
    iss: setup.serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/wallet_object.issuer',
    aud: 'https://oauth2.googleapis.com/token',
    iat: at,
    exp: at + 3600,
  });
  const response = await (setup.fetch ?? fetch)('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
  });
  if (!response.ok) throw new Error(`Google token: HTTP ${response.status}`);
  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error('Google token: no access_token');
  tokenCache = { email: setup.serviceAccount.client_email, token: data.access_token, until: at + (data.expires_in ?? 3600) };
  return data.access_token;
}

/**
 * Update a member's saved object (points, tier, next reward, name). Returns
 * 'missing' when the member never saved the pass (nothing to update).
 */
export async function googleUpdateObject(
  pass: WalletPassData,
  design: WalletDesign,
  setup: GoogleSetup,
  now: Date,
): Promise<'updated' | 'missing'> {
  const object = googleLoyaltyObject(pass, design, setup.issuerId);
  const token = await googleAccessToken(setup, now);
  const response = await (setup.fetch ?? fetch)(
    `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/${encodeURIComponent(object.id)}`,
    {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        accountName: object.accountName,
        loyaltyPoints: object.loyaltyPoints,
        barcode: object.barcode,
        textModulesData: object.textModulesData,
      }),
    },
  );
  if (response.status === 404) return 'missing';
  if (!response.ok) throw new Error(`Google Wallet update: HTTP ${response.status}`);
  return 'updated';
}
