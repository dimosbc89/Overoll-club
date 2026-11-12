import { useRouter } from 'expo-router';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/messages';
import { showsNoAppCopy } from '../lib/platformFeatures';
import { type } from '../theme/fonts';
import { colors, space } from '../theme/tokens';
import { PageHead } from './PageHead';
import { NotConfigured } from './RemoteContent';
import { PinkHeader } from './PinkHeader';
import { Body, Button, Card, LinkButton, Muted, Screen } from './ui';

const steps: { title: MessageKey; body: MessageKey }[] = [
  { title: 'landing.how.1.title', body: 'landing.how.1.body' },
  { title: 'landing.how.2.title', body: 'landing.how.2.body' },
  { title: 'landing.how.3.title', body: 'landing.how.3.body' },
];

const faq: { q: MessageKey; a: MessageKey; webOnly?: boolean }[] = [
  { q: 'landing.faq.cost.q', a: 'landing.faq.cost.a' },
  { q: 'landing.faq.expiry.q', a: 'landing.faq.expiry.a' },
  { q: 'landing.faq.stores.q', a: 'landing.faq.stores.a' },
  // "Do I need an app? No": web only (lib/platformFeatures).
  { q: 'landing.faq.wallet.q', a: 'landing.faq.wallet.a', webOnly: true },
  { q: 'landing.faq.delivery.q', a: 'landing.faq.delivery.a' },
  { q: 'landing.faq.privacy.q', a: 'landing.faq.privacy.a' },
  { q: 'landing.faq.delete.q', a: 'landing.faq.delete.a' },
  { q: 'landing.faq.contact.q', a: 'landing.faq.contact.a' },
];

/** Numbered circle from the join design (plum ring, plum-deep digit). */
export function StepNumber({ n }: { n: number }) {
  return (
    <View style={styles.number}>
      <Text style={[type.label, styles.numberText]}>{n}</Text>
    </View>
  );
}

/** The FAQ (copy deck §h3), on the landing page and the help page. */
export function FaqList() {
  const { t } = useI18n();
  return (
    <Card style={styles.faq}>
      {faq
        .filter((item) => !item.webOnly || showsNoAppCopy(Platform.OS))
        .map((item, i) => (
          <View key={item.q} style={[styles.faqItem, i > 0 && styles.divider]}>
            <Text style={type.bodyStrong}>{t(item.q)}</Text>
            <Body>{t(item.a)}</Body>
          </View>
        ))}
    </Card>
  );
}

/** The logged-out home (copy deck §h): what the club is, how it works, FAQ, join. */
export function Landing({ notConfigured }: { notConfigured?: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const join = () => router.push('/join');
  const signIn = () => router.push('/sign-in');

  return (
    <Screen title={t('landing.hero.title')} header={<PinkHeader title={t('landing.hero.title')} />} gap={space.mdl}>
      <PageHead title={t('landing.meta.title')} description={t('landing.meta.description')} />
      {notConfigured ? <NotConfigured /> : null}
      <Text style={type.lead}>{t('landing.hero.subline')}</Text>
      <View style={styles.actions}>
        <Button label={t('landing.hero.cta')} onPress={join} />
        <LinkButton label={t('landing.hero.signIn')} onPress={signIn} />
        {showsNoAppCopy(Platform.OS) ? <Muted style={styles.center}>{t('landing.hero.note')}</Muted> : null}
      </View>

      <Text accessibilityRole="header" style={[type.heading, styles.section]}>
        {t('landing.how.title')}
      </Text>
      {steps.map((step, i) => (
        <View key={step.title} style={styles.step}>
          <StepNumber n={i + 1} />
          <View style={styles.stepText}>
            <Text style={type.bodyStrong}>{t(step.title)}</Text>
            <Body>{t(step.body)}</Body>
          </View>
        </View>
      ))}

      <Text accessibilityRole="header" style={[type.heading, styles.section]}>
        {t('landing.faq.title')}
      </Text>
      <FaqList />

      <View style={[styles.final, styles.section]}>
        <Text accessibilityRole="header" style={type.heading}>
          {t('landing.final.title')}
        </Text>
        <Body>{t('landing.final.body')}</Body>
        <Button label={t('landing.final.cta')} onPress={join} />
      </View>

      <View style={styles.footer}>
        <LinkButton label={t('support.title')} onPress={() => router.push('/support')} />
        <LinkButton label={t('legal.terms.title')} onPress={() => router.push('/terms')} />
        <LinkButton label={t('legal.privacy.title')} onPress={() => router.push('/privacy')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { gap: space.ms },
  center: { textAlign: 'center' },
  section: { marginTop: space.md },
  step: { flexDirection: 'row', gap: space.ms, alignItems: 'flex-start' },
  stepText: { flex: 1, gap: 2 },
  number: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.outline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberText: { fontSize: 13, color: colors.accent },
  faq: { padding: 0, gap: 0 },
  faqItem: { padding: space.md, gap: space.xs },
  divider: { borderTopWidth: 1, borderTopColor: colors.line },
  final: { gap: space.ms },
  footer: { marginTop: space.md, gap: space.xs },
});
