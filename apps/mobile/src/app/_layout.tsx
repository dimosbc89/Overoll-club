import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { I18nProvider } from '../i18n/I18nProvider';
import { colors } from '../theme/tokens';

export default function RootLayout() {
  return (
    <I18nProvider>
      {/* Light icons on the cocoa header bar. */}
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.cream } }} />
    </I18nProvider>
  );
}
