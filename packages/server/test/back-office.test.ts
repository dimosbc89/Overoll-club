import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type StaffDeps,
  addStaff,
  adjustPoints,
  awardPoints,
  createEmployee,
  removeStaff,
  updateEmployee,
  verifyEmployeePin,
} from '../src/index.js';
import { type TestDatabase, createTestDatabase } from './helpers/db.js';
import { at, balanceOf, ids, key, newMember, pins, seedWorld } from './helpers/world.js';

let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
  await seedWorld(db.admin);
});
afterAll(async () => {
  await db?.drop();
});

const NOW = new Date('2027-06-01T09:00:00Z');

/** Stand-in for Supabase Auth: one auth user per email, created on first use. */
function fakeAuth(): StaffDeps & { calls: string[] } {
  const users = new Map<string, string>();
  const calls: string[] = [];
  return {
    calls,
    async ensureAuthUser(email) {
      calls.push(email);
      const known = users.get(email);
      if (known) return known;
      const [row] = await db.admin<{ id: string }[]>`insert into auth.users (id) values (gen_random_uuid()) returning id`;
      users.set(email, row!.id);
      return row!.id;
    },
  };
}

describe('createEmployee / updateEmployee (staff/employees/*)', () => {
  it('HQ and the store manager add cashiers; their PIN works at the till', async () => {
    const byHq = await createEmployee(db.server, {
      callerUserId: ids.hq,
      storeId: ids.storeA,
      displayName: '  Sofia ',
      pin: '2580',
      idempotencyKey: key('emp'),
      now: NOW,
    });
    expect(byHq).toMatchObject({ ok: true, employee: { storeId: ids.storeA, displayName: 'Sofia', active: true } });
    if (!byHq.ok) return;
    expect(
      await verifyEmployeePin(db.server, { callerUserId: ids.deviceA, storeId: ids.storeA, employeeId: byHq.employee.id, pin: '2580', now: NOW }),
    ).toMatchObject({ ok: true, employee: { displayName: 'Sofia' } });

    const byManager = await createEmployee(db.server, {
      callerUserId: ids.managerA,
      storeId: ids.storeA,
      displayName: 'Petros',
      pin: '73915',
      idempotencyKey: key('emp'),
      now: NOW,
    });
    expect(byManager).toMatchObject({ ok: true });
    const [hash] = await db.admin<{ pin_hash: string }[]>`select pin_hash from public.employees where display_name = 'Petros'`;
    expect(hash!.pin_hash).toMatch(/^\$2[aby]\$/);
    expect(hash!.pin_hash).not.toContain('73915');
    const [log] = await db.admin<{ details: Record<string, unknown> }[]>`
      select details from public.audit_log where action = 'employee.create' and entity_id = ${byManager.ok ? byManager.employee.id : ''}
    `;
    expect(JSON.stringify(log!.details)).not.toContain('73915');
  });

  it('refuses the wrong people, unknown stores and weak PINs', async () => {
    const base = { storeId: ids.storeA, displayName: 'X', pin: '2580', idempotencyKey: 'unused', now: NOW };
    for (const callerUserId of [ids.deviceA, ids.deviceB, ids.nobody, ids.otherBrandDevice]) {
      expect(await createEmployee(db.server, { ...base, callerUserId, idempotencyKey: key() }), callerUserId).toMatchObject({
        ok: false,
        code: 'forbidden',
      });
    }
    // The manager of store A cannot hire for store B.
    expect(await createEmployee(db.server, { ...base, callerUserId: ids.managerA, storeId: ids.storeB, idempotencyKey: key() })).toMatchObject({
      code: 'forbidden',
    });
    expect(
      await createEmployee(db.server, { ...base, callerUserId: ids.hq, storeId: '20000000-0000-0000-0000-000000000999', idempotencyKey: key() }),
    ).toMatchObject({ code: 'store_not_found' });
    expect(await createEmployee(db.server, { ...base, callerUserId: ids.hq, pin: '1234', idempotencyKey: key() })).toMatchObject({
      code: 'pin_too_simple',
    });
    expect(await createEmployee(db.server, { ...base, callerUserId: ids.hq, pin: '25a0', idempotencyKey: key() })).toMatchObject({
      code: 'pin_format',
    });
    expect(await createEmployee(db.server, { ...base, callerUserId: ids.hq, displayName: '   ', idempotencyKey: key() })).toMatchObject({
      code: 'invalid_input',
    });
  });

  it('a retry with the same key adds the cashier once', async () => {
    const k = key('emp');
    const input = { callerUserId: ids.hq, storeId: ids.storeB, displayName: 'Dimitra', pin: '4826', idempotencyKey: k, now: NOW };
    const [first, second] = await Promise.all([createEmployee(db.server, input), createEmployee(db.server, input)]);
    expect(second).toEqual(first);
    const [row] = await db.admin<{ n: number }[]>`select count(*)::int as n from public.employees where display_name = 'Dimitra'`;
    expect(row!.n).toBe(1);
    expect(await createEmployee(db.server, { ...input, displayName: 'Other name' })).toMatchObject({ code: 'idempotency_conflict' });
  });

  it('renames, resets the PIN (which lifts a lock) and switches a cashier off', async () => {
    const created = await createEmployee(db.server, {
      callerUserId: ids.hq,
      storeId: ids.storeA,
      displayName: 'Lena',
      pin: '3141',
      idempotencyKey: key('emp'),
      now: NOW,
    });
    if (!created.ok) throw new Error(created.code);
    const id = created.employee.id;
    const verify = (pin: string, seconds: number) =>
      verifyEmployeePin(db.server, { callerUserId: ids.deviceA, storeId: ids.storeA, employeeId: id, pin, now: at('2027-06-01T10:00:00Z', seconds) });
    for (let n = 0; n < 5; n++) await verify('9999', n);
    expect(await verify('3141', 10)).toMatchObject({ code: 'pin_locked' });

    expect(await updateEmployee(db.server, { callerUserId: ids.managerA, employeeId: id, displayName: 'Lena K.', pin: '7392', now: NOW })).toEqual({
      ok: true,
      employee: { id, storeId: ids.storeA, displayName: 'Lena K.', active: true },
    });
    expect(await verify('7392', 20)).toMatchObject({ ok: true, employee: { displayName: 'Lena K.' } });
    expect(await verify('3141', 30)).toMatchObject({ code: 'bad_pin' });

    expect(await updateEmployee(db.server, { callerUserId: ids.hq, employeeId: id, active: false, now: NOW })).toMatchObject({
      ok: true,
      employee: { active: false },
    });
    expect(await verify('7392', 40)).toMatchObject({ code: 'employee_not_found' });
    expect(await updateEmployee(db.server, { callerUserId: ids.hq, employeeId: id, active: true, now: NOW })).toMatchObject({ ok: true });
    expect(await verify('7392', 50)).toMatchObject({ ok: true });
  });

  it('update checks the caller, the PIN and that something changes', async () => {
    expect(await updateEmployee(db.server, { callerUserId: ids.deviceA, employeeId: ids.maria, active: false })).toMatchObject({ code: 'forbidden' });
    expect(await updateEmployee(db.server, { callerUserId: ids.managerA, employeeId: ids.nikos, active: false })).toMatchObject({ code: 'forbidden' });
    expect(await updateEmployee(db.server, { callerUserId: ids.hq, employeeId: ids.otherEmployee, active: false })).toMatchObject({ code: 'forbidden' });
    expect(await updateEmployee(db.server, { callerUserId: ids.hq, employeeId: '30000000-0000-0000-0000-000000000999', active: false })).toMatchObject({
      code: 'not_found',
    });
    expect(await updateEmployee(db.server, { callerUserId: ids.hq, employeeId: ids.maria, pin: '0000' })).toMatchObject({ code: 'pin_too_simple' });
    expect(await updateEmployee(db.server, { callerUserId: ids.hq, employeeId: ids.maria })).toMatchObject({ code: 'invalid_input' });
    // Nothing changed for Maria.
    expect(
      await verifyEmployeePin(db.server, { callerUserId: ids.deviceA, storeId: ids.storeA, employeeId: ids.maria, pin: pins.maria, now: NOW }),
    ).toMatchObject({ ok: true });
  });
});

