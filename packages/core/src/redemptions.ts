import type { ProgramConfig } from './config.js';

/**
 * Redemption codes: what the member shows at the till and staff may type in.
 * 8 characters from 32 symbols without look-alikes (no 0/O, 1/I), the same
 * alphabet as member codes. 32 symbols means `byte % 32` is unbiased.
 */
export const redemptionCodeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const redemptionCodeLength = 8;

const codePattern = new RegExp(`^[${redemptionCodeAlphabet}]{${redemptionCodeLength}}$`);

/** Build a code from random bytes (the caller supplies them, e.g. crypto.getRandomValues). */
export function redemptionCodeFromBytes(bytes: Uint8Array): string {
  if (bytes.length < redemptionCodeLength) {
    throw new Error(`Need at least ${redemptionCodeLength} random bytes`);
  }
  let code = '';
  for (let i = 0; i < redemptionCodeLength; i++) {
    code += redemptionCodeAlphabet[bytes[i]! % redemptionCodeAlphabet.length];
  }
  return code;
}

/** Clean up a scanned or typed code (case, spaces, dashes); null if it can't be a code. */
export function normalizeRedemptionCode(raw: string): string | null {
  const text = raw.trim().toUpperCase().replace(/[\s-]+/g, '');
  return codePattern.test(text) ? text : null;
}

/** When a code created at `createdAt` stops working. */
export function redemptionExpiresAt(createdAt: Date, config: ProgramConfig): Date {
  return new Date(createdAt.getTime() + config.redemptionValidMinutes * 60_000);
}

/** A code is usable strictly before its expiry time. */
export function isRedemptionExpired(expiresAt: Date, now: Date): boolean {
  return now.getTime() >= expiresAt.getTime();
}
