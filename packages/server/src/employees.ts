import { staffPinProblem } from '@grow-loyalty/core';
import { type StoreAccess, storeAccess } from './internal/access.js';
import { audit } from './internal/audit.js';
import { loadBrand } from './internal/brand.js';
import { idempotent } from './internal/idempotency.js';
import * as input from './internal/input.js';
import { InputError } from './internal/input.js';
import { type Db, type Failure, type Result, type Tx, fail } from './result.js';

/** A cashier as the back office shows it (never the PIN or its hash). */
export interface EmployeeView {
  id: string;
  storeId: string;
  displayName: string;
  active: boolean;
}

/** Longest cashier name: what fits on the till's name buttons. */
export const EMPLOYEE_NAME_MAX = 40;

const name = (value: unknown, field: string): string => {
  const trimmed = input.optionalText(value, field, EMPLOYEE_NAME_MAX);
  if (!trimmed) throw new InputError(`${field} must not be blank`);
  return trimmed;
};

/** Who may manage the cashiers of a store: its manager, HQ of the brand, platform admins. */
async function manageStore(
  tx: Tx,
  callerUserId: string,
  storeId: string,
): Promise<{ ok: true; access: StoreAccess } | Failure<'store_not_found' | 'forbidden'>> {
  const access = await storeAccess(tx, callerUserId, storeId);
  if (!access) return fail('store_not_found');
  if (!access.manager && !access.hq && !access.platform) return fail('forbidden');
  return { ok: true, access };
}

// ---------------------------------------------------------------------------
// staff/employees/create
// ---------------------------------------------------------------------------

export interface CreateEmployeeInput {
  /** HQ admin of the brand, the store's manager, or a platform admin. */
  callerUserId: string;
  storeId: string;
  displayName: string;
  /** The cashier's PIN: core `staffPinProblem` decides what is allowed. */
  pin: string;
  idempotencyKey: string;
  now?: Date;
}

export type CreateEmployeeError =
  | 'invalid_input'
  | 'idempotency_conflict'
  | 'forbidden'
  | 'store_not_found'
  | 'pin_format'
  | 'pin_too_simple';

export type CreateEmployeeResult = Result<{ employee: EmployeeView }, CreateEmployeeError>;

/** Add a cashier to a store, with their PIN (stored as a bcrypt hash only). */
export async function createEmployee(sql: Db, raw: CreateEmployeeInput): Promise<CreateEmployeeResult> {
  const parsed = input.parseInput(() => ({
    callerUserId: input.uuid(raw.callerUserId, 'callerUserId'),
    storeId: input.uuid(raw.storeId, 'storeId'),
    displayName: name(raw.displayName, 'displayName'),
    pin: input.text(raw.pin, 'pin', 72),
    idempotencyKey: input.idempotencyKey(raw.idempotencyKey),
    now: input.now(raw.now),
  }));
  if ('failure' in parsed) return parsed.failure;
  const i = parsed.input;

  return sql.begin(async (tx): Promise<CreateEmployeeResult> => {
    const allowed = await manageStore(tx, i.callerUserId, i.storeId);
    if (!allowed.ok) return allowed;
    const brand = await loadBrand(tx, allowed.access.brandId);
    const problem = staffPinProblem(i.pin, brand.config);
    if (problem) return fail(problem);

    return idempotent(
      tx,
      {
        brandId: brand.id,
        key: i.idempotencyKey,
        operation: 'create_employee',
        actorUserId: i.callerUserId,
        // No PIN in the fingerprint: it is never stored in clear.
        request: { storeId: i.storeId, displayName: i.displayName },
        now: i.now,
      },
      async (): Promise<CreateEmployeeResult> => {
        const [row] = await tx<{ id: string }[]>`
          insert into public.employees (brand_id, store_id, display_name, pin_hash, created_at)
          values (${brand.id}, ${i.storeId}, ${i.displayName}, extensions.crypt(${i.pin}, extensions.gen_salt('bf')), ${i.now})
          returning id
        `;
        if (!row) throw new Error('Employee insert returned no row');
        await audit(tx, {
          brandId: brand.id,
          actorUserId: i.callerUserId,
          action: 'employee.create',
          entity: 'employees',
          entityId: row.id,
          details: { storeId: i.storeId, displayName: i.displayName },
          at: i.now,
        });
        return { ok: true, employee: { id: row.id, storeId: i.storeId, displayName: i.displayName, active: true } };
      },
    );
  });
}

