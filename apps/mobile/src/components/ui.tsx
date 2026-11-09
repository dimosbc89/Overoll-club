import Head from 'expo-router/head';
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useI18n } from '../i18n/I18nProvider';
import { font, type } from '../theme/fonts';
import { colors, controlHeight, maxContentWidth, minTouch, radius, space } from '../theme/tokens';
import { Icon } from './Icon';

/**
 * Cream page with a centred column (the designs are 390 wide). `title` names
 * the browser tab. Children stack with `gap`; give the last block
 * `marginTop: 'auto'` to pin it to the bottom on tall screens.
 */
export function Screen({
  title,
  children,
  gap = space.md,
  header,
  onRefresh,
}: {
  title: string;
  children: ReactNode;
  gap?: number;
  /** Full-width block above the column (e.g. the pink join header). */
  header?: ReactNode;
  /** Pull to refresh. */
  onRefresh?: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [refreshing, setRefreshing] = useState(false);
  const pull = onRefresh
    ? () => {
        setRefreshing(true);
        onRefresh().finally(() => setRefreshing(false));
      }
    : undefined;
  return (
    <SafeAreaView edges={header ? [] : ['top']} style={styles.screen}>
      <Head>
        <title>{t('meta.pageTitle', { page: title })}</title>
      </Head>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={pull ? <RefreshControl refreshing={refreshing} onRefresh={pull} tintColor={colors.plumDeep} colors={[colors.plumDeep]} /> : undefined}
      >
        {header}
        <View style={[styles.column, { gap }]}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function Title({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return (
    <Text accessibilityRole="header" style={[type.title, style]}>
      {children}
    </Text>
  );
}

export function Body({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[type.body, style]}>{children}</Text>;
}

export function Muted({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[type.small, style]}>{children}</Text>;
}

/** White surface, radius 16, soft shadow (design `--shadow-card`). */
export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

type ButtonVariant = 'filled' | 'outline' | 'paper';

interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
  selected?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Pill button. Filled = pink with ink text; outline = plum ring; paper = white.
 * Pressed: plum-deep with white text, as in the design system.
 */
export function Button({
  label,
  variant = 'filled',
  size = 'md',
  selected,
  loading,
  disabled,
  style,
  accessibilityState,
  ...rest
}: ButtonProps) {
  const inactive = !!disabled || !!loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, selected: !!selected, busy: !!loading, ...accessibilityState }}
      disabled={inactive}
      hitSlop={size === 'sm' ? 6 : 0}
      style={({ pressed }) => [
        styles.button,
        size === 'sm' && styles.buttonSm,
        styles[variant],
        selected && styles.selected,
        pressed && !inactive && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
      {...rest}
    >
      {({ pressed }) =>
        loading ? (
          <ActivityIndicator color={colors.ink} />
        ) : (
          <Text style={[type.label, styles.buttonLabel, (pressed || selected) && !inactive && styles.pressedLabel]}>
            {label}
          </Text>
        )
      }
    </Pressable>
  );
}

/** Text link (plum-deep, bold), at least 44 high. */
export function LinkButton({
  label,
  onPress,
  accessibilityHint,
  style,
}: {
  label: string;
  onPress: () => void;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      style={({ pressed }) => [styles.link, pressed && { opacity: 0.7 }, style]}
    >
      <Text style={[type.label, { color: colors.plumDeep }]}>{label}</Text>
    </Pressable>
  );
}

type TagTone = 'pink' | 'plum' | 'paper' | 'outline';

export function Tag({ label, tone = 'pink', style }: { label: string; tone?: TagTone; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.tag, tagTones[tone], style]}>
      <Text style={[type.label, styles.tagLabel, { color: tone === 'plum' ? colors.white : tone === 'outline' ? colors.plumDeep : colors.ink }]}>
        {label}
      </Text>
    </View>
  );
}

/** Rounded bar; `value` and `max` are integers (points, seconds). */
export function ProgressBar({
  value,
  max,
  label,
  track = colors.line,
  height = 10,
}: {
  value: number;
  max: number;
  label: string;
  track?: string;
  height?: number;
}) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max, now: Math.min(Math.max(value, 0), max) }}
      style={[styles.track, { backgroundColor: track, height }]}
    >
      <View style={[styles.fill, { width: `${Math.round(ratio * 1000) / 10}%` }]} />
    </View>
  );
}

