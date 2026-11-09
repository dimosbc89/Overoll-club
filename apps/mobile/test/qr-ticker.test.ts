import { createRotatingToken, defaultConfig, resolveConfig } from '@overoll/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { msUntilNextStep, startTokenTicker } from '../src/lib/qrTicker';

const memberCode = 'K7MP2QXH';
const secret = 'a'.repeat(64);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('msUntilNextStep', () => {
  it('measures to the next epoch-aligned boundary', () => {
    expect(msUntilNextStep(0, 30)).toBe(30_000);
    expect(msUntilNextStep(29_999, 30)).toBe(1);
    expect(msUntilNextStep(30_000, 30)).toBe(30_000);
    expect(msUntilNextStep(1_000_012_345, 30)).toBe(30_000 - (1_000_012_345 % 30_000));
  });
});

describe('rotating member QR', () => {
  it('shows a token at once and a new one exactly when the step changes', () => {
    // 10 s into a 30 s step.
    vi.setSystemTime(new Date('2026-11-09T10:00:10.000Z'));
    const tokens: string[] = [];
    const stop = startTokenTicker({ memberCode, secret, config: defaultConfig, onToken: (tk) => tokens.push(tk) });

    expect(tokens).toEqual([createRotatingToken(memberCode, secret, new Date('2026-11-09T10:00:10.000Z'), defaultConfig)]);
    expect(tokens[0]).toMatch(/^OC1\.K7MP2QXH\.\d{8}$/);

    vi.advanceTimersByTime(19_000); // 10:00:29: same step, no change
    expect(tokens).toHaveLength(1);

    vi.advanceTimersByTime(1_100); // past 10:00:30
    expect(tokens).toHaveLength(2);
    expect(tokens[1]).toBe(createRotatingToken(memberCode, secret, new Date('2026-11-09T10:00:30.000Z'), defaultConfig));
    expect(tokens[1]).not.toBe(tokens[0]);

    vi.advanceTimersByTime(30_000); // 10:01:00
    expect(tokens).toHaveLength(3);

    stop();
    vi.advanceTimersByTime(120_000);
    expect(tokens).toHaveLength(3);
  });

  it('follows qr.stepSeconds from the brand config', () => {
    vi.setSystemTime(new Date('2026-11-09T10:00:00.000Z'));
    const config = resolveConfig({ qr: { stepSeconds: 60 } });
    const tokens: string[] = [];
    const stop = startTokenTicker({ memberCode, secret, config, onToken: (tk) => tokens.push(tk) });
    vi.advanceTimersByTime(45_000);
    expect(tokens).toHaveLength(1);
    vi.advanceTimersByTime(15_100);
    expect(tokens).toHaveLength(2);
    stop();
  });

  it('needs no network: the token comes from the secret and the clock alone', () => {
    vi.setSystemTime(new Date('2026-11-09T10:00:00.000Z'));
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const stop = startTokenTicker({ memberCode, secret, config: defaultConfig, onToken: () => {} });
    vi.advanceTimersByTime(90_000);
    expect(fetchSpy).not.toHaveBeenCalled();
    stop();
    fetchSpy.mockRestore();
  });
});
