import { describe, expect, it } from 'vitest';

import appConfig from '../app.config.ts?raw';
import { brands } from '../src/brand';
import { koalaArt } from '../src/brand/koalaArt';
import { nativeSplashMarkWidth, splashDecos, splashFrame, splashLayout, splashMark } from '../src/v2/splashLayout';

const native = import.meta.glob<{ iconBackground: string }>('../brands/*/native.json', { eager: true, import: 'default' });

describe('opening screen (Figma 01 Splash)', () => {
  it('starts from the native splash: same mark width and the same green', () => {
    expect(appConfig).toContain(`imageWidth: ${nativeSplashMarkWidth},`);
    for (const b of Object.values(brands)) {
      if (!b.v2) continue;
      expect(native[`../brands/${b.slug}/native.json`]!.iconBackground.toLowerCase(), b.slug).toBe(b.v2.colors.brand.toLowerCase());
    }
  });

  it('draws the Figma frame 1:1 on a 390 × 844 phone, the mark starting at the screen centre', () => {
    const aspect = 162.27 / 150;
    const l = splashLayout(390, 844, aspect);
    expect(l.scale).toBe(1);
    expect(l.left).toBe(0);
    expect(l.top).toBe(0);
    expect(l.markStart.translateY).toBeCloseTo(422 - (splashMark.top + 75), 5);
    expect(l.markStart.scale).toBeCloseTo(nativeSplashMarkWidth / 162.27, 3);
  });

  it('fits the whole frame on small and large screens (never crops)', () => {
    for (const [w, h] of [[375, 667], [430, 932], [360, 800], [820, 1180]] as const) {
      const l = splashLayout(w, h, 1.08);
      expect(splashFrame.width * l.scale).toBeLessThanOrEqual(w + 1e-9);
      expect(splashFrame.height * l.scale).toBeLessThanOrEqual(h + 1e-9);
      // Scaled about its centre, the frame's centre lands on the screen's centre.
      expect(l.left + splashFrame.width / 2).toBeCloseTo(w / 2, 9);
      expect(l.top + splashFrame.height / 2).toBeCloseTo(h / 2, 9);
      // The mark's first frame is as wide as on the native splash.
      expect(splashMark.height * 1.08 * l.scale * l.markStart.scale).toBeCloseTo(nativeSplashMarkWidth, 6);
    }
  });

  it('uses illustrations the brand has, inside the frame', () => {
    for (const d of splashDecos) {
      expect(koalaArt[d.name], d.name).toBeDefined();
      expect(d.left).toBeGreaterThanOrEqual(0);
      expect(d.top).toBeGreaterThanOrEqual(0);
      expect(d.left + d.size).toBeLessThanOrEqual(splashFrame.width);
      expect(d.top + d.size).toBeLessThanOrEqual(splashFrame.height);
    }
  });
});
