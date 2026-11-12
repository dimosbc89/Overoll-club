import type { SupabaseClient } from '@supabase/supabase-js';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { LoadError, Loading } from '../../components/RemoteContent';
import { useI18n } from '../../i18n/I18nProvider';
import { pluralKey, type Locale, type Translate } from '../../i18n/messages';
import { fetchHistory, type HistoryItem, type MemberBundle } from '../../lib/data';
import { formatDayMonth, formatEuroFromCents, formatPoints, formatSignedPoints } from '../../lib/format';
import { pointsValidUntil } from '../../lib/memberView';
import { inLocale } from '../../lib/storeNames';
import { useRemote } from '../../lib/useRemote';
import { AppScreen, TitleRow } from '../chrome';
import { c, radius, space, t } from '../theme';
import { Icon, Sticker } from '../ui';

function title(item: HistoryItem, tr: Translate, locale: Locale): string {
  const store = item.store ? inLocale(item.store.name, item.store.name_en, locale) : '';
  const reward = item.reward ? (locale === 'el' ? item.reward.name_el : item.reward.name_en) : '';
  switch (item.kind) {
    case 'earn':
      return tr('history.earn', { store });
    case 'bonus':
      return tr('history.bonus');
    case 'redeem':
      return tr('history.redeem', { reward });
    case 'refund_redeem':
      return tr('history.refundRedeem', { reward });
    case 'reverse':
      return tr('history.reverse', { store });
    case 'adjust':
      return tr('history.adjust');
    case 'expire':
      return tr('history.expire');
  }
}

/** Ιστορικό πόντων (Figma App · 10 History): opened from the Profile. */
export function HistoryScreen({ bundle }: { bundle: MemberBundle }) {
  const { t: tr, locale } = useI18n();
  const router = useRouter();
  const { member, rewards, balance } = bundle;
  const load = useCallback((client: SupabaseClient) => fetchHistory(client, member.id, rewards), [member.id, rewards]);
  const { state, reload } = useRemote(load);
  const validUntil = pointsValidUntil(member.last_purchase_at ?? balance.last_earn_at, balance.balance, bundle.brand.config);
  const points = formatPoints(balance.balance, locale);

  return (
    <AppScreen title={tr('history.title')} onBack={() => (router.canGoBack() ? router.back() : router.replace('/profile'))}>
      <TitleRow title={tr('history.title')} sticker={<Sticker label={tr(pluralKey('rewards.balance', balance.balance), { points })} />} />
      {state.status === 'loading' ? <Loading /> : null}
      {state.status === 'error' ? <LoadError onRetry={reload} /> : null}
      {state.status === 'ready' ? (
        state.data.length === 0 ? (
          <Text style={t.bodyM}>{tr('history.empty')}</Text>
        ) : (
          <View>
            {state.data.map((item) => {
              const heading = title(item, tr, locale);
              const signed = formatSignedPoints(item.points, locale);
              const when = formatDayMonth(item.created_at, locale);
              const receipt = item.kind === 'earn' && item.amount_cents ? tr('history.receipt', { amount: formatEuroFromCents(item.amount_cents, locale) }) : null;
              const spend = item.points < 0;
              return (
                <View
                  key={item.id}
                  accessible
                  accessibilityLabel={[heading, receipt, tr('card.pointsA11y', { points: signed }), when].filter(Boolean).join(', ')}
                  style={styles.row}
                >
                  <View style={[styles.badge, { backgroundColor: spend ? c.sun : c.mint }]}>
                    <Icon name={item.kind === 'redeem' || item.kind === 'refund_redeem' ? 'gift' : 'sparkle'} size={20} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={t.bodyMStrong}>{heading}</Text>
                    <Text style={t.bodyS}>{[when, receipt].filter(Boolean).join(' · ')}</Text>
                  </View>
                  <Text style={[t.title, { color: spend ? c.ink : c.brand }]}>{signed}</Text>
                </View>
              );
            })}
          </View>
        )
      ) : null}
      <Text style={t.bodyS}>
        {[tr('v2.history.total', { points }), validUntil ? tr('card.expiry', { date: formatDayMonth(validUntil, locale), months: bundle.brand.config.expiryMonths }) : null]
          .filter(Boolean)
          .join(' ')}
      </Text>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[12], paddingVertical: space[12], borderBottomWidth: 2, borderBottomColor: c.borderSubtle },
  badge: { width: 40, height: 40, borderRadius: radius.pill, borderWidth: 1.5, borderColor: c.ink, alignItems: 'center', justifyContent: 'center' },
});
