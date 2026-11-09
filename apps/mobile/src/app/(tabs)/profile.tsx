import { StyleSheet, View } from 'react-native';

import { Body, Button, Card, Screen, Title } from '../../components/ui';
import { useI18n } from '../../i18n/I18nProvider';
import { locales } from '../../i18n/messages';
import { space } from '../../theme/tokens';

/** Profile: language switch (saved on the device) and a sign-in placeholder. */
export default function ProfileScreen() {
  const { t, locale, setLocale } = useI18n();

  return (
    <Screen title={t('profile.title')}>
      <Title>{t('profile.title')}</Title>

      <Card style={styles.section}>
        <Body style={styles.label}>{t('profile.language')}</Body>
        <View style={styles.options} accessibilityRole="radiogroup" accessibilityLabel={t('profile.language')}>
          {locales.map((option) => (
            <Button
              key={option}
              label={t(option === 'el' ? 'language.el' : 'language.en')}
              variant="secondary"
              selected={option === locale}
              accessibilityRole="radio"
              accessibilityState={{ checked: option === locale }}
              onPress={() => setLocale(option)}
              style={styles.option}
            />
          ))}
        </View>
      </Card>

      <Card style={styles.section}>
        <Body style={styles.label}>{t('profile.signInTitle')}</Body>
        <Body>{t('profile.signInBody')}</Body>
        {/* Placeholder: email / SMS one-time code sign-in arrives in week 2. */}
        <Button label={`${t('profile.signIn')} · ${t('profile.signInSoon')}`} disabled />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  label: { fontWeight: '700' },
  options: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  option: { flexGrow: 1 },
});
