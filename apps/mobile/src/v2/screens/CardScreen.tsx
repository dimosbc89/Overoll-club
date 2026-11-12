import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { useI18n } from '../../i18n/I18nProvider';
import { pluralKey } from '../../i18n/messages';
import type { MemberBundle } from '../../lib/data';
import { formatCountdown, formatDayMonth, formatPoints, groupCode, remainingMs } from '../../lib/format';
import { nextRewardView, nextTierView, pointsValidUntil, rewardViews, welcomeBanner, redeemableGift } from '../../lib/memberView';
import { type WalletKind, walletButtons } from '../../lib/platformFeatures';
import { useRotatingToken } from '../../lib/qrTicker';
import { useRefreshOnFocus, useSession } from '../../lib/session';
import { tierName } from '../../lib/tiers';
import { useNow } from '../../lib/useNow';
import { qr } from '../../theme/tokens';
import { giftArt, rewardArt } from '../art';
import { AppScreen } from '../chrome';
import { c, radius, raised, space, t } from '../theme';
import { GiftBanner, Icon, Progress, QrFrame, Thumb, TierSticker, WalletButton } from '../ui';

/** Κάρτα (Figma App · 01 Card, 02 Card · welcome gift). */
export function CardScreen({ bundle, offline }: { bundle: MemberBundle; offline: boolean }) {
  const { t: tr, locale } = useI18n();
  const router = useRouter();
  const { refresh } = useSession();
  useRefreshOnFocus();
  const { member, balance, secret, rewards, gifts, activeRedemption } = bundle;
  const now = useNow(activeRedemption ? 1000 : 60_000);
  const config = bundle.brand.config;
  const token = useRotatingToken(member.member_code, secret?.qr_secret, config);
  const points = formatPoints(balance.balance, locale);
  const wallets = walletButtons(Platform.OS);
  const purchased = !!(member.last_purchase_at ?? balance.last_earn_at);

  const next = nextRewardView(balance.balance, member.tier, rewards, config);
  const canHave = rewardViews(balance.balance, member.tier, rewards, config).filter((v) => v.canHave).length;
  const nextTier = nextTierView(member.tier, balance.earned_12m, config);
  const banner = welcomeBanner(gifts, purchased, now, activeRedemption);
  const gift = redeemableGift(gifts, activeRedemption, now);
  const validUntil = pointsValidUntil(member.last_purchase_at ?? balance.last_earn_at, balance.balance, config);
  const activeLeft = activeRedemption ? remainingMs(activeRedemption.expires_at, now) : 0;
  const activeReward = activeRedemption?.reward_id ? rewards.find((r) => r.id === activeRedemption.reward_id) : undefined;
  const activeName = activeRedemption?.gift_id ? tr('rewards.welcome.title') : activeReward ? (locale === 'el' ? activeReward.name_el : activeReward.name_en) : '';

  return (
    <AppScreen title={tr('tabs.card')} onRefresh={refresh}>
      {offline ? <Text style={t.bodyS}>{tr('card.offline')}</Text> : null}

      {activeRedemption && activeLeft > 0 ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`${activeName}, ${tr('v2.card.active', { time: formatCountdown(activeLeft) })}`}
          onPress={() => router.push('/redeem')}
          style={({ pressed }) => [styles.pending, pressed && { ...raised(1), transform: [{ translateY: 3 }] }]}
        >
          <Thumb name={activeRedemption.gift_id ? giftArt() : rewardArt(activeReward ?? {})} />
          <View style={styles.flex}>
            <Text style={t.title}>{activeName}</Text>
            <Text style={t.bodySStrong}>{tr('v2.card.active', { time: formatCountdown(activeLeft) })}</Text>
          </View>
          <View style={styles.chevron}>
            <Icon name="chevron" size={22} />
          </View>
        </Pressable>
      ) : null}

      {banner === 'ready' && gift ? (
        <GiftBanner
          title={tr('v2.gift.ready.title')}
          body={tr('v2.gift.ready.body', { date: formatDayMonth(gift.expires_at, locale) })}
          onPress={() => router.push('/rewards')}
        />
      ) : null}

      <View style={styles.balance}>
        <View accessible accessibilityLabel={`${member.first_name}, ${tr('card.pointsA11y', { points })}`} style={styles.flexShrink}>
          <Text style={[t.bodyMStrong, { color: c.muted }]} numberOfLines={1}>
            {member.first_name}
          </Text>
          <View style={styles.pointsRow}>
            <Text style={t.displayXl} adjustsFontSizeToFit numberOfLines={1}>
              {points}
            </Text>
            <Text style={t.bodyL}>{tr('card.points')}</Text>
          </View>
        </View>
        <TierSticker tier={member.tier} label={tierName(tr, member.tier)} style={styles.tier} />
      </View>

      <QrFrame
        tone="sun"
        code={groupCode(member.member_code)}
        codeA11y={tr('card.memberCode', { code: member.member_code.split('').join(' ') })}
        hint={tr('v2.card.qrHint')}
      >
        <View accessible accessibilityRole="image" accessibilityLabel={tr('card.qr.a11y')} style={styles.qr}>
          {token ? <QRCode value={token} size={160} color={qr.dark} backgroundColor={qr.light} ecl="M" quietZone={8} /> : null}
        </View>
      </QrFrame>

      {next.kind === 'progress' ? (
        <Progress
          title={tr('v2.card.next.title', { reward: locale === 'el' ? next.reward.name_el : next.reward.name_en })}
          subtitle={
            canHave > 0
              ? tr(pluralKey('v2.card.next.canHave', canHave), { count: canHave })
              : tr(pluralKey('v2.card.next.toGo', next.pointsNeeded), { points: formatPoints(next.pointsNeeded, locale) })
          }
          value={balance.balance}
          max={next.cost}
          start={points}
          end={formatPoints(next.cost, locale)}
          a11y={tr('card.nextReward.a11y')}
        />
      ) : next.kind === 'ready' ? (
        <Text style={t.bodyMStrong}>{tr('card.nextReward.ready')}</Text>
      ) : null}

      {nextTier.kind === 'progress' ? (
        <Progress
          title={tr('card.nextTier', { points: formatPoints(nextTier.pointsToNext, locale), tier: tierName(tr, nextTier.next) })}
          value={nextTier.earned}
          max={nextTier.threshold}
          fill="brand"
          start={`${tierName(tr, member.tier)} · ${formatPoints(nextTier.earned, locale)}`}
          end={`${tierName(tr, nextTier.next)} · ${formatPoints(nextTier.threshold, locale)}`}
          a11y={tr('card.nextTier.a11y')}
        />
      ) : (
        <Text style={t.bodyMStrong}>{tr('card.topTier')}</Text>
      )}

      {banner === 'locked' ? (
        <GiftBanner title={tr('v2.gift.locked.title')} body={tr('v2.gift.locked.body', { days: config.welcome.validDays })} />
      ) : null}

      {wallets.length > 0 ? (
        <View style={styles.wallets}>
          {wallets.map((kind) => (
            <Wallet key={kind} kind={kind} />
          ))}
        </View>
      ) : null}

      {validUntil ? (
        <Text style={t.bodyS}>{tr('card.expiry', { date: formatDayMonth(validUntil, locale), months: config.expiryMonths })}</Text>
      ) : null}
    </AppScreen>
  );
}

