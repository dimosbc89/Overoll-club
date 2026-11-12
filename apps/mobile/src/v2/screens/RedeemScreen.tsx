import { Redirect, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { useI18n } from '../../i18n/I18nProvider';
import { ActionSlot } from '../../lib/api';
import { fetchRedemption, type MemberBundle, type RedemptionRow } from '../../lib/data';
import { formatCountdown, formatPoints, groupCode, remainingMs } from '../../lib/format';
import { useSession } from '../../lib/session';
import { getSupabase } from '../../lib/supabase';
import { useNow } from '../../lib/useNow';
import { qr } from '../../theme/tokens';
import { giftArt, rewardArt } from '../art';
import { AppScreen } from '../chrome';
import { space, t } from '../theme';
import { Button, ErrorText, Illo, Progress, QrFrame, Sheet, Sticker } from '../ui';

type Outcome = 'used' | 'cancelled' | 'expired';

/** How often the open code screen checks whether the till has used the code. */
const POLL_MS = 5000;

interface CancelResult {
  redemptionId: string;
  pointsRefunded: number;
  balance: number;
}

/** The active redemption code (Figma App · 06 Redemption code). */
export function RedeemScreen({ bundle }: { bundle: MemberBundle }) {
  const { t: tr, locale } = useI18n();
  const router = useRouter();
  const { api, config, clearRedemption, refresh, errorText } = useSession();
  const now = useNow(1000);
  const [kept, setShown] = useState<RedemptionRow | null>(bundle.activeRedemption);
  // Opened directly (a reload): the code arrives with the member's data.
  const shown = kept ?? bundle.activeRedemption;
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

  useEffect(() => {
    if (shown && !outcome && left === 0) finish('expired');
  });

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
  const name = isGift ? tr('rewards.welcome.title') : reward ? (locale === 'el' ? reward.name_el : reward.name_en) : '';
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

  if (outcome) {
    const message =
      outcome === 'used'
        ? tr('redeem.used')
        : outcome === 'cancelled'
          ? tr(isGift ? 'redeem.cancelledGift' : 'redeem.cancelled')
          : tr(isGift ? 'redeem.expiredGift' : 'redeem.expired');
    return (
      <AppScreen title={tr('redeem.code.title')} onBack={back} gap={space[16]}>
        <View style={styles.outcome} accessibilityLiveRegion="polite">
          <Illo name={outcome === 'used' ? 'confetti' : isGift ? giftArt() : rewardArt(reward ?? {})} size={120} />
          <Text accessibilityRole="header" style={[t.displayM, styles.center]}>
            {name}
          </Text>
          <Text style={[t.bodyL, styles.center]}>{message}</Text>
        </View>
        <Button label={tr('redeem.backToRewards')} onPress={() => router.replace('/rewards')} />
      </AppScreen>
    );
  }

  return (
    <AppScreen title={tr('redeem.code.title')} onBack={back} gap={space[16]} contentStyle={styles.centerItems}>
      {isGift ? <Sticker label={`${tr('rewards.welcome.badge')}!`} color="coral" rotate={-4} style={styles.centerSelf} /> : null}
      <Text accessibilityRole="header" style={[t.displayM, styles.center, styles.full]}>
        {name}
      </Text>
      <Text style={[t.bodyM, styles.center, styles.full]}>{tr('redeem.code.title')}</Text>

      <QrFrame tone="mint" code={groupCode(shown.code)} codeA11y={shown.code.split('').join(' ')} hint={tr('v2.redeem.manual')}>
        <View accessible accessibilityRole="image" accessibilityLabel={tr('redeem.code.qrA11y')}>
          <QRCode value={shown.code} size={160} color={qr.dark} backgroundColor={qr.light} ecl="M" quietZone={8} />
        </View>
      </QrFrame>

      <Progress
        title={tr('redeem.code.timer', { time: formatCountdown(left) })}
        subtitle={tr('v2.redeem.valid', { minutes: Math.round(total / 60) })}
        value={Math.ceil(left / 1000)}
        max={total}
        start="0:00"
        end={formatCountdown(total * 1000)}
        a11y={tr('redeem.code.timeA11y')}
      />

      <Button label={tr('redeem.code.cancel')} kind="secondary" onPress={() => setConfirming(true)} />
      <Text style={[t.bodyS, styles.center, styles.full]}>{isGift ? tr('redeem.code.noteGift') : tr('redeem.code.notePoints', { points })}</Text>

      <Sheet visible={confirming} onClose={() => !busy && setConfirming(false)} closeLabel={tr('redeem.cancel.no')}>
        <Text accessibilityRole="header" style={t.displayS}>
          {tr('redeem.cancel.title')}
        </Text>
        <Text style={t.bodyM}>{isGift ? tr('redeem.cancel.bodyGift') : tr('redeem.cancel.body', { points })}</Text>
        {error ? <ErrorText message={error} /> : null}
        <Button label={tr('redeem.cancel.yes')} onPress={cancel} loading={busy} />
        <Button label={tr('redeem.cancel.no')} kind="text" onPress={() => setConfirming(false)} disabled={busy} />
      </Sheet>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  full: { alignSelf: 'stretch' },
  centerItems: { alignItems: 'stretch' },
  centerSelf: { alignSelf: 'center' },
  outcome: { alignItems: 'center', gap: space[12], paddingVertical: space[32] },
});
