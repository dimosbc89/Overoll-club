import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text } from 'react-native';

import { useI18n } from '../i18n/I18nProvider';
import { ActionSlot, type ApiResult } from '../lib/api';
import type { GiftRow, RedemptionRow, RewardRow } from '../lib/data';
import { formatPoints } from '../lib/format';
import { useSession } from '../lib/session';
import { tierName } from '../lib/tiers';
import { type } from '../theme/fonts';
import { Body, Button, ErrorText, Sheet } from './ui';

export type RedeemTarget = { kind: 'reward'; reward: RewardRow; cost: number } | { kind: 'gift'; gift: GiftRow };

interface CreatedRedemption {
  redemptionId: string;
  code: string;
  rewardId: string;
  pointsSpent: number;
  expiresAt: string;
  balance: number;
  giftId?: string | null;
}

/**
 * "Shall we make your code?" → POST redemptions/create (rewardId or giftId)
 * → the code screen. A retry after a network error reuses the idempotency
 * key, so the member is never charged twice.
 */
export function RedeemSheet({ target, memberId, onClose }: { target: RedeemTarget | null; memberId: string; onClose: () => void }) {
  const { t, locale } = useI18n();
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
      const tier = target.kind === 'reward' && target.reward.min_tier ? tierName(t, target.reward.min_tier) : undefined;
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
  return (
    <Sheet visible={!!target} onClose={close} closeLabel={t('redeem.confirm.no')}>
      <Text accessibilityRole="header" style={type.heading}>
        {t('redeem.confirm.title')}
      </Text>
      <Body>
        {target?.kind === 'gift'
          ? t('redeem.confirm.bodyGift', { minutes })
          : t('redeem.confirm.body', { minutes, points: formatPoints(target?.cost ?? 0, locale) })}
      </Body>
      {error ? <ErrorText message={error} /> : null}
      <Button label={t('redeem.confirm.yes')} onPress={confirm} loading={busy} />
      <Button label={t('redeem.confirm.no')} variant="outline" onPress={close} disabled={busy} />
    </Sheet>
  );
}
