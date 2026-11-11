import { Redirect, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Icon } from '../../components/Icon';
import { Landing } from '../../components/Landing';
import { Logo } from '../../components/Logo';
import { LoadError, Loading } from '../../components/RemoteContent';
import { Muted, ProgressBar, Screen, Tag } from '../../components/ui';
import { useI18n } from '../../i18n/I18nProvider';
import { pluralKey } from '../../i18n/messages';
import type { MemberBundle } from '../../lib/data';
import { formatCountdown, formatDayMonth, formatPoints, groupCode, remainingMs } from '../../lib/format';
import { nextRewardView, nextTierView, pointsValidUntil, welcomeBanner } from '../../lib/memberView';
import { useRotatingToken } from '../../lib/qrTicker';
import { useRefreshOnFocus, useSession } from '../../lib/session';
import { useNow } from '../../lib/useNow';
import { tierName } from '../../lib/tiers';
import { font, type } from '../../theme/fonts';
import { raised } from '../../theme/surface';
import { colors, minTouch, qr, radius, space } from '../../theme/tokens';
import { brand } from '../../brand';

/** Home: the member card when signed in, the landing page otherwise (copy deck §h). */
export default function CardTab() {
  const { auth, member, refresh } = useSession();
  const { t } = useI18n();

  if (auth.status === 'not_configured') return <Landing notConfigured />;
  if (auth.status === 'signed_out') return <Landing />;
  if (member.status === 'none') return <Redirect href="/join" />;
  if (member.status === 'ready') return <MemberCard bundle={member.data} offline={member.offline} />;
  return (
    <Screen title={t('tabs.card')}>
      {member.status === 'error' ? <LoadError onRetry={refresh} /> : <Loading />}
    </Screen>
  );
}

function MemberCard({ bundle, offline }: { bundle: MemberBundle; offline: boolean }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { refresh } = useSession();
  useRefreshOnFocus();
  const { member, balance, secret, rewards, gifts, activeRedemption } = bundle;
  // Every second only while a code is counting down.
  const now = useNow(activeRedemption ? 1000 : 60_000);
  const config = bundle.brand.config;
  const token = useRotatingToken(member.member_code, secret?.qr_secret, config);
  const tier = tierName(t, member.tier);
  const points = formatPoints(balance.balance, locale);

  const next = nextRewardView(balance.balance, member.tier, rewards, config);
  const nextTier = nextTierView(member.tier, balance.earned_12m, config);
  const banner = welcomeBanner(gifts, !!(member.last_purchase_at ?? balance.last_earn_at), now, activeRedemption);
  const validUntil = pointsValidUntil(member.last_purchase_at ?? balance.last_earn_at, balance.balance, config);
  const activeLeft = activeRedemption ? remainingMs(activeRedemption.expires_at, now) : 0;
  const activeReward = activeRedemption
    ? activeRedemption.gift_id
      ? t('rewards.welcome.title')
      : (() => {
          const r = rewards.find((x) => x.id === activeRedemption.reward_id);
          return r ? (locale === 'el' ? r.name_el : r.name_en) : '';
        })()
    : '';

  return (
    <Screen title={t('tabs.card')} onRefresh={refresh}>
      <View style={styles.topRow}>
        <Logo variant="wordmark" width={96} />
        <Text style={type.bodyStrong}>{t('card.hello', { firstName: member.first_name })}</Text>
      </View>

      {offline ? <Muted>{t('card.offline')}</Muted> : null}

      {activeRedemption && activeLeft > 0 ? (
        <Banner
          label={t('redeem.active', { reward: activeReward, time: formatCountdown(activeLeft) })}
          onPress={() => router.push('/redeem')}
        />
      ) : null}

      <View style={styles.card}>
        <View style={styles.pointsRow}>
          <View accessible accessibilityLabel={t('card.pointsA11y', { points })}>
            <Text style={styles.points}>{points}</Text>
            <Text style={[type.label, styles.onCard]}>{t('card.points')}</Text>
          </View>
          <Tag tone="paper" label={t('card.tier', { tier })} />
        </View>

        <View style={styles.qrBox}>
          <View accessible accessibilityRole="image" accessibilityLabel={t('card.qr.a11y')} style={styles.qr}>
            {token ? <QRCode value={token} size={176} color={qr.dark} backgroundColor={qr.light} ecl="M" quietZone={0} /> : null}
          </View>
          <Text
            style={styles.memberCode}
            accessibilityLabel={t('card.memberCode', { code: member.member_code.split('').join(' ') })}
          >
            {groupCode(member.member_code)}
          </Text>
        </View>
        <Text style={[type.label, styles.centerText, styles.onCard]}>{t('card.qr.hint')}</Text>
        <Text style={[type.caption, styles.centerText, styles.onCard]}>{t('card.qr.rotates', { seconds: config.qr.stepSeconds })}</Text>
      </View>

      {next.kind !== 'none' ? (
        <View style={styles.progress}>
          <Text style={type.label}>
            {next.kind === 'ready'
              ? t('card.nextReward.ready')
              : t(pluralKey('card.nextReward', next.pointsNeeded), {
                  points: formatPoints(next.pointsNeeded, locale),
                  reward: locale === 'el' ? next.reward.name_el : next.reward.name_en,
                })}
          </Text>
          {next.kind === 'progress' ? (
            <ProgressBar value={balance.balance} max={next.cost} label={t('card.nextReward.a11y')} />
          ) : null}
        </View>
      ) : null}

      <View style={styles.progress}>
        <Text style={type.body}>
          {nextTier.kind === 'top'
            ? t('card.topTier')
            : t('card.nextTier', { points: formatPoints(nextTier.pointsToNext, locale), tier: tierName(t, nextTier.next) })}
        </Text>
        {nextTier.kind === 'progress' ? (
          <ProgressBar value={nextTier.earned} max={nextTier.threshold} label={t('card.nextTier.a11y')} height={6} />
        ) : null}
      </View>

      {banner ? (
        <Banner
          icon
          label={t(banner === 'ready' ? 'card.welcome.ready' : 'card.welcome.locked')}
          onPress={banner === 'ready' ? () => router.push('/rewards') : undefined}
        />
      ) : null}

      {validUntil ? (
        <Muted>{t('card.expiry', { date: formatDayMonth(validUntil, locale), months: config.expiryMonths })}</Muted>
      ) : null}

      <View style={styles.walletBlock}>
        <View style={styles.walletRow}>
          <WalletPlaceholder label={t('card.wallet.apple')} />
          <WalletPlaceholder label={t('card.wallet.google')} />
        </View>
        <Muted>{t('card.wallet.hint')}</Muted>
      </View>
    </Screen>
  );
}

