import {
  type EarnLimitError,
  type PurchaseError,
  type TierId,
  InvalidConfigError,
  checkEarnLimits,
  earnLimitsLookbackStart,
  localDay,
  normalizeReceiptNumber,
  parseToken,
  pointsEarnedForTier,
  pointsForPurchase,
  receiptLookbackStart,
  receiptNumberMaxLength,
  receiptUsedToday,
  tierAfterEarn,
  tierRule,
  tierWindowStart,
  validatePurchaseAmount,
  welcomeGiftExpiresAt,
} from '@overoll/core';
import { checkEmployeePin, storeAccess } from './internal/access.js';
import { audit } from './internal/audit.js';
import { loadBrand } from './internal/brand.js';
import { idempotent, ledgerKey } from './internal/idempotency.js';
import * as input from './internal/input.js';
import { InputError } from './internal/input.js';
import { lockMember, memberBalance, memberFromToken } from './internal/members.js';
import { type Db, type Result, fail } from './result.js';

export interface AwardPointsInput {
  /** The store device (or store manager) at the till. */
  callerUserId: string;
  storeId: string;
  /** The cashier, confirmed with their PIN. */
  employeeId: string;
  pin: string;
  /** The member from a prior resolveMemberToken, or the scanned token itself. */
  member: { memberId: string } | { token: string };
  /** Receipt total in integer cents. */
  amountCents: number;
  /**
   * Late points (forgotten card): the receipt number, letters, digits, "-" and
   * "/", 1–40 characters. One receipt earns points once per store per
   * calendar day. Blank or missing = an ordinary award.
   */
  receiptNumber?: string | null;
  idempotencyKey: string;
  now?: Date;
}

export type AwardPointsError =
  | 'invalid_input'
  | 'idempotency_conflict'
  | 'forbidden'
  | 'store_inactive'
  | 'employee_not_found'
  | 'bad_pin'
  | 'pin_locked'
  | PurchaseError
  | 'amount_too_small'
  | EarnLimitError
  | 'receipt_already_used'
  | 'member_not_found'
  | 'member_deleted'
  | 'invalid_token'
  | 'expired_token'
  | 'old_pass';

export interface AwardedPoints {
  /** The new `earn` ledger entry (int8 as string). */
  entryId: string;
  memberId: string;
  points: number;
  balance: number;
  tier: TierId;
  tierChanged: boolean;
  /** True when this was the member's first earn and it unlocked the welcome gift (`member_gifts`). */
  welcomeGiftUnlocked: boolean;
}

export type AwardPointsResult = Result<AwardedPoints, AwardPointsError>;

function parse(raw: AwardPointsInput) {
  const member = raw.member as { memberId?: unknown; token?: unknown } | null | undefined;
  let ref: { memberId: string } | { token: string };
  if (member && member.memberId !== undefined) ref = { memberId: input.uuid(member.memberId, 'member.memberId') };
  else if (member && member.token !== undefined) ref = { token: input.text(member.token, 'member.token', 200) };
  else throw new InputError('member must have a memberId or a token');
  if (typeof raw.amountCents !== 'number') throw new InputError('amountCents must be a number');
  let receiptNumber: string | null = null;
  const receipt = input.optionalText(raw.receiptNumber, 'receiptNumber', receiptNumberMaxLength);
  if (receipt !== null) {
    receiptNumber = normalizeReceiptNumber(receipt);
    if (!receiptNumber) throw new InputError('receiptNumber must be letters, digits, "-" or "/" (1–40 characters)');
  }
  return {
    callerUserId: input.uuid(raw.callerUserId, 'callerUserId'),
    storeId: input.uuid(raw.storeId, 'storeId'),
    employeeId: input.uuid(raw.employeeId, 'employeeId'),
    pin: input.text(raw.pin, 'pin', 72),
    member: ref,
    amountCents: raw.amountCents,
    receiptNumber,
    idempotencyKey: input.idempotencyKey(raw.idempotencyKey),
    now: input.now(raw.now),
  };
}

