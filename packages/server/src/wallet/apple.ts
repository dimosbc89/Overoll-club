/**
 * Apple Wallet: the member's store card as a signed .pkpass (PassKit package
 * format), and the authentication token of the PassKit web service.
 * Runtime-neutral: WebCrypto for hashes, the signature comes from `sign`
 * (apple-signer.ts, the Pass Type ID certificate).
 */
import { WALLET_LOCALES, type WalletDesign, type WalletLocale, fillWalletText, hexToRgb } from './design.js';
import type { WalletPassData } from './pass-data.js';
import { zipStored } from './zip.js';

export interface AppleSetup {
  /** pass.<reverse domain>, registered on the brand's Apple Developer account. */
  passTypeId: string;
  teamId: string;
  /** Base URL of the PassKit web service, e.g. https://<ref>.supabase.co/functions/v1/api/wallet/apple */
  webServiceUrl: string;
  /** Detached PKCS #7 signature of manifest.json with the Pass Type ID certificate. */
  sign(manifest: Uint8Array): Uint8Array | Promise<Uint8Array>;
}

const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}

/**
 * The pass's `authenticationToken` (sent back by Wallet as `ApplePass <token>`):
 * derived from the member's QR secret and pass version, so nothing extra is
 * stored and a reissued pass (new version or secret) drops the old token.
 */
export function appleAuthToken(pass: Pick<WalletPassData, 'qrSecret' | 'passVersion'>): Promise<string> {
  return hmacHex(pass.qrSecret, `apple-wallet:${pass.passVersion}`).then((h) => h.slice(0, 40));
}

/** A download link token for the .pkpass, valid until `expiresAt` (seconds since 1970). */
export async function appleDownloadToken(pass: Pick<WalletPassData, 'memberId' | 'qrSecret'>, expiresAt: number): Promise<string> {
  const sig = (await hmacHex(pass.qrSecret, `apple-download:${expiresAt}`)).slice(0, 32);
  return `${pass.memberId}.${expiresAt}.${sig}`;
}

export function parseDownloadToken(token: string): { memberId: string; expiresAt: number; sig: string } | null {
  const m = /^([0-9a-f-]{36})\.(\d{9,11})\.([0-9a-f]{32})$/.exec(token);
  return m ? { memberId: m[1]!, expiresAt: Number(m[2]), sig: m[3]! } : null;
}

export function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const termsUrl = (design: WalletDesign) => `${design.siteUrl}/terms`;
const clubHost = (design: WalletDesign) => design.siteUrl.replace(/^https?:\/\//, '');

/** The texts of one language, keyed as pass.json refers to them. */
export function applePassStrings(pass: WalletPassData, design: WalletDesign, locale: WalletLocale): Record<string, string> {
  const copy = design.copy[locale];
  const values = {
    programName: design.programName,
    clubUrl: clubHost(design),
    supportEmail: design.supportEmail,
    termsUrl: termsUrl(design),
    expiryMonths: pass.config.expiryMonths,
  };
  const strings: Record<string, string> = {};
  for (const [key, text] of Object.entries(copy)) {
    if (key.startsWith('$')) continue;
    strings[key] = fillWalletText(text, values);
  }
  for (const [tier, names] of Object.entries(design.tiers)) strings[`tier.${tier}`] = names[locale];
  if (pass.nextReward) strings[`reward.${pass.nextReward.id}`] = locale === 'el' ? pass.nextReward.nameEl : pass.nextReward.nameEn;
  return strings;
}

/** A .strings file (UTF-8): "key" = "value"; */
export function stringsFile(strings: Record<string, string>): string {
  const quote = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
  return Object.entries(strings)
    .map(([k, v]) => `${quote(k)} = ${quote(v)};`)
    .join('\n')
    .concat('\n');
}

export function applePassJson(
  pass: WalletPassData,
  design: WalletDesign,
  setup: Pick<AppleSetup, 'passTypeId' | 'teamId' | 'webServiceUrl'>,
  authenticationToken: string,
): Record<string, unknown> {
  const barcode = { format: 'PKBarcodeFormatQR', message: pass.barcode, messageEncoding: 'iso-8859-1', altText: pass.barcodeText };
  return {
    formatVersion: 1,
    passTypeIdentifier: setup.passTypeId,
    teamIdentifier: setup.teamId,
    serialNumber: pass.memberId,
    organizationName: pass.brandName,
    description: design.programName,
    authenticationToken,
    webServiceURL: setup.webServiceUrl,
    backgroundColor: hexToRgb(design.colors.background),
    foregroundColor: hexToRgb(design.colors.foreground),
    labelColor: hexToRgb(design.colors.label),
    sharingProhibited: true,
    barcodes: [barcode],
    barcode,
    storeCard: {
      headerFields: [{ key: 'tier', label: 'label.tier', value: `tier.${pass.tier}`, changeMessage: 'change.tier' }],
      primaryFields: [
        {
          key: 'points',
          label: 'label.points',
          value: pass.points,
          numberStyle: 'PKNumberStyleDecimal',
          changeMessage: 'change.points',
        },
      ],
      secondaryFields: [{ key: 'member', label: 'label.member', value: pass.firstName }],
      auxiliaryFields: pass.nextReward
        ? [
            {
              key: 'nextReward',
              label: 'label.nextReward',
              value: `reward.${pass.nextReward.id}`,
              changeMessage: 'change.nextReward',
            },
          ]
        : [],
      backFields: [
        { key: 'howTo', label: '', value: 'back.howTo' },
        { key: 'rewards', label: '', value: 'back.rewards' },
        { key: 'expiry', label: '', value: 'back.expiry' },
        { key: 'help', label: '', value: 'back.help' },
      ],
    },
  };
}

async function sha1Hex(data: Uint8Array): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-1', data as Uint8Array<ArrayBuffer>));
}

/** The files of the pass, before manifest and signature. */
export async function applePassFiles(
  pass: WalletPassData,
  design: WalletDesign,
  setup: Pick<AppleSetup, 'passTypeId' | 'teamId' | 'webServiceUrl'>,
): Promise<Record<string, Uint8Array>> {
  const files: Record<string, Uint8Array> = {
    'pass.json': encoder.encode(JSON.stringify(applePassJson(pass, design, setup, await appleAuthToken(pass)))),
  };
  for (const locale of WALLET_LOCALES) {
    files[`${locale}.lproj/pass.strings`] = encoder.encode(stringsFile(applePassStrings(pass, design, locale)));
  }
  for (const [name, data] of Object.entries(design.appleImages)) files[name] = data;
  if (!files['icon.png']) throw new Error(`Wallet design ${design.slug}: icon.png is required`);
  return files;
}

/** The signed .pkpass. */
export async function buildPkpass(pass: WalletPassData, design: WalletDesign, setup: AppleSetup): Promise<Uint8Array> {
  const files = await applePassFiles(pass, design, setup);
  const manifest: Record<string, string> = {};
  for (const [name, data] of Object.entries(files)) manifest[name] = await sha1Hex(data);
  const manifestBytes = encoder.encode(JSON.stringify(manifest));
  const signature = await setup.sign(manifestBytes);
  return zipStored([
    ...Object.entries(files).map(([name, data]) => ({ name, data })),
    { name: 'manifest.json', data: manifestBytes },
    { name: 'signature', data: signature },
  ]);
}
