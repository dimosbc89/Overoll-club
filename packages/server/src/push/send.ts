import { type ProgramConfig, type TierId, earnNotice, pointsExpireAt, tierRule } from '@grow-loyalty/core';
import { loadBrand } from '../internal/brand.js';
import * as input from '../internal/input.js';
import type { Db } from '../result.js';
import { type PushLocale, type PushParams, type PushTextKey, formatPoints, pushText } from './texts.js';

/** One message for the Expo push service (https://docs.expo.dev/push-notifications/sending-notifications/). */
export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  /** Read by the member app when the notification is tapped: which screen to open. */
  data: { kind: string; screen: 'card' | 'rewards' };
  sound: 'default';
  channelId: 'default';
  priority: 'high';
}

/** Expo's answer for one message, in the order sent. */
export type ExpoPushTicket =
  | { status: 'ok'; id: string }
  | { status: 'error'; message: string; details?: { error?: string } };

/** What the messages need from the brand's files (built like the Wallet designs). */
export interface PushBrand {
  /** The title of every service message, e.g. "Koala Club". */
  programName: string;
  /** The brand's own tier names ("Koala", "Eucalyptus"). */
  tiers: Record<TierId, Record<PushLocale, string>>;
}

export interface PushServices {
  /** Send up to 100 messages; one ticket per message, same order. Throws when Expo can't be reached. */
  sendExpo(messages: readonly ExpoPushMessage[]): Promise<ExpoPushTicket[]>;
  /** By brand slug. A brand missing here uses its database name and the tier ids. */
  brands?: Readonly<Record<string, PushBrand>>;
}

export interface SendPushesResult {
  ok: true;
  /** Outbox rows this run finished, by outcome. */
  sent: number;
  noDevice: number;
  skipped: number;
  failed: number;
  /** Messages handed to Expo (one per device). */
  messages: number;
  /** Devices Expo reported as gone (app removed, token replaced): deleted. */
  devicesRemoved: number;
}

/** A row is tried this many times (Expo unreachable) before it is given up. */
export const PUSH_MAX_ATTEMPTS = 5;
/** Finished rows are kept this long (support questions), then deleted. */
const KEEP_SENT_DAYS = 30;
const EXPO_BATCH = 100;

interface OutboxRow {
  id: string;
  brand_id: string;
  member_id: string;
  kind: 'earn' | 'code_expired' | 'points_expiring' | 'message';
  ref: string;
  payload: Record<string, unknown>;
  campaign_id: string | null;
  attempts: number;
}

interface BrandInfo {
  /** brands.name, e.g. "Koala Coffee". */
  name: string;
  programName: string;
  tierName(tier: TierId, locale: PushLocale): string;
  config: ProgramConfig;
}

type Rendered =
  | { outcome: 'skipped' | 'no_device' }
  | { title: string; body: string; screen: 'card' | 'rewards'; tokens: string[] };

/**
 * Job (every minute): sends what the outbox holds. Each row is claimed for
 * five minutes, rendered in the member's language (data/copy/push.*.json) and
 * sent to each of the member's devices through Expo. Without `services` (no
 * push set up) nothing is claimed and nothing changes.
 */
