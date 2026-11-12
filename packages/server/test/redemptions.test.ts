import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type UseRedemptionInput,
  cancelRedemption,
  createRedemption,
  expireRedemptions,
  useRedemption,
} from '../src/index.js';
import { type TestDatabase, createTestDatabase } from './helpers/db.js';
import { type TestMember, at, balanceOf, givePoints, ids, key, ledgerCount, newMember, pins, seedWorld } from './helpers/world.js';

let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
  await seedWorld(db.admin);
});
afterAll(async () => {
  await db?.drop();
});

const redeem = (member: TestMember, rewardId: string, now: Date, idempotencyKey = key('redeem')) =>
  createRedemption(db.server, { callerUserId: member.userId, memberId: member.memberId, rewardId, idempotencyKey, now });

const cancel = (member: TestMember, redemptionId: string, now: Date, idempotencyKey = key('cancel')) =>
  cancelRedemption(db.server, { callerUserId: member.userId, redemptionId, idempotencyKey, now });

const use = (code: string, now: Date, o: Partial<UseRedemptionInput> = {}) =>
  useRedemption(db.server, {
    callerUserId: ids.deviceA,
    storeId: ids.storeA,
    employeeId: ids.maria,
    pin: pins.maria,
    code,
    idempotencyKey: key('use'),
    now,
    ...o,
  });

async function memberWith(points: number, tier?: 'classic' | 'gold' | 'club'): Promise<TestMember> {
  const member = await newMember(db.server, db.admin, tier ? { tier } : {});
  if (points !== 0) await givePoints(db.admin, member.memberId, points);
  return member;
}

async function redemptionRow(id: string) {
  const [row] = await db.admin`
    select status, points_spent, created_at, expires_at, used_at, used_store_id, used_employee_id, cancelled_at, value_cents
    from public.redemptions where id = ${id}
  `;
  return row!;
}

const refunds = async (redemptionId: string) =>
  (await db.admin`select 1 from public.ledger_entries where redemption_id = ${redemptionId} and kind = 'refund_redeem'`).length;

describe('createRedemption', () => {
  it('refuses when the balance does not cover the cost, and writes nothing', async () => {
    const member = await memberWith(299);
    const result = await redeem(member, ids.espresso, new Date('2027-01-20T09:00:00Z'));
    expect(result).toMatchObject({ ok: false, code: 'insufficient_points' });
    expect(await ledgerCount(db.admin, member.memberId)).toBe(1);
    expect(await db.admin`select 1 from public.redemptions where member_id = ${member.memberId}`).toHaveLength(0);
  });

  it('takes the cost with the tier discount and creates a code valid for 15 minutes', async () => {
    const now = new Date('2027-01-20T09:00:00Z');
    for (const [tier, rewardId, cost] of [
      ['classic', ids.espresso, 300],
      ['gold', ids.espresso, 240],
      ['club', ids.croissant, 350],
    ] as const) {
      const member = await memberWith(1000, tier);
      const result = await redeem(member, rewardId, now);
      expect(result).toEqual({
        ok: true,
        redemptionId: expect.any(String),
        code: expect.stringMatching(/^[A-HJ-NP-Z2-9]{8}$/),
        rewardId,
        giftId: null,
        pointsSpent: cost,
        expiresAt: '2027-01-20T09:15:00.000Z',
        balance: 1000 - cost,
      });
      if (!result.ok) return;
      expect(await redemptionRow(result.redemptionId)).toMatchObject({
        status: 'pending',
        points_spent: cost,
        created_at: now,
        expires_at: new Date('2027-01-20T09:15:00Z'),
      });
      const [entry] = await db.admin`
        select points, created_by, created_at from public.ledger_entries
        where redemption_id = ${result.redemptionId} and kind = 'redeem'
      `;
      expect(entry).toMatchObject({ points: -cost, created_by: member.userId, created_at: now });
      expect(await balanceOf(db.admin, member.memberId)).toBe(1000 - cost);
    }
  });

  it('checks the reward and who is asking', async () => {
    const now = new Date('2027-01-20T10:00:00Z');
    const classic = await memberWith(2000);
    const gold = await memberWith(2000, 'gold');
    expect(await redeem(classic, ids.goldOnly, now)).toMatchObject({ ok: false, code: 'tier_too_low' });
    expect(await redeem(gold, ids.goldOnly, now)).toMatchObject({ ok: true, pointsSpent: 320 });
    expect(await redeem(classic, ids.retiredReward, now)).toMatchObject({ ok: false, code: 'reward_unavailable' });
    expect(await redeem(classic, ids.otherReward, now)).toMatchObject({ ok: false, code: 'reward_not_found' });
    expect(await redeem(classic, '50000000-0000-0000-0000-000000000999', now)).toMatchObject({ ok: false, code: 'reward_not_found' });
    expect(await redeem({ ...classic, userId: gold.userId }, ids.espresso, now)).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await redeem({ ...classic, userId: ids.deviceA }, ids.espresso, now)).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await redeem({ ...classic, memberId: '40000000-0000-0000-0000-000000000999' }, ids.espresso, now)).toMatchObject({
      ok: false,
      code: 'member_not_found',
    });
    expect(await balanceOf(db.admin, classic.memberId)).toBe(2000);
  });

  it('a retry with the same key returns the same code and charges once', async () => {
    const now = new Date('2027-01-20T11:00:00Z');
    const member = await memberWith(1000);
    const k = key('redeem');
    const first = await redeem(member, ids.espresso, now, k);
    expect(first.ok).toBe(true);
    expect(await redeem(member, ids.espresso, at('2027-01-20T11:00:00Z', 5), k)).toEqual(first);
    expect(await redeem(member, ids.croissant, now, k)).toMatchObject({ ok: false, code: 'idempotency_conflict' });
    expect(await ledgerCount(db.admin, member.memberId, 'redeem')).toBe(1);
    expect(await balanceOf(db.admin, member.memberId)).toBe(700);
  });
});

