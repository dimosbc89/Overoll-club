import type postgres from 'postgres';
import type { Tx } from '../result.js';

export type PushKind = 'earn' | 'code_expired' | 'points_expiring' | 'message';

export interface PushEvent {
  brandId: string;
  memberId: string;
  kind: PushKind;
  /** What the event is about; one message per (brand, kind, ref). */
  ref: string;
  payload: Record<string, string | number | boolean | null>;
  /** When it happened (created_at). */
  now: Date;
  /** Not before this time (points added wait a minute for a possible undo). */
  sendAfter: Date;
  campaignId?: string | null;
}

/**
 * Put a push message in the outbox, inside the caller's transaction, but only
 * when the member has a device that can receive it (most members have none:
 * the web app, or no permission). The same event twice writes one row.
 */
export async function enqueuePush(tx: Tx, event: PushEvent): Promise<boolean> {
  const rows = await tx`
    insert into public.push_outbox (brand_id, member_id, kind, ref, payload, campaign_id, send_after, created_at)
    select ${event.brandId}, ${event.memberId}, ${event.kind}, ${event.ref},
      ${tx.json(event.payload as postgres.JSONValue)}, ${event.campaignId ?? null}, ${event.sendAfter}, ${event.now}
    where exists (select 1 from public.push_devices d where d.member_id = ${event.memberId})
    on conflict (brand_id, kind, ref) do nothing
    returning id
  `;
  return rows.length > 0;
}
