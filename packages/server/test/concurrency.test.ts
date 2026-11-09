import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AwardPointsInput,
  awardPoints,
  createRedemption,
  expireRedemptions,
  joinMember,
  undoEarn,
} from '../src/index.js';
import { type TestDatabase, createTestDatabase } from './helpers/db.js';
import { at, balanceOf, givePoints, ids, key, ledgerCount, newMember, newUser, pins, seedWorld } from './helpers/world.js';

let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
  await seedWorld(db.admin);
});
afterAll(async () => {
  await db?.drop();
});

const award = (memberId: string, now: Date, o: Partial<AwardPointsInput> = {}) =>
  awardPoints(db.server, {
    callerUserId: ids.deviceA,
    storeId: ids.storeA,
    employeeId: ids.maria,
    pin: pins.maria,
    member: { memberId },
    amountCents: 640,
    idempotencyKey: key('award'),
    now,
    ...o,
  });

describe('concurrent calls for the same member (Promise.all)', () => {
  it('two awards at the same moment, different keys: one earns, the other is too soon', async () => {
    const member = await newMember(db.server, db.admin);
    const now = new Date('2027-02-01T09:00:00Z');
    const results = await Promise.all([award(member.memberId, now), award(member.memberId, now)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.code === 'too_soon_after_last_earn')).toHaveLength(1);
    expect(await ledgerCount(db.admin, member.memberId, 'earn')).toBe(1);
    expect(await balanceOf(db.admin, member.memberId)).toBe(64);
  });

  it('eight awards spread over the day, all at once: never more than 5, never 2 within 2 minutes', async () => {
    const member = await newMember(db.server, db.admin);
    // Two stores, 3 minutes apart in "time", sent together.
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, n) =>
        award(
          member.memberId,
          at('2027-02-01T10:00:00Z', n * 180),
          n % 2 ? { callerUserId: ids.deviceB, storeId: ids.storeB, employeeId: ids.nikos, pin: pins.nikos } : {},
        ),
      ),
    );
    const ok = results.filter((r) => r.ok);
    expect(ok.length).toBeGreaterThanOrEqual(1);
    expect(ok.length).toBeLessThanOrEqual(5);
    for (const r of results) if (!r.ok) expect(['too_soon_after_last_earn', 'daily_earn_limit_reached']).toContain(r.code);
    const times = (
      await db.admin<{ created_at: Date }[]>`
        select created_at from public.ledger_entries where member_id = ${member.memberId} and kind = 'earn' order by created_at
      `
    ).map((r) => r.created_at.getTime());
    expect(times).toHaveLength(ok.length);
    for (let n = 1; n < times.length; n++) expect(times[n]! - times[n - 1]!).toBeGreaterThanOrEqual(120_000);
    expect(await balanceOf(db.admin, member.memberId)).toBe(64 * ok.length);
  });

  it('the same award retried five times at once is written once', async () => {
    const member = await newMember(db.server, db.admin);
    const input = { idempotencyKey: key('same') };
    const now = new Date('2027-02-01T12:00:00Z');
    const results = await Promise.all(Array.from({ length: 5 }, () => award(member.memberId, now, input)));
    expect(results[0]!.ok).toBe(true);
    for (const r of results) expect(r).toEqual(results[0]);
    expect(await ledgerCount(db.admin, member.memberId)).toBe(1);
  });

  it('three redemptions at once with points for one: one succeeds, the balance never goes below zero', async () => {
    const member = await newMember(db.server, db.admin);
    await givePoints(db.admin, member.memberId, 500);
    const now = new Date('2027-02-01T13:00:00Z');
    const results = await Promise.all(
      Array.from({ length: 3 }, () =>
        createRedemption(db.server, { callerUserId: member.userId, memberId: member.memberId, rewardId: ids.espresso, idempotencyKey: key('r'), now }),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.code === 'insufficient_points')).toHaveLength(2);
    expect(await balanceOf(db.admin, member.memberId)).toBe(200);
  });

  it('three undos of the same earn at once: one reverses it, the others are already_undone', async () => {
    const member = await newMember(db.server, db.admin);
    const earned = await award(member.memberId, new Date('2027-02-01T14:00:00Z'));
    if (!earned.ok) throw new Error(earned.code);
    const results = await Promise.all(
      Array.from({ length: 3 }, () =>
        undoEarn(db.server, { callerUserId: ids.managerA, entryId: earned.entryId, idempotencyKey: key('u'), now: new Date('2027-02-01T14:01:00Z') }),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.code === 'already_undone')).toHaveLength(2);
    expect(await balanceOf(db.admin, member.memberId)).toBe(0);
  });

  it('four joins of the same user at once create one member', async () => {
    const userId = await newUser(db.admin);
    const now = new Date('2027-02-01T15:00:00Z');
    const results = await Promise.all(
      Array.from({ length: 4 }, () => joinMember(db.server, { userId, brandSlug: 'overoll', firstName: 'Anna', idempotencyKey: key('j'), now })),
    );
    const ids_ = new Set(results.map((r) => (r.ok ? r.memberId : r.code)));
    expect(ids_.size).toBe(1);
    expect(results.filter((r) => r.ok && r.created)).toHaveLength(1);
    const rows = await db.admin`select 1 from public.members where user_id = ${userId}`;
    expect(rows).toHaveLength(1);
  });

  it('three expiry jobs at once refund each code once', async () => {
    const member = await newMember(db.server, db.admin);
    await givePoints(db.admin, member.memberId, 900);
    const made: string[] = [];
    for (let n = 0; n < 3; n++) {
      const r = await createRedemption(db.server, {
        callerUserId: member.userId,
        memberId: member.memberId,
        rewardId: ids.espresso,
        idempotencyKey: key('r'),
        now: new Date('2027-02-02T09:00:00Z'),
      });
      if (!r.ok) throw new Error(r.code);
      made.push(r.redemptionId);
    }
    const now = new Date('2027-02-02T10:00:00Z');
    const runs = await Promise.all([1, 2, 3].map(() => expireRedemptions(db.server, { now })));
    const expiredHere = runs.flatMap((r) => r.redemptionIds).filter((id) => made.includes(id));
    expect(expiredHere.sort()).toEqual([...made].sort());
    expect(await balanceOf(db.admin, member.memberId)).toBe(900);
    expect(await ledgerCount(db.admin, member.memberId, 'refund_redeem')).toBe(3);
  });
});