describe('cancelRedemption', () => {
  it('gives the points back once', async () => {
    const base = '2027-01-20T12:00:00Z';
    const member = await memberWith(1000);
    const created = await redeem(member, ids.croissant, at(base));
    if (!created.ok) throw new Error(created.code);
    expect(await balanceOf(db.admin, member.memberId)).toBe(500);

    const k = key('cancel');
    const cancelled = await cancel(member, created.redemptionId, at(base, 60), k);
    expect(cancelled).toEqual({ ok: true, redemptionId: created.redemptionId, pointsRefunded: 500, balance: 1000 });
    expect(await redemptionRow(created.redemptionId)).toMatchObject({ status: 'cancelled', cancelled_at: at(base, 60) });
    expect(await cancel(member, created.redemptionId, at(base, 90), k)).toEqual(cancelled);
    expect(await cancel(member, created.redemptionId, at(base, 90))).toMatchObject({ ok: false, code: 'cancelled' });
    expect(await refunds(created.redemptionId)).toBe(1);
    expect(await balanceOf(db.admin, member.memberId)).toBe(1000);
    expect(await use(created.code, at(base, 120))).toMatchObject({ ok: false, code: 'cancelled' });
  });

  it("refuses someone else's code and unknown codes", async () => {
    const now = new Date('2027-01-20T12:30:00Z');
    const member = await memberWith(1000);
    const other = await memberWith(0);
    const created = await redeem(member, ids.espresso, now);
    if (!created.ok) throw new Error(created.code);
    expect(await cancel(other, created.redemptionId, now)).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await cancel(member, '60000000-0000-0000-0000-000000000999', now)).toMatchObject({ ok: false, code: 'not_found' });
    expect(await redemptionRow(created.redemptionId)).toMatchObject({ status: 'pending' });
  });
});

