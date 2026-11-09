import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '../../components/Icon';
import { useI18n } from '../../i18n/I18nProvider';
import type { MessageKey } from '../../i18n/messages';
import { font } from '../../theme/fonts';
import { colors, minTouch } from '../../theme/tokens';

const tabs: { name: string; label: MessageKey; icon: IconName }[] = [
  { name: 'index', label: 'tabs.card', icon: 'card' },
  { name: 'rewards', label: 'tabs.rewards', icon: 'gift' },
  { name: 'stores', label: 'tabs.stores', icon: 'pin' },
  { name: 'profile', label: 'tabs.profile', icon: 'user' },
];

/** Bottom bar from the designs: white, line on top, plum-deep for the current tab. */
export default function TabsLayout() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.cream },
        // Design: 6 px above, 10 below, 48 px items (icon + label).
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopColor: colors.line,
          borderTopWidth: 1,
          height: 6 + minTouch + 8 + Math.max(insets.bottom, 10),
          paddingTop: 6,
          paddingBottom: Math.max(insets.bottom, 10),
        },
        tabBarItemStyle: { minHeight: minTouch },
        tabBarActiveTintColor: colors.plumDeep,
        tabBarInactiveTintColor: colors.inkMuted,
        tabBarLabelStyle: { ...font(700), fontSize: 12, lineHeight: 16 },
      }}
    >
      {tabs.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: t(tab.label),
            tabBarAccessibilityLabel: t(tab.label),
            tabBarIcon: ({ color }) => <Icon name={tab.icon} size={22} color={color} strokeWidth={1.75} />,
          }}
        />
      ))}
    </Tabs>
  );
}
