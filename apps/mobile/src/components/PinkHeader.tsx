import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n } from '../i18n/I18nProvider';
import { type } from '../theme/fonts';
import { colors, maxContentWidth, radius, space } from '../theme/tokens';
import { Logo } from './Logo';
import { Button } from './ui';

/** "EN" / "ΕΛ": switches to the other language (design: paper pill top right). */
export function LanguageToggle() {
  const { t, locale, setLocale } = useI18n();
  const other = locale === 'el' ? 'en' : 'el';
  return (
    <Button
      variant="paper"
      size="sm"
      label={t(other === 'en' ? 'language.enShort' : 'language.elShort')}
      accessibilityLabel={t(other === 'en' ? 'language.en' : 'language.el')}
      onPress={() => setLocale(other)}
    />
  );
}

/**
 * The coloured top of the join and landing screens (Main.dc.html): logo, language
 * switch, optional kicker line and a big title, in the brand's header colours.
 */
export function PinkHeader({ kicker, title, children }: { kicker?: string | null; title: string; children?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + space.mdl }]}>
      <View style={styles.inner}>
        <View style={styles.topRow}>
          <Logo variant="logo" onHeader width={104} />
          <LanguageToggle />
        </View>
        {kicker ? <Text style={styles.kicker}>{kicker}</Text> : null}
        <Text accessibilityRole="header" style={[type.display, { color: colors.onHeader }]}>
          {title}
        </Text>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    width: '100%',
    alignItems: 'center',
    backgroundColor: colors.header,
    paddingHorizontal: space.lg,
    paddingBottom: space.xl,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  inner: { width: '100%', maxWidth: maxContentWidth - space.mdl * 2, gap: space.mdl },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kicker: { ...type.label, fontSize: 13, lineHeight: 18, letterSpacing: 0.13, color: colors.onHeader },
});
