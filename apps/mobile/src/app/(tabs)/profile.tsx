import type { SupabaseClient } from '@supabase/supabase-js';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { LoadError, Loading, NotConfigured } from '../../components/RemoteContent';
import { Body, Button, Card, LinkButton, Muted, Screen, Title } from '../../components/ui';
import { useI18n } from '../../i18n/I18nProvider';
import { locales, type Locale, type Translate } from '../../i18n/messages';
import { fetchHistory, type HistoryItem, type MemberBundle } from '../../lib/data';
import { formatDateTime, formatDayMonth, formatEuroFromCents, formatSignedPoints } from '../../lib/format';
import { useSession } from '../../lib/session';
import { inLocale } from '../../lib/storeNames';
import { useRemote } from '../../lib/useRemote';
import { type } from '../../theme/fonts';
import { colors, space } from '../../theme/tokens';

/** Profile: language, history, sign out, account deletion (`/delete-account`). */
export default function ProfileTab() {
  const { auth, member, refresh } = useSession();
  const { t } = useI18n();
  const router = useRouter();

  return (
    <Screen title={t('profile.title')}>
      <Title>{t('profile.title')}</Title>
      <LanguageCard />
      {auth.status === 'not_configured' ? <NotConfigured /> : null}
      {auth.status === 'signed_out' ? (
        <Card style={styles.section}>
          <Button label={t('join.hero.cta')} onPress={() => router.push('/join')} />
          <LinkButton label={t('join.hero.signIn')} onPress={() => router.push('/sign-in')} />
        </Card>
      ) : null}
      {member.status === 'loading' || (auth.status === 'loading' && member.status !== 'ready') ? <Loading /> : null}
      {member.status === 'error' ? <LoadError onRetry={refresh} /> : null}
      {member.status === 'ready' ? <MemberProfile bundle={member.data} /> : null}
    </Screen>
  );
}

function LanguageCard() {
  const { t, locale, setLocale } = useI18n();
  return (
    <Card style={styles.section}>
      <Text style={type.label}>{t('profile.language')}</Text>
      <View style={styles.options} accessibilityRole="radiogroup" accessibilityLabel={t('profile.language')}>
        {locales.map((option) => (
          <Button
            key={option}
            label={t(option === 'el' ? 'language.el' : 'language.en')}
            variant="outline"
            selected={option === locale}
            accessibilityRole="radio"
            accessibilityState={{ checked: option === locale }}
            onPress={() => setLocale(option)}
            style={styles.option}
          />
        ))}
      </View>
    </Card>
  );
}

function historyTitle(item: HistoryItem, t: Translate, locale: Locale): string {
  const store = item.store ? inLocale(item.store.name, item.store.name_en, locale) : '';
  const reward = item.reward ? (locale === 'el' ? item.reward.name_el : item.reward.name_en) : '';
  switch (item.kind) {
    case 'earn':
      return t('history.earn', { store });
    case 'bonus':
      return t('history.bonus');
    case 'redeem':
      return t('history.redeem', { reward });
    case 'refund_redeem':
      return t('history.refundRedeem', { reward });
    case 'reverse':
      return t('history.reverse', { store });
    case 'adjust':
      return t('history.adjust');
    case 'expire':
      return t('history.expire');
  }
}

function MemberProfile({ bundle }: { bundle: MemberBundle }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { signOut } = useSession();
  const { member, rewards } = bundle;
  const loadHistory = useCallback((client: SupabaseClient) => fetchHistory(client, member.id, rewards), [member.id, rewards]);
  const { state: history, reload } = useRemote(loadHistory);

  return (
    <>
      <Card style={styles.section}>
        <Text style={type.label}>{t('profile.name')}</Text>
        <Body>{member.first_name}</Body>
        {member.email ? (
          <>
            <Text style={[type.label, styles.gapTop]}>{t('profile.email')}</Text>
            <Body>{member.email}</Body>
          </>
        ) : null}
        <Muted style={styles.gapTop}>{t('profile.memberSince', { date: formatDayMonth(member.created_at, locale) })}</Muted>
      </Card>

      <Text accessibilityRole="header" style={[type.heading, styles.gapTop]}>
        {t('history.title')}
      </Text>
      {history.status === 'loading' ? <Loading /> : null}
      {history.status === 'error' ? <LoadError onRetry={reload} /> : null}
      {history.status === 'ready' ? (
        history.data.length === 0 ? (
          <Muted>{t('history.empty')}</Muted>
        ) : (
          <Card style={styles.list}>
            {history.data.map((item, i) => {
              const title = historyTitle(item, t, locale);
              const points = formatSignedPoints(item.points, locale);
              const when = formatDateTime(item.created_at, locale);
              const receipt =
                item.kind === 'earn' && item.amount_cents ? t('history.receipt', { amount: formatEuroFromCents(item.amount_cents, locale) }) : null;
              return (
                <View
                  key={item.id}
                  accessible
                  accessibilityLabel={[title, receipt, t('card.pointsA11y', { points }), when].filter(Boolean).join(', ')}
                  style={[styles.row, i > 0 && styles.divider]}
                >
                  <View style={styles.rowText}>
                    <Text style={type.bodyStrong}>{title}</Text>
                    <Muted>{[receipt, when].filter(Boolean).join(' · ')}</Muted>
                  </View>
                  <Text style={[type.bodyStrong, item.points > 0 && { color: colors.plumDeep }]}>{points}</Text>
                </View>
              );
            })}
          </Card>
        )
      ) : null}

      <View style={[styles.section, styles.gapTop]}>
        <Button
          label={t('profile.signOut')}
          variant="outline"
          onPress={async () => {
            await signOut();
            router.replace('/');
          }}
        />
        <LinkButton label={t('profile.delete')} onPress={() => router.push('/delete-account')} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  options: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  option: { flexGrow: 1 },
  gapTop: { marginTop: space.sm },
  list: { padding: 0, gap: 0, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.ms, paddingVertical: space.ms, paddingHorizontal: space.md, minHeight: 56 },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  divider: { borderTopWidth: 1, borderTopColor: colors.line },
});
