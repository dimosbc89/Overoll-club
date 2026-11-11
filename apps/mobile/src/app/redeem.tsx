import { Redirect, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Icon } from '../components/Icon';
import { Loading } from '../components/RemoteContent';
import { Body, Button, ErrorText, Muted, ProgressBar, Screen, Sheet, Tag } from '../components/ui';
import { useI18n } from '../i18n/I18nProvider';
import { ActionSlot } from '../lib/api';
import { fetchRedemption, type MemberBundle, type RedemptionRow } from '../lib/data';
import { formatCountdown, formatPoints, groupCode, remainingMs } from '../lib/format';
import { useSession } from '../lib/session';
import { getSupabase } from '../lib/supabase';
import { useNow } from '../lib/useNow';
import { type } from '../theme/fonts';
import { brand } from '../brand';
import { raised } from '../theme/surface';
import { colors, qr, radius, space } from '../theme/tokens';

type Outcome = 'used' | 'cancelled' | 'expired';

/** How often the open code screen checks whether the till has used the code. */
const POLL_MS = 5000;

/** The active redemption code: QR, letters, countdown, cancel (Redeem.dc.html). */
export default function RedeemScreen() {
  const { auth, member } = useSession();
  const { t } = useI18n();
  if (auth.status === 'signed_out' || auth.status === 'not_configured' || member.status === 'none') {
    return <Redirect href="/rewards" />;
  }
  if (member.status !== 'ready') {
    return (
      <Screen title={t('redeem.code.title')}>
        <Loading />
      </Screen>
    );
  }
  return <CodeScreen bundle={member.data} />;
}

interface CancelResult {
  redemptionId: string;
  pointsRefunded: number;
  balance: number;
}