/**
 * Points for a purchase at the till. Checks, in order: caller is a device or
 * manager of the store, the store is open, the amount, the cashier's PIN
 * (with the lockout), the member, the receipt number if given (once per store
 * per calendar day), then the fraud limits (this member's earns network-wide;
 * earns that were undone don't count). Tier only goes up here.
 *
 * The member's first earn ever unlocks the welcome gift when the brand has
 * one (`welcome.rewardId`): one `member_gifts` row per member, kept even if
 * that earn is undone later.
 */
export async function awardPoints(sql: Db, raw: AwardPointsInput): Promise<AwardPointsResult> {
  const parsed = input.parseInput(() => parse(raw));
  if ('failure' in parsed) return parsed.failure;
  const i = parsed.input;

  return sql.begin(async (tx): Promise<AwardPointsResult> => {
    const access = await storeAccess(tx, i.callerUserId, i.storeId);
    if (!access || !(access.device || access.manager)) return fail('forbidden');
    if (!access.storeActive) return fail('store_inactive');
    const brand = await loadBrand(tx, access.brandId);
    const { config } = brand;

    const amountError = validatePurchaseAmount(i.amountCents, config);
    if (amountError) return fail(amountError);
    const employee = await checkEmployeePin(tx, {
      storeId: i.storeId,
      employeeId: i.employeeId,
      pin: i.pin,
      callerUserId: i.callerUserId,
      now: i.now,
      config,
    });
    if (!employee.ok) return employee;

    // The request as stored with the key: the member as given (a token is
    // reduced to its public member code, it rotates between retries).
    let memberRef: string;
    if ('memberId' in i.member) memberRef = `id:${i.member.memberId}`;
    else {
      const token = parseToken(i.member.token);
      if (!token) return fail('invalid_token');
      memberRef = `code:${token.memberCode}`;
    }
    // receiptNumber only when given, so ordinary awards keep the v0.1 fingerprint.
    const request = {
      storeId: i.storeId,
      employeeId: i.employeeId,
      amountCents: i.amountCents,
      member: memberRef,
      ...(i.receiptNumber ? { receiptNumber: i.receiptNumber } : {}),
    };

    return idempotent(
      tx,
      { brandId: brand.id, key: i.idempotencyKey, operation: 'award_points', actorUserId: i.callerUserId, request, now: i.now },
      async (): Promise<AwardPointsResult> => {
        let memberId: string;
        if ('memberId' in i.member) memberId = i.member.memberId;
        else {
          const found = await memberFromToken(tx, brand.id, i.member.token, i.now, config);
          if (!found.ok) return found;
          memberId = found.memberId;
        }
        const member = await lockMember(tx, memberId);
        if (!member || member.brand_id !== brand.id) return fail('member_not_found');
        if (member.deleted_at) return fail('member_deleted');

        // Late points: one receipt earns once per store per calendar day. The
        // advisory lock (after the member lock, always in this order) makes two
        // members claiming the same receipt at once wait for each other. An
        // undone earn frees the receipt.
        if (i.receiptNumber) {
          const day = localDay(i.now, brand.timeZone);
          await tx`select pg_advisory_xact_lock(hashtextextended(${`receipt:${i.storeId}:${day}:${i.receiptNumber}`}, 0))`;
          const used = await tx<{ created_at: Date }[]>`
            select e.created_at
            from public.ledger_entries e
            where e.store_id = ${i.storeId}
              and e.receipt_number = ${i.receiptNumber}
              and e.kind = 'earn'
              and e.created_at > ${receiptLookbackStart(i.now)}
              and not exists (select 1 from public.ledger_entries r where r.reverses_entry_id = e.id)
          `;
          if (receiptUsedToday(used.map((r) => r.created_at), i.now, brand.timeZone)) {
            return fail('receipt_already_used', 'This receipt already earned points at this store today');
          }
        }

        // Fraud limits: this member's earns in any store. An earn that was
        // undone doesn't count, so a cashier can fix a typo straight away.
        const recent = await tx<{ created_at: Date }[]>`
          select e.created_at
          from public.ledger_entries e
          where e.member_id = ${member.id}
            and e.kind = 'earn'
            and e.created_at > ${earnLimitsLookbackStart(i.now, config)}
            and not exists (select 1 from public.ledger_entries r where r.reverses_entry_id = e.id)
        `;
        const limitError = checkEarnLimits(recent.map((r) => r.created_at), i.now, config, brand.timeZone);
        if (limitError) return fail(limitError);

        const bonusMultiplierPct = 100; // campaigns (double points) come later
        const points = pointsForPurchase(i.amountCents, member.tier, config, bonusMultiplierPct);
        if (points <= 0) return fail('amount_too_small', 'This amount earns no points');

        // Any earlier earn, even one that was undone, means this is not the first.
        const [earlierEarn] = await tx`
          select 1 from public.ledger_entries where member_id = ${member.id} and kind = 'earn' limit 1
        `;

        const [entry] = await tx<{ id: string }[]>`
          insert into public.ledger_entries (
            brand_id, member_id, store_id, employee_id, kind, points, amount_cents,
            multiplier_pct, bonus_multiplier_pct, receipt_number, idempotency_key, created_by, created_at
          ) values (
            ${brand.id}, ${member.id}, ${i.storeId}, ${i.employeeId}, 'earn', ${points}, ${i.amountCents},
            ${tierRule(config, member.tier).multiplierPct}, ${bonusMultiplierPct}, ${i.receiptNumber},
            ${ledgerKey('award', i.idempotencyKey)}, ${i.callerUserId}, ${i.now}
          )
          returning id
        `;
        if (!entry) throw new Error('Ledger insert returned no row');

        let welcomeGiftUnlocked = false;
        const welcomeRewardId = config.welcome.rewardId;
        if (!earlierEarn && welcomeRewardId) {
          const [reward] = await tx<{ id: string }[]>`
            select id from public.rewards where id = ${welcomeRewardId} and brand_id = ${brand.id}
          `;
          // A setup bug, like any other invalid brands.config: throw, don't skip the gift silently.
          if (!reward) throw new InvalidConfigError([`welcome.rewardId: brand ${brand.slug} has no reward ${welcomeRewardId}`]);
          const [gift] = await tx<{ id: string }[]>`
            insert into public.member_gifts (
              brand_id, member_id, kind, reward_id, unlocked_at, expires_at, unlocked_by_entry_id
            ) values (
              ${brand.id}, ${member.id}, 'welcome', ${reward.id}, ${i.now}, ${welcomeGiftExpiresAt(i.now, config)}, ${entry.id}
            )
            on conflict (member_id, kind) do nothing
            returning id
          `;
          if (gift) {
            welcomeGiftUnlocked = true;
            await audit(tx, {
              brandId: brand.id,
              actorUserId: i.callerUserId,
              employeeId: i.employeeId,
              action: 'gift.unlock',
              entity: 'member_gifts',
              entityId: gift.id,
              details: { memberId: member.id, kind: 'welcome', rewardId: reward.id, entryId: entry.id },
              at: i.now,
            });
          }
        }

        const window = await tx<{ kind: string; points: number; created_at: Date }[]>`
          select kind, points, created_at from public.ledger_entries
          where member_id = ${member.id} and created_at > ${tierWindowStart(i.now, config)}
        `;
        const earned = pointsEarnedForTier(
          window.map((e) => ({ kind: e.kind, points: e.points, createdAt: e.created_at })),
          i.now,
          config,
        );
        const tier = tierAfterEarn(member.tier, earned, config);
        const tierChanged = tier !== member.tier;
        await tx`
          update public.members set
            last_purchase_at = greatest(coalesce(last_purchase_at, ${i.now}), ${i.now}),
            tier = ${tier}
          where id = ${member.id}
        `;
        const balance = await memberBalance(tx, member.id);
        await audit(tx, {
          brandId: brand.id,
          actorUserId: i.callerUserId,
          employeeId: i.employeeId,
          action: 'points.award',
          entity: 'ledger_entries',
          entityId: entry.id,
          details: {
            memberId: member.id,
            storeId: i.storeId,
            amountCents: i.amountCents,
            points,
            tier,
            tierChanged,
            receiptNumber: i.receiptNumber,
            welcomeGiftUnlocked,
          },
          at: i.now,
        });
        return { ok: true, entryId: entry.id, memberId: member.id, points, balance, tier, tierChanged, welcomeGiftUnlocked };
      },
    );
  });
}
