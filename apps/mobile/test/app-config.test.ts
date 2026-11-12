import { describe, expect, it } from 'vitest';

import eas from '../eas.json';
import { brands } from '../src/brand';

// app.config.ts builds each brand's native app from these files (it needs Node, so the
// test checks the files it reads rather than importing it).
const native = import.meta.glob<{
  slug: string;
  iosBundleId: string;
  androidPackage: string;
  iconBackground: string;
  background: string;
  version?: string;
}>('../brands/*/native.json', { eager: true, import: 'default' });
const projects = import.meta.glob<{ programName: string; appScheme: string }>('../../../supabase/projects/*.json', {
  eager: true,
  import: 'default',
});
const images = import.meta.glob<string>('../brands/*/*.png', { eager: true, import: 'default' });

const slugs = Object.keys(brands);

describe('native app identity per brand', () => {
  it('every brand has its native.json and images, and nothing else lives in brands/', () => {
    expect(Object.keys(native).map((p) => p.split('/')[2]).sort()).toEqual([...slugs].sort());
    for (const slug of slugs) {
      for (const file of ['icon.png', 'adaptive-icon.png', 'splash-icon.png']) {
        expect(images[`../brands/${slug}/${file}`], `${slug}/${file}`).toBeDefined();
      }
    }
  });

  it('bundle ids, packages and slugs are valid and differ between brands', () => {
    const ids = slugs.map((s) => native[`../brands/${s}/native.json`]!);
    for (const n of ids) {
      expect(n.iosBundleId).toMatch(/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*){2,}$/);
      expect(n.androidPackage).toMatch(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$/);
      expect(n.slug).toMatch(/^[a-z0-9-]+$/);
    }
    for (const key of ['iosBundleId', 'androidPackage', 'slug'] as const) {
      expect(new Set(ids.map((n) => n[key])).size, key).toBe(ids.length);
    }
  });

  it('store versions are plain x.y.z', () => {
    for (const slug of slugs) {
      const version = native[`../brands/${slug}/native.json`]!.version;
      if (version !== undefined) expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it('native colours match the brand theme, and the app scheme is the project one', () => {
    for (const slug of slugs) {
      const n = native[`../brands/${slug}/native.json`]!;
      const project = projects[`../../../supabase/projects/${slug}.json`]!;
      expect(n.background).toBe(brands[slug as keyof typeof brands]!.colors.background);
      expect(n.iconBackground).toMatch(/^#[0-9a-f]{6}$/);
      expect(project.appScheme).toMatch(/^[a-z][a-z0-9]+$/);
      expect(project.programName.trim()).not.toBe('');
    }
  });
});

// Native builds (EAS) get the same public settings the web build takes from supabase/projects.

describe('EAS build profiles', () => {
  const full = import.meta.glob<{ brand: string; projectRef: string; publishableKey: string; siteUrl: string }>(
    '../../../supabase/projects/*.json',
    { eager: true, import: 'default' },
  );
  it('one profile per brand, with that brand project settings', () => {
    const build = eas.build as Record<string, { env?: Record<string, string> }>;
    for (const p of Object.values(full)) {
      expect(build[p.brand]?.env, p.brand).toEqual({
        EXPO_PUBLIC_BRAND: p.brand,
        EXPO_PUBLIC_SUPABASE_URL: `https://${p.projectRef}.supabase.co`,
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: p.publishableKey,
        EXPO_PUBLIC_CLUB_URL: p.siteUrl,
      });
    }
  });
});
