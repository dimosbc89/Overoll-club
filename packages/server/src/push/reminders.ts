import { expiryReminderDue, pointsExpireAt } from '@grow-loyalty/core';
import { loadBrand } from '../internal/brand.js';
import * as input from '../internal/input.js';
import { enqueuePush } from '../internal/push.js';
import type { Db } from '../result.js';

export interface PushRemindersResult {
  ok: true;
  /** Reminders put in the outbox by this run. */
  queued: number;
}

const NIL_UUID = '00000000-0000-0000-0000-000000000000';

/**
 * Job (once a day, mid-morning): "your points expire in 30 / 7 days" (core
 * `expiryReminderDue`, program spec §6) for members with points and a device
 * that can receive it. One reminder per member, expiry date and day count:
 * running it twice queues nothing more. The sender checks again before it
 * sends (a purchase since moves the date, and the reminder is dropped).
 */
export async function pushReminders(sql: Db, options: { now?: Date; batchSize?: number } = {}): Promise<PushRemindersResult> {
  const now = input.now(options.now);
  const batchSize = options.batchSize ?? 500;
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new TypeError('batchSize must be a positive integer');
  let queued = 0;
  const brands = await sql<{ id: string }[]>`select id from public.brands order by id`;
  for (const { id: brandId } of brands) {
    const brand = await sql.begin((tx) => loadBrand(tx, brandId));
    let after = NIL_UUID;
    for (;;) {
      const members = await sql<{ id: string; last_purchase_at: Date | null; created_at: Date }[]>`
        select m.id, m.last_purchase_at, m.created_at
        from public.members m
        where m.brand_id = ${brand.id}
          and m.deleted_at is null
          and m.id > ${after}
          and exists (select 1 from public.push_devices d where d.member_id = m.id)
          and (select coalesce(sum(l.points), 0) from public.ledger_entries l where l.member_id = m.id) > 0
        order by m.id
        limit ${batchSize}
      `;
      for (const m of members) {
        const lastPurchase = m.last_purchase_at ?? m.created_at;
        const days = expiryReminderDue(lastPurchase, now, brand.config);
        if (days === null) continue;
        const expiresAt = pointsExpireAt(lastPurchase, brand.config).toISOString();
        const added = await sql.begin((tx) =>
          enqueuePush(tx, {
            brandId: brand.id,
            memberId: m.id,
            kind: 'points_expiring',
            ref: `${m.id}:${expiresAt}:${days}`,
            payload: { days, expiresAt },
            now,
            sendAfter: now,
          }),
        );
        if (added) queued += 1;
      }
      const last = members.at(-1);
      if (!last || members.length < batchSize) break;
      after = last.id;
    }
  }
  return { ok: true, queued };
}
