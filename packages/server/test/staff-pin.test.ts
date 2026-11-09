import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type VerifyEmployeePinInput,
  awardPoints,
  createRedemption,
  undoEarn,
  useRedemption,
  verifyEmployeePin,
} from '../src/index.js';
import { type TestDatabase, createTestDatabase } from './helpers/db.js';
import { at, givePoints, ids, key, ledgerCount, newEmployee, newMember, pins, seedWorld } from './helpers/world.js';

let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
  await seedWorld(db.admin);
});
afterAll(async () => {
  await db?.drop();
});

const PIN = '4321';

const verify = (employeeId: string, pin: string, now: Date, o: Partial<VerifyEmployeePinInput> = {}) =>
  verifyEmployeePin(db.server, { callerUserId: ids.deviceA, storeId: ids.storeA, employeeId, pin, now, ...o });

const failureRows = async (employeeId: string) =>
  (await db.admin<{ n: number }[]>`select count(*)::int as n from private.employee_pin_failures where employee_id = ${employeeId}`)[0]!.n;

/** Five wrong PINs, a minute apart from `base`: the fifth locks. */
async function lockOut(employeeId: string, base: string): Promise<void> {
  for (let n = 0; n < 4; n++) expect(await verify(employeeId, '0000', at(base, n * 60))).toMatchObject({ ok: false, code: 'bad_pin' });
  expect(await verify(employeeId, '0000', at(base, 240))).toMatchObject({ ok: false, code: 'pin_locked' });
}

describe('verifyEmployeePin (staff/verify-pin)', () => {
  it('returns the employee for the right PIN', async () => {
    const now = new Date('2027-05-01T08:00:00Z');
    const employeeId = await newEmployee(db.admin, PIN, ids.storeA, 'Anna');
    expect(await verify(employeeId, PIN, now)).toEqual({ ok: true, employee: { id: employeeId, displayName: 'Anna' } });
    expect(await verify(employeeId, PIN, now, { callerUserId: ids.managerA })).toMatchObject({ ok: true });
  });

  it('checks the caller, the employee and the PIN', async () => {
    const now = new Date('2027-05-01T08:30:00Z');
    expect(await verify(ids.maria, '9999', now)).toMatchObject({ ok: false, code: 'bad_pin' });
    expect(await verify(ids.maria, pins.maria, now, { callerUserId: ids.deviceB })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await verify(ids.maria, pins.maria, now, { callerUserId: ids.hq })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await verify(ids.maria, pins.maria, now, { callerUserId: ids.nobody })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await verify(ids.maria, pins.maria, now, { storeId: '20000000-0000-0000-0000-000000000999' })).toMatchObject({
      ok: false,
      code: 'forbidden',
    });
    expect(await verify(ids.nikos, pins.nikos, now)).toMatchObject({ ok: false, code: 'employee_not_found' });
    expect(await verify(ids.retiredA, pins.retiredA, now)).toMatchObject({ ok: false, code: 'employee_not_found' });
    expect(await verify(ids.otherEmployee, pins.otherEmployee, now)).toMatchObject({ ok: false, code: 'employee_not_found' });
    expect(await verify('nope', pins.maria, now)).toMatchObject({ ok: false, code: 'invalid_input' });
    expect(await verify(ids.maria, '', now)).toMatchObject({ ok: false, code: 'invalid_input' });
    // The right PIN clears the one wrong attempt above.
    expect(await verify(ids.maria, pins.maria, now)).toMatchObject({ ok: true });
    expect(await failureRows(ids.maria)).toBe(0);
  });
});

