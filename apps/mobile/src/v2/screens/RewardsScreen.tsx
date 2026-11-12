import { rewardCostForTier, type TierId } from '@grow-loyalty/core';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '../../i18n/I18nProvider';
import { pluralKey, type Translate } from '../../i18n/messages';
import { ActionSlot, type ApiResult } from '../../lib/api';
import type { GiftRow, MemberBundle, RedemptionRow, RewardRow } from '../../lib/data';
import { formatCountdown, formatDayMonth, formatPoints, remainingMs } from '../../lib/format';
import { redeemableGift, rewardViews, type RewardView } from '../../lib/memberView';
import { useRefreshOnFocus, useSession } from '../../lib/session';
import { tierName } from '../../lib/tiers';
import { useNow } from '../../lib/useNow';
import { giftArt, rewardArt } from '../art';
import { AppScreen, TitleRow } from '../chrome';
import { c, radius, raised, space, t } from '../theme';
import { Button, ErrorText, Icon, Sheet, Sticker, Thumb } from '../ui';

type Target = { kind: 'reward'; reward: RewardRow; cost: number } | { kind: 'gift'; gift: GiftRow };

const tiers: TierId[] = ['classic', 'gold', 'club'];

function name(reward: RewardRow, locale: 'el' | 'en'): string {
  return locale === 'el' ? reward.name_el : reward.name_en;
}

/** "Koala 240 · Eucalyptus 210": what the other tiers pay. */
function tierPrices(reward: RewardRow, mine: TierId, config: MemberBundle['brand']['config'], t: Translate, locale: 'el' | 'en'): string {
  return tiers
    .filter((x) => x !== mine)
    .map((x) => `${tierName(t, x)} ${formatPoints(rewardCostForTier(reward.base_cost, x, config), locale)}`)
    .join(' · ');
}

/** Δώρα (Figma App · 03 Rewards, 04 scrolled, 05 confirm sheet). */
export function RewardsScreen({ bundle }: { bundle: MemberBundle }) {
  const { t: tr, locale } = useI18n();
  const router = useRouter();
  const { refresh } = useSession();
  useRefreshOnFocus();
  const [target, setTarget] = useState<Target | null>(null);
  const { member, balance, rewards, gifts, activeRedemption, brand } = bundle;
  const config = brand.config;
  const now = useNow(activeRedemption ? 1000 : 60_000);
  const gift = redeemableGift(gifts, activeRedemption, now);
  const views = rewardViews(balance.balance, member.tier, rewards, config);
  const available = views.filter((v) => v.canHave);
  const later = views.filter((v) => !v.canHave);
  const activeLeft = activeRedemption ? remainingMs(activeRedemption.expires_at, now) : 0;
  const activeReward = activeRedemption?.reward_id ? rewards.find((r) => r.id === activeRedemption.reward_id) : undefined;
  const activeName = activeRedemption?.gift_id ? tr('rewards.welcome.title') : activeReward ? name(activeReward, locale) : '';

  return (
    <AppScreen title={tr('rewards.title')} onRefresh={refresh}>
      <TitleRow
        title={tr('rewards.title')}
        sticker={<Sticker label={tr(pluralKey('rewards.balance', balance.balance), { points: formatPoints(balance.balance, locale) })} />}
      />
      <Text style={t.bodyS}>{tr('v2.rewards.intro', { gold: tierName(tr, 'gold'), club: tierName(tr, 'club') })}</Text>

      {activeRedemption && activeLeft > 0 ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`${activeName}, ${tr('v2.card.active', { time: formatCountdown(activeLeft) })}`}
          onPress={() => router.push('/redeem')}
          style={({ pressed }) => [styles.card, { backgroundColor: c.mint }, pressed && styles.pressed]}
        >
          <Thumb name={activeRedemption.gift_id ? giftArt() : rewardArt(activeReward ?? {})} />
          <View style={styles.text}>
            <Text style={t.title}>{activeName}</Text>
            <Text style={t.bodySStrong}>{tr('v2.card.active', { time: formatCountdown(activeLeft) })}</Text>
          </View>
          <View style={[styles.action, { backgroundColor: c.surface }]}>
            <Icon name="chevron" size={22} />
          </View>
        </Pressable>
      ) : null}

      {gift ? (
        <View style={styles.giftCard} accessible={false}>
          <View style={styles.giftTop}>
            <Thumb name={giftArt()} tile="sun" />
            <View style={styles.text}>
              <Sticker label={`${tr('rewards.welcome.badge')}!`} rotate={-4} style={{ marginLeft: -4 }} />
              <Text style={t.title}>{tr('rewards.welcome.title')}</Text>
              <Text style={t.bodySStrong}>{tr('rewards.welcome.validUntil', { date: formatDayMonth(gift.expires_at, locale) })}</Text>
            </View>
          </View>
          <Button label={tr('v2.rewards.take')} accessibilityHint={tr('rewards.welcome.title')} onPress={() => setTarget({ kind: 'gift', gift })} />
        </View>
      ) : null}

      {views.length === 0 ? <Text style={t.bodyS}>{tr('rewards.empty')}</Text> : null}

      {available.map((view) => (
        <RewardCard key={view.reward.id} view={view} tier={member.tier} config={config} onPress={() => setTarget({ kind: 'reward', reward: view.reward, cost: view.cost })} />
      ))}

      {later.length > 0 ? (
        <Text accessibilityRole="header" style={[t.overline, styles.section]}>
          {tr('v2.rewards.soon')}
        </Text>
      ) : null}
      {later.map((view) => (
        <RewardCard key={view.reward.id} view={view} tier={member.tier} config={config} />
      ))}

      <RedeemSheet target={target} memberId={member.id} balance={balance.balance} onClose={() => setTarget(null)} />
    </AppScreen>
  );
}

