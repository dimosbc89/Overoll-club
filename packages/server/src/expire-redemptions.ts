import { isRedemptionExpired } from '@overoll/core';
import { audit } from './internal/audit.js';
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
}

/**
 * Job (every minute or so, all brands): pending codes past their expiry are
 * marked expired and their points returned. Each code is handled in its own
 * transaction under the member lock; running it twice, or twice at once,
 * refunds each code once (the ledger also allows one refund per redemption).
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
        const [r] = await tx<{ brand_id: string; status: string; expires_at: Date; points_spent: number }[]>`
          select brand_id, status, expires_at, points_spent from public.redemptions
          where id = ${candidate.id} for update
        `;
        if (!r || r.status !== 'pending' || !isRedemptionExpired(r.expires_at, now)) return false;
        await tx`update public.redemptions set status = 'expired' where id = ${candidate.id}`;
        await tx`
          insert into public.ledger_entries (
            brand_id, member_id, kind, points, redemption_id, idempotency_key, created_at
          ) values (
            ${r.brand_id}, ${candidate.member_id}, 'refund_redeem', ${r.points_spent}, ${candidate.id},
            ${`expire_redemption:${candidate.id}`}, ${now}
          )
        `;
        await audit(tx, {
          brandId: r.brand_id,
          actorUserId: null,
          action: 'redemption.expire',
          entity: 'redemptions',
          entityId: candidate.id,
          details: { memberId: candidate.member_id, pointsRefunded: r.points_spent },
          at: now,
        });
        return true;
      });
      if (expired) redemptionIds.push(candidate.id);
    }
    if (due.length < batchSize) break;
  }
  return { ok: true, expired: redemptionIds.length, redemptionIds };
}
