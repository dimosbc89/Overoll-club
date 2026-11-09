import { Tabs } from 'expo-router';

import { Wordmark } from '../../components/Wordmark';
import { useI18n } from '../../i18n/I18nProvider';
import type { MessageKey } from '../../i18n/messages';
import { fonts } from '../../theme/fonts';
import { colors, minTouch } from '../../theme/tokens';

const tabs: { name: string; label: MessageKey }[] = [
  { name: 'index', label: 'tabs.card' },
  { name: 'rewards', label: 'tabs.rewards' },
  { name: 'stores', label: 'tabs.stores' },
  { name: 'profile', label: 'tabs.profile' },
];

export default function TabsLayout() {
  const { t } = useI18n();

  return (
    <Tabs
      screenOptions={{
        headerTitle: () => <Wordmark />,
        headerTitleAlign: 'center',
        headerStyle: { backgroundColor: colors.cocoa },
        headerTintColor: colors.pink,
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: colors.cream },
        tabBarStyle: { backgroundColor: colors.white, borderTopColor: colors.butter },
        tabBarItemStyle: { minHeight: minTouch },
        tabBarActiveTintColor: colors.cocoa,
        tabBarInactiveTintColor: colors.ink,
        tabBarActiveBackgroundColor: colors.pinkLight,
        // Text-only tabs until the icon set is designed.
        tabBarIcon: () => null,
        tabBarIconStyle: { display: 'none' },
        tabBarLabelPosition: 'beside-icon',
        tabBarLabelStyle: { fontFamily: fonts.sans, fontSize: 12, fontWeight: '600', marginHorizontal: 0 },
      }}
    >
      {tabs.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{ title: t(tab.label), tabBarAccessibilityLabel: t(tab.label) }}
        />
      ))}
    </Tabs>
  );
}