describe('addStaff / removeStaff (staff/add, staff/remove)', () => {
  it('HQ adds a till device by email; the role carries the email; adding again changes nothing', async () => {
    const auth = fakeAuth();
    const added = await addStaff(db.server, { callerUserId: ids.hq, role: 'store_device', storeId: ids.storeB, email: ' Till-B2@Example.com ', now: NOW }, auth);
    expect(added).toMatchObject({
      ok: true,
      created: true,
      staff: { role: 'store_device', brandId: ids.brand, storeId: ids.storeB, email: 'till-b2@example.com' },
    });
    if (!added.ok) return;
    expect(auth.calls).toEqual(['till-b2@example.com']);
    const again = await addStaff(db.server, { callerUserId: ids.hq, role: 'store_device', storeId: ids.storeB, email: 'till-b2@example.com', now: NOW }, auth);
    expect(again).toMatchObject({ ok: true, created: false, staff: { id: added.staff.id } });
    // The new device can work the till of store B.
    const member = await newMember(db.server, db.admin);
    const awarded = await awardPoints(db.server, {
      callerUserId: added.staff.userId,
      storeId: ids.storeB,
      employeeId: ids.nikos,
      pin: pins.nikos,
      member: { memberId: member.memberId },
      amountCents: 500,
      idempotencyKey: key('award'),
      now: NOW,
    });
    expect(awarded).toMatchObject({ ok: true });
  });

  it('a till account serves one store; HQ and managers are added the same way', async () => {
    const auth = fakeAuth();
    expect(await addStaff(db.server, { callerUserId: ids.hq, role: 'store_device', storeId: ids.storeA, email: 'till@example.com' }, auth)).toMatchObject({ ok: true });
    expect(await addStaff(db.server, { callerUserId: ids.hq, role: 'store_device', storeId: ids.storeB, email: 'till@example.com' }, auth)).toMatchObject({
      code: 'device_in_other_store',
    });
    expect(await addStaff(db.server, { callerUserId: ids.hq, role: 'store_manager', storeId: ids.storeB, email: 'boss@example.com' }, auth)).toMatchObject({
      ok: true,
      staff: { role: 'store_manager', storeId: ids.storeB },
    });
    expect(await addStaff(db.server, { callerUserId: ids.platform, role: 'hq_admin', brandId: ids.brand, email: 'hq2@example.com' }, auth)).toMatchObject({
      ok: true,
      staff: { role: 'hq_admin', storeId: null, brandId: ids.brand },
    });
  });

  it('only HQ of the brand (or GROW) adds staff, and nothing is created for anyone else', async () => {
    const auth = fakeAuth();
    const device = { role: 'store_device' as const, storeId: ids.storeA, email: 'x@example.com' };
    for (const callerUserId of [ids.managerA, ids.deviceA, ids.nobody, ids.otherBrandDevice]) {
      expect(await addStaff(db.server, { ...device, callerUserId }, auth), callerUserId).toMatchObject({ code: 'forbidden' });
    }
    expect(await addStaff(db.server, { ...device, callerUserId: ids.hq, storeId: ids.otherStore }, auth)).toMatchObject({ code: 'forbidden' });
    expect(await addStaff(db.server, { callerUserId: ids.hq, role: 'hq_admin', brandId: ids.otherBrand, email: 'x@example.com' }, auth)).toMatchObject({
      code: 'forbidden',
    });
    expect(auth.calls).toEqual([]);
    expect(await addStaff(db.server, { ...device, callerUserId: ids.hq, role: 'platform_admin' as never }, auth)).toMatchObject({ code: 'invalid_input' });
    expect(await addStaff(db.server, { ...device, callerUserId: ids.hq, email: 'not-an-email' }, auth)).toMatchObject({ code: 'invalid_input' });
    expect(await addStaff(db.server, { ...device, callerUserId: ids.hq, storeId: undefined }, auth)).toMatchObject({ code: 'invalid_input' });
  });

  it('removes a role; a brand keeps one HQ admin; platform admins stay', async () => {
    const auth = fakeAuth();
    const added = await addStaff(db.server, { callerUserId: ids.hq, role: 'store_device', storeId: ids.storeA, email: 'old-till@example.com' }, auth);
    if (!added.ok) throw new Error(added.code);
    expect(await removeStaff(db.server, { callerUserId: ids.managerA, staffId: added.staff.id })).toMatchObject({ code: 'forbidden' });
    expect(await removeStaff(db.server, { callerUserId: ids.hq, staffId: added.staff.id, now: NOW })).toMatchObject({
      ok: true,
      removed: { role: 'store_device', email: 'old-till@example.com' },
    });
    expect(await removeStaff(db.server, { callerUserId: ids.hq, staffId: added.staff.id })).toMatchObject({ code: 'not_found' });

    const [platformRole] = await db.admin<{ id: string }[]>`select id from public.staff_roles where role = 'platform_admin'`;
    expect(await removeStaff(db.server, { callerUserId: ids.hq, staffId: platformRole!.id })).toMatchObject({ code: 'not_found' });

    const hqRoles = await db.admin<{ id: string; user_id: string }[]>`
      select id, user_id from public.staff_roles where brand_id = ${ids.brand} and role = 'hq_admin' order by created_at
    `;
    // Remove every HQ admin but one, then the last one is refused.
    for (const r of hqRoles.slice(1)) expect(await removeStaff(db.server, { callerUserId: ids.hq, staffId: r.id })).toMatchObject({ ok: true });
    expect(await removeStaff(db.server, { callerUserId: ids.platform, staffId: hqRoles[0]!.id })).toMatchObject({ code: 'last_hq_admin' });
  });
});

