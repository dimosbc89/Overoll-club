import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { awardPoints, createRedemption, expirePoints, expireRedemptions, undoEarn } from '../src/index.js';
import { type TestDatabase, createTestDatabase } from './helpers/db.js';
import {
  type TestMember,
  balanceOf,
  givePoints,
  ids,
  key,
  ledgerCount,
  newMember,
  pins,
  seedWorld,
  setBrandConfig,
} from './helpers/world.js';

let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
  await seedWorld(db.admin);
});
afterAll(async () => {
  await db?.drop();
});

const t = (iso: string) => new Date(iso);

async function buy(member: TestMember, iso: string, brand: 'overoll' | 'other' = 'overoll') {
  const till =
    brand === 'overoll'
      ? { callerUserId: ids.deviceA, storeId: ids.storeA, employeeId: ids.maria, pin: pins.maria }
      : { callerUserId: ids.otherBrandDevice, storeId: ids.otherStore, employeeId: ids.otherEmployee, pin: pins.otherEmployee };
  const result = await awardPoints(db.server, {
    ...till,
    member: { memberId: member.memberId },
    amountCents: 640,
    idempotencyKey: key('award'),
    now: t(iso),
  });
  if (!result.ok) throw new Error(result.code);
  return result;
}

const run = (iso: string, batchSize?: number) => expirePoints(db.server, { now: t(iso), ...(batchSize ? { batchSize } : {}) });

