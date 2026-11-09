import { canUndo } from '@overoll/core';
import { brandAccess, checkEmployee, storeAccess } from './internal/access.js';
import { audit } from './internal/audit.js';
import { loadBrand } from './internal/brand.js';
import { idempotent, ledgerKey } from './internal/idempotency.js';
import * as input from './internal/input.js';
import { InputError } from './internal/input.js';
import { lockMember, memberBalance } from './internal/members.js';
import { type Db, type Result, fail } from './result.js';

export interface UndoEarnInput {
  /** A store device, the store manager, HQ admin or platform admin. */
  callerUserId: string;
  /** The `earn` ledger entry to reverse (entryId from awardPoints). */
  entryId: string;
  /**
   * The cashier, with PIN. Required when the caller is only a store device;
   * optional (but checked if given) for managers and HQ.
   */
  employee?: { employeeId: string; pin: string } | null;
  idempotencyKey: string;
  now?: Date;
}

export type UndoEarnError =
  | 'invalid_input'
  | 'idempotency_conflict'
  | 'forbidden'
  | 'not_found'
  | 'not_undoable'
  | 'already_undone'
  | 'undo_window_passed'
  | 'employee_required'
  | 'employee_not_found'
  | 'bad_pin';

export interface UndoneEarn {
  /** The new `reverse` ledger entry. */
  entryId: string;
  reversedEntryId: string;
  memberId: string;
  /** Negative: the points taken back. */
  points: number;
  balance: number;
}

export type UndoEarnResult = Result<UndoneEarn, UndoEarnError>;

/**
 * Reverse an earn. A store device can undo its store's earns within the undo
 * window (core `canUndo`); the store manager, HQ and platform admins can undo
 * at any time. The balance may go negative; the tier does not drop (that only
 * happens at the annual review).
 */
export async function undoEarn(sql: Db, raw: UndoEarnInput): Promise<UndoEarnResult> {
  const parsed = input.parseInput(() => {
    if (typeof raw.entryId !== 'string' || !/^[1-9][0-9]{0,18}$/.test(raw.entryId)) {
      throw new InputError('entryId must be a ledger entry id');
    }
    const employee = raw.employee
      ? { employeeId: input.uuid(raw.employee.employeeId, 'employee.employeeId'), pin: input.text(raw.employee.pin, 'employee.pin', 72) }
      : null;
    return {
      callerUserId: input.uuid(raw.callerUserId, 'callerUserId'),
      entryId: raw.entryId,
      employee,
      idempotencyKey: input.idempotencyKey(raw.idempotencyKey),
      now: input.now(raw.now),
    };
  });
  if ('failure' in parsed) return parsed.failure;
  const i = parsed.input;

  return sql.begin(async (tx): Promise<UndoEarnResult> => {
    const [entry] = await tx<
      { id: string; brand_id: string; member_id: string; store_id: string | null; kind: string; points: number; created_at: Date }[]
    >`
      select id, brand_id, member_id, store_id, kind, points, created_at
      from public.ledger_entries where id = ${i.entryId}
    `;
    if (!entry) return fail('not_found');

    const access = entry.store_id
      ? await storeAccess(tx, i.callerUserId, entry.store_id)
      : { ...(await brandAccess(tx, i.callerUserId, entry.brand_id)), device: false, manager: false };
    if (!access) return fail('not_found');
    const anyTime = access.manager || access.hq || access.platform;
    const role = access.platform ? 'platform_admin' : access.hq ? 'hq_admin' : access.manager ? 'store_manager' : 'store_device';
    if (!anyTime && !access.device) return fail('forbidden');
    if (entry.kind !== 'earn' || !entry.store_id) return fail('not_undoable', 'Only earn entries can be undone');
    const storeId = entry.store_id;

    if (!anyTime && !i.employee) return fail('employee_required', 'A store device needs the cashier PIN to undo');
    if (i.employee) {
      const employeeError = await checkEmployee(tx, storeId, i.employee.employeeId, i.employee.pin);
      if (employeeError) return fail(employeeError);
    }
    const brand = await loadBrand(tx, entry.brand_id);
    const employeeId = i.employee?.employeeId ?? null;

    return idempotent(
      tx,
      {
        brandId: brand.id,
        key: i.idempotencyKey,
        operation: 'undo_earn',
        actorUserId: i.callerUserId,
        request: { entryId: entry.id, employeeId },
        now: i.now,
      },
      async (): Promise<UndoEarnResult> => {
        await lockMember(tx, entry.member_id);
        const [reversal] = await tx`select 1 from public.ledger_entries where reverses_entry_id = ${entry.id}`;
        if (reversal) return fail('already_undone');
        if (!anyTime && !canUndo(entry.created_at, i.now, brand.config)) {
          return fail('undo_window_passed', 'Older transactions need the store manager');
        }
        const [reverse] = await tx<{ id: string }[]>`
          insert into public.ledger_entries (
            brand_id, member_id, store_id, employee_id, kind, points, reverses_entry_id,
            reason, idempotency_key, created_by, created_at
          ) values (
            ${brand.id}, ${entry.member_id}, ${storeId}, ${employeeId}, 'reverse', ${-entry.points}, ${entry.id},
            'undo', ${ledgerKey('undo', i.idempotencyKey)}, ${i.callerUserId}, ${i.now}
          )
          returning id
        `;
        if (!reverse) throw new Error('Ledger insert returned no row');
        const balance = await memberBalance(tx, entry.member_id);
        await audit(tx, {
          brandId: brand.id,
          actorUserId: i.callerUserId,
          employeeId,
          action: 'points.undo',
          entity: 'ledger_entries',
          entityId: reverse.id,
          details: { reversedEntryId: entry.id, memberId: entry.member_id, points: -entry.points, role },
          at: i.now,
        });
        return {
          ok: true,
          entryId: reverse.id,
          reversedEntryId: entry.id,
          memberId: entry.member_id,
          points: -entry.points,
          balance,
        };
      },
    );
  });
}
