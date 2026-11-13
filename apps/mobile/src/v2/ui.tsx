import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
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
import Svg, { Path, SvgXml } from 'react-native-svg';

import { brand, type LogoShape } from '../brand';
import type { AccentColor } from '../brand/types';
import { useI18n } from '../i18n/I18nProvider';
import { font } from '../theme/fonts';
import { art, artTile } from './art';
import { v2IconMarkup, type V2IconName } from './iconMarkup';
import { accent, c, columnWidth, onAccent, pop, radius, raised, sheetShadow, space, t } from './theme';

/* ------------------------------------------------------------------ art */

/** Line icon (24 px grid, 2 px stroke). Decorative: the text next to it carries the meaning. */
export function Icon({ name, size = 24, color = c.ink }: { name: V2IconName; size?: number; color?: string }) {
  return (
    <SvgXml
      xml={`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">${v2IconMarkup[name]}</svg>`}
      width={size}
      height={size}
      color={color}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

/** One of the brand's illustration stickers (src/brand/<brand>Art.ts). */
export function Illo({ name, size = 96, width, style }: { name: string; size?: number; width?: number; style?: StyleProp<ViewStyle> }) {
  const drawing = art[name];
  if (!drawing) return null;
  const [, , w = 96, h = 96] = drawing.viewBox.split(' ').map(Number);
  const boxW = width ?? size;
  const boxH = width ? (width * h) / w : size;
  return (
    <View style={[{ width: boxW, height: boxH }, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">
      <SvgXml
        xml={`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${drawing.viewBox}" fill="none">${drawing.body}</svg>`}
        width={boxW}
        height={boxH}
      />
    </View>
  );
}

function Shape({ shape, height, color }: { shape: LogoShape; height: number; color: string }) {
  const width = (height * shape.width) / shape.height;
  return (
    <Svg width={width} height={height} viewBox={`${shape.x ?? 0} ${shape.y ?? 0} ${shape.width} ${shape.height}`}>
      {shape.paths.map((d, i) => (
        <Path key={i} d={d} fill={color} fillRule={shape.evenOdd || shape.evenOddPaths?.includes(i) ? 'evenodd' : 'nonzero'} />
      ))}
    </Svg>
  );
}

/** The brand's logo mark alone (Figma Logo · Mark), `height` high, in one colour. Decorative. */
export function LogoMark({ height, color }: { height: number; color: string }) {
  return <Shape shape={brand.logo.mark} height={height} color={color} />;
}

/**
 * Logo lockup (Figma Logo · Lockup): the mark, 40 high, and the brand name set in the
 * display font (a stand-in until the brand's own wordmark), or the mark alone.
 */
export function Lockup({ height = 40, onDark = false, markOnly = false }: { height?: number; onDark?: boolean; markOnly?: boolean }) {
  const { t: tr } = useI18n();
  const color = onDark ? c.onBrandSoft : c.brand;
  const fontSize = Math.round(height * 0.65);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={tr('brand.wordmark')} style={[styles.lockup, { gap: height / 4 }]}>
      <Shape shape={brand.logo.mark} height={height} color={color} />
      {!markOnly ? (
        <Text style={[t.displayM, { fontSize, lineHeight: Math.round(fontSize * 1.23), color }]}>{brand.logo.wordmarkText}</Text>
      ) : null}
    </View>
  );
}

/* -------------------------------------------------------------- buttons */

type ButtonKind = 'primary' | 'secondary' | 'text';

interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  kind?: ButtonKind;
  size?: 'L' | 'S';
  loading?: boolean;
  /** Stretch to the column (default for primary and secondary). */
  block?: boolean;
  icon?: V2IconName;
  style?: StyleProp<ViewStyle>;
}

/** Pill button with an ink outline and a pop shadow that flattens when pressed (Figma Button). */
export function Button({ label, kind = 'primary', size = 'L', loading, disabled, block, icon, style, accessibilityState, ...rest }: ButtonProps) {
  const inactive = !!disabled || !!loading;
  const stretch = block ?? kind !== 'text';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: !!loading, ...accessibilityState }}
      disabled={inactive}
      style={({ pressed }) => {
        const down = pressed && !inactive;
        const base: ViewStyle[] = [styles.button, size === 'S' ? styles.buttonS : styles.buttonL, stretch ? styles.block : styles.inline];
        if (kind === 'text') base.push({ paddingHorizontal: size === 'S' ? space[12] : space[16] }, down ? { backgroundColor: c.mintSoft } : {});
        else if (disabled) base.push(kind === 'primary' ? { backgroundColor: c.disabled } : { borderWidth: 2, borderColor: c.disabled });
        else
          base.push(
            { backgroundColor: kind === 'primary' ? (down ? c.brandPressed : c.brand) : down ? c.sunSoft : c.surface },
            raised(down ? 1 : 4),
            down ? { transform: [{ translateY: 3 }] } : {},
          );
        return [...base, style];
      }}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={kind === 'primary' ? c.onBrand : c.brand} />
      ) : (
        <View style={styles.buttonInner}>
          {icon ? <Icon name={icon} size={20} color={kind === 'primary' && !disabled ? c.onBrand : c.ink} /> : null}
          <Text
            numberOfLines={2}
            style={[
              size === 'S' ? t.bodyMStrong : t.button,
              styles.center,
              {
                color: disabled ? c.onDisabled : kind === 'primary' ? c.onBrand : kind === 'text' ? c.brand : c.ink,
              },
            ]}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

/** 48 px round action (call, directions, close, next). Filled = sun; outline = white. */
export function IconButton({
  icon,
  label,
  onPress,
  tone = 'sun',
  size = 48,
  iconSize = 22,
  disabled,
}: {
  icon: V2IconName;
  label: string;
  onPress?: () => void;
  tone?: 'sun' | 'white';
  size?: number;
  iconSize?: number;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      hitSlop={size < 44 ? (44 - size) / 2 : 0}
      style={({ pressed }) => [
        styles.round,
        { width: size, height: size, backgroundColor: tone === 'sun' ? (pressed ? c.sunSoft : c.sun) : pressed ? c.sunSoft : c.surface },
        raised(pressed ? 1 : 4),
        pressed && { transform: [{ translateY: 3 }] },
      ]}
    >
      <Icon name={icon} size={iconSize} />
    </Pressable>
  );
}

/** Round back button (44 px, white, ink outline) of the header and the onboarding bar. */
export function BackButton({ onPress, label }: { onPress: () => void; label: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.back, pressed && { backgroundColor: c.sunSoft }]}
    >
      <Icon name="back" size={24} />
    </Pressable>
  );
}

