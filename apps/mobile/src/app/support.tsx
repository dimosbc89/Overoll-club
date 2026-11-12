import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { CloseLink } from '../components/CloseLink';
import { FaqList } from '../components/Landing';
import { Body, Card, Screen, Title } from '../components/ui';
import { useI18n } from '../i18n/I18nProvider';
import { SUPPORT_EMAIL } from '../lib/program';
import { type } from '../theme/fonts';
import { colors, space } from '../theme/tokens';

/** Help page (`/support`): contact, the FAQ, terms and privacy. The App Store's support URL. */
export default function SupportScreen() {
  const { t } = useI18n();
  return (
    <Screen title={t('support.title')}>
      <Title>{t('support.title')}</Title>
      <Body>{t('support.intro')}</Body>
      <Card>
        <Link href={`mailto:${SUPPORT_EMAIL}`} style={[type.bodyStrong, styles.link]}>
          {t('support.email')}
        </Link>
      </Card>

      <Text accessibilityRole="header" style={[type.heading, styles.section]}>
        {t('landing.faq.title')}
      </Text>
      <FaqList />

      <Text accessibilityRole="header" style={[type.heading, styles.section]}>
        {t('support.legalTitle')}
      </Text>
      <View style={styles.links}>
        <Link href="/terms" style={[type.bodyStrong, styles.link]}>
          {t('legal.terms.title')}
        </Link>
        <Link href="/privacy" style={[type.bodyStrong, styles.link]}>
          {t('legal.privacy.title')}
        </Link>
      </View>
      <CloseLink />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: space.md },
  links: { gap: space.ms },
  link: { color: colors.accent, textDecorationLine: 'underline' },
});
