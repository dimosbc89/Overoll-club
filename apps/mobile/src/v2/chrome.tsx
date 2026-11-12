import { useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { PageHead } from '../components/PageHead';
import { useI18n } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/messages';
import type { V2IconName } from './iconMarkup';
import { c, columnWidth, radius, space, t } from './theme';
import { BackButton, Icon, Lockup } from './ui';

/**
 * Signed-in page: fixed header with the logo (and a back button on sub-screens),
 * scrolling column (24 px sides), the bottom bar comes from the tab layout.
 */
export function AppScreen({
  title,
  onBack,
  children,
  gap = space[12],
  onRefresh,
  contentStyle,
}: {
  title: string;
  onBack?: () => void;
  children: ReactNode;
  gap?: number;
  onRefresh?: () => Promise<void>;
  contentStyle?: object;
}) {
  const { t: tr } = useI18n();
  const [refreshing, setRefreshing] = useState(false);
  const pull = onRefresh
    ? () => {
        setRefreshing(true);
        onRefresh().finally(() => setRefreshing(false));
      }
    : undefined;
  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <PageHead title={tr('meta.pageTitle', { page: title })} />
      <View style={styles.header}>
        <View style={styles.headerColumn}>
          {onBack ? (
            <View style={styles.headerBack}>
              <BackButton onPress={onBack} label={tr('v2.back')} />
            </View>
          ) : null}
          <Lockup />
        </View>
      </View>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={pull ? <RefreshControl refreshing={refreshing} onRefresh={pull} tintColor={c.brand} colors={[c.brand]} /> : undefined}
      >
        <View style={[styles.column, { gap }, contentStyle]}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

/** Screen title with an optional sticker on the right (Δώρα · «Έχεις 1.180 πόντους»). */
export function TitleRow({ title, sticker }: { title: string; sticker?: ReactNode }) {
  return (
    <View style={styles.titleRow}>
      <Text accessibilityRole="header" style={[t.displayM, styles.titleText]}>
        {title}
      </Text>
      {sticker}
    </View>
  );
}

const tabs: { name: string; label: MessageKey; icon: V2IconName }[] = [
  { name: 'index', label: 'tabs.card', icon: 'card' },
  { name: 'rewards', label: 'tabs.rewards', icon: 'gift' },
  { name: 'stores', label: 'tabs.stores', icon: 'pin' },
  { name: 'profile', label: 'tabs.profile', icon: 'user' },
];

/** What the tab layout hands its tab bar (the part of React Navigation's props used here). */
interface TabBarProps {
  state: { index: number; routes: { key: string; name: string }[] };
  navigateToTab: (routeKey: string) => void;
}

/** Bottom bar: white, rounded top, active tab = green pill with ink outline + bold green label. */
export function BottomNav({ state, navigateToTab }: TabBarProps) {
  const { t: tr } = useI18n();
  const insets = useSafeAreaInsets();
  const name = state.routes[state.index]?.name;
  // Sub-screens keep their parent tab active.
  const current = name === 'redeem' ? 'rewards' : name === 'history' ? 'profile' : name;
  return (
    <View style={[styles.nav, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.navRow} accessibilityRole="tablist">
        {tabs.map((tab) => {
          const route = state.routes.find((r) => r.name === tab.name);
          if (!route) return null;
          const active = current === tab.name;
          const label = tr(tab.label);
          return (
            <Pressable
              key={tab.name}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={label}
              onPress={() => {
                if (name !== route.name) navigateToTab(route.key);
              }}
              style={styles.navItem}
            >
              <View style={[styles.navPill, active && styles.navPillActive]}>
                <Icon name={tab.icon} size={24} color={active ? c.onBrand : c.ink} />
              </View>
              <Text numberOfLines={1} style={[t.nav, active && { ...t.nav, fontWeight: '800', color: c.brand }]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Onboarding progress: done = green, current = sun (wider), next = white; "{current} από {total}". */
export function Steps({ current, total }: { current: number; total: number }) {
  const { t: tr } = useI18n();
  return (
    <View style={styles.steps} accessible accessibilityLabel={tr('v2.steps', { current, total })}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={[
            styles.step,
            i + 1 < current && { backgroundColor: c.brand },
            i + 1 === current && { backgroundColor: c.sun, width: 36 },
          ]}
        />
      ))}
      <Text style={t.bodySStrong}>{tr('v2.steps', { current, total })}</Text>
    </View>
  );
}

/**
 * Onboarding and sign-up page: bar with back, steps and «Παράλειψη»; scrolling
 * content; buttons pinned at the bottom. No logo header, no bottom bar.
 */
export function FlowScreen({
  title,
  onBack,
  step,
  onSkip,
  children,
  footer,
  gap = space[16],
  tone = 'app',
}: {
  title: string;
  onBack?: () => void;
  step?: { current: number; total: number };
  onSkip?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  gap?: number;
  tone?: 'app' | 'brand';
}) {
  const { t: tr } = useI18n();
  const bg = tone === 'brand' ? c.brand : c.app;
  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.screen, { backgroundColor: bg }]}>
      <PageHead title={tr('meta.pageTitle', { page: title })} />
      {onBack || step || onSkip ? (
        <View style={styles.flowBarWrap}>
          <View style={styles.flowBar}>
            {onBack ? <BackButton onPress={onBack} label={tr('v2.back')} /> : null}
            <View style={styles.flex} />
            {step ? <Steps {...step} /> : null}
            {onSkip ? (
              <Pressable accessibilityRole="button" onPress={onSkip} style={styles.skip} hitSlop={6}>
                <Text style={[t.bodyMStrong, { color: c.brand, textDecorationLine: 'underline' }]}>{tr('v2.skip')}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
      <ScrollView style={styles.flex} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={[styles.column, styles.flowColumn, { gap }]}>{children}</View>
      </ScrollView>
      {footer ? (
        <View style={styles.footerWrap}>
          <View style={styles.footer}>{footer}</View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: c.app },
  header: { height: 60, alignItems: 'center', backgroundColor: c.app },
  headerColumn: { width: '100%', maxWidth: columnWidth, height: 60, alignItems: 'center', justifyContent: 'center' },
  headerBack: { position: 'absolute', left: space[16], top: 8 },
  scroll: { flexGrow: 1, alignItems: 'center' },
  column: {
    width: '100%',
    maxWidth: columnWidth,
    paddingHorizontal: space[24],
    paddingTop: space[8],
    paddingBottom: space[24],
    flexGrow: 1,
  },
  flowColumn: { paddingTop: space[16] },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[8], minHeight: 64 },
  titleText: { flexShrink: 1 },
  nav: {
    backgroundColor: c.surface,
    borderTopWidth: 2,
    borderTopColor: c.borderSubtle,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: 8,
    alignItems: 'center',
  },
  navRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', maxWidth: columnWidth, paddingHorizontal: 3 },
  navItem: { flex: 1, height: 64, alignItems: 'center', justifyContent: 'center', gap: 4 },
  navPill: { width: 60, height: 32, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  navPillActive: { backgroundColor: c.brand, borderWidth: 2, borderColor: c.ink },
  steps: { flexDirection: 'row', alignItems: 'center', gap: space[8] },
  step: { width: 24, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: c.ink, backgroundColor: c.surface },
  flowBarWrap: { alignItems: 'center' },
  flowBar: {
    width: '100%',
    maxWidth: columnWidth,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[12],
    paddingLeft: 16,
    paddingRight: 12,
  },
  skip: { height: 44, justifyContent: 'center', paddingHorizontal: 8 },
  footerWrap: { alignItems: 'center' },
  footer: { width: '100%', maxWidth: columnWidth, paddingHorizontal: space[24], paddingTop: space[8], paddingBottom: space[8], gap: space[8], alignItems: 'center' },
});