/* ------------------------------------------------------------- stickers */

/** Tilted label sticker (Playpen Sans), ink text on an accent (≥ 6:1). */
export function Sticker({
  label,
  color = 'sun',
  rotate = 6,
  icon,
  small,
  shape = 'tag',
  style,
}: {
  label: string;
  color?: AccentColor;
  rotate?: number;
  icon?: V2IconName;
  small?: boolean;
  shape?: 'tag' | 'pill';
  style?: StyleProp<ViewStyle>;
}) {
  const textColor = onAccent(color);
  return (
    <View style={[styles.stickerWrap, style]}>
      <View
        style={[
          styles.sticker,
          shape === 'pill' ? { borderRadius: radius.pill, paddingLeft: icon ? space[8] : space[12] } : { borderRadius: radius.sm },
          { backgroundColor: accent(color), transform: [{ rotate: `${rotate}deg` }] },
          raised(1),
        ]}
      >
        {icon ? <Icon name={icon} size={16} color={textColor} /> : null}
        <Text numberOfLines={1} style={[small ? t.stickerS : t.sticker, { color: textColor }]}>
          {label}
        </Text>
      </View>
    </View>
  );
}

/** The member's tier as a tilted pill sticker (brand.v2.tiers). */
export function TierSticker({ tier, label, style }: { tier: 'classic' | 'gold' | 'club'; label: string; style?: StyleProp<ViewStyle> }) {
  const look = brand.v2?.tiers[tier] ?? { color: 'mint' as const, icon: 'sparkle' as const };
  return <Sticker label={label} color={look.color} icon={look.icon} rotate={4} shape="pill" style={style} />;
}

/* ------------------------------------------------------------ progress */