describe('expirePoints (jobs/expire-points)', () => {
  it('takes the whole balance off 12 months after the last purchase, to the millisecond, once', async () => {
    const member = await newMember(db.server, db.admin);
    await buy(member, '2027-06-01T09:00:00Z');
    await givePoints(db.admin, member.memberId, 100);
    expect(await balanceOf(db.admin, member.memberId)).toBe(164);

    const early = await run('2028-06-01T08:59:59.999Z');
    expect(early.memberIds).not.toContain(member.memberId);
    expect(await balanceOf(db.admin, member.memberId)).toBe(164);

    const due = await run('2028-06-01T09:00:00Z');
    expect(due.memberIds).toContain(member.memberId);
    expect(due.expired).toBe(due.memberIds.length);
    expect(due.pointsExpired).toBeGreaterThanOrEqual(164);
    expect(await balanceOf(db.admin, member.memberId)).toBe(0);
    const [entry] = await db.admin`
      select id::text, kind, points, store_id, reason, idempotency_key, created_at
      from public.ledger_entries where member_id = ${member.memberId} and kind = 'expire'
    `;
    expect(entry).toMatchObject({
      kind: 'expire',
      points: -164,
      store_id: null,
      reason: 'expiry',
      idempotency_key: `expire_points:${member.memberId}:2028-06-01T09:00:00.000Z`,
      created_at: t('2028-06-01T09:00:00Z'),
    });
    const audits = await db.admin`select details from public.audit_log where action = 'points.expire' and entity_id = ${entry!.id}`;
    expect(audits).toHaveLength(1);
    expect(audits[0]!.details).toMatchObject({ memberId: member.memberId, points: -164, expiresAt: '2028-06-01T09:00:00.000Z' });

    const again = await run('2028-06-02T09:00:00Z');
    expect(again.memberIds).not.toContain(member.memberId);
    expect(await ledgerCount(db.admin, member.memberId, 'expire')).toBe(1);
  });

  it('three runs at once expire a member once', async () => {
    const member = await newMember(db.server, db.admin);
    await buy(member, '2027-06-05T09:00:00Z');
    const runs = await Promise.all([1, 2, 3].map(() => run('2028-06-05T10:00:00Z')));
    expect(runs.filter((r) => r.memberIds.includes(member.memberId))).toHaveLength(1);
    expect(await ledgerCount(db.admin, member.memberId, 'expire')).toBe(1);
    expect(await balanceOf(db.admin, member.memberId)).toBe(0);
  });

  it('any purchase resets the clock', async () => {
    const member = await newMember(db.server, db.admin);
    await buy(member, '2027-06-10T09:00:00Z');
    await buy(member, '2027-12-10T09:00:00Z');
    expect((await run('2028-06-11T09:00:00Z')).memberIds).not.toContain(member.memberId);
    expect(await balanceOf(db.admin, member.memberId)).toBe(128);
    expect((await run('2028-12-10T09:00:00Z')).memberIds).toContain(member.memberId);
    expect(await balanceOf(db.admin, member.memberId)).toBe(0);
  });

  it('leaves zero and negative balances alone', async () => {
    const zero = await newMember(db.server, db.admin);
    const earned = await buy(zero, '2027-06-15T09:00:00Z');
    const undone = await undoEarn(db.server, { callerUserId: ids.managerA, entryId: earned.entryId, idempotencyKey: key('u'), now: t('2027-06-15T09:05:00Z') });
    expect(undone.ok).toBe(true);
    const negative = await newMember(db.server, db.admin);
    await buy(negative, '2027-06-15T09:00:00Z');
    await givePoints(db.admin, negative.memberId, -100);
    const result = await run('2028-06-16T09:00:00Z');
    expect(result.memberIds).not.toContain(zero.memberId);
    expect(result.memberIds).not.toContain(negative.memberId);
    expect(await ledgerCount(db.admin, zero.memberId, 'expire')).toBe(0);
    expect(await balanceOf(db.admin, negative.memberId)).toBe(-36);
  });

  it('a member who never bought anything counts from joining', async () => {
    const member = await newMember(db.server, db.admin); // joined 2027-01-01T08:00:00Z
    await givePoints(db.admin, member.memberId, 50);
    expect((await run('2028-01-01T07:59:59Z')).memberIds).not.toContain(member.memberId);
    expect((await run('2028-01-01T08:00:00Z')).memberIds).toContain(member.memberId);
    expect(await balanceOf(db.admin, member.memberId)).toBe(0);
  });

  it('skips a member with a pending points code; the next run takes the refunded balance too', async () => {
    const member = await newMember(db.server, db.admin);
    await buy(member, '2027-06-20T09:00:00Z');
    await givePoints(db.admin, member.memberId, 500);
    const code = await createRedemption(db.server, {
      callerUserId: member.userId,
      memberId: member.memberId,
      rewardId: ids.espresso,
      idempotencyKey: key('r'),
      now: t('2028-06-20T08:55:00Z'),
    });
    expect(code).toMatchObject({ ok: true, balance: 264 });
    expect((await run('2028-06-20T09:00:00Z')).memberIds).not.toContain(member.memberId);
    expect(await balanceOf(db.admin, member.memberId)).toBe(264);
    await expireRedemptions(db.server, { now: t('2028-06-20T09:10:00Z') });
    expect(await balanceOf(db.admin, member.memberId)).toBe(564);
    expect((await run('2028-06-20T09:11:00Z')).memberIds).toContain(member.memberId);
    expect(await balanceOf(db.admin, member.memberId)).toBe(0);
  });

  it('points added after an expiry stay until the next purchase has lapsed too', async () => {
    const member = await newMember(db.server, db.admin);
    await buy(member, '2027-06-25T09:00:00Z');
    expect((await run('2028-06-25T09:00:00Z')).memberIds).toContain(member.memberId);
    await givePoints(db.admin, member.memberId, 70); // HQ goodwill
    expect((await run('2028-06-26T09:00:00Z')).memberIds).not.toContain(member.memberId);
    expect(await balanceOf(db.admin, member.memberId)).toBe(70);
    await buy(member, '2028-07-01T09:00:00Z');
    expect((await run('2029-06-30T09:00:00Z')).memberIds).not.toContain(member.memberId);
    expect((await run('2029-07-01T09:00:00Z')).memberIds).toContain(member.memberId);
    expect(await balanceOf(db.admin, member.memberId)).toBe(0);
    expect(await ledgerCount(db.admin, member.memberId, 'expire')).toBe(2);
  });

  it('uses calendar months with month-end clamping (29 Feb + 12 months = 28 Feb)', async () => {
    const member = await newMember(db.server, db.admin);
    await buy(member, '2028-02-29T10:00:00Z');
    expect((await run('2029-02-28T09:59:59Z')).memberIds).not.toContain(member.memberId);
    expect((await run('2029-02-28T10:00:00Z')).memberIds).toContain(member.memberId);
  });

  it("follows each brand's expiryMonths", async () => {
    await setBrandConfig(db.admin, ids.otherBrand, { expiryMonths: 6 });
    const stranger = await newMember(db.server, db.admin, { brandSlug: 'other' });
    const ours = await newMember(db.server, db.admin);
    await buy(stranger, '2027-08-01T09:00:00Z', 'other');
    await buy(ours, '2027-08-01T09:00:00Z');
    const result = await run('2028-02-01T09:00:00Z');
    expect(result.memberIds).toContain(stranger.memberId);
    expect(result.memberIds).not.toContain(ours.memberId);
    await setBrandConfig(db.admin, ids.otherBrand, {});
  });

  it('pages through members with any batch size', async () => {
    const members = await Promise.all([1, 2, 3].map(() => newMember(db.server, db.admin)));
    for (const m of members) await buy(m, '2027-09-01T09:00:00Z');
    const result = await run('2028-09-01T09:00:00Z', 1);
    for (const m of members) expect(result.memberIds).toContain(m.memberId);
    expect(new Set(result.memberIds).size).toBe(result.memberIds.length);
    await expect(expirePoints(db.server, { batchSize: 0 })).rejects.toThrow(TypeError);
  });
});
