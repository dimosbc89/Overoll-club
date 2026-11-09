import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '../../components/Icon';
import { RedeemSheet, type RedeemTarget } from '../../components/RedeemSheet';
import { LoadError, Loading, NotConfigured, RemoteContent } from '../../components/RemoteContent';
import { Button, Card, LinkButton, Muted, Screen, Tag, Title } from '../../components/ui';
import { useI18n } from '../../i18n/I18nProvider';
import { pluralKey, type Translate } from '../../i18n/messages';
import { fetchRewards, type MemberBundle, type RewardRow } from '../../lib/data';
import { formatCountdown, formatDayMonth, formatPoints, remainingMs } from '../../lib/format';
import { redeemableGift, rewardViews, type RewardView } from '../../lib/memberView';
import { useRefreshOnFocus, useSession } from '../../lib/session';
import { tierName } from '../../lib/tiers';
import { useNow } from '../../lib/useNow';
import { useRemote } from '../../lib/useRemote';
import { font, type } from '../../theme/fonts';
import { colors, radius, space } from '../../theme/tokens';

export default function RewardsTab() {
  const { auth, member, refresh } = useSession();
  const { t } = useI18n();

  if (member.status === 'ready') return <MemberRewards bundle={member.data} />;
  if (auth.status === 'not_configured') {
    return (
      <Screen title={t('rewards.title')}>
        <Title>{t('rewards.title')}</Title>
        <NotConfigured />
      </Screen>
    );
  }
  if (auth.status === 'signed_out') return <GuestRewards />;
  return (
    <Screen title={t('rewards.title')}>
      <Title>{t('rewards.title')}</Title>
      {member.status === 'error' ? <LoadError onRetry={refresh} /> : <Loading />}
    </Screen>
  );
}

function rewardName(reward: RewardRow, locale: 'el' | 'en'): string {
  return locale === 'el' ? reward.name_el : reward.name_en;
}

/** Signed out: the catalog with Classic costs, and a way in. */
function GuestRewards() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { state, reload } = useRemote(fetchRewards);
  return (
    <Screen title={t('rewards.title')}>
      <Title>{t('rewards.title')}</Title>
      <Muted>{t('rewards.intro')}</Muted>
      <RemoteContent state={state} onRetry={reload}>
        {(rewards) =>
          rewards.length === 0 ? (
            <Muted>{t('rewards.empty')}</Muted>
          ) : (
            <Card style={styles.list}>
              {rewards.map((reward, i) => (
                <View
                  key={reward.id}
                  accessible
                  accessibilityLabel={`${rewardName(reward, locale)}, ${t('rewards.cost', { points: formatPoints(reward.base_cost, locale) })}`}
                  style={[styles.row, i > 0 && styles.divider]}
                >
                  <View style={styles.rowText}>
                    <Text style={type.bodyStrong}>{rewardName(reward, locale)}</Text>
                    <Text style={styles.cost}>{t('rewards.cost', { points: formatPoints(reward.base_cost, locale) })}</Text>
                  </View>
                </View>
              ))}
            </Card>
          )
        }
      </RemoteContent>
      <Button label={t('join.hero.cta')} onPress={() => router.push('/join')} />
      <LinkButton label={t('join.hero.signIn')} onPress={() => router.push('/sign-in')} />
    </Screen>
  );
}

function costLine(view: RewardView, tier: string, t: Translate, locale: 'el' | 'en'): string {
  const points = formatPoints(view.cost, locale);
  if (!view.discounted) return t('rewards.cost', { points });
  return `${t('rewards.tierPrice', { tier, points })} · ${t('rewards.basePrice', { points: formatPoints(view.baseCost, locale) })}`;
}