/** Label + chunky bar + start/end figures (Progress reward = sun, Progress tier = green, code countdown). */
export function Progress({
  title,
  subtitle,
  value,
  max,
  start,
  end,
  fill = 'sun',
  a11y,
}: {
  title: string;
  subtitle?: string | null;
  value: number;
  max: number;
  start?: string;
  end?: string;
  fill?: 'sun' | 'brand';
  a11y: string;
}) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <View style={styles.progress}>
      <View>
        <Text style={t.bodyMStrong}>{title}</Text>
        {subtitle ? <Text style={t.bodyS}>{subtitle}</Text> : null}
      </View>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={a11y}
        accessibilityValue={{ min: 0, max, now: Math.min(Math.max(value, 0), max) }}
        style={styles.track}
      >
        {ratio > 0 ? (
          <View style={[styles.fill, { width: `${Math.max(ratio * 100, 4)}%`, backgroundColor: fill === 'sun' ? c.sun : c.brand }]} />
        ) : null}
      </View>
      {start || end ? (
        <View style={styles.ends}>
          <Text style={[t.bodySStrong, { color: c.muted }]}>{start}</Text>
          <Text style={t.bodySStrong}>{end}</Text>
        </View>
      ) : null}
    </View>
  );
}

/* --------------------------------------------------------------- panels */

/** Fun frame around the QR: the QR itself stays straight, black on white (Figma QR container). */
export function QrFrame({ tone, children, code, hint, codeA11y }: { tone: 'sun' | 'mint'; children: ReactNode; code: string; hint: string; codeA11y: string }) {
  return (
    <View style={[styles.qrFrame, { backgroundColor: tone === 'sun' ? c.sun : c.mint }]}>
      <View style={styles.qrCard}>
        {children}
        <Text style={[t.code, styles.center]} accessibilityLabel={codeA11y}>
          {code}
        </Text>
        <Text style={[t.bodyS, styles.center]}>{hint}</Text>
      </View>
      {tone === 'sun' ? (
        <Illo name="sparkle" size={44} style={styles.qrDecoLeft} />
      ) : (
        <Illo name="confetti" size={44} style={styles.qrDecoRight} />
      )}
    </View>
  );
}