export async function sendPushes(
  sql: Db,
  services: PushServices | undefined,
  options: { now?: Date; batchSize?: number } = {},
): Promise<SendPushesResult> {
  const now = input.now(options.now);
  const batchSize = Math.min(Math.max(options.batchSize ?? 200, 1), 1000);
  const result: SendPushesResult = { ok: true, sent: 0, noDevice: 0, skipped: 0, failed: 0, messages: 0, devicesRemoved: 0 };
  if (!services) return result;

  await sql`delete from public.push_outbox where sent_at < ${new Date(now.getTime() - KEEP_SENT_DAYS * 86_400_000)}`;

  const rows = await sql<OutboxRow[]>`
    with due as (
      select id from public.push_outbox
      where sent_at is null and send_after <= ${now} and (claimed_until is null or claimed_until < ${now})
      order by send_after, id
      limit ${batchSize}
      for update skip locked
    )
    update public.push_outbox o
    set claimed_until = ${new Date(now.getTime() + 5 * 60_000)}, attempts = o.attempts + 1
    from due where o.id = due.id
    returning o.id::text as id, o.brand_id, o.member_id, o.kind, o.ref, o.payload, o.campaign_id, o.attempts
  `;
  if (rows.length === 0) return result;

  const brands = new Map<string, BrandInfo>();
  const brandInfo = async (brandId: string): Promise<BrandInfo> => {
    let info = brands.get(brandId);
    if (!info) {
      const brand = await sql.begin((tx) => loadBrand(tx, brandId));
      const [row] = await sql<{ name: string }[]>`select name from public.brands where id = ${brandId}`;
      const files = services.brands?.[brand.slug];
      const name = row?.name ?? brand.slug;
      info = {
        name,
        programName: files?.programName ?? name,
        tierName: (tier, locale) => files?.tiers[tier]?.[locale] ?? tier,
        config: brand.config,
      };
      brands.set(brandId, info);
    }
    return info;
  };

  const finish = async (ids: string[], outcome: 'sent' | 'no_device' | 'skipped' | 'failed') => {
    if (ids.length === 0) return;
    await sql`
      update public.push_outbox set sent_at = ${now}, outcome = ${outcome}, claimed_until = null
      where id in ${sql(ids.map(Number))}
    `;
  };

  // Render every row; collect the messages to send.
  const outgoing: { rowId: string; message: ExpoPushMessage }[] = [];
  const done: Record<'no_device' | 'skipped', string[]> = { no_device: [], skipped: [] };
  for (const row of rows) {
    let rendered: Rendered;
    try {
      rendered = await renderRow(sql, row, await brandInfo(row.brand_id), now);
    } catch (error) {
      console.error(`push ${row.id}: ${(error as Error).message}`);
      rendered = { outcome: 'skipped' };
    }
    if ('outcome' in rendered) {
      done[rendered.outcome].push(row.id);
      continue;
    }
    for (const to of rendered.tokens) {
      outgoing.push({
        rowId: row.id,
        message: {
          to,
          title: rendered.title,
          body: rendered.body,
          data: { kind: row.kind, screen: rendered.screen },
          sound: 'default',
          channelId: 'default',
          priority: 'high',
        },
      });
    }
  }
  await finish(done.no_device, 'no_device');
  await finish(done.skipped, 'skipped');
  result.noDevice = done.no_device.length;
  result.skipped = done.skipped.length;

  // Send in batches; a row counts as sent when at least one of its devices got it.
  const delivered = new Set<string>();
  const attempted = new Set<string>();
  const unreachable = new Set<string>();
  const gone: string[] = [];
  for (let start = 0; start < outgoing.length; start += EXPO_BATCH) {
    const batch = outgoing.slice(start, start + EXPO_BATCH);
    let tickets: ExpoPushTicket[];
    try {
      tickets = await services.sendExpo(batch.map((b) => b.message));
    } catch (error) {
      console.error(`push: Expo unreachable: ${(error as Error).message}`);
      for (const b of batch) unreachable.add(b.rowId);
      continue;
    }
    batch.forEach((b, index) => {
      attempted.add(b.rowId);
      const ticket = tickets[index];
      if (ticket?.status === 'ok') delivered.add(b.rowId);
      else if (ticket?.details?.error === 'DeviceNotRegistered') gone.push(b.message.to);
    });
    result.messages += batch.length;
  }

  if (gone.length) {
    const removed = await sql`delete from public.push_devices where token in ${sql(gone)} returning id`;
    result.devicesRemoved = removed.length;
  }

  const sentIds: string[] = [];
  const failedIds: string[] = [];
  const retryIds: string[] = [];
  for (const row of rows) {
    if (done.no_device.includes(row.id) || done.skipped.includes(row.id)) continue;
    if (delivered.has(row.id)) sentIds.push(row.id);
    else if (unreachable.has(row.id) && !attempted.has(row.id) && row.attempts < PUSH_MAX_ATTEMPTS) retryIds.push(row.id);
    else failedIds.push(row.id);
  }
  await finish(sentIds, 'sent');
  await finish(failedIds, 'failed');
  if (retryIds.length) {
    // Expo was unreachable: try again on a later run.
    await sql`update public.push_outbox set claimed_until = null where id in ${sql(retryIds.map(Number))}`;
  }
  result.sent = sentIds.length;
  result.failed = failedIds.length;
  return result;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const isTier = (v: unknown): v is TierId => v === 'classic' || v === 'gold' || v === 'club';

async function renderRow(sql: Db, row: OutboxRow, brand: BrandInfo, now: Date): Promise<Rendered> {
  const [member] = await sql<
    { locale: PushLocale; deleted_at: Date | null; consent_push: boolean; last_purchase_at: Date | null; created_at: Date }[]
  >`
    select locale, deleted_at, consent_push, last_purchase_at, created_at from public.members where id = ${row.member_id}
  `;
  if (!member || member.deleted_at) return { outcome: 'skipped' };
  const tokens = (
    await sql<{ token: string }[]>`select token from public.push_devices where member_id = ${row.member_id} order by created_at`
  ).map((d) => d.token);
  if (tokens.length === 0) return { outcome: 'no_device' };
  const locale: PushLocale = member.locale === 'en' ? 'en' : 'el';
  const p = row.payload;
  const rewardName = async (rewardId: string): Promise<string> => {
    const [r] = await sql<{ name_el: string; name_en: string }[]>`
      select name_el, name_en from public.rewards where id = ${rewardId}
    `;
    return r ? (locale === 'en' ? r.name_en : r.name_el) : '';
  };
  // Service messages: the program name as title, the line from data/copy/push.*.json as text.
  const say = (key: PushTextKey, params: PushParams, screen: 'card' | 'rewards'): Rendered => ({
    title: brand.programName,
    body: pushText(locale, key, params),
    screen,
    tokens,
  });
  const points = (n: number) => formatPoints(n, locale);

  switch (row.kind) {
    case 'earn': {
      const entryId = str(p.entryId);
      const [reversed] = await sql`select 1 from public.ledger_entries where reverses_entry_id = ${entryId} limit 1`;
      if (reversed) return { outcome: 'skipped' }; // the cashier undid it
      const [store] = await sql<{ name: string; name_en: string | null }[]>`
        select name, name_en from public.stores where id = ${str(p.storeId)}
      `;
      const storeName = store ? (locale === 'en' ? (store.name_en ?? store.name) : store.name) : brand.name;
      const catalog = (
        await sql<{ id: string; base_cost: number; min_tier: TierId | null; active: boolean }[]>`
          select id, base_cost, min_tier, active from public.rewards where brand_id = ${row.brand_id}
        `
      ).map((r) => ({ id: r.id, baseCost: r.base_cost, active: r.active, ...(r.min_tier ? { minTier: r.min_tier } : {}) }));
      const earned = num(p.points);
      const balance = num(p.balanceAfter);
      const notice = earnNotice(
        {
          points: earned,
          balanceAfter: balance,
          tierBefore: isTier(p.tierBefore) ? p.tierBefore : 'classic',
          tierAfter: isTier(p.tierAfter) ? p.tierAfter : 'classic',
          welcomeGiftUnlocked: p.welcomeGiftUnlocked === true,
          catalog,
        },
        brand.config,
      );
      if (notice.kind === 'welcome_gift') {
        const [gift] = await sql<{ reward_id: string }[]>`
          select reward_id from public.member_gifts where unlocked_by_entry_id = ${entryId} limit 1
        `;
        if (gift) return say('push.welcomeReady', { reward: await rewardName(gift.reward_id) }, 'rewards');
      } else if (notice.kind === 'tier_up' && notice.tier !== 'classic') {
        const rule = tierRule(brand.config, notice.tier);
        return say(
          notice.tier === 'club' ? 'push.tierUp.club' : 'push.tierUp.gold',
          {
            tier: brand.tierName(notice.tier, locale),
            morePct: rule.multiplierPct - 100,
            fewerPct: Math.round(rule.rewardDiscountBp / 100),
          },
          'card',
        );
      } else if (notice.kind === 'reward_ready') {
        return say('push.rewardUnlocked', { reward: await rewardName(notice.rewardId) }, 'rewards');
      }
      return say('push.pointsAdded', { points: points(earned), store: storeName, balance: points(balance) }, 'card');
    }
    case 'code_expired': {
      const giftStatus = str(p.giftStatus);
      if (giftStatus === 'available') return say('push.giftCodeExpired', { reward: await rewardName(str(p.rewardId)) }, 'rewards');
      if (giftStatus === 'expired') return say('push.giftCodeLapsed', { reward: await rewardName(str(p.rewardId)) }, 'rewards');
      return say('push.redemptionExpired', { points: points(num(p.points)) }, 'rewards');
    }
    case 'points_expiring': {
      const lastPurchase = member.last_purchase_at ?? member.created_at;
      const expiresAt = pointsExpireAt(lastPurchase, brand.config);
      if (expiresAt.toISOString() !== str(p.expiresAt)) return { outcome: 'skipped' }; // bought since: new date
      const [b] = await sql<{ balance: number }[]>`select balance from public.member_balances where member_id = ${row.member_id}`;
      const balance = b?.balance ?? 0;
      if (balance <= 0 || expiresAt.getTime() <= now.getTime()) return { outcome: 'skipped' };
      const days = num(p.days);
      // The last reminder (7 days with the default config) is the "last call" line.
      const last = days <= Math.min(...brand.config.expiryReminderDays);
      return say(
        last ? 'push.expiry7' : 'push.expiry30',
        { points: points(balance), days, months: brand.config.expiryMonths },
        'card',
      );
    }
    case 'message': {
      if (!member.consent_push) return { outcome: 'skipped' }; // said no to offers since
      const [c] = await sql<{ title_el: string; body_el: string; title_en: string | null; body_en: string | null }[]>`
        select title_el, body_el, title_en, body_en from public.push_campaigns where id = ${row.campaign_id}
      `;
      if (!c) return { outcome: 'skipped' };
      const english = locale === 'en' && c.title_en && c.body_en;
      return {
        title: english ? c.title_en! : c.title_el,
        body: english ? c.body_en! : c.body_el,
        screen: 'card',
        tokens,
      };
    }
    default:
      return { outcome: 'skipped' };
  }
}