describe('useRedemption', () => {
  it('marks the code used with store, employee and time; a second scan is already_used', async () => {
    const base = '2027-01-20T13:00:00Z';
    const member = await memberWith(1000);
    const created = await redeem(member, ids.croissant, at(base));
    if (!created.ok) throw new Error(created.code);
    const typed = `${created.code.slice(0, 4).toLowerCase()}-${created.code.slice(4)}`;
    const k = key('use');
    const used = await use(typed, at(base, 120), { idempotencyKey: k });
    expect(used).toEqual({
      ok: true,
      redemptionId: created.redemptionId,
      memberId: member.memberId,
      memberFirstName: 'Eleni',
      rewardId: ids.croissant,
      rewardNameEl: 'Κρουασάν',
      rewardNameEn: 'Croissant',
      pointsSpent: 500,
      usedAt: at(base, 120).toISOString(),
    });
    expect(await redemptionRow(created.redemptionId)).toMatchObject({
      status: 'used',
      used_at: at(base, 120),
      used_store_id: ids.storeA,
      used_employee_id: ids.maria,
      // The croissant's shelf price at the time of use (store report, v0.6).
      value_cents: 350,
    });
    expect(await use(created.code, at(base, 130), { idempotencyKey: k })).toEqual(used);
    expect(await use(created.code, at(base, 130))).toMatchObject({ ok: false, code: 'already_used' });
    expect(await cancel(member, created.redemptionId, at(base, 140))).toMatchObject({ ok: false, code: 'already_used' });
    expect(await balanceOf(db.admin, member.memberId)).toBe(500);
    const audits = await db.admin`select 1 from public.audit_log where action = 'redemption.use' and entity_id = ${created.redemptionId}`;
    expect(audits).toHaveLength(1);
  });

  it('checks the till: device of the store, cashier PIN, the brand of the code', async () => {
    const now = new Date('2027-01-20T14:00:00Z');
    const member = await memberWith(1000);
    const created = await redeem(member, ids.espresso, now);
    if (!created.ok) throw new Error(created.code);
    const code = created.code;
    expect(await use(code, now, { pin: '0000' })).toMatchObject({ ok: false, code: 'bad_pin' });
    expect(await use(code, now, { employeeId: ids.nikos, pin: pins.nikos })).toMatchObject({ ok: false, code: 'employee_not_found' });
    expect(await use(code, now, { callerUserId: ids.deviceB })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await use(code, now, { callerUserId: ids.hq })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await use(code, now, { callerUserId: member.userId })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(
      await use(code, now, { callerUserId: ids.deviceClosed, storeId: ids.closedStore, employeeId: ids.closedEmployee, pin: pins.closedEmployee }),
    ).toMatchObject({ ok: false, code: 'store_inactive' });
    expect(
      await use(code, now, { callerUserId: ids.otherBrandDevice, storeId: ids.otherStore, employeeId: ids.otherEmployee, pin: pins.otherEmployee }),
    ).toMatchObject({ ok: false, code: 'not_found' });
    expect(await use('ZZZZZZZZ', now)).toMatchObject({ ok: false, code: 'not_found' });
    expect(await use('hello', now)).toMatchObject({ ok: false, code: 'not_found' });
    expect(await redemptionRow(created.redemptionId)).toMatchObject({ status: 'pending' });
    expect(await use(code, now, { callerUserId: ids.managerA })).toMatchObject({ ok: true });
  });

  it('works until the last second; refuses the code once expired', async () => {
    const base = '2027-01-20T15:00:00Z';
    const member = await memberWith(1000);
    const a = await redeem(member, ids.espresso, at(base));
    const b = await redeem(member, ids.espresso, at(base));
    if (!a.ok || !b.ok) throw new Error('redeem failed');
    expect(await use(a.code, at(base, 15 * 60 - 1))).toMatchObject({ ok: true });
    expect(await use(b.code, at(base, 15 * 60))).toMatchObject({ ok: false, code: 'expired' });
    expect(await redemptionRow(b.redemptionId)).toMatchObject({ status: 'pending' });
  });
});

describe('expireRedemptions', () => {
  it('expires pending codes past their time and refunds each once, even when run twice', async () => {
    const base = '2027-01-21T09:00:00Z';
    const member = await memberWith(2000);
    const made = [];
    for (let n = 0; n < 3; n++) {
      const r = await redeem(member, ids.espresso, at(base, n));
      if (!r.ok) throw new Error(r.code);
      made.push(r);
    }
    const used = await redeem(member, ids.espresso, at(base));
    const cancelledOne = await redeem(member, ids.espresso, at(base));
    const fresh = await redeem(member, ids.espresso, at(base, 19 * 60));
    if (!used.ok || !cancelledOne.ok || !fresh.ok) throw new Error('redeem failed');
    expect((await use(used.code, at(base, 60))).ok).toBe(true);
    expect((await cancel(member, cancelledOne.redemptionId, at(base, 60))).ok).toBe(true);
    expect(await balanceOf(db.admin, member.memberId)).toBe(2000 - 5 * 300);

    const first = await expireRedemptions(db.server, { now: at(base, 20 * 60), batchSize: 2 });
    for (const r of made) expect(first.redemptionIds).toContain(r.redemptionId);
    expect(first.redemptionIds).not.toContain(used.redemptionId);
    expect(first.redemptionIds).not.toContain(cancelledOne.redemptionId);
    expect(first.redemptionIds).not.toContain(fresh.redemptionId);
    expect(first.expired).toBe(first.redemptionIds.length);

    const second = await expireRedemptions(db.server, { now: at(base, 20 * 60) });
    expect(second).toEqual({ ok: true, expired: 0, redemptionIds: [], giftsExpired: 0, giftIds: [] });

    for (const r of made) {
      expect(await refunds(r.redemptionId)).toBe(1);
      expect(await redemptionRow(r.redemptionId)).toMatchObject({ status: 'expired' });
    }
    expect(await redemptionRow(fresh.redemptionId)).toMatchObject({ status: 'pending' });
    expect(await balanceOf(db.admin, member.memberId)).toBe(2000 - 2 * 300);
    const audits = await db.admin`select 1 from public.audit_log where action = 'redemption.expire' and entity_id = ${made[0]!.redemptionId}`;
    expect(audits).toHaveLength(1);

    expect(await use(made[0]!.code, at(base, 21 * 60))).toMatchObject({ ok: false, code: 'expired' });
    expect(await cancel(member, made[0]!.redemptionId, at(base, 21 * 60))).toMatchObject({ ok: false, code: 'expired' });
  });
});