/** «Προσθήκη στο Apple / Google Wallet»: asks the server for the pass link (API contract v0.7). */
function Wallet({ kind }: { kind: WalletKind }) {
  const { t: tr } = useI18n();
  const { api, errorText } = useSession();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const label = tr(kind === 'apple' ? 'card.wallet.apple' : 'card.wallet.google');
  const add = async () => {
    if (!api || busy) return;
    setBusy(true);
    setNote(null);
    const result = await api.action<{ url: string }>(kind === 'apple' ? 'wallet/apple/link' : 'wallet/google/link', {}).send();
    setBusy(false);
    if (!result.ok) {
      setNote(result.code === 'not_configured' ? tr('common.comingSoon') : errorText(result.code));
      return;
    }
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.location.assign(result.data.url);
    else await Linking.openURL(result.data.url).catch(() => setNote(errorText('unknown')));
  };
  return (
    <View style={styles.walletSlot}>
      <WalletButton kind={kind} label={label} onPress={add} busy={busy} />
      {note ? <Text style={[t.bodyS, styles.center]}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  flexShrink: { flexShrink: 1 },
  center: { textAlign: 'center' },
  balance: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space[8] },
  pointsRow: { flexDirection: 'row', alignItems: 'baseline', gap: space[8] },
  tier: { alignSelf: 'flex-end', marginBottom: 2 },
  qr: { width: 160, height: 160 },
  pending: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[12],
    padding: space[12],
    borderRadius: radius.lg,
    backgroundColor: c.mint,
    ...raised(4),
  },
  chevron: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: c.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...raised(4),
  },
  wallets: { flexDirection: 'row', gap: space[8] },
  walletSlot: { flex: 1, gap: 4 },
});
