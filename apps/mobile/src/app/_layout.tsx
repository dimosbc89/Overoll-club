import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';

import { I18nProvider } from '../i18n/I18nProvider';
import { SessionProvider } from '../lib/session';
import { fontAssets } from '../theme/fontAssets';
import { colors } from '../theme/tokens';

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);

  // Native: wait for Manrope (a few ms, bundled). Web: render at once, so the
  // static HTML has content; the font swaps in when it arrives.
  if (Platform.OS !== 'web' && !fontsLoaded && !fontError) return null;

  return (
    <I18nProvider>
      <SessionProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />
      </SessionProvider>
    </I18nProvider>
  );
}