// ---------------------------------------------------------------------------
// staff/employees/update
// ---------------------------------------------------------------------------

export interface UpdateEmployeeInput {
  callerUserId: string;
  employeeId: string;
  /** New name, if it changes. */
  displayName?: string;
  /** false: the cashier leaves (no longer listed at the till); true: back again. */
  active?: boolean;
  /** New PIN, if it changes. Also clears the cashier's wrong-PIN count and any lock. */
  pin?: string;
  now?: Date;
}

export type UpdateEmployeeError = 'invalid_input' | 'forbidden' | 'not_found' | 'store_not_found' | 'pin_format' | 'pin_too_simple';

export type UpdateEmployeeResult = Result<{ employee: EmployeeView }, UpdateEmployeeError>;

/**
 * Rename a cashier, give them a new PIN, or switch them off and on. Setting
 * the same values again is harmless, so no idempotency key is needed.
 * Employees are never deleted: ledger entries and codes keep pointing to them.
 */
export async function updateEmployee(sql: Db, raw: UpdateEmployeeInput): Promise<UpdateEmployeeResult> {
  const parsed = input.parseInput(() => {
    const displayName = raw.displayName === undefined ? undefined : name(raw.displayName, 'displayName');
    if (raw.active !== undefined && typeof raw.active !== 'boolean') throw new InputError('active must be true or false');
    const pin = raw.pin === undefined ? undefined : input.text(raw.pin, 'pin', 72);
    if (displayName === undefined && raw.active === undefined && pin === undefined) {
      throw new InputError('Nothing to change: give displayName, active or pin');
    }
    return {
      callerUserId: input.uuid(raw.callerUserId, 'callerUserId'),
      employeeId: input.uuid(raw.employeeId, 'employeeId'),
      displayName,
      active: raw.active,
      pin,
      now: input.now(raw.now),
    };
  });
  if ('failure' in parsed) return parsed.failure;
  const i = parsed.input;

  return sql.begin(async (tx): Promise<UpdateEmployeeResult> => {
    const [employee] = await tx<{ id: string; brand_id: string; store_id: string; display_name: string; active: boolean }[]>`
      select id, brand_id, store_id, display_name, active from public.employees where id = ${i.employeeId} for update
    `;
    if (!employee) return fail('not_found');
    const allowed = await manageStore(tx, i.callerUserId, employee.store_id);
    if (!allowed.ok) return allowed.code === 'store_not_found' ? fail('not_found') : allowed;

    if (i.pin !== undefined) {
      const problem = staffPinProblem(i.pin, (await loadBrand(tx, employee.brand_id)).config);
      if (problem) return fail(problem);
    }

    const displayName = i.displayName ?? employee.display_name;
    const active = i.active ?? employee.active;
    await tx`
      update public.employees set
        display_name = ${displayName},
        active = ${active},
        pin_hash = case when ${i.pin ?? null}::text is null then pin_hash
                        else extensions.crypt(${i.pin ?? null}::text, extensions.gen_salt('bf')) end
      where id = ${employee.id}
    `;
    // A new PIN starts a clean slate (the lock was on the old one).
    if (i.pin !== undefined) await tx`delete from private.employee_pin_failures where employee_id = ${employee.id}`;

    await audit(tx, {
      brandId: employee.brand_id,
      actorUserId: i.callerUserId,
      action: 'employee.update',
      entity: 'employees',
      entityId: employee.id,
      details: {
        storeId: employee.store_id,
        renamed: displayName !== employee.display_name,
        active,
        newPin: i.pin !== undefined,
      },
      at: i.now,
    });
    return { ok: true, employee: { id: employee.id, storeId: employee.store_id, displayName, active } };
  });
}