describe('adjustPoints (points/adjust)', () => {
  it('HQ adds or takes back points with a reason; the balance may go negative', async () => {
    const m = await newMember(db.server, db.admin);
    const k = key('adj');
    const added = await adjustPoints(db.server, { callerUserId: ids.hq, memberId: m.memberId, points: 120, reason: 'Missed scan, receipt 4411', idempotencyKey: k, now: NOW });
    expect(added).toMatchObject({ ok: true, memberId: m.memberId, points: 120, balance: 120 });
    expect(await adjustPoints(db.server, { callerUserId: ids.hq, memberId: m.memberId, points: 120, reason: 'Missed scan, receipt 4411', idempotencyKey: k, now: NOW })).toEqual(added);
    expect(await adjustPoints(db.server, { callerUserId: ids.hq, memberId: m.memberId, points: 999, reason: 'Missed scan, receipt 4411', idempotencyKey: k })).toMatchObject({
      code: 'idempotency_conflict',
    });
    expect(await adjustPoints(db.server, { callerUserId: ids.platform, memberId: m.memberId, points: -200, reason: 'Duplicate', idempotencyKey: key('adj'), now: NOW })).toMatchObject({
      ok: true,
      balance: -80,
    });
    expect(await balanceOf(db.admin, m.memberId)).toBe(-80);
    const [entry] = await db.admin<{ kind: string; reason: string; created_by: string }[]>`
      select kind, reason, created_by from public.ledger_entries where member_id = ${m.memberId} order by id limit 1
    `;
    expect(entry).toEqual({ kind: 'adjust', reason: 'Missed scan, receipt 4411', created_by: ids.hq });
  });

  it('refuses everyone but HQ, zero, missing reasons and deleted members', async () => {
    const m = await newMember(db.server, db.admin);
    const base = { memberId: m.memberId, points: 50, reason: 'Goodwill', now: NOW };
    for (const callerUserId of [ids.managerA, ids.deviceA, ids.nobody, ids.otherBrandDevice, m.userId]) {
      expect(await adjustPoints(db.server, { ...base, callerUserId, idempotencyKey: key() }), callerUserId).toMatchObject({ code: 'member_not_found' });
    }
    expect(await adjustPoints(db.server, { ...base, callerUserId: ids.hq, points: 0, idempotencyKey: key() })).toMatchObject({ code: 'invalid_input' });
    expect(await adjustPoints(db.server, { ...base, callerUserId: ids.hq, points: 1.5, idempotencyKey: key() })).toMatchObject({ code: 'invalid_input' });
    expect(await adjustPoints(db.server, { ...base, callerUserId: ids.hq, points: 100_001, idempotencyKey: key() })).toMatchObject({ code: 'invalid_input' });
    expect(await adjustPoints(db.server, { ...base, callerUserId: ids.hq, reason: '  ', idempotencyKey: key() })).toMatchObject({ code: 'invalid_input' });
    await db.admin`
      update public.members set deleted_at = now(), user_id = null, first_name = '', email = null, referral_code = null
      where id = ${m.memberId}
    `;
    expect(await adjustPoints(db.server, { ...base, callerUserId: ids.hq, idempotencyKey: key() })).toMatchObject({ code: 'member_deleted' });
    expect(await balanceOf(db.admin, m.memberId)).toBe(0);
  });
});
