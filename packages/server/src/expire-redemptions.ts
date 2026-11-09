import { isRedemptionExpired } from '@overoll/core';
import { audit } from './internal/audit.js';
import { returnGift } from './internal/gifts.js';
import * as input from './internal/input.js';
import { lockMember } from './internal/members.js';
import type { Db } from './result.js';

export interface ExpireRedemptionsInput {
  now?: Date;
  /** Codes fetched per round (default 100). */
  batchSize?: number;
}

export interface ExpiredRedemptions {
  ok: true;
  /** How many codes this run expired and refunded. */
  expired: number;
  redemptionIds: string[];
  /** Available gifts past their expiry that this run marked expired. */
  giftsExpired: number;
  giftIds: string[];
}

/**
 * Job (every minute or so, all brands): pending codes past their expiry are
 * marked expired and their points returned (a gift code gives its gift back:
 * available, or expired if the gift itself is past its expiry). Each code is
 * handled in its own transaction under the member lock; running it twice, or
 * twice at once, refunds each code once (the ledger also allows one refund
 * per redemption).
 *
 * Then available gifts past their `expires_at` are marked expired. The
 * operations already treat them as expired at read time (core giftStatusAt);
 * this keeps `member_gifts.status` right for the apps that read it.
 */
export async function expireRedemptions(sql: Db, options: ExpireRedemptionsInput = {}): Promise<ExpiredRedemptions> {
  const now = input.now(options.now);
  const batchSize = options.batchSize ?? 100;
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new TypeError('batchSize must be a positive integer');

  const redemptionIds: string[] = [];
  const seen = new Set<string>();
  for (;;) {
    const due = await sql<{ id: string; member_id: string }[]>`
      select id, member_id from public.redemptions
      where status = 'pending' and expires_at <= ${now}
      order by expires_at, id
      limit ${batchSize}
    `;
    const fresh = due.filter((r) => !seen.has(r.id));
    if (fresh.length === 0) break;
    for (const candidate of fresh) {
      seen.add(candidate.id);
      const expired = await sql.begin(async (tx) => {
        await lockMember(tx, candidate.member_id);
        const [r] = await tx<{ brand_id: string; status: string; expires_at: Date; points_spent: number; gift_id: string | null }[]>`
          select brand_id, status, expires_at, points_spent, gift_id from public.redemptions
          where id = ${candidate.id} for update
        `;
        if (!r || r.status !== 'pending' || !isRedemptionExpired(r.expires_at, now)) return false;
        await tx`update public.redemptions set status = 'expired' where id = ${candidate.id}`;
        const giftStatus = r.gift_id ? await returnGift(tx, r.gift_id, candidate.id, now) : null;
        if (!r.gift_id) {
          await tx`
            insert into public.ledger_entries (
              brand_id, member_id, kind, points, redemption_id, idempotency_key, created_at
            ) values (
              ${r.brand_id}, ${candidate.member_id}, 'refund_redeem', ${r.points_spent}, ${candidate.id},
              ${`expire_redemption:${candidate.id}`}, ${now}
            )
          `;
        }
        await audit(tx, {
          brandId: r.brand_id,
          actorUserId: null,
          action: 'redemption.expire',
          entity: 'redemptions',
          entityId: candidate.id,
          details: { memberId: candidate.member_id, pointsRefunded: r.points_spent, giftId: r.gift_id, giftStatus },
          at: now,
        });
        return true;
      });
      if (expired) redemptionIds.push(candidate.id);
    }
    if (due.length < batchSize) break;
  }

  // Gifts: one statement per batch. Row locks make it safe next to
  // createRedemption (which locks the gift row and re-checks its status).
  const giftIds: string[] = [];
  for (;;) {
    const rows = await sql<{ id: string }[]>`
      with due as (
        select id from public.member_gifts
        where status = 'available' and expires_at <= ${now}
        order by expires_at, id
        limit ${batchSize}
        for update skip locked
      ), expired as (
        update public.member_gifts g set status = 'expired'
        from due where g.id = due.id and g.status = 'available'
        returning g.id, g.brand_id, g.member_id, g.expires_at
      ), audited as (
        insert into public.audit_log (brand_id, actor_user_id, action, entity, entity_id, details, created_at)
        select brand_id, null, 'gift.expire', 'member_gifts', id::text,
          jsonb_build_object('memberId', member_id, 'expiresAt', to_char(expires_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
          ${now}
        from expired
      )
      select id from expired
    `;
    giftIds.push(...rows.map((r) => r.id));
    if (rows.length < batchSize) break;
  }
  return { ok: true, expired: redemptionIds.length, redemptionIds, giftsExpired: giftIds.length, giftIds };
}
