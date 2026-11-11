import { brandAccess } from './internal/access.js';
import { audit } from './internal/audit.js';
import { idempotent, ledgerKey } from './internal/idempotency.js';
import * as input from './internal/input.js';
import { InputError } from './internal/input.js';
import { lockMember, memberBalance } from './internal/members.js';
import { type Db, type Result, fail } from './result.js';

/** Sanity bound on one correction (input check, not a programme rule): far above any real fix. */
export const MAX_ADJUST_POINTS = 100_000;

export interface AdjustPointsInput {
  /** HQ admin of the member's brand, or a platform admin. */
  callerUserId: string;
  memberId: string;
  /** Points to add (positive) or take back (negative); never 0. */
  points: number;
  /** Why: kept on the ledger entry and shown in the member's history to HQ. */
  reason: string;
  idempotencyKey: string;
  now?: Date;
}

export type AdjustPointsError = 'invalid_input' | 'idempotency_conflict' | 'forbidden' | 'member_not_found' | 'member_deleted';

export interface AdjustedPoints {
  entryId: string;
  memberId: string;
  points: number;
  balance: number;
}

export type AdjustPointsResult = Result<AdjustedPoints, AdjustPointsError>;

/**
 * HQ corrects a member's points (a purchase that was never scanned, a
 * goodwill gesture, a mistake): an `adjust` ledger entry with the reason. The
 * balance may go below zero. Adjustments never count towards tiers (core
 * `pointsEarnedInWindow`).
 */
export async function adjustPoints(sql: Db, raw: AdjustPointsInput): Promise<AdjustPointsResult> {
  const parsed = input.parseInput(() => {
    if (!Number.isInteger(raw.points) || raw.points === 0 || Math.abs(raw.points) > MAX_ADJUST_POINTS) {
      throw new InputError(`points must be a whole number from -${MAX_ADJUST_POINTS} to ${MAX_ADJUST_POINTS}, not 0`);
    }
    const reason = input.optionalText(raw.reason, 'reason', 200);
    if (!reason) throw new InputError('reason is required');
    return {
      callerUserId: input.uuid(raw.callerUserId, 'callerUserId'),
      memberId: input.uuid(raw.memberId, 'memberId'),
      points: raw.points,
      reason,
      idempotencyKey: input.idempotencyKey(raw.idempotencyKey),
      now: input.now(raw.now),
    };
  });
  if ('failure' in parsed) return parsed.failure;
  const i = parsed.input;

  return sql.begin(async (tx): Promise<AdjustPointsResult> => {
    const [found] = await tx<{ brand_id: string }[]>`select brand_id from public.members where id = ${i.memberId}`;
    if (!found) return fail('member_not_found');
    const access = await brandAccess(tx, i.callerUserId, found.brand_id);
    // Callers outside the brand learn nothing about its members.
    if (!access.hq && !access.platform) return fail('member_not_found');

    return idempotent(
      tx,
      {
        brandId: found.brand_id,
        key: i.idempotencyKey,
        operation: 'adjust_points',
        actorUserId: i.callerUserId,
        request: { memberId: i.memberId, points: i.points, reason: i.reason },
        now: i.now,
      },
      async (): Promise<AdjustPointsResult> => {
        const member = await lockMember(tx, i.memberId);
        if (!member) return fail('member_not_found');
        if (member.deleted_at) return fail('member_deleted');
        const [entry] = await tx<{ id: string }[]>`
          insert into public.ledger_entries (brand_id, member_id, kind, points, reason, idempotency_key, created_by, created_at)
          values (${member.brand_id}, ${member.id}, 'adjust', ${i.points}, ${i.reason},
            ${ledgerKey('adjust', i.idempotencyKey)}, ${i.callerUserId}, ${i.now})
          returning id
        `;
        if (!entry) throw new Error('Ledger insert returned no row');
        const balance = await memberBalance(tx, member.id);
        await audit(tx, {
          brandId: member.brand_id,
          actorUserId: i.callerUserId,
          action: 'points.adjust',
          entity: 'ledger_entries',
          entityId: entry.id,
          details: { memberId: member.id, points: i.points, reason: i.reason },
          at: i.now,
        });
        return { ok: true, entryId: entry.id, memberId: member.id, points: i.points, balance };
      },
    );
  });
}
