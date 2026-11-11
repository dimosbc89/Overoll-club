import { brandAccess, storeAccess } from './internal/access.js';
import { audit } from './internal/audit.js';
import * as input from './internal/input.js';
import { InputError } from './internal/input.js';
import { type Db, type Result, fail } from './result.js';

/** Roles HQ hands out in the back office (platform admins are GROW's, set by hand). */
export const STAFF_ROLES = ['hq_admin', 'store_manager', 'store_device'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export interface StaffView {
  /** The staff_roles row. */
  id: string;
  userId: string;
  role: StaffRole;
  brandId: string;
  /** Null for HQ admins. */
  storeId: string | null;
  email: string | null;
}

/** Supabase Auth, given by the API layer: the auth user with this email, created when missing. */
export interface StaffDeps {
  ensureAuthUser(email: string): Promise<string>;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function email(value: unknown): string {
  const trimmed = input.optionalText(value, 'email', 320)?.toLowerCase();
  if (!trimmed || !emailPattern.test(trimmed)) throw new InputError('email must be an email address');
  return trimmed;
}

// ---------------------------------------------------------------------------
// staff/add
// ---------------------------------------------------------------------------

export interface AddStaffInput {
  /** HQ admin of the brand, or a platform admin. */
  callerUserId: string;
  role: StaffRole;
  /** Required for store_manager and store_device. */
  storeId?: string;
  /** Required for hq_admin. */
  brandId?: string;
  /** The account's email: it signs in with a one-time code sent there. */
  email: string;
  now?: Date;
}

export type AddStaffError = 'invalid_input' | 'forbidden' | 'store_not_found' | 'brand_not_found' | 'device_in_other_store';

export type AddStaffResult = Result<{ staff: StaffView; created: boolean }, AddStaffError>;

/**
 * Give an email a back-office role: a till device or a manager for one store,
 * or HQ for the brand. The Supabase Auth user is created when missing (no
 * email is sent; the person signs in with a one-time code when they are
 * ready). Adding the same role again returns the existing one. A till device
 * account serves one store only.
 */
export async function addStaff(sql: Db, raw: AddStaffInput, deps: StaffDeps): Promise<AddStaffResult> {
  const parsed = input.parseInput(() => {
    if (!STAFF_ROLES.includes(raw.role)) throw new InputError(`role must be one of ${STAFF_ROLES.join(', ')}`);
    const storeRole = raw.role !== 'hq_admin';
    return {
      callerUserId: input.uuid(raw.callerUserId, 'callerUserId'),
      role: raw.role,
      storeId: storeRole ? input.uuid(raw.storeId, 'storeId') : null,
      brandId: storeRole ? null : input.uuid(raw.brandId, 'brandId'),
      email: email(raw.email),
      now: input.now(raw.now),
    };
  });
  if ('failure' in parsed) return parsed.failure;
  const i = parsed.input;

  return sql.begin(async (tx): Promise<AddStaffResult> => {
    let brandId: string;
    if (i.storeId) {
      const access = await storeAccess(tx, i.callerUserId, i.storeId);
      if (!access) return fail('store_not_found');
      if (!access.hq && !access.platform) return fail('forbidden');
      brandId = access.brandId;
    } else {
      const [brand] = await tx<{ id: string }[]>`select id from public.brands where id = ${i.brandId}`;
      if (!brand) return fail('brand_not_found');
      const access = await brandAccess(tx, i.callerUserId, brand.id);
      if (!access.hq && !access.platform) return fail('forbidden');
      brandId = brand.id;
    }

    const userId = await deps.ensureAuthUser(i.email);
    if (i.role === 'store_device') {
      const [elsewhere] = await tx`
        select 1 from public.staff_roles
        where user_id = ${userId} and role = 'store_device' and store_id is distinct from ${i.storeId}
      `;
      if (elsewhere) return fail('device_in_other_store', 'This till account already serves another store');
    }

    const [inserted] = await tx<{ id: string }[]>`
      insert into public.staff_roles (user_id, brand_id, store_id, role, email, created_at)
      values (${userId}, ${brandId}, ${i.storeId}, ${i.role}, ${i.email}, ${i.now})
      on conflict (user_id, brand_id, store_id, role) do nothing
      returning id
    `;
    const [row] = inserted
      ? [inserted]
      : await tx<{ id: string }[]>`
          select id from public.staff_roles
          where user_id = ${userId} and brand_id = ${brandId} and store_id is not distinct from ${i.storeId} and role = ${i.role}
        `;
    if (!row) throw new Error('Staff role neither inserted nor found');
    // A role from before v0.5 gets its email label now.
    if (!inserted) await tx`update public.staff_roles set email = ${i.email} where id = ${row.id} and email is null`;
    if (inserted) {
      await audit(tx, {
        brandId,
        actorUserId: i.callerUserId,
        action: 'staff.add',
        entity: 'staff_roles',
        entityId: row.id,
        details: { role: i.role, storeId: i.storeId, email: i.email },
        at: i.now,
      });
    }
    return {
      ok: true,
      created: Boolean(inserted),
      staff: { id: row.id, userId, role: i.role, brandId, storeId: i.storeId, email: i.email },
    };
  });
}

// ---------------------------------------------------------------------------
// staff/remove
// ---------------------------------------------------------------------------

export interface RemoveStaffInput {
  callerUserId: string;
  /** The staff_roles row (StaffView.id). */
  staffId: string;
  now?: Date;
}

export type RemoveStaffError = 'invalid_input' | 'forbidden' | 'not_found' | 'last_hq_admin';

export type RemoveStaffResult = Result<{ removed: StaffView }, RemoveStaffError>;

/**
 * Take a back-office role away (a till that is replaced, a manager who
 * leaves). The Auth user stays: it may be a member too, and it can be given a
 * role again. A brand always keeps at least one HQ admin.
 */
export async function removeStaff(sql: Db, raw: RemoveStaffInput): Promise<RemoveStaffResult> {
  const parsed = input.parseInput(() => ({
    callerUserId: input.uuid(raw.callerUserId, 'callerUserId'),
    staffId: input.uuid(raw.staffId, 'staffId'),
    now: input.now(raw.now),
  }));
  if ('failure' in parsed) return parsed.failure;
  const i = parsed.input;

  return sql.begin(async (tx): Promise<RemoveStaffResult> => {
    const [row] = await tx<
      { id: string; user_id: string; role: string; brand_id: string | null; store_id: string | null; email: string | null }[]
    >`
      select id, user_id, role, brand_id, store_id, email from public.staff_roles where id = ${i.staffId} for update
    `;
    if (!row || !row.brand_id || row.role === 'platform_admin') return fail('not_found');
    const access = await brandAccess(tx, i.callerUserId, row.brand_id);
    if (!access.hq && !access.platform) return fail('forbidden');

    if (row.role === 'hq_admin') {
      // Serialise removals of the brand's HQ admins, then count the others.
      await tx`select pg_advisory_xact_lock(hashtextextended(${`hq_admins:${row.brand_id}`}, 0))`;
      const [others] = await tx<{ n: number }[]>`
        select count(*)::int as n from public.staff_roles
        where brand_id = ${row.brand_id} and role = 'hq_admin' and id <> ${row.id}
      `;
      if (!others?.n) return fail('last_hq_admin', 'A brand keeps at least one HQ admin');
    }

    await tx`delete from public.staff_roles where id = ${row.id}`;
    await audit(tx, {
      brandId: row.brand_id,
      actorUserId: i.callerUserId,
      action: 'staff.remove',
      entity: 'staff_roles',
      entityId: row.id,
      details: { role: row.role, storeId: row.store_id, email: row.email },
      at: i.now,
    });
    return {
      ok: true,
      removed: {
        id: row.id,
        userId: row.user_id,
        role: row.role as StaffRole,
        brandId: row.brand_id,
        storeId: row.store_id,
        email: row.email,
      },
    };
  });
}