function MemberRewards({ bundle }: { bundle: MemberBundle }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { refresh } = useSession();
  useRefreshOnFocus();
  const [target, setTarget] = useState<RedeemTarget | null>(null);
  const { member, balance, rewards, gifts, activeRedemption, brand } = bundle;
  const now = useNow(activeRedemption ? 1000 : 60_000);
  const gift = redeemableGift(gifts, activeRedemption, now);
  const views = rewardViews(balance.balance, member.tier, rewards, brand.config);
  const tier = tierName(t, member.tier);
  const activeLeft = activeRedemption ? remainingMs(activeRedemption.expires_at, now) : 0;
  const activeName = activeRedemption
    ? activeRedemption.gift_id
      ? t('rewards.welcome.title')
      : (() => {
          const r = rewards.find((x) => x.id === activeRedemption.reward_id);
          return r ? rewardName(r, locale) : '';
        })()
    : '';

  return (
    <Screen title={t('rewards.title')} gap={14} onRefresh={refresh}>
      <View style={styles.header}>
        <Title>{t('rewards.title')}</Title>
        <Text style={type.label}>{t(pluralKey('rewards.balance', balance.balance), { points: formatPoints(balance.balance, locale) })}</Text>
      </View>
      <Muted style={styles.intro}>{t('rewards.intro')}</Muted>

      {activeRedemption && activeLeft > 0 ? (
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push('/redeem')}
          style={({ pressed }) => [styles.active, pressed && { backgroundColor: colors.cream }]}
        >
          <Text style={type.label}>{t('redeem.active', { reward: activeName, time: formatCountdown(activeLeft) })}</Text>
        </Pressable>
      ) : null}

      {gift ? (
        <View style={styles.gift} accessibilityLabel={t('rewards.welcome.title')}>
          <View style={styles.giftIcon}>
            <Icon name="croissant" size={26} color={colors.ink} />
          </View>
          <View style={styles.giftText}>
            <Tag tone="paper" label={t('rewards.welcome.badge')} />
            <Text style={[type.bodyStrong, styles.giftTitle]}>{t('rewards.welcome.title')}</Text>
            <Text style={type.caption}>{t('rewards.welcome.validUntil', { date: formatDayMonth(gift.expires_at, locale) })}</Text>
          </View>
          <Button
            variant="paper"
            size="sm"
            label={t('rewards.redeem')}
            accessibilityHint={t('rewards.welcome.title')}
            onPress={() => setTarget({ kind: 'gift', gift })}
            style={styles.giftButton}
          />
        </View>
      ) : null}

      {views.length === 0 ? (
        <Muted>{t('rewards.empty')}</Muted>
      ) : (
        <Card style={styles.list}>
          {views.map((view, i) => {
            const name = rewardName(view.reward, locale);
            const cost = costLine(view, tier, t, locale);
            const status = view.lockedTier
              ? t('rewards.tierOnly', { tier: tierName(t, view.lockedTier) })
              : view.canHave
                ? t('rewards.canHave')
                : t('rewards.toGo', { points: formatPoints(view.toGo, locale) });
            const content = (
              <>
                <View style={styles.rowText}>
                  <Text style={type.bodyStrong}>{name}</Text>
                  <Text style={styles.cost}>{cost}</Text>
                </View>
                <Text style={[type.small, view.canHave && styles.canHave]}>{status}</Text>
              </>
            );
            return view.canHave ? (
              <Pressable
                key={view.reward.id}
                accessibilityRole="button"
                accessibilityLabel={`${name}, ${cost}, ${status}`}
                accessibilityHint={t('rewards.redeem')}
                onPress={() => setTarget({ kind: 'reward', reward: view.reward, cost: view.cost })}
                style={({ pressed }) => [styles.row, i > 0 && styles.divider, pressed && { backgroundColor: colors.cream }]}
              >
                {content}
              </Pressable>
            ) : (
              <View key={view.reward.id} accessible accessibilityLabel={`${name}, ${cost}, ${status}`} style={[styles.row, i > 0 && styles.divider]}>
                {content}
              </View>
            );
          })}
        </Card>
      )}

      <RedeemSheet target={target} memberId={member.id} onClose={() => setTarget(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space.md, flexWrap: 'wrap' },
  intro: { fontSize: 14, lineHeight: 21 },
  active: {
    minHeight: 48,
    justifyContent: 'center',
    paddingVertical: space.ms,
    paddingHorizontal: space.md,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.plum,
  },
  gift: {
    backgroundColor: colors.pink,
    borderRadius: radius.md,
    padding: space.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    alignItems: 'center',
  },
  giftIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  giftText: { flex: 1, gap: space.xs, minWidth: 0 },
  giftTitle: { ...font(800), fontSize: 16, lineHeight: 22, marginTop: 2 },
  giftButton: { flexBasis: '100%' },
  list: { padding: 0, gap: 0, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    gap: space.ms,
    alignItems: 'center',
    paddingVertical: space.ms,
    paddingHorizontal: space.md,
    minHeight: 56,
  },
  divider: { borderTopWidth: 1, borderTopColor: colors.line },
  rowText: { flex: 1, minWidth: 0 },
  cost: { ...type.label, fontSize: 13, lineHeight: 18, color: colors.plumDeep },
  canHave: { ...type.label, fontSize: 13, lineHeight: 18, color: colors.plumDeep },
});
