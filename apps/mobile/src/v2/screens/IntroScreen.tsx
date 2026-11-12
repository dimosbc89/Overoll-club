import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { brand } from '../../brand';
import { NotConfigured, RemoteContent } from '../../components/RemoteContent';
import { useI18n } from '../../i18n/I18nProvider';
import { fetchRewards } from '../../lib/data';
import { formatPoints } from '../../lib/format';
import { useSession } from '../../lib/session';
import { tierName } from '../../lib/tiers';
import { useRemote } from '../../lib/useRemote';
import { rewardArt } from '../art';
import { welcomePhoto } from '../brandAssets';
import { FlowScreen } from '../chrome';
import { c, radius, raised, space, t } from '../theme';
import { Button, GiftBanner, Illo, Sticker, Thumb, TierSticker } from '../ui';

const tierIds = ['classic', 'gold', 'club'] as const;

/**
 * Signed out at "/": three intro steps (Figma Onboarding · 02 Welcome, 03 How it
 * works, 04 Rewards), each with «Παράλειψη» to the sign-up.
 */
export function IntroScreen({ notConfigured }: { notConfigured?: boolean }) {
  const { t: tr, locale } = useI18n();
  const router = useRouter();
  const { config } = useSession();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const join = () => router.push('/join');
  const signIn = () => router.push('/sign-in');
  const signInLink = <Button label={tr('join.hero.signIn')} kind="text" onPress={signIn} />;

  if (step === 1) {
    return (
      <FlowScreen
        title={tr('landing.meta.title')}
        step={{ current: 1, total: 3 }}
        onSkip={join}
        footer={
          <>
            <Button label={tr('v2.welcome.go')} onPress={() => setStep(2)} />
            {signInLink}
          </>
        }
      >
        {notConfigured ? <NotConfigured /> : null}
        <View style={styles.hero}>
          <View style={styles.photoFrame}>
            {welcomePhoto ? <Image source={welcomePhoto} style={styles.photo} contentFit="cover" accessible={false} /> : null}
          </View>
          <Sticker label={tr('v2.welcome.sticker')} color="coral" rotate={-6} style={styles.heroSticker} />
          <Illo name="sparkle" size={48} style={styles.heroSparkle} />
        </View>
        <Text style={t.overline}>{brand.programName}</Text>
        <Text accessibilityRole="header" style={t.displayL}>
          {tr('v2.welcome.title')}
        </Text>
        <Text style={t.bodyL}>{tr('v2.welcome.body')}</Text>
      </FlowScreen>
    );
  }

  if (step === 2) {
    return (
      <FlowScreen
        title={tr('landing.how.title')}
        onBack={() => setStep(1)}
        step={{ current: 2, total: 3 }}
        onSkip={join}
        footer={
          <>
            <Button label={tr('v2.next')} onPress={() => setStep(3)} />
            {signInLink}
          </>
        }
      >
        <Text accessibilityRole="header" style={t.displayL}>
          {tr('v2.how.title')}
        </Text>
        {(['v2.how.1', 'v2.how.2', 'v2.how.3'] as const).map((key, i) => (
          <View key={key} style={styles.stepRow}>
            <View style={[styles.number, { backgroundColor: [c.sun, c.coral, c.mint][i] }]}>
              <Text style={t.title}>{i + 1}</Text>
            </View>
            <Text style={[t.bodyM, styles.flex]}>{tr(key, { points: formatPoints(config.pointsPerEuro, locale) })}</Text>
          </View>
        ))}
        <View style={styles.ladder}>
          {tierIds.map((id, i) => {
            const rule = config.tiers.find((x) => x.id === id);
            if (!rule) return null;
            const multiplier = (rule.multiplierPct / 100).toLocaleString(locale === 'el' ? 'el-GR' : 'en-GB', { minimumFractionDigits: 2 });
            const discount = Math.round(rule.rewardDiscountBp / 100);
            return (
              <View key={id} style={[styles.tierRow, i > 0 && styles.divider]}>
                <View style={styles.tierSticker}>
                  <TierSticker tier={id} label={tierName(tr, id)} />
                </View>
                <View style={styles.flex}>
                  <Text style={t.bodySStrong}>{rule.threshold === 0 ? tr('v2.how.tier.start') : tr('rewards.cost', { points: formatPoints(rule.threshold, locale) })}</Text>
                  <Text style={t.bodyS}>
                    {discount > 0 ? tr('v2.how.tier.perkDiscount', { multiplier, discount }) : tr('v2.how.tier.perk', { multiplier })}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </FlowScreen>
    );
  }

  return (
    <FlowScreen
      title={tr('rewards.title')}
      onBack={() => setStep(2)}
      step={{ current: 3, total: 3 }}
      footer={
        <>
          <Button label={tr('join.hero.cta')} onPress={join} disabled={notConfigured} />
          {signInLink}
        </>
      }
    >
      <Text accessibilityRole="header" style={t.displayL}>
        {tr('v2.rewardsIntro.title')}
      </Text>
      <IntroRewards />
      <GiftBanner title={tr('v2.gift.locked.title')} body={tr('v2.rewardsIntro.giftBody', { days: config.welcome.validDays })} />
    </FlowScreen>
  );
}

/** Four rewards of the catalog with their Joey price. */
function IntroRewards() {
  const { t: tr, locale } = useI18n();
  const { state, reload } = useRemote(fetchRewards);
  return (
    <RemoteContent state={state} onRetry={reload}>
      {(rewards) =>
        rewards.length === 0 ? null : (
          <View style={styles.list}>
            {pickFour(rewards).map((reward, i) => (
              <View
                key={reward.id}
                accessible
                accessibilityLabel={`${locale === 'el' ? reward.name_el : reward.name_en}, ${tr('rewards.cost', { points: formatPoints(reward.base_cost, locale) })}`}
                style={[styles.listRow, i > 0 && styles.divider]}
              >
                <Thumb name={rewardArt(reward)} size={48} />
                <Text style={[t.bodyMStrong, styles.flex]}>{locale === 'el' ? reward.name_el : reward.name_en}</Text>
                <Text style={[t.bodySStrong, { color: c.brand }]}>{tr('rewards.cost', { points: formatPoints(reward.base_cost, locale) })}</Text>
              </View>
            ))}
          </View>
        )
      }
    </RemoteContent>
  );
}

/** Cheapest, two from the middle and the dearest, so the list shows the range. */
function pickFour<T extends { base_cost: number }>(rewards: T[]): T[] {
  const sorted = [...rewards].sort((a, b) => a.base_cost - b.base_cost);
  if (sorted.length <= 4) return sorted;
  const at = (f: number) => sorted[Math.round(f * (sorted.length - 1))]!;
  return [...new Set([at(0), at(1 / 3), at(2 / 3), at(1)])];
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  hero: { height: 272, marginBottom: space[8] },
  photoFrame: {
    position: 'absolute',
    left: 20,
    top: 18,
    right: 12,
    bottom: 4,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 2.5,
    borderColor: c.ink,
    transform: [{ rotate: '-3deg' }],
    backgroundColor: c.sunken,
  },
  photo: { width: '100%', height: '100%' },
  heroSticker: { position: 'absolute', right: 0, top: 0 },
  heroSparkle: { position: 'absolute', left: 0, bottom: 12 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: space[12] },
  number: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: c.ink, alignItems: 'center', justifyContent: 'center' },
  ladder: { backgroundColor: c.surface, borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 6, ...raised(4) },
  tierRow: { flexDirection: 'row', alignItems: 'center', gap: space[8], paddingVertical: space[8] },
  tierSticker: { width: 132 },
  divider: { borderTopWidth: 2, borderTopColor: c.borderSubtle },
  list: { backgroundColor: c.surface, borderRadius: radius.lg, paddingHorizontal: 18, paddingVertical: 6, ...raised(4) },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: space[12], paddingVertical: space[12] },
});
