/**
 * Expo app config, one app per brand: EXPO_PUBLIC_BRAND (set by `--brand` in
 * scripts/build-web.ts, and by EAS builds) picks
 *   - supabase/projects/<brand>.json  programName (app name) and appScheme (sign-in links),
 *   - brands/<brand>/native.json      store identity (bundle id, package, slug, icon colour),
 *   - brands/<brand>/*.png            icon, Android adaptive icon, splash image,
 *   (native.json background must equal src/brand/<brand>.ts colors.background: test/app-config.test.ts)
 * Bundle ids can still change until the app record exists in App Store Connect / Play Console.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ConfigContext, ExpoConfig } from 'expo/config';

interface NativeIdentity {
  slug: string;
  iosBundleId: string;
  androidPackage: string;
  iconBackground: string;
  background: string;
}

export function brandSlug(env: Record<string, string | undefined> = process.env): string {
  const slug = env.EXPO_PUBLIC_BRAND?.trim() || 'overoll';
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`EXPO_PUBLIC_BRAND: bad brand slug "${slug}"`);
  return slug;
}

export function appConfig(slug: string, base: Partial<ExpoConfig> = {}): ExpoConfig {
  const read = <T>(path: string): T => JSON.parse(readFileSync(join(__dirname, path), 'utf8')) as T;
  const project = read<{ programName: string; appScheme: string }>(`../../supabase/projects/${slug}.json`);
  const native = read<NativeIdentity>(`brands/${slug}/native.json`);
  const assets = `./brands/${slug}`;
  return {
    ...base,
    name: project.programName,
    slug: native.slug,
    version: '0.1.0',
    scheme: project.appScheme,
    orientation: 'portrait',
    userInterfaceStyle: 'light',
    backgroundColor: native.background,
    icon: `${assets}/icon.png`,
    ios: { bundleIdentifier: native.iosBundleId, supportsTablet: false },
    android: {
      package: native.androidPackage,
      predictiveBackGestureEnabled: false,
      adaptiveIcon: { foregroundImage: `${assets}/adaptive-icon.png`, backgroundColor: native.iconBackground },
    },
    web: { output: 'static', bundler: 'metro' },
    plugins: [
      'expo-router',
      'expo-font',
      [
        'expo-splash-screen',
        { image: `${assets}/splash-icon.png`, imageWidth: 160, resizeMode: 'contain', backgroundColor: native.iconBackground },
      ],
      // Member QR secret in the Keychain / Keystore; kept out of Android backups (a restored key can't decrypt it).
      ['expo-secure-store', { configureAndroidBackup: true }],
    ],
    extra: { ...(base.extra ?? {}), brand: slug },
  };
}

export default ({ config }: ConfigContext): ExpoConfig => appConfig(brandSlug(), config);