/** Plum-outlined white row (design: the welcome-croissant link on the card). */
function Banner({ label, onPress, icon }: { label: string; onPress?: () => void; icon?: boolean }) {
  const content = (
    <>
      {icon ? <Icon name={brand.giftIcon} size={22} color={colors.accent} /> : null}
      <Text style={[type.label, styles.bannerText]}>{label}</Text>
    </>
  );
  if (!onPress) return <View style={styles.banner}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.banner, pressed && { backgroundColor: colors.background }]}
    >
      {content}
    </Pressable>
  );
}

/**
 * Wallet buttons: Apple's and Google's official badges replace these when the
 * passes are ready. Disabled until then; the label is the badge's
 * accessibility text (copy deck b1).
 */
function WalletPlaceholder({ label }: { label: string }) {
  const { t } = useI18n();
  return (
    <View
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={t('common.comingSoon')}
      accessibilityState={{ disabled: true }}
      style={styles.wallet}
    >
      <Text style={styles.walletText} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: space.mdl, paddingBottom: 18, gap: 14, ...raised },
  onCard: { color: colors.onCard },
  pointsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  points: { ...type.display, fontSize: 52, lineHeight: 54, letterSpacing: -1, color: colors.onCard },
  qrBox: {
    alignSelf: 'center',
    backgroundColor: qr.light,
    borderRadius: radius.md,
    padding: 14,
    alignItems: 'center',
    gap: space.sm,
  },
  qr: { width: 176, height: 176 },
  memberCode: { ...type.label, fontSize: 13, lineHeight: 18, letterSpacing: 1.5, color: qr.dark },
  centerText: { textAlign: 'center' },
  progress: { gap: space.sm },
  banner: {
    flexDirection: 'row',
    gap: space.ms,
    alignItems: 'center',
    minHeight: 48,
    paddingVertical: space.ms,
    paddingHorizontal: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.outline,
  },
  bannerText: { flex: 1 },
  walletBlock: { gap: space.sm, marginTop: 'auto', paddingTop: space.sm },
  walletRow: { flexDirection: 'row', gap: 10 },
  wallet: {
    flex: 1,
    minHeight: minTouch,
    borderRadius: 10,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
  },
  walletText: { ...type.caption, ...font(700), color: colors.textMuted, textAlign: 'center' },
});
