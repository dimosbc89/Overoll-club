import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type AwardPointsInput, awardPoints, undoEarn } from '../src/index.js';
import { type TestDatabase, createTestDatabase } from './helpers/db.js';
import { at, ids, key, ledgerCount, newMember, pins, seedWorld } from './helpers/world.js';

let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
  await seedWorld(db.admin);
});
afterAll(async () => {
  await db?.drop();
});

const storeB = { callerUserId: ids.deviceB, storeId: ids.storeB, employeeId: ids.nikos, pin: pins.nikos };

const award = (memberId: string, now: Date, receiptNumber: string | null | undefined, o: Partial<AwardPointsInput> = {}) =>
  awardPoints(db.server, {
    callerUserId: ids.deviceA,
    storeId: ids.storeA,
    employeeId: ids.maria,
    pin: pins.maria,
    member: { memberId },
    amountCents: 640,
    receiptNumber,
    idempotencyKey: key('award'),
    now,
    ...o,
  });

const receiptOf = async (entryId: string) =>
  (await db.admin<{ receipt_number: string | null }[]>`select receipt_number from public.ledger_entries where id = ${entryId}`)[0]!
    .receipt_number;

describe('late points: receipt number (awardPoints)', () => {
  it('stores the receipt number, normalised, on the earn and in the audit', async () => {
    const now = new Date('2027-04-01T08:00:00Z');
    const member = await newMember(db.server, db.admin);
    const result = await award(member.memberId, now, ' a-1234/7 ');
    expect(result).toMatchObject({ ok: true, points: 64 });
    if (!result.ok) return;
    expect(await receiptOf(result.entryId)).toBe('A-1234/7');
    const [log] = await db.admin`select details from public.audit_log where action = 'points.award' and entity_id = ${result.entryId}`;
    expect(log!.details).toMatchObject({ receiptNumber: 'A-1234/7' });
  });

  it('a receipt earns once per store per day: refused for any member the same day, nothing written', async () => {
    const base = '2027-04-01T09:00:00Z';
    const first = await newMember(db.server, db.admin);
    const second = await newMember(db.server, db.admin);
    expect((await award(first.memberId, at(base), '5001')).ok).toBe(true);
    expect(await award(second.memberId, at(base, 60), '5001')).toMatchObject({ ok: false, code: 'receipt_already_used' });
    expect(await award(first.memberId, at(base, 600), '5001')).toMatchObject({ ok: false, code: 'receipt_already_used' });
    // The same receipt typed on a Greek keyboard is the same receipt.
    expect((await award(first.memberId, at(base, 900), 'Α-77')).ok).toBe(true);
    expect(await award(second.memberId, at(base, 960), 'a-77')).toMatchObject({ ok: false, code: 'receipt_already_used' });
    expect(await ledgerCount(db.admin, second.memberId)).toBe(0);
  });

  it('the same receipt number is fine at another store, and the next day in Athens (not UTC)', async () => {
    // In April Athens is UTC+3: 20:30Z = 23:30 in Athens, and Athens midnight is 21:00Z
    // while the UTC day goes on for three more hours.
    const member = await newMember(db.server, db.admin);
    const other = await newMember(db.server, db.admin);
    expect((await award(member.memberId, new Date('2027-04-02T20:30:00Z'), '6001')).ok).toBe(true); // 23:30 Athens
    expect(await award(other.memberId, new Date('2027-04-02T20:59:59Z'), '6001')).toMatchObject({ ok: false, code: 'receipt_already_used' });
    expect(await award(other.memberId, new Date('2027-04-02T20:40:00Z'), '6001', storeB)).toMatchObject({ ok: true });
    expect(await award(other.memberId, new Date('2027-04-02T21:00:00Z'), '6001')).toMatchObject({ ok: true }); // 00:00 next day
  });

  it('an undone earn frees its receipt, so the cashier can fix a wrong amount', async () => {
    const base = '2027-04-03T09:00:00Z';
    const member = await newMember(db.server, db.admin);
    const typo = await award(member.memberId, at(base), '7001', { amountCents: 6400 });
    if (!typo.ok) throw new Error(typo.code);
    const undone = await undoEarn(db.server, {
      callerUserId: ids.deviceA,
      entryId: typo.entryId,
      employee: { employeeId: ids.maria, pin: pins.maria },
      idempotencyKey: key('undo'),
      now: at(base, 30),
    });
    expect(undone.ok).toBe(true);
    expect(await award(member.memberId, at(base, 60), '7001')).toMatchObject({ ok: true, points: 64, balance: 64 });
    expect(await award(member.memberId, at(base, 400), '7001')).toMatchObject({ ok: false, code: 'receipt_already_used' });
  });

  it('late points still obey the fraud limits', async () => {
    const base = '2027-04-04T08:00:00Z';
    const member = await newMember(db.server, db.admin);
    expect((await award(member.memberId, at(base), null)).ok).toBe(true);
    expect(await award(member.memberId, at(base, 60), '8001')).toMatchObject({ ok: false, code: 'too_soon_after_last_earn' });
    for (let n = 1; n <= 4; n++) expect((await award(member.memberId, at(base, n * 180), `81${n}`)).ok).toBe(true);
    expect(await award(member.memberId, at(base, 5 * 180), '8200')).toMatchObject({ ok: false, code: 'daily_earn_limit_reached' });
    expect(await award(member.memberId, at(base, 5 * 180), '8001', { amountCents: 9000 })).toMatchObject({ ok: false, code: 'amount_over_limit' });
    // The refused receipt was not used up.
    const other = await newMember(db.server, db.admin);
    expect((await award(other.memberId, at(base, 6 * 180), '8001')).ok).toBe(true);
  });

  it('checks the format; blank means an ordinary award', async () => {
    const now = new Date('2027-04-05T08:00:00Z');
    const member = await newMember(db.server, db.admin);
    for (const bad of ['12 34', 'x'.repeat(41), '12;34', 42 as unknown as string]) {
      expect(await award(member.memberId, now, bad)).toMatchObject({ ok: false, code: 'invalid_input' });
    }
    expect(await ledgerCount(db.admin, member.memberId)).toBe(0);
    const blank = await award(member.memberId, now, '  ');
    expect(blank).toMatchObject({ ok: true });
    if (blank.ok) expect(await receiptOf(blank.entryId)).toBeNull();
  });

  it('a retry with the same key answers the same; the same key with another receipt is a conflict', async () => {
    const now = new Date('2027-04-06T08:00:00Z');
    const member = await newMember(db.server, db.admin);
    const k = key('award');
    const first = await award(member.memberId, now, '9001', { idempotencyKey: k });
    expect(first.ok).toBe(true);
    expect(await award(member.memberId, at('2027-04-06T08:00:00Z', 30), '9001', { idempotencyKey: k })).toEqual(first);
    expect(await award(member.memberId, now, '9002', { idempotencyKey: k })).toMatchObject({ ok: false, code: 'idempotency_conflict' });
    expect(await award(member.memberId, now, null, { idempotencyKey: k })).toMatchObject({ ok: false, code: 'idempotency_conflict' });
    expect(await ledgerCount(db.admin, member.memberId)).toBe(1);
  });

  it('two members claiming the same receipt at the same moment: one gets the points', async () => {
    const now = new Date('2027-04-07T08:00:00Z');
    const members = await Promise.all([1, 2, 3, 4].map(() => newMember(db.server, db.admin)));
    const results = await Promise.all(members.map((m) => award(m.memberId, now, 'RACE-1')));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.code === 'receipt_already_used')).toHaveLength(3);
    const [row] = await db.admin<{ n: number }[]>`select count(*)::int as n from public.ledger_entries where receipt_number = 'RACE-1'`;
    expect(row!.n).toBe(1);
  });
});
