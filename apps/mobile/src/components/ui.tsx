import Head from 'expo-router/head';
import type { ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { useI18n } from '../i18n/I18nProvider';
import { fonts } from '../theme/fonts';
import { colors, maxContentWidth, minTouch, radius, space } from '../theme/tokens';

/** Scrollable cream page with a centred column (narrow on the web app). `title` names the browser tab. */
export function Screen({ title, children }: { title: string; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
      <Head>
        <title>{t('meta.pageTitle', { page: title })}</title>
      </Head>
      <View style={styles.column}>{children}</View>
    </ScrollView>
  );
}

/** Serif display heading, tight tracking like the website. */
export function Title({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return (
    <Text accessibilityRole="header" style={[styles.title, style]}>
      {children}
    </Text>
  );
}

export function Body({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.body, style]}>{children}</Text>;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  variant?: 'primary' | 'secondary';
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Primary = pink with cocoa text (8.5:1). Never white text on pink. */
export function Button({
  label,
  variant = 'primary',
  selected,
  disabled,
  style,
  accessibilityState,
  ...rest
}: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, selected: !!selected, ...accessibilityState }}
      disabled={disabled}
      hitSlop={4}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' ? styles.buttonPrimary : styles.buttonSecondary,
        selected && styles.buttonSelected,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
        style,
      ]}
      {...rest}
    >
      <Text style={[styles.buttonLabel, selected && styles.buttonLabelSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  screenContent: { padding: space.md, paddingBottom: space.xl, alignItems: 'center' },
  column: { width: '100%', maxWidth: maxContentWidth, gap: space.md },
  title: {
    fontFamily: fonts.serif,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '400',
    letterSpacing: -1,
    color: colors.cocoa,
  },
  body: { fontFamily: fonts.sans, fontSize: 16, lineHeight: 24, color: colors.ink },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.butter,
    padding: space.md,
    gap: space.xs,
  },
  button: {
    minHeight: Math.max(minTouch, 48),
    minWidth: minTouch,
    paddingHorizontal: space.lg,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: { backgroundColor: colors.pink },
  buttonSecondary: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.cocoa },
  buttonSelected: { backgroundColor: colors.pinkLight, borderWidth: 2, borderColor: colors.cocoa },
  buttonDisabled: { opacity: 0.55 },
  buttonPressed: { opacity: 0.8 },
  buttonLabel: { fontFamily: fonts.sans, fontSize: 17, fontWeight: '600', color: colors.cocoa },
  buttonLabelSelected: { fontWeight: '700' },
});
