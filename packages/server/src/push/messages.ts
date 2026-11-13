import { pushMessageLimits } from '@grow-loyalty/core';
import { brandAccess } from '../internal/access.js';
import { audit } from '../internal/audit.js';
import { idempotent } from '../internal/idempotency.js';
import * as input from '../internal/input.js';
import { InputError } from '../internal/input.js';
import { type Db, type Result, fail } from '../result.js';

export interface SendPushMessageInput {
  /** HQ admin of the brand, or a platform admin. */
  callerUserId: string;
  brandId: string;
  titleEl: string;
  bodyEl: string;
  /** English text for members who chose English; both or neither. Without it they get the Greek. */
  titleEn?: string | null;
  bodyEn?: string | null;
  /** Only count who would get it; nothing is sent or stored. */
  dryRun?: boolean;
  /** Required unless dryRun. */
  idempotencyKey?: string;
  now?: Date;
}

export type SendPushMessageResult = Result<
  { recipients: number; campaignId: string | null },
  'invalid_input' | 'forbidden' | 'idempotency_conflict'
>;

function messageText(value: unknown, name: string, max: number): string {
  if (typeof value !== 'string' || value.trim() === '' || value.trim().length > max) {
    throw new InputError(`${name} must be 1–${max} characters`);
  }
  return value.trim();
}

function parse(raw: SendPushMessageInput) {
  const dryRun = raw.dryRun === true;
  const hasEn = [raw.titleEn, raw.bodyEn].some((v) => typeof v === 'string' && v.trim() !== '');
  return {
    callerUserId: input.uuid(raw.callerUserId, 'callerUserId'),
    brandId: input.uuid(raw.brandId, 'brandId'),
    titleEl: messageText(raw.titleEl, 'titleEl', pushMessageLimits.title),
    bodyEl: messageText(raw.bodyEl, 'bodyEl', pushMessageLimits.body),
    titleEn: hasEn ? messageText(raw.titleEn, 'titleEn', pushMessageLimits.title) : null,
    bodyEn: hasEn ? messageText(raw.bodyEn, 'bodyEn', pushMessageLimits.body) : null,
    dryRun,
    idempotencyKey: dryRun ? null : input.idempotencyKey(raw.idempotencyKey),
    now: input.now(raw.now),
  };
}

/**
 * messages/send (v0.9): HQ sends a notification (an offer, news) to every
 * member of the brand who said yes to offers by notification
 * (`consent_push`) and has a phone that can receive it. `dryRun` answers how
 * many that is. The job `jobs/push-send` delivers it within a minute or two;
 * a member who withdraws consent before then doesn't get it.
 */
export async function sendPushMessage(sql: Db, raw: SendPushMessageInput): Promise<SendPushMessageResult> {
  const parsed = input.parseInput(() => parse(raw));
  if ('failure' in parsed) return parsed.failure;
  const i = parsed.input;

  return sql.begin(async (tx): Promise<SendPushMessageResult> => {
    const access = await brandAccess(tx, i.callerUserId, i.brandId);
    if (!access.hq && !access.platform) return fail('forbidden');

    if (i.dryRun) {
      const [row] = await tx<{ n: number }[]>`
        select count(*)::int as n from public.members m
        where m.brand_id = ${i.brandId} and m.deleted_at is null and m.consent_push
          and exists (select 1 from public.push_devices d where d.member_id = m.id)
      `;
      return { ok: true, recipients: row?.n ?? 0, campaignId: null };
    }

    const request = { brandId: i.brandId, titleEl: i.titleEl, bodyEl: i.bodyEl, titleEn: i.titleEn, bodyEn: i.bodyEn };
    return idempotent(
      tx,
      { brandId: i.brandId, key: i.idempotencyKey!, operation: 'push_message', actorUserId: i.callerUserId, request, now: i.now },
      async (): Promise<SendPushMessageResult> => {
        const [campaign] = await tx<{ id: string }[]>`
          insert into public.push_campaigns (brand_id, title_el, body_el, title_en, body_en, created_by, created_at)
          values (${i.brandId}, ${i.titleEl}, ${i.bodyEl}, ${i.titleEn}, ${i.bodyEn}, ${i.callerUserId}, ${i.now})
          returning id
        `;
        if (!campaign) throw new Error('Campaign insert returned no row');
        const queued = await tx`
          insert into public.push_outbox (brand_id, member_id, kind, ref, payload, campaign_id, send_after, created_at)
          select m.brand_id, m.id, 'message', ${campaign.id}::text || ':' || m.id::text, '{}'::jsonb, ${campaign.id}, ${i.now}, ${i.now}
          from public.members m
          where m.brand_id = ${i.brandId} and m.deleted_at is null and m.consent_push
            and exists (select 1 from public.push_devices d where d.member_id = m.id)
          on conflict (brand_id, kind, ref) do nothing
          returning id
        `;
        await tx`update public.push_campaigns set recipients = ${queued.length} where id = ${campaign.id}`;
        await audit(tx, {
          brandId: i.brandId,
          actorUserId: i.callerUserId,
          action: 'message.send',
          entity: 'push_campaigns',
          entityId: campaign.id,
          details: { recipients: queued.length, title: i.titleEl },
          at: i.now,
        });
        return { ok: true, recipients: queued.length, campaignId: campaign.id };
      },
    );
  });
}
