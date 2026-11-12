import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '../../components/Icon';
import { useI18n } from '../../i18n/I18nProvider';
import type { MessageKey } from '../../i18n/messages';
import { font } from '../../theme/fonts';
import { useSession } from '../../lib/session';
import { colors, minTouch } from '../../theme/tokens';
import { BottomNav } from '../../v2/chrome';
import { c as v2Colors, isV2 } from '../../v2/theme';

const tabs: { name: string; label: MessageKey; icon: IconName }[] = [
  { name: 'index', label: 'tabs.card', icon: 'card' },
  { name: 'rewards', label: 'tabs.rewards', icon: 'gift' },
  { name: 'stores', label: 'tabs.stores', icon: 'pin' },
  { name: 'profile', label: 'tabs.profile', icon: 'user' },
];

/** A tab without a button that takes no room in the classic bar. */
const noButton = { tabBarButton: () => null, tabBarItemStyle: { display: 'none' as const } };

/** Bottom bar from the designs: white, line on top, plum-deep for the current tab. */
export default function TabsLayout() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { member } = useSession();

  return (
    <Tabs
      // v2: the design's own bar, only for signed-in members (the intro and sign-up have none).
      tabBar={isV2 ? (props) => (member.status === 'ready' ? <BottomNav {...props} /> : null) : undefined}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: isV2 ? v2Colors.app : colors.background },
        // Design: 6 px above, 10 below, 48 px items (icon + label).
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
          borderTopWidth: 1,
          height: 6 + minTouch + 8 + Math.max(insets.bottom, 10),
          paddingTop: 6,
          paddingBottom: Math.max(insets.bottom, 10),
        },
        tabBarItemStyle: { minHeight: minTouch },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
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
      {/* Sub-screens: no tab button of their own (the v2 bar keeps their parent active).
          Not `href: null`: expo-router redirects away from hidden tabs. Classic keeps the
          code screen full-screen, as before it moved into this group. */}
      <Tabs.Screen
        name="redeem"
        options={{ title: t('redeem.code.title'), ...noButton, ...(isV2 ? {} : { tabBarStyle: { display: 'none' } }) }}
      />
      <Tabs.Screen name="history" options={{ title: t('history.title'), ...noButton }} />
    </Tabs>
  );
}
