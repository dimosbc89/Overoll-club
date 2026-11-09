import { describe, expect, it } from 'vitest';
import {
  ageOn,
  defaultConfig,
  isOldEnoughToJoin,
  isWelcomeGiftValid,
  resolveConfig,
  staffPinSessionExpired,
  validateConfig,
  welcomeGiftExpiresAt,
} from '../src/index.js';

describe('welcome gift', () => {
  it('is valid for 30 days after the first purchase', () => {
    const unlocked = new Date('2027-01-05T09:00:00Z');
    expect(welcomeGiftExpiresAt(unlocked, defaultConfig).toISOString()).toBe('2027-02-04T09:00:00.000Z');
    expect(isWelcomeGiftValid(unlocked, new Date('2027-02-04T08:59:59Z'), defaultConfig)).toBe(true);
    expect(isWelcomeGiftValid(unlocked, new Date('2027-02-04T09:00:00Z'), defaultConfig)).toBe(false);
  });
});

describe('minimum age', () => {
  it('counts whole years on calendar dates', () => {
    expect(ageOn('2011-11-09', '2026-11-09')).toBe(15);
    expect(ageOn('2011-11-10', '2026-11-09')).toBe(14);
    expect(ageOn('2008-02-29', '2023-02-28')).toBe(14);
    expect(ageOn('2008-02-29', '2023-03-01')).toBe(15);
    expect(() => ageOn('09/11/2011', '2026-11-09')).toThrow();
  });
  it('lets people join from their 15th birthday', () => {
    expect(defaultConfig.minimumAge).toBe(15);
    expect(isOldEnoughToJoin('2011-11-09', '2026-11-09', defaultConfig)).toBe(true);
    expect(isOldEnoughToJoin('2011-11-10', '2026-11-09', defaultConfig)).toBe(false);
  });
});

describe('staff PIN session', () => {
  it('locks the console after 5 idle minutes', () => {
    const last = new Date('2027-01-05T09:00:00Z');
    expect(staffPinSessionExpired(last, new Date('2027-01-05T09:04:59Z'), defaultConfig)).toBe(false);
    expect(staffPinSessionExpired(last, new Date('2027-01-05T09:05:00Z'), defaultConfig)).toBe(true);
  });
});

describe('new settings in brand overrides', () => {
  it('validates welcome, minimum age and PIN idle overrides', () => {
    expect(validateConfig(defaultConfig)).toEqual([]);
    expect(resolveConfig({ welcome: { validDays: 14 }, minimumAge: 16 }).welcome.validDays).toBe(14);
    expect(() => resolveConfig({ minimumAge: 10 })).toThrow();
    expect(() => resolveConfig({ limits: { staffPinIdleMinutes: 0 } })).toThrow();
  });
});
