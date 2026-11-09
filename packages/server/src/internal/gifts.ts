import { type GiftStatus, giftStatusAfterCodeReturned } from '@overoll/core';
import type { Tx } from '../result.js';
import { audit } from './audit.js';

export interface LockedGift {
  id: string;
  brand_id: string;
  member_id: string;
  reward_id: string;
  status: GiftStatus;
  expires_at: Date;
  redemption_id: string | null;
}

/** Lock a gift row for the rest of the transaction (callers hold the member lock first). */
export async function lockGift(tx: Tx, giftId: string): Promise<LockedGift | null> {
  const [row] = await tx<LockedGift[]>`
    select id, brand_id, member_id, reward_id, status, expires_at, redemption_id
    from public.member_gifts
    where id = ${giftId}
    for update
  `;
  return row ?? null;
}

/** An available gift past its expiry: mark it expired (at read time, before the job does). */
export async function expireGift(tx: Tx, gift: LockedGift, now: Date): Promise<void> {
  await tx`update public.member_gifts set status = 'expired' where id = ${gift.id} and status = 'available'`;
  await audit(tx, {
    brandId: gift.brand_id,
    actorUserId: null,
    action: 'gift.expire',
    entity: 'member_gifts',
    entityId: gift.id,
    details: { memberId: gift.member_id, expiresAt: gift.expires_at.toISOString() },
    at: now,
  });
}

/**
 * The gift's code was cancelled or expired unused: the gift is available
 * again, or expired if its own expiry has passed. Returns the new status.
 */
export async function returnGift(tx: Tx, giftId: string, redemptionId: string, now: Date): Promise<GiftStatus> {
  const gift = await lockGift(tx, giftId);
  if (!gift) throw new Error(`Gift ${giftId} not found`);
  if (gift.redemption_id !== redemptionId) throw new Error(`Gift ${giftId} is not held by redemption ${redemptionId}`);
  const status = giftStatusAfterCodeReturned(gift.expires_at, now);
  await tx`update public.member_gifts set status = ${status}, redemption_id = null where id = ${gift.id}`;
  if (status === 'expired') {
    await audit(tx, {
      brandId: gift.brand_id,
      actorUserId: null,
      action: 'gift.expire',
      entity: 'member_gifts',
      entityId: gift.id,
      details: { memberId: gift.member_id, expiresAt: gift.expires_at.toISOString() },
      at: now,
    });
  }
  return status;
}