export function Checkbox({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  hint?: string;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      accessibilityHint={hint}
      onPress={() => onChange(!checked)}
      style={({ pressed }) => [styles.checkRow, pressed && { opacity: 0.8 }]}
    >
      <View style={[styles.box, checked && styles.boxChecked]}>
        {checked ? <Icon name="check" size={18} color={colors.white} strokeWidth={2.5} /> : null}
      </View>
      <View style={styles.checkText}>
        <Text style={type.body}>{label}</Text>
        {hint ? <Text style={type.small}>{hint}</Text> : null}
      </View>
    </Pressable>
  );
}

export function TextField({
  label,
  error,
  hint,
  style,
  ...input
}: TextInputProps & { label: string; error?: string | null; hint?: string }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.field, style as StyleProp<ViewStyle>]}>
      <Text style={type.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={hint}
        placeholderTextColor={colors.inkMuted}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[styles.input, focused && styles.inputFocused, !!error && styles.inputError]}
        {...input}
      />
      {hint && !error ? <Text style={type.small}>{hint}</Text> : null}
      {error ? <ErrorText message={error} /> : null}
    </View>
  );
}

/** A message the screen reader announces as soon as it appears. */
export function ErrorText({ message }: { message: string }) {
  return (
    <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={[type.label, { color: colors.plumDeep }]}>
      {message}
    </Text>
  );
}

/** Bottom sheet over a dimmed page (confirmations). */
export function Sheet({
  visible,
  onClose,
  children,
  closeLabel,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  closeLabel: string;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.sheetRoot}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel={closeLabel} />
        <SafeAreaView edges={['bottom']} style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.sheetInner}>{children}</View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const shadow: ViewStyle =
  Platform.OS === 'web'
    ? ({ boxShadow: '0 1px 2px #48423e14, 0 8px 24px #48423e14' } as ViewStyle)
    : { shadowColor: colors.ink, shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 };

const tagTones: Record<TagTone, ViewStyle> = {
  pink: { backgroundColor: colors.pink },
  plum: { backgroundColor: colors.plumDeep },
  paper: { backgroundColor: colors.white },
  outline: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.plum },
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  scrollContent: { flexGrow: 1, alignItems: 'center' },
  column: {
    flexGrow: 1,
    width: '100%',
    maxWidth: maxContentWidth,
    paddingHorizontal: space.mdl,
    paddingTop: space.mdl,
    paddingBottom: space.lg,
  },
  card: { backgroundColor: colors.white, borderRadius: radius.md, padding: space.md, gap: space.xs, ...shadow },
  button: {
    minHeight: controlHeight,
    paddingHorizontal: space.lg,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSm: { minHeight: 36, paddingHorizontal: space.md },
  filled: { backgroundColor: colors.pink },
  outline: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.plum },
  paper: { backgroundColor: colors.white },
  selected: { backgroundColor: colors.plumDeep, borderColor: colors.plumDeep },
  pressed: { backgroundColor: colors.plumDeep, borderColor: colors.plumDeep },
  disabled: { opacity: 0.45 },
  buttonLabel: { textAlign: 'center', letterSpacing: 0.14 },
  pressedLabel: { color: colors.white },
  link: { minHeight: minTouch, justifyContent: 'center', alignSelf: 'center', paddingHorizontal: space.sm },
  tag: { alignSelf: 'flex-start', minHeight: 28, paddingHorizontal: space.ms, borderRadius: radius.full, justifyContent: 'center' },
  tagLabel: { fontSize: 13, letterSpacing: 0.13 },
  track: { borderRadius: radius.full, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.full, backgroundColor: colors.plumDeep },
  checkRow: { flexDirection: 'row', gap: space.ms, alignItems: 'flex-start', minHeight: minTouch, paddingVertical: space.xs },
  box: {
    width: 24,
    height: 24,
    marginTop: 1,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.plum,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxChecked: { backgroundColor: colors.plumDeep, borderColor: colors.plumDeep },
  checkText: { flex: 1, gap: 2 },
  field: { gap: space.xs + 2 },
  input: {
    ...font(500),
    minHeight: controlHeight,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.white,
    color: colors.ink,
    fontSize: 17,
  },
  inputFocused: { borderColor: colors.plumDeep },
  inputError: { borderColor: colors.plumDeep },
  sheetRoot: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', backgroundColor: colors.scrim },
  sheet: {
    width: '100%',
    maxWidth: maxContentWidth,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  sheetInner: { padding: space.lg, gap: space.md },
});
