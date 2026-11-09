import { describe, expect, it } from 'vitest';
import {
  createRotatingToken,
  createWalletToken,
  defaultConfig as config,
  latinLookalikes,
  normalizeMemberCode,
  oneTimeCode,
  parseToken,
  verifyToken,
} from '../src/index.js';

describe('oneTimeCode', () => {
  // RFC 6238 Appendix B test vectors, SHA-256, 8 digits, 30 s step.
  const rfcSecret = '12345678901234567890123456789012';
  const vectors: Array<[number, string]> = [
    [59, '46119246'],
    [1111111109, '68084774'],
    [1111111111, '67062674'],
    [1234567890, '91819424'],
    [2000000000, '90698825'],
    [20000000000, '77737706'],
  ];
  it.each(vectors)('matches RFC 6238 at T=%i', (seconds, expected) => {
    expect(oneTimeCode(rfcSecret, Math.floor(seconds / 30), 8)).toBe(expected);
  });
});

describe('rotating member QR', () => {
  const secret = 'test-member-secret-0001';
  const now = new Date('2026-12-10T10:00:10Z');

  it('round-trips and verifies', () => {
    const token = createRotatingToken('AB12CD34', secret, now, config);
    expect(token).toMatch(/^OC1\.AB12CD34\.\d{8}$/);
    const parsed = parseToken(token);
    expect(parsed).toEqual({ kind: 'rotating', memberCode: 'AB12CD34', otp: token.split('.')[2] });
    expect(verifyToken(parsed!, secret, 1, now, config)).toBe('ok');
  });

  it('accepts one step of clock drift either way', () => {
    const parsed = parseToken(createRotatingToken('AB12CD34', secret, now, config))!;
    expect(verifyToken(parsed, secret, 1, new Date(now.getTime() + 30_000), config)).toBe('ok');
    expect(verifyToken(parsed, secret, 1, new Date(now.getTime() - 30_000), config)).toBe('ok');
  });

  it('reports a screenshot from minutes ago as expired', () => {
    const parsed = parseToken(createRotatingToken('AB12CD34', secret, now, config))!;
    expect(verifyToken(parsed, secret, 1, new Date(now.getTime() + 5 * 60_000), config)).toBe('expired');
  });

  it('rejects a code made with another secret', () => {
    const parsed = parseToken(createRotatingToken('AB12CD34', 'someone-else', now, config))!;
    expect(verifyToken(parsed, secret, 1, now, config)).toBe('invalid');
  });
});

describe('wallet pass QR', () => {
  const secret = 'test-member-secret-0001';
  const now = new Date('2026-12-10T10:00:10Z');

  it('is static, unforgeable and dies when the pass is reissued', () => {
    const token = createWalletToken('AB12CD34', secret, 1);
    expect(token).toMatch(/^OCW\.AB12CD34\.1\.[0-9a-f]{10}$/);
    const parsed = parseToken(token)!;
    expect(verifyToken(parsed, secret, 1, now, config)).toBe('ok');
    expect(verifyToken(parsed, secret, 2, now, config)).toBe('old_pass');
    expect(verifyToken(parsed, 'wrong-secret', 1, now, config)).toBe('invalid');
  });
});

describe('parseToken', () => {
  it('ignores anything that is not an Overoll Club code', () => {
    expect(parseToken('https://example.com')).toBeNull();
    expect(parseToken('OC1.ab12cd34.12345678')).toBeNull(); // lower-case member code
    expect(parseToken('  OC1.AB12CD34.12345678  ')?.kind).toBe('rotating');
  });
});

describe('typed member code', () => {
  it('reads the code under the QR however it is typed', () => {
    expect(normalizeMemberCode('ABCD2345')).toBe('ABCD2345');
    expect(normalizeMemberCode(' abcd 2345 ')).toBe('ABCD2345');
    expect(normalizeMemberCode('abcd-2345')).toBe('ABCD2345');
    expect(normalizeMemberCode('ABCD — 2345')).toBe('ABCD2345');
    expect(normalizeMemberCode('ΑΒCD 2345')).toBe('ABCD2345');
    expect(normalizeMemberCode('κηmn 2345')).toBe('KHMN2345');
  });

  it('refuses anything that cannot be a member code', () => {
    expect(normalizeMemberCode('')).toBeNull();
    expect(normalizeMemberCode('ABC')).toBeNull();
    expect(normalizeMemberCode('ABCD 2345 ABCD 23456')).toBeNull();
    expect(normalizeMemberCode('ΓΔΛΞ2345')).toBeNull();
    expect(normalizeMemberCode('ABCD/2345')).toBeNull();
    // A full QR token is not a typed code (the console sends it as a token).
    expect(normalizeMemberCode('OC1.ABCD2345.12345678')).toBeNull();
  });

  it('maps only the Greek capitals that look Latin', () => {
    expect(latinLookalikes('ΑΒΕΖΗΙΚΜΝΟΡΤΥΧ')).toBe('ABEZHIKMNOPTYX');
    expect(latinLookalikes('άέή')).toBe('AEH');
    expect(latinLookalikes('ΓΔΘΛΞΠΣΦΨΩ')).toBe('ΓΔΘΛΞΠΣΦΨΩ');
  });
});
