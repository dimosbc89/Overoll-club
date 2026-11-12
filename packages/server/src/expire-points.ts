import { addMonthsUtc, arePointsExpired, pointsExpireAt } from '@grow-loyalty/core';
import { audit } from './internal/audit.js';
import { loadBrand } from './internal/brand.js';
import * as input from './internal/input.js';
import { lockMember, memberBalance } from './internal/members.js';
import type { Db } from './result.js';

export interface ExpirePointsInput {
  now?: Date;
  /** Members fetched per round (default 100). */
  batchSize?: number;
}

export interface ExpiredPoints {
  ok: true;
  /** How many members this run wrote an `expire` entry for. */
  expired: number;
  memberIds: string[];
  /** Points taken off in total (a positive number). */
  pointsExpired: number;
}

/** Month-end clamping (core addMonthsUtc) can make points expire up to 3 days earlier than "same date". */
const PREFILTER_MARGIN_MS = 4 * 86_400_000;
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

/**
 * Job (once a day, all brands): points expire `expiryMonths` after the
 * member's last purchase (core `pointsExpireAt`); a member who never bought
 * anything counts from joining. For every such member with a balance above 0,
 * one `expire` entry takes the whole balance off.
 *
 * - Idempotent per member and expiry date: the entry's key is
 *   `expire_points:<member id>:<expiry time>` (unique in the ledger). Running
 *   the job again, or twice at once, writes nothing more. Points added later
 *   without a purchase (an HQ adjustment) are not expired again until the
 *   next purchase has also lapsed.
 * - A member with a pending points code is skipped this time: that code is
 *   used, cancelled or refunded within minutes, and the next run expires the
 *   balance as it is then (so a refund can't bring expired points back).
 * - Each member in its own transaction, under the member lock.
 */
export async function expirePoints(sql: Db, options: ExpirePointsInput = {}): Promise<ExpiredPoints> {
  const now = input.now(options.now);
  const batchSize = options.batchSize ?? 100;
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new TypeError('batchSize must be a positive integer');

  const memberIds: string[] = [];
  let pointsExpired = 0;
  const brands = await sql<{ id: string }[]>`select id from public.brands order by id`;
  for (const { id: brandId } of brands) {
    const brand = await sql.begin((tx) => loadBrand(tx, brandId));
    const { config } = brand;
    // Generous prefilter in SQL; the exact rule is core arePointsExpired below.
    const cutoff = new Date(addMonthsUtc(now, -config.expiryMonths).getTime() + PREFILTER_MARGIN_MS);

    let after = NIL_UUID;
    for (;;) {
      const candidates = await sql<{ id: string }[]>`
        select m.id
        from public.members m
        where m.brand_id = ${brand.id}
          and coalesce(m.last_purchase_at, m.created_at) <= ${cutoff}
          and m.id > ${after}
          and (select coalesce(sum(l.points), 0) from public.ledger_entries l where l.member_id = m.id) > 0
        order by m.id
        limit ${batchSize}
      `;
      for (const candidate of candidates) {
        const points = await sql.begin(async (tx): Promise<number> => {
          const member = await lockMember(tx, candidate.id);
          if (!member) return 0;
          const [row] = await tx<{ last_purchase_at: Date | null; created_at: Date }[]>`
            select last_purchase_at, created_at from public.members where id = ${member.id}
          `;
          if (!row) return 0;
          const lastPurchase = row.last_purchase_at ?? row.created_at;
          if (!arePointsExpired(lastPurchase, now, config)) return 0;
          const [pending] = await tx`
            select 1 from public.redemptions
            where member_id = ${member.id} and status = 'pending' and gift_id is null
            limit 1
          `;
          if (pending) return 0;
          const balance = await memberBalance(tx, member.id);
          if (balance <= 0) return 0;

          const expiresAt = pointsExpireAt(lastPurchase, config);
          const [entry] = await tx<{ id: string }[]>`
            insert into public.ledger_entries (brand_id, member_id, kind, points, reason, idempotency_key, created_at)
            values (${brand.id}, ${member.id}, 'expire', ${-balance}, 'expiry',
              ${`expire_points:${member.id}:${expiresAt.toISOString()}`}, ${now})
            on conflict (brand_id, idempotency_key) do nothing
            returning id
          `;
          if (!entry) return 0; // already expired for this date
          await audit(tx, {
            brandId: brand.id,
            actorUserId: null,
            action: 'points.expire',
            entity: 'ledger_entries',
            entityId: entry.id,
            details: {
              memberId: member.id,
              points: -balance,
              lastPurchaseAt: lastPurchase.toISOString(),
              expiresAt: expiresAt.toISOString(),
            },
            at: now,
          });
          return balance;
        });
        if (points > 0) {
          memberIds.push(candidate.id);
          pointsExpired += points;
        }
      }
      const last = candidates.at(-1);
      if (!last || candidates.length < batchSize) break;
      after = last.id;
    }
  }
  return { ok: true, expired: memberIds.length, memberIds, pointsExpired };
}
