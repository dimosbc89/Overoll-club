import { type ProgramConfig, lockAfterWrongPin, pinLockedUntil, wrongPinLookbackStart } from '@grow-loyalty/core';
import { type Failure, type Tx, fail } from '../result.js';
import { audit } from './audit.js';

/** What the calling user may do in one store (HQ and platform admins included). */
export interface StoreAccess {
  storeId: string;
  brandId: string;
  storeActive: boolean;
  device: boolean;
  manager: boolean;
  hq: boolean;
  platform: boolean;
}

/** The caller's roles for a store; null when the store doesn't exist. */
export async function storeAccess(tx: Tx, userId: string, storeId: string): Promise<StoreAccess | null> {
  const [row] = await tx<
    { store_id: string; brand_id: string; active: boolean; device: boolean; manager: boolean; hq: boolean; platform: boolean }[]
  >`
    select s.id as store_id, s.brand_id, s.active,
      coalesce(bool_or(r.role = 'store_device' and r.store_id = s.id), false) as device,
      coalesce(bool_or(r.role = 'store_manager' and r.store_id = s.id), false) as manager,
      coalesce(bool_or(r.role = 'hq_admin' and r.brand_id = s.brand_id), false) as hq,
      coalesce(bool_or(r.role = 'platform_admin'), false) as platform
    from public.stores s
    left join public.staff_roles r on r.user_id = ${userId}
    where s.id = ${storeId}
    group by s.id, s.brand_id, s.active
  `;
  if (!row) return null;
  return {
    storeId: row.store_id,
    brandId: row.brand_id,
    storeActive: row.active,
    device: row.device,
    manager: row.manager,
    hq: row.hq,
    platform: row.platform,
  };
}

/** The caller's brand-wide roles (HQ admin of the brand, platform admin). */
export async function brandAccess(tx: Tx, userId: string, brandId: string): Promise<{ hq: boolean; platform: boolean }> {
  const [row] = await tx<{ hq: boolean; platform: boolean }[]>`
    select
      coalesce(bool_or(role = 'hq_admin' and brand_id = ${brandId}), false) as hq,
      coalesce(bool_or(role = 'platform_admin'), false) as platform
    from public.staff_roles
    where user_id = ${userId}
  `;
  return { hq: row?.hq ?? false, platform: row?.platform ?? false };
}

export interface PinCheck {
  storeId: string;
  employeeId: string;
  pin: string;
  /** The store device or manager sending the PIN (stored with a wrong PIN). */
  callerUserId: string;
  now: Date;
  config: ProgramConfig;
}

export type PinCheckFailure = 'employee_not_found' | 'bad_pin' | 'pin_locked';

/**
 * The cashier typing their PIN on a store device: an active employee of this
 * store, not locked out, with a matching PIN (bcrypt hash, checked by
 * pgcrypto). Every operation that takes a PIN goes through here.
 *
 * Wrong PINs are stored in `private.employee_pin_failures`; the one that
 * reaches `limits.pinMaxAttempts` within `limits.pinLockMinutes` locks the
 * employee (core `lockAfterWrongPin`) and already answers `pin_locked`. While
 * locked, PINs are not checked. The right PIN forgets the wrong ones.
 *
 * Takes a per-employee lock for the rest of the transaction, so attempts sent
 * at the same moment are counted one after the other. A wrong PIN is a write:
 * callers must return this failure (the transaction commits), not throw.
 */
export async function checkEmployeePin(
  tx: Tx,
  c: PinCheck,
): Promise<{ ok: true; displayName: string } | Failure<PinCheckFailure>> {
  const [employee] = await tx<{ brand_id: string; display_name: string; pin_ok: boolean; has_failures: boolean }[]>`
    select e.brand_id, e.display_name, (e.pin_hash = extensions.crypt(${c.pin}, e.pin_hash)) as pin_ok,
      exists (select 1 from private.employee_pin_failures f where f.employee_id = e.id) as has_failures
    from public.employees e
    where e.id = ${c.employeeId} and e.store_id = ${c.storeId} and e.active
  `;
  if (!employee) return fail('employee_not_found');

  await tx`select pg_advisory_xact_lock(hashtextextended(${`pin:${c.employeeId}`}, 0))`;
  const rows = await tx<{ failed_at: Date; locked_until: Date | null }[]>`
    select failed_at, locked_until
    from private.employee_pin_failures
    where employee_id = ${c.employeeId}
      and failed_at > ${wrongPinLookbackStart(c.now, c.config)}
      and failed_at <= ${c.now}
  `;
  const wrongPins = rows.map((r) => ({ at: r.failed_at, lockedUntil: r.locked_until }));
  const lockedUntil = pinLockedUntil(wrongPins, c.now);
  if (lockedUntil) return fail('pin_locked', `PIN locked until ${lockedUntil.toISOString()}`);

  if (employee.pin_ok) {
    if (employee.has_failures || rows.length) {
      await tx`delete from private.employee_pin_failures where employee_id = ${c.employeeId}`;
    }
    return { ok: true, displayName: employee.display_name };
  }

  const locks = lockAfterWrongPin(wrongPins, c.now, c.config);
  await tx`
    insert into private.employee_pin_failures (brand_id, employee_id, caller_user_id, failed_at, locked_until)
    values (${employee.brand_id}, ${c.employeeId}, ${c.callerUserId}, ${c.now}, ${locks})
  `;
  if (!locks) return fail('bad_pin');
  await audit(tx, {
    brandId: employee.brand_id,
    actorUserId: c.callerUserId,
    employeeId: c.employeeId,
    action: 'employee.pin_lock',
    entity: 'employees',
    entityId: c.employeeId,
    details: { storeId: c.storeId, lockedUntil: locks.toISOString(), wrongPins: c.config.limits.pinMaxAttempts },
    at: c.now,
  });
  return fail('pin_locked', `PIN locked until ${locks.toISOString()}`);
}