function CodeScreen({ bundle }: { bundle: MemberBundle }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { api, config, clearRedemption, refresh, errorText } = useSession();
  const now = useNow(1000);
  // Keep the code on screen after it is cleared from the session (to show the outcome).
  const [shown, setShown] = useState<RedemptionRow | null>(bundle.activeRedemption);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const slot = useMemo(() => (api ? new ActionSlot<CancelResult>(() => api) : null), [api]);
  const finished = useRef(false);

  useEffect(() => {
    if (!outcome && bundle.activeRedemption && bundle.activeRedemption.id !== shown?.id) setShown(bundle.activeRedemption);
  }, [bundle.activeRedemption, outcome, shown?.id]);

  const finish = (result: Outcome, balance?: number) => {
    if (finished.current) return;
    finished.current = true;
    setOutcome(result);
    setConfirming(false);
    clearRedemption(balance);
    void refresh();
  };

  const left = shown ? remainingMs(shown.expires_at, now) : 0;

  // The countdown ran out: the server job returns the points (or the gift).
  useEffect(() => {
    if (shown && !outcome && left === 0) finish('expired');
  });

  // Has the till used it? (Also catches a cancel or expiry seen elsewhere.)
  useEffect(() => {
    const client = getSupabase();
    if (!client || !shown || outcome) return;
    const id = setInterval(() => {
      fetchRedemption(client, shown.id)
        .then((row) => {
          if (!row || row.status === 'pending') return;
          finish(row.status === 'used' ? 'used' : row.status === 'cancelled' ? 'cancelled' : 'expired');
        })
        .catch(() => {});
    }, POLL_MS);
    return () => clearInterval(id);
  }, [shown?.id, outcome]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/rewards'));

  if (!shown) return <Redirect href="/rewards" />;

  const isGift = !!shown.gift_id;
  const reward = bundle.rewards.find((r) => r.id === shown.reward_id);
  const name = isGift ? t('rewards.welcome.title') : reward ? (locale === 'el' ? reward.name_el : reward.name_en) : '';
  const points = formatPoints(shown.points_spent, locale);
  const span = Math.round((Date.parse(shown.expires_at) - Date.parse(shown.created_at)) / 1000);
  const total = span > 0 ? span : config.redemptionValidMinutes * 60;

  const cancel = async () => {
    if (!slot) return;
    setBusy(true);
    setError(null);
    const result = await slot.send('redemptions/cancel', { redemptionId: shown.id });
    setBusy(false);
    if (result.ok) return finish('cancelled', result.data.balance);
    if (result.code === 'already_used') return finish('used');
    if (result.code === 'expired') return finish('expired');
    if (result.code === 'cancelled') return finish('cancelled');
    setError(errorText(result.code));
  };

  const backLink = (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={t('redeem.backToRewards')}
      onPress={back}
      style={({ pressed }) => [styles.back, pressed && { opacity: 0.7 }]}
    >
      <Icon name="back" size={20} color={colors.accent} strokeWidth={1.75} />
      <Text style={[type.label, { color: colors.accent }]}>{t('tabs.rewards')}</Text>
    </Pressable>
  );

  if (outcome) {
    const message =
      outcome === 'used'
        ? t('redeem.used')
        : outcome === 'cancelled'
          ? t(isGift ? 'redeem.cancelledGift' : 'redeem.cancelled')
          : t(isGift ? 'redeem.expiredGift' : 'redeem.expired');
    return (
      <Screen title={t('redeem.code.title')} gap={18}>
        {backLink}
        <View style={styles.outcome} accessibilityLiveRegion="polite">
          {outcome === 'used' ? <Icon name={brand.giftIcon} size={40} color={colors.accent} /> : null}
          <Text accessibilityRole="header" style={[type.heading, styles.center]}>
            {name}
          </Text>
          <Body style={[type.bodyStrong, styles.center]}>{message}</Body>
        </View>
        <Button label={t('redeem.backToRewards')} onPress={() => router.replace('/rewards')} style={styles.bottom} />
      </Screen>
    );
  }

  return (
    <Screen title={t('redeem.code.title')} gap={18}>
      {backLink}

      <View style={styles.titleBlock}>
        {isGift ? <Tag tone="plum" label={t('rewards.welcome.badge')} style={styles.centerSelf} /> : null}
        <Text accessibilityRole="header" style={[type.heading, styles.center, isGift && { marginTop: 6 }]}>
          {name}
        </Text>
        <Text style={[type.bodyStrong, styles.title]}>{t('redeem.code.title')}</Text>
      </View>

      <View style={styles.panel}>
        <View style={styles.qrBox} accessible accessibilityRole="image" accessibilityLabel={t('redeem.code.qrA11y')}>
          <QRCode value={shown.code} size={200} color={qr.dark} backgroundColor={qr.light} ecl="M" quietZone={0} />
        </View>
        <Text style={styles.code} accessibilityLabel={shown.code.split('').join(' ')}>
          {groupCode(shown.code)}
        </Text>
        <View style={styles.timer}>
          <Text style={[type.bodyStrong, styles.center, styles.onCard, { fontSize: 15, lineHeight: 20 }]} accessibilityLiveRegion="none">
            {t('redeem.code.timer', { time: formatCountdown(left) })}
          </Text>
          <ProgressBar value={Math.ceil(left / 1000)} max={total} label={t('redeem.code.timeA11y')} track={colors.surface} height={8} />
        </View>
      </View>

      <Muted style={styles.center}>{t('redeem.code.manual', { code: shown.code })}</Muted>

      <View style={[styles.actions, styles.bottom]}>
        <Button label={t('redeem.code.cancel')} variant="outline" onPress={() => setConfirming(true)} />
        <Muted style={[styles.center, { fontSize: 12, lineHeight: 17 }]}>
          {isGift ? t('redeem.code.noteGift') : t('redeem.code.notePoints', { points })}
        </Muted>
      </View>

      <Sheet visible={confirming} onClose={() => !busy && setConfirming(false)} closeLabel={t('redeem.cancel.no')}>
        <Text accessibilityRole="header" style={type.heading}>
          {t('redeem.cancel.title')}
        </Text>
        <Body>{isGift ? t('redeem.cancel.bodyGift') : t('redeem.cancel.body', { points })}</Body>
        {error ? <ErrorText message={error} /> : null}
        <Button label={t('redeem.cancel.yes')} onPress={cancel} loading={busy} />
        <Button label={t('redeem.cancel.no')} variant="outline" onPress={() => setConfirming(false)} disabled={busy} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  titleBlock: { alignItems: 'center', gap: 6 },
  centerSelf: { alignSelf: 'center' },
  center: { textAlign: 'center' },
  title: { textAlign: 'center', fontSize: 16, lineHeight: 24 },
  panel: { backgroundColor: colors.card, borderRadius: radius.lg, padding: space.lg, alignItems: 'center', gap: space.md, ...raised },
  onCard: { color: colors.onCard },
  qrBox: { backgroundColor: qr.light, borderRadius: radius.md, padding: space.md },
  code: { ...type.display, fontSize: 28, lineHeight: 32, letterSpacing: 4, color: colors.onCard },
  timer: { width: '100%', gap: space.sm },
  actions: { gap: 10 },
  bottom: { marginTop: 'auto' },
  outcome: { alignItems: 'center', gap: space.ms, paddingVertical: space.xl },
});