describe('PIN lockout', () => {
  it('5 wrong PINs within 15 minutes lock the employee for 15 minutes, even with the right PIN', async () => {
    const base = '2027-05-02T08:00:00Z';
    const employeeId = await newEmployee(db.admin, PIN);
    await lockOut(employeeId, base);
    // Locked from the 5th wrong PIN (minute 4) until minute 19.
    expect(await verify(employeeId, PIN, at(base, 300))).toMatchObject({ ok: false, code: 'pin_locked' });
    expect(await verify(employeeId, PIN, at(base, 19 * 60 - 1))).toMatchObject({ ok: false, code: 'pin_locked' });
    // Attempts while locked are not stored and don't extend the lock.
    expect(await failureRows(employeeId)).toBe(5);
    expect(await verify(employeeId, PIN, at(base, 19 * 60))).toMatchObject({ ok: true });
    expect(await failureRows(employeeId)).toBe(0);
    const audits = await db.admin`select details from public.audit_log where action = 'employee.pin_lock' and entity_id = ${employeeId}`;
    expect(audits).toHaveLength(1);
    expect(audits[0]!.details).toMatchObject({ storeId: ids.storeA, lockedUntil: at(base, 19 * 60).toISOString() });
  });

  it('counts only the last 15 minutes; the right PIN starts the count again', async () => {
    const base = '2027-05-03T08:00:00Z';
    const employeeId = await newEmployee(db.admin, PIN);
    // Wrong at minutes 0, 5, 10, 14; at minute 16 the one at 0 no longer counts.
    for (const m of [0, 5, 10, 14]) expect(await verify(employeeId, '1111', at(base, m * 60))).toMatchObject({ code: 'bad_pin' });
    expect(await verify(employeeId, '1111', at(base, 16 * 60))).toMatchObject({ ok: false, code: 'bad_pin' });
    // Minute 17: 5, 10, 14, 16 and this one → locked.
    expect(await verify(employeeId, '1111', at(base, 17 * 60))).toMatchObject({ ok: false, code: 'pin_locked' });

    const other = await newEmployee(db.admin, PIN);
    for (let n = 0; n < 4; n++) expect(await verify(other, '1111', at(base, n * 10))).toMatchObject({ code: 'bad_pin' });
    expect(await verify(other, PIN, at(base, 50))).toMatchObject({ ok: true });
    for (let n = 0; n < 4; n++) expect(await verify(other, '1111', at(base, 60 + n * 10))).toMatchObject({ code: 'bad_pin' });
    expect(await verify(other, PIN, at(base, 120))).toMatchObject({ ok: true });
  });

  it('after a lock ends, it takes 5 new wrong PINs to lock again; other employees are not affected', async () => {
    const base = '2027-05-04T08:00:00Z';
    const employeeId = await newEmployee(db.admin, PIN);
    const colleague = await newEmployee(db.admin, '8765');
    await lockOut(employeeId, base);
    expect(await verify(colleague, '8765', at(base, 300))).toMatchObject({ ok: true });
    const after = 19 * 60;
    for (let n = 0; n < 4; n++) expect(await verify(employeeId, '0000', at(base, after + n * 30))).toMatchObject({ code: 'bad_pin' });
    expect(await verify(employeeId, '0000', at(base, after + 150))).toMatchObject({ ok: false, code: 'pin_locked' });
  });

  it('applies to award, undo and redemptions/use; wrong PINs sent there count too', async () => {
    const base = '2027-05-05T08:00:00Z';
    const employeeId = await newEmployee(db.admin, PIN);
    const member = await newMember(db.server, db.admin);
    await givePoints(db.admin, member.memberId, 1000);
    const till = { callerUserId: ids.deviceA, storeId: ids.storeA, employeeId };
    const award = (pin: string, now: Date) =>
      awardPoints(db.server, { ...till, pin, member: { memberId: member.memberId }, amountCents: 640, idempotencyKey: key('a'), now });

    const earned = await award(PIN, at(base));
    if (!earned.ok) throw new Error(earned.code);
    const code = await createRedemption(db.server, {
      callerUserId: member.userId,
      memberId: member.memberId,
      rewardId: ids.espresso,
      idempotencyKey: key('r'),
      now: at(base),
    });
    if (!code.ok) throw new Error(code.code);

    // Wrong PINs through award (2), undo (1) and use (1), then the 5th locks via award.
    expect(await award('0000', at(base, 10))).toMatchObject({ code: 'bad_pin' });
    expect(await award('0000', at(base, 20))).toMatchObject({ code: 'bad_pin' });
    const undo = (pin: string, now: Date) =>
      undoEarn(db.server, { callerUserId: ids.deviceA, entryId: earned.entryId, employee: { employeeId, pin }, idempotencyKey: key('u'), now });
    const use = (pin: string, now: Date) =>
      useRedemption(db.server, { ...till, pin, code: code.code, idempotencyKey: key('use'), now });
    expect(await undo('0000', at(base, 30))).toMatchObject({ code: 'bad_pin' });
    expect(await use('0000', at(base, 40))).toMatchObject({ code: 'bad_pin' });
    expect(await award('0000', at(base, 50))).toMatchObject({ ok: false, code: 'pin_locked' });

    // Locked: the right PIN is refused everywhere and nothing is written.
    expect(await award(PIN, at(base, 300))).toMatchObject({ ok: false, code: 'pin_locked' });
    expect(await undo(PIN, at(base, 300))).toMatchObject({ ok: false, code: 'pin_locked' });
    expect(await use(PIN, at(base, 300))).toMatchObject({ ok: false, code: 'pin_locked' });
    expect(await verify(employeeId, PIN, at(base, 300))).toMatchObject({ ok: false, code: 'pin_locked' });
    expect(await ledgerCount(db.admin, member.memberId, 'earn')).toBe(1);
    expect(await ledgerCount(db.admin, member.memberId, 'reverse')).toBe(0);
    // A manager can still undo without an employee PIN.
    expect(
      await undoEarn(db.server, { callerUserId: ids.managerA, entryId: earned.entryId, idempotencyKey: key('u'), now: at(base, 310) }),
    ).toMatchObject({ ok: true });
    // 15 minutes after the 5th wrong PIN (second 50) the employee is back.
    const back = at(base, 50 + 15 * 60);
    const fresh = await createRedemption(db.server, {
      callerUserId: member.userId,
      memberId: member.memberId,
      rewardId: ids.espresso,
      idempotencyKey: key('r'),
      now: back,
    });
    if (!fresh.ok) throw new Error(fresh.code);
    expect(await useRedemption(db.server, { ...till, pin: PIN, code: fresh.code, idempotencyKey: key('use'), now: back })).toMatchObject({
      ok: true,
    });
    expect(await failureRows(employeeId)).toBe(0);
  });

  it('wrong PINs sent at the same moment are counted one by one: 4 bad_pin, then locked', async () => {
    const now = new Date('2027-05-06T08:00:00Z');
    const employeeId = await newEmployee(db.admin, PIN);
    const results = await Promise.all(Array.from({ length: 8 }, () => verify(employeeId, '0000', now)));
    expect(results.filter((r) => !r.ok && r.code === 'bad_pin')).toHaveLength(4);
    expect(results.filter((r) => !r.ok && r.code === 'pin_locked')).toHaveLength(4);
    expect(await failureRows(employeeId)).toBe(5);
  });
});