function RewardCard({ view, tier, config, onPress }: { view: RewardView; tier: TierId; config: MemberBundle['brand']['config']; onPress?: () => void }) {
  const { t: tr, locale } = useI18n();
  const title = name(view.reward, locale);
  const cost = tr('rewards.cost', { points: formatPoints(view.cost, locale) });
  const others = tierPrices(view.reward, tier, config, tr, locale);
  const status = view.lockedTier ? tr('rewards.tierOnly', { tier: tierName(tr, view.lockedTier) }) : tr('rewards.toGo', { points: formatPoints(view.toGo, locale) });
  const body = (
    <>
      <Thumb name={rewardArt(view.reward)} faded={!onPress} />
      <View style={styles.text}>
        <Text style={t.title}>{title}</Text>
        <Text style={[t.bodySStrong, { color: c.brand }]}>{cost}</Text>
        <Text style={t.bodyS}>{others}</Text>
      </View>
      {onPress ? (
        <View style={[styles.action, { backgroundColor: c.sun }]}>
          <Icon name="chevron" size={22} />
        </View>
      ) : (
        <View style={styles.locked}>
          <Icon name="lock" size={20} />
          <Text style={[t.bodySStrong, styles.center]}>{status}</Text>
        </View>
      )}
    </>
  );
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={`${title}, ${cost}, ${status}`} style={styles.lockedCard}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${cost}`}
      accessibilityHint={tr('rewards.redeem')}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
}

interface CreatedRedemption {
  redemptionId: string;
  code: string;
  rewardId: string;
  pointsSpent: number;
  expiresAt: string;
  balance: number;
  giftId?: string | null;
}

/** «Να ετοιμάσουμε τον κωδικό;» → POST redemptions/create → the code screen (same key on retry). */
function RedeemSheet({ target, memberId, balance, onClose }: { target: Target | null; memberId: string; balance: number; onClose: () => void }) {
  const { t: tr, locale } = useI18n();
  const router = useRouter();
  const { api, config, applyRedemption, errorText } = useSession();
  const slot = useMemo(() => (api ? new ActionSlot<CreatedRedemption>(() => api) : null), [api]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (busy) return;
    setError(null);
    onClose();
  };

  const confirm = async () => {
    if (!target || !slot) return;
    setBusy(true);
    setError(null);
    const body = target.kind === 'gift' ? { memberId, giftId: target.gift.id } : { memberId, rewardId: target.reward.id };
    const result: ApiResult<CreatedRedemption> = await slot.send('redemptions/create', body);
    setBusy(false);
    if (!result.ok) {
      const tier = target.kind === 'reward' && target.reward.min_tier ? tierName(tr, target.reward.min_tier) : undefined;
      setError(errorText(result.code, tier));
      return;
    }
    const r = result.data;
    const redemption: RedemptionRow = {
      id: r.redemptionId,
      code: r.code,
      reward_id: r.rewardId,
      points_spent: r.pointsSpent,
      status: 'pending',
      created_at: new Date().toISOString(),
      expires_at: r.expiresAt,
      gift_id: r.giftId ?? (target.kind === 'gift' ? target.gift.id : null),
    };
    applyRedemption(redemption, r.balance);
    onClose();
    router.push('/redeem');
  };

  const minutes = config.redemptionValidMinutes;
  const isGift = target?.kind === 'gift';
  const cost = target?.kind === 'reward' ? target.cost : 0;
  return (
    <Sheet visible={!!target} onClose={close} closeLabel={tr('redeem.confirm.no')}>
      {target ? (
        <View style={styles.summary}>
          <Thumb name={isGift ? giftArt() : rewardArt(target.kind === 'reward' ? target.reward : {})} />
          <View style={styles.text}>
            <Text style={t.title}>{target.kind === 'reward' ? name(target.reward, locale) : tr('rewards.welcome.title')}</Text>
            <Text style={[t.bodySStrong, { color: c.brand }]}>
              {isGift
                ? tr('rewards.welcome.badge')
                : tr('v2.redeem.summary', { cost: formatPoints(cost, locale), left: formatPoints(Math.max(0, balance - cost), locale) })}
            </Text>
          </View>
        </View>
      ) : null}
      <Text accessibilityRole="header" style={t.displayS}>
        {tr('redeem.confirm.title')}
      </Text>
      <Text style={t.bodyM}>
        {isGift ? tr('redeem.confirm.bodyGift', { minutes }) : tr('redeem.confirm.body', { minutes, points: formatPoints(cost, locale) })}
      </Text>
      {error ? <ErrorText message={error} /> : null}
      <Button label={tr('redeem.confirm.yes')} onPress={confirm} loading={busy} />
      <Button label={tr('redeem.confirm.no')} kind="text" onPress={close} disabled={busy} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  text: { flex: 1, minWidth: 0, gap: 2 },
  section: { marginTop: space[4] },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[12],
    padding: space[12],
    borderRadius: radius.lg,
    backgroundColor: c.surface,
    ...raised(4),
  },
  pressed: { ...raised(1), transform: [{ translateY: 3 }] },
  lockedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[12],
    padding: space[12],
    borderRadius: radius.lg,
    backgroundColor: c.sunken,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: c.border,
  },
  action: { width: 48, height: 48, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', ...raised(4) },
  locked: { alignItems: 'center', gap: space[4], maxWidth: 96 },
  giftCard: { backgroundColor: c.coral, borderRadius: radius.lg, padding: space[20], gap: space[16], ...raised(4) },
  giftTop: { flexDirection: 'row', alignItems: 'center', gap: space[16] },
  summary: { flexDirection: 'row', alignItems: 'center', gap: space[12], padding: space[12], borderRadius: radius.lg, backgroundColor: c.app },
});
