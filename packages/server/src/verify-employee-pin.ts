import { checkEmployeePin, storeAccess } from './internal/access.js';
import { loadBrand } from './internal/brand.js';
import * as input from './internal/input.js';
import { type Db, type Result, fail } from './result.js';

export interface VerifyEmployeePinInput {
  /** The store device (or store manager) at the till. */
  callerUserId: string;
  storeId: string;
  employeeId: string;
  pin: string;
  now?: Date;
}

export type VerifyEmployeePinError = 'invalid_input' | 'forbidden' | 'employee_not_found' | 'bad_pin' | 'pin_locked';

export interface VerifiedEmployee {
  employee: { id: string; displayName: string };
}

export type VerifyEmployeePinResult = Result<VerifiedEmployee, VerifyEmployeePinError>;

/**
 * The cashier starts a shift on the staff console (and again after the idle
 * lock, core `limits.staffPinIdleMinutes`): checks the PIN with the same
 * lockout as every other PIN-checking operation. Moves no points, so it takes
 * no idempotency key; a wrong PIN is still stored (it counts towards the lock).
 */
export async function verifyEmployeePin(sql: Db, raw: VerifyEmployeePinInput): Promise<VerifyEmployeePinResult> {
  const parsed = input.parseInput(() => ({
    callerUserId: input.uuid(raw.callerUserId, 'callerUserId'),
    storeId: input.uuid(raw.storeId, 'storeId'),
    employeeId: input.uuid(raw.employeeId, 'employeeId'),
    pin: input.text(raw.pin, 'pin', 72),
    now: input.now(raw.now),
  }));
  if ('failure' in parsed) return parsed.failure;
  const i = parsed.input;

  return sql.begin(async (tx): Promise<VerifyEmployeePinResult> => {
    const access = await storeAccess(tx, i.callerUserId, i.storeId);
    if (!access || !(access.device || access.manager)) return fail('forbidden');
    const brand = await loadBrand(tx, access.brandId);
    const employee = await checkEmployeePin(tx, {
      storeId: i.storeId,
      employeeId: i.employeeId,
      pin: i.pin,
      callerUserId: i.callerUserId,
      now: i.now,
      config: brand.config,
    });
    if (!employee.ok) return employee;
    return { ok: true, employee: { id: i.employeeId, displayName: employee.displayName } };
  });
}
