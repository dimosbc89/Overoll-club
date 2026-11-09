import { describe, expect, it } from 'vitest';
import {
  InvalidConfigError,
  defaultConfig,
  earnLimitsLookbackStart,
  isRedemptionExpired,
  isTierAtLeast,
  normalizeRedemptionCode,
  pointsEarnedForTier,
  redemptionCodeAlphabet,
  redemptionCodeFromBytes,
  redemptionExpiresAt,
  resolveConfig,
  tierRank,
  tierWindowStart,
  validateConfig,
} from '../src/index.js';

const problemsOf = (overrides: unknown): readonly string[] => {
  try {
    resolveConfig(overrides);
  } catch (e) {
    if (e instanceof InvalidConfigError) return e.problems;
    throw e;
  }
  return [];
};

describe('resolveConfig (brands.config overrides)', () => {
  it('returns the defaults for an empty, null or missing override, as a copy', () => {
    for (const o of [{}, null, undefined]) {
      const config = resolveConfig(o);
      expect(config).toEqual(defaultConfig);
      expect(config).not.toBe(defaultConfig);
      expect(config.tiers).not.toBe(defaultConfig.tiers);
    }
    expect(validateConfig(defaultConfig)).toEqual([]);
  });

  it('merges nested objects key by key', () => {
    const config = resolveConfig({ limits: { maxAmountCents: 10_000 }, pointsPerEuro: 20 });
    expect(config.limits).toEqual({ ...defaultConfig.limits, maxAmountCents: 10_000 });
    expect(config.pointsPerEuro).toBe(20);
    expect(config.qr).toEqual(defaultConfig.qr);
  });

  it('replaces arrays as a whole', () => {
    const tiers = [
      { id: 'classic', threshold: 0, multiplierPct: 100, rewardDiscountBp: 0 },
      { id: 'gold', threshold: 2000, multiplierPct: 125, rewardDiscountBp: 2000 },
      { id: 'club', threshold: 5000, multiplierPct: 150, rewardDiscountBp: 3000 },
    ];
    expect(resolveConfig({ tiers }).tiers).toEqual(tiers);
    expect(resolveConfig({ expiryReminderDays: [14] }).expiryReminderDays).toEqual([14]);
  });

  it('does not change the defaults', () => {
    const before = JSON.stringify(defaultConfig);
    const config = resolveConfig({ limits: { maxEarnsPerDay: 9 } });
    (config.limits as { maxEarnsPerDay: number }).maxEarnsPerDay = 99;
    expect(JSON.stringify(defaultConfig)).toBe(before);
  });

  it('rejects unknown settings (typos) at any level', () => {
    expect(problemsOf({ pointsPerEur: 10 })).toEqual(['pointsPerEur: unknown setting']);
    expect(problemsOf({ limits: { maxAmount: 1 } })).toEqual(['limits.maxAmount: unknown setting']);
  });

  it('rejects wrong types and out-of-range numbers', () => {
    expect(problemsOf({ pointsPerEuro: '10' })).toEqual(['pointsPerEuro: must be an integer']);
    expect(problemsOf({ pointsPerEuro: 10.5 })).toEqual(['pointsPerEuro: must be an integer']);
    expect(problemsOf({ limits: { maxEarnsPerDay: 0 } })).toEqual(['limits.maxEarnsPerDay: must be between 1 and 1000']);
    expect(problemsOf({ qr: { digits: 12 } })).toEqual(['qr.digits: must be between 6 and 10']);
    expect(problemsOf({ limits: 5 })).toEqual(['limits: must be an object']);
  });

  it('checks the tiers: all three, classic at 0, thresholds increasing', () => {
    const tier = (id: string, threshold: number) => ({ id, threshold, multiplierPct: 100, rewardDiscountBp: 0 });
    expect(problemsOf({ tiers: [tier('classic', 0), tier('club', 4000)] })).toEqual(['tiers: missing gold']);
    expect(problemsOf({ tiers: [tier('classic', 0), tier('gold', 5000), tier('club', 4000)] })).toEqual([
      'tiers: thresholds must increase from classic to gold to club',
    ]);
    expect(problemsOf({ tiers: [tier('classic', 10), tier('gold', 50), tier('club', 90)] })).toEqual([
      'tiers: classic threshold must be 0',
    ]);
    expect(problemsOf({ tiers: [tier('classic', 0), tier('gold', 1), tier('gold', 2), tier('club', 3)] })).toContain(
      'tiers[2].id: "gold" appears twice',
    );
    expect(problemsOf({ tiers: [tier('classic', 0), tier('silver', 1), tier('gold', 2), tier('club', 3)] })).toContain(
      'tiers[1].id: must be one of classic, gold, club',
    );
  });

  it('rejects a non-object override and a "__proto__" key from JSON', () => {
    expect(problemsOf([1, 2])).toEqual(['overrides must be a JSON object']);
    expect(problemsOf('{}')).toEqual(['overrides must be a JSON object']);
    expect(problemsOf(JSON.parse('{"__proto__": {"polluted": true}}'))).toEqual(['__proto__: unknown setting']);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('tier helpers', () => {
  it('ranks tiers and compares them for tier-limited rewards', () => {
    expect([tierRank('classic', defaultConfig), tierRank('gold', defaultConfig), tierRank('club', defaultConfig)]).toEqual([0, 1, 2]);
    expect(isTierAtLeast('gold', 'gold', defaultConfig)).toBe(true);
    expect(isTierAtLeast('club', 'gold', defaultConfig)).toBe(true);
    expect(isTierAtLeast('classic', 'gold', defaultConfig)).toBe(false);
  });

  it('starts the tier window 12 months back, clamping month ends', () => {
    expect(tierWindowStart(new Date('2027-03-31T10:00:00Z'), defaultConfig).toISOString()).toBe('2026-03-31T10:00:00.000Z');
    expect(tierWindowStart(new Date('2028-02-29T10:00:00Z'), defaultConfig).toISOString()).toBe('2027-02-28T10:00:00.000Z');
  });

  it('counts earn, bonus and reversals inside the window only', () => {
    const now = new Date('2027-06-15T12:00:00Z');
    const at = (iso: string) => new Date(iso);
    const entries = [
      { kind: 'earn', points: 100, createdAt: at('2027-06-14T12:00:00Z') },
      { kind: 'bonus', points: 50, createdAt: at('2027-01-01T12:00:00Z') },
      { kind: 'reverse', points: -30, createdAt: at('2027-06-15T11:00:00Z') },
      { kind: 'earn', points: 7, createdAt: now }, // exactly now counts
      { kind: 'redeem', points: -300, createdAt: at('2027-06-01T12:00:00Z') },
      { kind: 'refund_redeem', points: 300, createdAt: at('2027-06-01T12:10:00Z') },
      { kind: 'adjust', points: 1000, createdAt: at('2027-06-01T12:00:00Z') },
      { kind: 'earn', points: 999, createdAt: at('2026-06-15T12:00:00Z') }, // window start is exclusive
      { kind: 'earn', points: 999, createdAt: at('2027-06-15T12:00:01Z') }, // after now
    ];
    expect(pointsEarnedForTier(entries, now, defaultConfig)).toBe(127);
  });
});

describe('earn limit lookback', () => {
  it('reaches back far enough for a 25-hour local day and the double-scan window', () => {
    const now = new Date('2027-01-15T10:00:00Z');
    expect(earnLimitsLookbackStart(now, defaultConfig).toISOString()).toBe('2027-01-14T08:00:00.000Z');
    const long = resolveConfig({ limits: { minSecondsBetweenEarns: 86_400 } });
    expect(earnLimitsLookbackStart(now, long).toISOString()).toBe('2027-01-14T08:00:00.000Z');
  });
});

describe('redemption codes', () => {
  it('uses 32 symbols without look-alikes', () => {
    expect(new Set(redemptionCodeAlphabet).size).toBe(32);
    expect(redemptionCodeAlphabet).not.toMatch(/[01IO]/);
  });

  it('turns random bytes into an 8-character code', () => {
    expect(redemptionCodeFromBytes(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]))).toBe('ABCDEFGH');
    expect(redemptionCodeFromBytes(new Uint8Array([31, 63, 255, 32, 24, 25, 0, 0, 9]))).toBe('999A23AA');
    expect(() => redemptionCodeFromBytes(new Uint8Array(7))).toThrow();
  });

  it('normalizes what staff type or scan', () => {
    expect(normalizeRedemptionCode(' abcd-efgh ')).toBe('ABCDEFGH');
    expect(normalizeRedemptionCode('ABCD EFGH')).toBe('ABCDEFGH');
    expect(normalizeRedemptionCode('ABCDEFG0')).toBeNull();
    expect(normalizeRedemptionCode('ABCDEFG')).toBeNull();
    expect(normalizeRedemptionCode('ABCDEFGHJ')).toBeNull();
  });

  it('reads a code typed on a Greek keyboard or with other separators the same way', () => {
    // Α Β Ε Η Κ Μ Ν Ρ Τ Υ Χ Ζ are Greek capitals that look Latin.
    expect(normalizeRedemptionCode('ΑΒCD ΕFGΗ')).toBe('ABCDEFGH');
    expect(normalizeRedemptionCode('κμνρ-τυχζ')).toBe('KMNPTYXZ');
    expect(normalizeRedemptionCode('ABCD–EFGH')).toBe('ABCDEFGH');
    expect(normalizeRedemptionCode('ABCD.EFGH')).toBe('ABCDEFGH');
    // Greek letters with no Latin twin (Γ, Δ, Λ…) are never part of a code.
    expect(normalizeRedemptionCode('ΓΔCDEFGH')).toBeNull();
  });

  it('expires after the configured minutes, exactly at expiry', () => {
    const created = new Date('2027-01-15T10:00:00Z');
    const expires = redemptionExpiresAt(created, defaultConfig);
    expect(expires.toISOString()).toBe('2027-01-15T10:15:00.000Z');
    expect(isRedemptionExpired(expires, new Date(expires.getTime() - 1))).toBe(false);
    expect(isRedemptionExpired(expires, expires)).toBe(true);
  });
});
