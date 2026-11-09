import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Body, Button, Screen, Title } from '../../components/ui';
import { useI18n } from '../../i18n/I18nProvider';
import { formatPoints } from '../../lib/format';
import { fonts } from '../../theme/fonts';
import { colors, radius, space } from '../../theme/tokens';

/** Member card. Placeholder: a guest card until sign-up and the rotating QR land (week 2). */
export default function CardScreen() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const points = formatPoints(0, locale);

  return (
    <Screen title={t('tabs.card')}>
      <View style={styles.card}>
        <Text style={styles.program}>{t('card.program')}</Text>
        <Text style={styles.member}>{t('card.guest')}</Text>
        <View
          style={styles.pointsRow}
          accessible
          accessibilityLabel={t('card.pointsA11y', { points })}
        >
          <Text style={styles.points}>{points}</Text>
          <Text style={styles.pointsLabel}>{t('card.points')}</Text>
        </View>
        <View style={styles.qr}>
          <Text style={styles.qrText}>{t('card.qrPlaceholder')}</Text>
        </View>
      </View>

      <Title>{t('card.joinTitle')}</Title>
      <Body>{t('card.joinBody')}</Body>
      <Button
        label={t('card.join')}
        accessibilityHint={t('card.joinHint')}
        onPress={() => router.push('/profile')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Cocoa text on pink (8.5:1), like the Wallet pass.
  card: {
    backgroundColor: colors.pink,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.sm,
  },
  program: { fontFamily: fonts.serif, fontSize: 26, letterSpacing: -0.8, color: colors.cocoa },
  member: { fontFamily: fonts.sans, fontSize: 16, color: colors.cocoa },
  pointsRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  points: { fontFamily: fonts.serif, fontSize: 56, lineHeight: 64, letterSpacing: -2, color: colors.cocoa },
  pointsLabel: { fontFamily: fonts.sans, fontSize: 18, color: colors.cocoa },
  qr: {
    marginTop: space.sm,
    minHeight: 160,
    borderRadius: radius.md,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.cocoa,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.md,
  },
  qrText: { fontFamily: fonts.sans, fontSize: 15, textAlign: 'center', color: colors.ink },
});