/** Coral welcome-gift banner: starburst + the gift's art, title, line, chevron when it links. */
export function GiftBanner({ title, body, onPress, a11yHint }: { title: string; body: string; onPress?: () => void; a11yHint?: string }) {
  const giftArt = brand.v2?.art.gift ?? '';
  const content = (
    <>
      <View style={styles.giftArt}>
        <Illo name="starburst" size={64} style={StyleSheet.absoluteFill} />
        <Illo name={giftArt} size={44} style={{ position: 'absolute', left: 10, top: 10 }} />
      </View>
      <View style={styles.flex}>
        <Text style={t.title}>{title}</Text>
        <Text style={t.bodySStrong}>{body}</Text>
      </View>
      {onPress ? <Icon name="chevron" size={22} /> : null}
    </>
  );
  if (!onPress) return <View style={styles.giftBanner}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${title} ${body}`}
      accessibilityHint={a11yHint}
      onPress={onPress}
      style={({ pressed }) => [styles.giftBanner, pressed && { ...raised(1), transform: [{ translateY: 3 }] }]}
    >
      {content}
    </Pressable>
  );
}

/** Accent tile with an illustration (placeholder for product photos). */
export function Thumb({ name, size = 64, faded, tile: forced }: { name: string; size?: number; faded?: boolean; tile?: AccentColor }) {
  const tile = faded ? 'cream' : (forced ?? artTile(name));
  return (
    <View style={[styles.thumb, { width: size, height: size, backgroundColor: accent(tile) }, faded && { opacity: 0.6 }]}>
      <Illo name={name} size={size * 0.8125} />
    </View>
  );
}

/** White card with ink outline and pop (the generic raised surface). */
export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** Small message box: info (mint), error (coral). */
export function Notice({ kind = 'info', title, body }: { kind?: 'info' | 'error' | 'success'; title?: string; body: string }) {
  const bg = kind === 'error' ? c.coralSoft : kind === 'success' ? c.mintSoft : c.sunSoft;
  return (
    <View style={[styles.notice, { backgroundColor: bg }]} accessibilityRole={kind === 'error' ? 'alert' : undefined}>
      <Icon name={kind === 'error' ? 'alert' : kind === 'success' ? 'check' : 'info'} size={20} color={kind === 'error' ? c.error : c.ink} />
      <View style={styles.flex}>
        {title ? <Text style={t.bodyMStrong}>{title}</Text> : null}
        <Text style={[t.bodyS, { color: c.ink }]}>{body}</Text>
      </View>
    </View>
  );
}

/** A message the screen reader announces as soon as it appears. */
export function ErrorText({ message, style }: { message: string; style?: StyleProp<TextStyle> }) {
  return (
    <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={[t.bodySStrong, { color: c.error }, style]}>
      {message}
    </Text>
  );
}

/* ---------------------------------------------------------------- lists */

/** White group of settings rows (ink outline, pop), optional overline title above. */
export function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View style={styles.groupWrap}>
      {title ? (
        <Text accessibilityRole="header" style={t.overline}>
          {title}
        </Text>
      ) : null}
      <View style={styles.group}>{children}</View>
    </View>
  );
}

export function Toggle({ on }: { on: boolean }) {
  return (
    <View style={[styles.toggle, { backgroundColor: on ? c.brand : c.surface }]}>
      <View style={[styles.knob, on ? { backgroundColor: c.sun, alignSelf: 'flex-end' } : { backgroundColor: c.muted }]} />
    </View>
  );
}

/** Profile row ≥ 56 px: link (chevron), value, toggle, danger (red). */
export function SettingsRow({
  icon,
  label,
  value,
  toggle,
  danger,
  onPress,
  hint,
  disabled,
}: {
  icon: V2IconName;
  label: string;
  value?: string;
  toggle?: boolean;
  danger?: boolean;
  onPress?: () => void;
  hint?: string;
  disabled?: boolean;
}) {
  const isToggle = toggle !== undefined;
  return (
    <Pressable
      accessibilityRole={isToggle ? 'switch' : 'button'}
      accessibilityLabel={value ? `${label}, ${value}` : label}
      accessibilityHint={hint}
      accessibilityState={isToggle ? { checked: toggle, disabled } : { disabled }}
      disabled={!onPress || disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.app }]}
    >
      <View style={[styles.rowIcon, { backgroundColor: danger ? c.coralSoft : c.app }]}>
        <Icon name={icon} size={20} color={danger ? c.error : c.ink} />
      </View>
      <Text style={[t.bodyMStrong, styles.flex, danger && { color: c.error }]}>{label}</Text>
      {value ? (
        <Text numberOfLines={1} style={[t.bodyM, styles.rowValue]}>
          {value}
        </Text>
      ) : null}
      {isToggle ? <Toggle on={!!toggle} /> : !danger && onPress ? <Icon name="chevron" size={20} /> : null}
    </Pressable>
  );
}

/* --------------------------------------------------------------- forms */

export function TextField({
  label,
  error,
  helper,
  style,
  ...input
}: TextInputProps & { label: string; error?: string | null; helper?: string | null }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.field, style as StyleProp<ViewStyle>]}>
      <Text style={t.bodySStrong}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={helper ?? undefined}
        placeholderTextColor={c.muted}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[styles.input, focused && styles.inputFocused, !!error && { borderColor: c.error }]}
        {...input}
      />
      {error ? <ErrorText message={error} /> : helper ? <Text style={t.bodyS}>{helper}</Text> : null}
    </View>
  );
}

/** Six (or more, for the review code) digit boxes over one hidden input, so paste and SMS autofill work. */
export function OtpField({
  value,
  onChange,
  onSubmit,
  error,
  label,
  cells = 6,
  editable = true,
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit?: () => void;
  error?: boolean;
  label: string;
  cells?: number;
  editable?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const shown = Math.max(cells, value.length);
  return (
    <View style={styles.otp}>
      <View style={styles.otpRow} pointerEvents="none">
        {Array.from({ length: shown }, (_, i) => {
          const digit = value[i] ?? '';
          const active = focused && i === Math.min(value.length, shown - 1) && value.length < shown;
          return (
            <View
              key={i}
              style={[
                styles.otpCell,
                shown > 6 && { width: 30 },
                digit ? { borderColor: c.ink, borderWidth: 2.5 } : null,
                active ? { borderColor: c.brand, borderWidth: 2.5 } : null,
                error ? { borderColor: c.error } : null,
              ]}
            >
              {digit ? <Text style={[t.displayM, shown > 6 && { fontSize: 20 }]}>{digit}</Text> : active ? <View style={styles.caret} /> : null}
            </View>
          );
        })}
      </View>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        inputMode="numeric"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={10}
        returnKeyType="done"
        onSubmitEditing={onSubmit}
        editable={editable}
        autoFocus
        caretHidden
        style={styles.otpInput}
      />
    </View>
  );
}

export function Checkbox({ label, checked, onChange, error, children }: { label: string; checked: boolean; onChange: (next: boolean) => void; error?: boolean; children?: ReactNode }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={() => onChange(!checked)}
      style={({ pressed }) => [styles.check, pressed && { opacity: 0.85 }]}
    >
      <View style={[styles.box, checked && { backgroundColor: c.brand, ...pop(1) }, error && !checked && { borderColor: c.error, borderWidth: 2.5 }]}>
        {checked ? <Icon name="check" size={18} color={c.onBrand} /> : null}
      </View>
      <View style={styles.flex}>{children ?? <Text style={t.bodyM}>{label}</Text>}</View>
    </Pressable>
  );
}

export function Segmented<K extends string>({ options, value, onChange, label }: { options: { key: K; label: string; icon: V2IconName }[]; value: K; onChange: (k: K) => void; label: string }) {
  return (
    <View style={styles.segmented} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => {
        const selected = o.key === value;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={o.label}
            onPress={() => onChange(o.key)}
            style={[styles.segment, selected && { backgroundColor: c.brand }]}
          >
            <Icon name={o.icon} size={20} color={selected ? c.onBrand : c.ink} />
            <Text style={[t.bodyMStrong, { color: selected ? c.onBrand : c.ink }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* --------------------------------------------------------------- sheet */

/** Bottom sheet on a dimmed screen (handle, white, ink outline on three sides). */
export function Sheet({ visible, onClose, closeLabel, children }: { visible: boolean; onClose: () => void; closeLabel: string; children: ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.sheetRoot}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel={closeLabel} />
        <SafeAreaView edges={['bottom']} style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.handle} />
          <View style={styles.sheetInner}>{children}</View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

/* ----------------------------------------------------- wallet buttons */

/** Placeholder "Add to … Wallet" button (black, until Apple's and Google's badges). */
export function WalletButton({ label, kind, onPress, busy }: { label: string; kind: 'apple' | 'google'; onPress: () => void; busy?: boolean }) {
  const { t: tr } = useI18n();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: !!busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [styles.wallet, pressed && { opacity: 0.85 }]}
    >
      <Icon name="wallet" size={22} color="#ffffff" />
      <View style={styles.flex}>
        <Text style={styles.walletSmall}>{tr('v2.wallet.addTo')}</Text>
        <Text style={styles.walletBig} numberOfLines={1}>
          {kind === 'apple' ? 'Apple Wallet' : 'Google Wallet'}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  center: { textAlign: 'center' },
  lockup: { flexDirection: 'row', alignItems: 'center' },
  button: { borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  buttonL: { minHeight: 56, paddingHorizontal: space[32] },
  buttonS: { minHeight: 44, paddingHorizontal: space[20] },
  block: { alignSelf: 'stretch' },
  inline: { alignSelf: 'center' },
  buttonInner: { flexDirection: 'row', alignItems: 'center', gap: space[8] },
  round: { borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  back: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: c.ink,
    backgroundColor: c.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickerWrap: { paddingHorizontal: 4, paddingVertical: 6, alignSelf: 'flex-start' },
  sticker: { flexDirection: 'row', alignItems: 'center', gap: space[4], paddingRight: space[12], paddingLeft: space[12], paddingVertical: space[4] },
  progress: { gap: space[8], alignSelf: 'stretch' },
  track: { height: 14, borderRadius: 7, borderWidth: 2, borderColor: c.ink, backgroundColor: c.surface, overflow: 'hidden' },
  fill: { position: 'absolute', left: -2, top: -2, bottom: -2, borderRadius: 7, borderWidth: 2, borderColor: c.ink },
  ends: { flexDirection: 'row', justifyContent: 'space-between' },
  qrFrame: { alignSelf: 'stretch', borderRadius: radius.xl, padding: space[16], ...raised(4) },
  qrCard: {
    backgroundColor: c.surface,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: c.ink,
    paddingTop: space[16],
    paddingBottom: space[12],
    paddingHorizontal: space[16],
    alignItems: 'center',
    gap: space[8],
  },
  qrDecoLeft: { position: 'absolute', left: -22, top: -18, transform: [{ rotate: '12deg' }] },
  qrDecoRight: { position: 'absolute', right: -6, top: -20 },
  giftBanner: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[12],
    paddingLeft: space[12],
    paddingRight: space[16],
    paddingVertical: space[16],
    borderRadius: radius.lg,
    backgroundColor: c.coral,
    ...raised(4),
  },
  giftArt: { width: 64, height: 64 },
  thumb: { borderRadius: radius.lg, borderWidth: 2, borderColor: c.ink, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: c.surface, borderRadius: radius.lg, ...raised(4) },
  notice: { flexDirection: 'row', gap: space[12], padding: space[12], borderRadius: radius.md, borderWidth: 2, borderColor: c.ink, alignItems: 'flex-start' },
  groupWrap: { gap: space[8], alignSelf: 'stretch' },
  group: { backgroundColor: c.surface, borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 6, ...raised(4) },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[12], minHeight: 56, paddingHorizontal: space[4], paddingVertical: space[8], borderRadius: radius.sm },
  rowIcon: { width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  rowValue: { color: c.muted, maxWidth: '50%' },
  toggle: { width: 52, height: 32, borderRadius: radius.pill, borderWidth: 2, borderColor: c.ink, padding: 3, justifyContent: 'center' },
  knob: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: c.ink },
  field: { gap: space[8], alignSelf: 'stretch' },
  input: {
    ...font(500),
    minHeight: 56,
    paddingHorizontal: space[16],
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: c.border,
    backgroundColor: c.surface,
    color: c.ink,
    fontSize: 17,
  },
  inputFocused: { borderColor: c.brand, boxShadow: `0 0 0 3px ${c.sun}` } as ViewStyle,
  otp: { alignSelf: 'stretch', height: 60 },
  otpRow: { flexDirection: 'row', justifyContent: 'space-between', height: 60 },
  otpCell: {
    width: 48,
    height: 60,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: c.border,
    backgroundColor: c.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caret: { width: 2, height: 26, backgroundColor: c.brand },
  otpInput: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, opacity: 0.02, color: 'transparent', fontSize: 1 },
  check: { flexDirection: 'row', gap: space[12], alignItems: 'flex-start', minHeight: 44, paddingVertical: space[8] },
  box: { width: 28, height: 28, borderRadius: 8, borderWidth: 2, borderColor: c.ink, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' },
  segmented: {
    flexDirection: 'row',
    gap: 4,
    height: 56,
    padding: 4,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: c.ink,
    backgroundColor: c.surface,
    alignSelf: 'stretch',
  },
  segment: { flex: 1, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  sheetRoot: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', backgroundColor: c.scrim },
  sheet: {
    width: '100%',
    maxWidth: columnWidth,
    backgroundColor: c.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 2,
    borderBottomWidth: 0,
    borderColor: c.ink,
    alignItems: 'center',
    paddingTop: space[12],
    ...sheetShadow,
  },
  handle: { width: 48, height: 5, borderRadius: 3, backgroundColor: c.border },
  sheetInner: { alignSelf: 'stretch', paddingHorizontal: space[24], paddingTop: space[16], paddingBottom: space[16], gap: space[16] },
  wallet: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[8],
    height: 52,
    paddingHorizontal: space[12],
    borderRadius: radius.sm,
    backgroundColor: c.wallet,
  },
  walletSmall: { ...font(500), fontSize: 10, lineHeight: 12, color: '#ffffff' },
  walletBig: { ...font(700), fontSize: 13, lineHeight: 18, color: '#ffffff' },
});
