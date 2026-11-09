import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import type { ProgramConfig } from './config.js';
import { cleanTypedCode } from './lookalikes.js';

/**
 * Member QR codes.
 *
 * App / web card — rotating, works offline (like a bank's one-time code):
 *   OC1.<memberCode>.<otp>
 *   otp = 8 digits from HMAC-SHA256(memberSecret, time step), time step = 30 s.
 *   A screenshot stops working within about a minute.
 *
 * Wallet pass — static (Wallet can't rotate a code offline), still unforgeable:
 *   OCW.<memberCode>.<passVersion>.<sig>
 *   sig = first 10 hex chars of HMAC-SHA256(memberSecret, "wallet:<passVersion>").
 *   Reissuing a pass bumps passVersion, which kills the old code.
 *
 * memberCode is public (it identifies the member); memberSecret is per member,
 * created by the server and stored on the device for offline codes.
 * @noble/hashes is pure JS, so this runs the same in Node, Deno (Supabase
 * functions), browsers and React Native.
 */

const encoder = new TextEncoder();

function toBytes(secret: string | Uint8Array): Uint8Array {
  return typeof secret === 'string' ? encoder.encode(secret) : secret;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** 8-byte big-endian counter, as in RFC 4226. */
function counterBytes(counter: number): Uint8Array {
  const out = new Uint8Array(8);
  let value = counter;
  for (let i = 7; i >= 0; i--) {
    out[i] = value & 0xff;
    value = Math.floor(value / 256);
  }
  return out;
}

/** HOTP-style dynamic truncation to `digits` digits. */
export function oneTimeCode(secret: string | Uint8Array, counter: number, digits: number): string {
  const mac = hmac(sha256, toBytes(secret), counterBytes(counter));
  const offset = mac[mac.length - 1]! & 0x0f;
  const binary =
    ((mac[offset]! & 0x7f) << 24) |
    (mac[offset + 1]! << 16) |
    (mac[offset + 2]! << 8) |
    mac[offset + 3]!;
  return String(binary % 10 ** digits).padStart(digits, '0');
}

export function timeStep(now: Date, config: ProgramConfig): number {
  return Math.floor(now.getTime() / 1000 / config.qr.stepSeconds);
}

/** The code the app shows right now. */
export function createRotatingToken(
  memberCode: string,
  secret: string | Uint8Array,
  now: Date,
  config: ProgramConfig,
): string {
  return `OC1.${memberCode}.${oneTimeCode(secret, timeStep(now, config), config.qr.digits)}`;
}

export function createWalletToken(
  memberCode: string,
  secret: string | Uint8Array,
  passVersion: number,
): string {
  const sig = hex(hmac(sha256, toBytes(secret), encoder.encode(`wallet:${passVersion}`))).slice(0, 10);
  return `OCW.${memberCode}.${passVersion}.${sig}`;
}

export type ParsedToken =
  | { kind: 'rotating'; memberCode: string; otp: string }
  | { kind: 'wallet'; memberCode: string; passVersion: number; sig: string };

/** Member codes as stored (`members.member_code`); new ones are 8 characters of the redemption-code alphabet. */
const memberCodePattern = /^[A-Z0-9]{6,16}$/;

/**
 * The member code printed under the QR (shown in groups of 4, "ABCD 2345"),
 * typed by the cashier when the card won't scan. Case, spaces, dashes and
 * Greek capitals that look Latin don't matter (core `cleanTypedCode`). Null
 * if it can't be a member code. The code is public, so a typed code only
 * identifies the member (to earn points): the cashier checks the first name,
 * and rewards still need a redemption code from the member's app.
 */
export function normalizeMemberCode(raw: string): string | null {
  const text = cleanTypedCode(raw);
  return memberCodePattern.test(text) ? text : null;
}

/** Split a scanned string; null if it isn't an Overoll Club member code. */
export function parseToken(raw: string): ParsedToken | null {
  const text = raw.trim();
  const rotating = /^OC1\.([A-Z0-9]{6,16})\.(\d{6,10})$/.exec(text);
  if (rotating) return { kind: 'rotating', memberCode: rotating[1]!, otp: rotating[2]! };
  const wallet = /^OCW\.([A-Z0-9]{6,16})\.(\d{1,6})\.([0-9a-f]{10})$/.exec(text);
  if (wallet) {
    return { kind: 'wallet', memberCode: wallet[1]!, passVersion: Number(wallet[2]), sig: wallet[3]! };
  }
  return null;
}

/** Constant-time string comparison. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type TokenCheck = 'ok' | 'invalid' | 'expired' | 'old_pass';

/**
 * Verify a scanned token against the member's secret (looked up by memberCode
 * on the server). Rotating codes are accepted for ±acceptedDriftSteps.
 */
export function verifyToken(
  token: ParsedToken,
  secret: string | Uint8Array,
  currentPassVersion: number,
  now: Date,
  config: ProgramConfig,
): TokenCheck {
  if (token.kind === 'wallet') {
    if (token.passVersion !== currentPassVersion) return 'old_pass';
    const expected = createWalletToken(token.memberCode, secret, token.passVersion).split('.')[3]!;
    return safeEqual(expected, token.sig) ? 'ok' : 'invalid';
  }
  const step = timeStep(now, config);
  const drift = config.qr.acceptedDriftSteps;
  for (let d = -drift; d <= drift; d++) {
    if (safeEqual(oneTimeCode(secret, step + d, config.qr.digits), token.otp)) return 'ok';
  }
  // Distinguish a stale screenshot (matched a few minutes ago) from garbage.
  for (let d = drift + 1; d <= drift + 20; d++) {
    if (safeEqual(oneTimeCode(secret, step - d, config.qr.digits), token.otp)) return 'expired';
  }
  return 'invalid';
}
