import type { Tx } from '../result.js';

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

/**
 * The cashier typing their PIN on a store device: an active employee of this
 * store, with a matching PIN (bcrypt hash, checked by pgcrypto).
 */
export async function checkEmployee(
  tx: Tx,
  storeId: string,
  employeeId: string,
  pin: string,
): Promise<'employee_not_found' | 'bad_pin' | null> {
  const [row] = await tx<{ pin_ok: boolean }[]>`
    select (pin_hash = extensions.crypt(${pin}, pin_hash)) as pin_ok
    from public.employees
    where id = ${employeeId} and store_id = ${storeId} and active
  `;
  if (!row) return 'employee_not_found';
  return row.pin_ok ? null : 'bad_pin';
}
