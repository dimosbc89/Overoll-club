import { InvalidConfigError } from '@overoll/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AwardPointsInput,
  awardPoints,
  cancelRedemption,
  createRedemption,
  expireRedemptions,
  undoEarn,
  useRedemption,
} from '../src/index.js';
import { type TestDatabase, createTestDatabase } from './helpers/db.js';
import {
  type TestMember,
  at,
  balanceOf,
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
  // The croissant reward is this brand's welcome gift; the other brand has none.
  await setBrandConfig(db.admin, ids.brand, { welcome: { rewardId: ids.croissant } });
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

const redeemGift = (member: TestMember, giftId: string, now: Date, idempotencyKey = key('gift')) =>
  createRedemption(db.server, { callerUserId: member.userId, memberId: member.memberId, giftId, idempotencyKey, now });

const use = (code: string, now: Date) =>
  useRedemption(db.server, {
    callerUserId: ids.deviceA,
    storeId: ids.storeA,
    employeeId: ids.maria,
    pin: pins.maria,
    code,
    idempotencyKey: key('use'),
    now,
  });

async function giftsOf(memberId: string) {
  return db.admin<
    { id: string; kind: string; reward_id: string; unlocked_at: Date; expires_at: Date; status: string; redemption_id: string | null; unlocked_by_entry_id: string | null }[]
  >`
    select id, kind, reward_id, unlocked_at, expires_at, status, redemption_id, unlocked_by_entry_id::text
    from public.member_gifts where member_id = ${memberId}
  `;
}

/** A member whose first purchase at `now` unlocked the gift. */
async function memberWithGift(now: Date): Promise<TestMember & { giftId: string }> {
  const member = await newMember(db.server, db.admin);
  const earned = await award(member.memberId, now);
  if (!earned.ok || !earned.welcomeGiftUnlocked) throw new Error('gift not unlocked');
  const [gift] = await giftsOf(member.memberId);
  return { ...member, giftId: gift!.id };
}

describe('welcome gift unlock (awardPoints)', () => {
  it('the first earn unlocks it, once: not again after more earns or after undoing the first', async () => {
    const base = '2027-03-01T08:00:00Z';
    const member = await newMember(db.server, db.admin);
    const first = await award(member.memberId, at(base));
    expect(first).toMatchObject({ ok: true, points: 64, welcomeGiftUnlocked: true });
    if (!first.ok) return;
    const gifts = await giftsOf(member.memberId);
    expect(gifts).toEqual([
      {
        id: expect.any(String),
        kind: 'welcome',
        reward_id: ids.croissant,
        unlocked_at: at(base),
        expires_at: at(base, 30 * 86_400),
        status: 'available',
        redemption_id: null,
        unlocked_by_entry_id: first.entryId,
      },
    ]);
    const audits = await db.admin`select details from public.audit_log where action = 'gift.unlock' and entity_id = ${gifts[0]!.id}`;
    expect(audits).toHaveLength(1);

    expect(await award(member.memberId, at(base, 180))).toMatchObject({ ok: true, welcomeGiftUnlocked: false });
    // Undo the first earn: the gift stays (decided: once per member, ever).
    const undone = await undoEarn(db.server, {
      callerUserId: ids.managerA,
      entryId: first.entryId,
      idempotencyKey: key('undo'),
      now: at(base, 200),
    });
    expect(undone.ok).toBe(true);
    expect(await award(member.memberId, at(base, 400))).toMatchObject({ ok: true, welcomeGiftUnlocked: false });
    expect(await giftsOf(member.memberId)).toHaveLength(1);
    expect((await giftsOf(member.memberId))[0]).toMatchObject({ status: 'available' });
  });

  it('only the very first earn unlocks it: a member who first bought before the gift was switched on gets none', async () => {
    const base = '2027-03-01T09:00:00Z';
    const member = await newMember(db.server, db.admin);
    await setBrandConfig(db.admin, ids.brand, {});
    const first = await award(member.memberId, at(base));
    await setBrandConfig(db.admin, ids.brand, { welcome: { rewardId: ids.croissant } });
    expect(first).toMatchObject({ ok: true, welcomeGiftUnlocked: false });
    expect(await award(member.memberId, at(base, 180))).toMatchObject({ ok: true, welcomeGiftUnlocked: false });
    expect(await giftsOf(member.memberId)).toHaveLength(0);
  });

  it('a retry of the unlocking award answers the same and adds no second gift', async () => {
    const now = new Date('2027-03-01T10:00:00Z');
    const member = await newMember(db.server, db.admin);
    const k = key('award');
    const first = await award(member.memberId, now, { idempotencyKey: k });
    expect(first).toMatchObject({ ok: true, welcomeGiftUnlocked: true });
    expect(await award(member.memberId, now, { idempotencyKey: k })).toEqual(first);
    expect(await giftsOf(member.memberId)).toHaveLength(1);
  });

  it('two first earns at the same moment unlock one gift', async () => {
    const now = new Date('2027-03-01T10:30:00Z');
    const member = await newMember(db.server, db.admin);
    const results = await Promise.all([award(member.memberId, now), award(member.memberId, now), award(member.memberId, now)]);
    expect(results.filter((r) => r.ok && r.welcomeGiftUnlocked)).toHaveLength(1);
    expect(await giftsOf(member.memberId)).toHaveLength(1);
  });

  it('a brand without welcome.rewardId has no welcome gift', async () => {
    const now = new Date('2027-03-01T11:00:00Z');
    const stranger = await newMember(db.server, db.admin, { brandSlug: 'other' });
    const result = await award(stranger.memberId, now, {
      callerUserId: ids.otherBrandDevice,
      storeId: ids.otherStore,
      employeeId: ids.otherEmployee,
      pin: pins.otherEmployee,
    });
    expect(result).toMatchObject({ ok: true, welcomeGiftUnlocked: false });
    expect(await giftsOf(stranger.memberId)).toHaveLength(0);
  });

  it("a welcome.rewardId that is not one of the brand's rewards is a setup bug: it throws and writes nothing", async () => {
    const now = new Date('2027-03-01T11:30:00Z');
    const stranger = await newMember(db.server, db.admin, { brandSlug: 'other' });
    await setBrandConfig(db.admin, ids.otherBrand, { welcome: { rewardId: ids.croissant } }); // Overoll's reward
    const input = {
      callerUserId: ids.otherBrandDevice,
      storeId: ids.otherStore,
      employeeId: ids.otherEmployee,
      pin: pins.otherEmployee,
    };
    await expect(award(stranger.memberId, now, input)).rejects.toThrow(InvalidConfigError);
    await setBrandConfig(db.admin, ids.otherBrand, {});
    expect(await ledgerCount(db.admin, stranger.memberId)).toBe(0);
  });
});

describe('redeeming the gift (createRedemption with giftId)', () => {
  it('creates a code for the gift reward with 0 points and no ledger entry; staff use it like any code', async () => {
    const base = '2027-03-02T08:00:00Z';
    const member = await memberWithGift(at(base));
    const entriesBefore = await ledgerCount(db.admin, member.memberId);
    const result = await redeemGift(member, member.giftId, at(base, 600));
    expect(result).toEqual({
      ok: true,
      redemptionId: expect.any(String),
      code: expect.stringMatching(/^[A-HJ-NP-Z2-9]{8}$/),
      rewardId: ids.croissant,
      giftId: member.giftId,
      pointsSpent: 0,
      expiresAt: at(base, 600 + 15 * 60).toISOString(),
      balance: 64,
    });
    if (!result.ok) return;
    expect(await ledgerCount(db.admin, member.memberId)).toBe(entriesBefore);
    expect(await balanceOf(db.admin, member.memberId)).toBe(64);
    const [row] = await db.admin`select gift_id, points_spent, status from public.redemptions where id = ${result.redemptionId}`;
    expect(row).toEqual({ gift_id: member.giftId, points_spent: 0, status: 'pending' });
    expect((await giftsOf(member.memberId))[0]).toMatchObject({ status: 'redeemed', redemption_id: result.redemptionId });

    const used = await use(result.code, at(base, 700));
    expect(used).toMatchObject({ ok: true, rewardId: ids.croissant, rewardNameEn: 'Croissant', pointsSpent: 0 });
    expect((await giftsOf(member.memberId))[0]).toMatchObject({ status: 'redeemed', redemption_id: result.redemptionId });
    expect(await redeemGift(member, member.giftId, at(base, 800))).toMatchObject({ ok: false, code: 'gift_used' });
    expect(await ledgerCount(db.admin, member.memberId)).toBe(entriesBefore);
  });

  it('one code per gift: a second request while the code is pending is gift_used, also when sent at once', async () => {
    const base = '2027-03-02T09:00:00Z';
    const member = await memberWithGift(at(base));
    const results = await Promise.all([1, 2, 3].map(() => redeemGift(member, member.giftId, at(base, 60))));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.code === 'gift_used')).toHaveLength(2);
    expect(await redeemGift(member, member.giftId, at(base, 120))).toMatchObject({ ok: false, code: 'gift_used' });
    const codes = await db.admin`select 1 from public.redemptions where gift_id = ${member.giftId}`;
    expect(codes).toHaveLength(1);
  });

  it('a retry with the same key returns the same code; the same key for a reward is a conflict', async () => {
    const base = '2027-03-02T09:30:00Z';
    const member = await memberWithGift(at(base));
    const k = key('gift');
    const first = await redeemGift(member, member.giftId, at(base, 60), k);
    expect(first.ok).toBe(true);
    expect(await redeemGift(member, member.giftId, at(base, 65), k)).toEqual(first);
    const asReward = await createRedemption(db.server, {
      callerUserId: member.userId,
      memberId: member.memberId,
      rewardId: ids.croissant,
      idempotencyKey: k,
      now: at(base, 70),
    });
    expect(asReward).toMatchObject({ ok: false, code: 'idempotency_conflict' });
  });

  it('cancelling the code gives the gift back (no points refund); a new code can be made', async () => {
    const base = '2027-03-02T10:00:00Z';
    const member = await memberWithGift(at(base));
    const created = await redeemGift(member, member.giftId, at(base, 60));
    if (!created.ok) throw new Error(created.code);
    const cancelled = await cancelRedemption(db.server, {
      callerUserId: member.userId,
      redemptionId: created.redemptionId,
      idempotencyKey: key('cancel'),
      now: at(base, 120),
    });
    expect(cancelled).toEqual({ ok: true, redemptionId: created.redemptionId, pointsRefunded: 0, balance: 64 });
    expect(await ledgerCount(db.admin, member.memberId, 'refund_redeem')).toBe(0);
    expect((await giftsOf(member.memberId))[0]).toMatchObject({ status: 'available', redemption_id: null });
    expect(await use(created.code, at(base, 130))).toMatchObject({ ok: false, code: 'cancelled' });
    const again = await redeemGift(member, member.giftId, at(base, 180));
    expect(again).toMatchObject({ ok: true, pointsSpent: 0 });
  });

  it('a gift code that expires unused gives the gift back (expiry job), no ledger entry', async () => {
    const base = '2027-03-02T11:00:00Z';
    const member = await memberWithGift(at(base));
    const created = await redeemGift(member, member.giftId, at(base, 60));
    if (!created.ok) throw new Error(created.code);
    const job = await expireRedemptions(db.server, { now: at(base, 60 + 15 * 60) });
    expect(job.redemptionIds).toContain(created.redemptionId);
    expect(job.giftIds).not.toContain(member.giftId);
    expect((await giftsOf(member.memberId))[0]).toMatchObject({ status: 'available', redemption_id: null });
    const [row] = await db.admin`select status from public.redemptions where id = ${created.redemptionId}`;
    expect(row!.status).toBe('expired');
    expect(await ledgerCount(db.admin, member.memberId, 'refund_redeem')).toBe(0);
    expect(await use(created.code, at(base, 60 + 16 * 60))).toMatchObject({ ok: false, code: 'expired' });
  });

  it('if the gift itself expired meanwhile, a returned code leaves it expired', async () => {
    const base = '2027-03-03T08:00:00Z';
    const giftEnds = 30 * 86_400;
    const viaJob = await memberWithGift(at(base));
    const viaCancel = await memberWithGift(at(base));
    const usedLate = await memberWithGift(at(base));
    const a = await redeemGift(viaJob, viaJob.giftId, at(base, giftEnds - 300));
    const b = await redeemGift(viaCancel, viaCancel.giftId, at(base, giftEnds - 300));
    const c = await redeemGift(usedLate, usedLate.giftId, at(base, giftEnds - 300));
    if (!a.ok || !b.ok || !c.ok) throw new Error('redeem failed');
    // A code made in time works for its 15 minutes, even past the gift's own expiry.
    expect(await use(c.code, at(base, giftEnds + 60))).toMatchObject({ ok: true, pointsSpent: 0 });
    expect((await giftsOf(usedLate.memberId))[0]).toMatchObject({ status: 'redeemed' });
    const cancelled = await cancelRedemption(db.server, {
      callerUserId: viaCancel.userId,
      redemptionId: b.redemptionId,
      idempotencyKey: key('cancel'),
      now: at(base, giftEnds + 60),
    });
    expect(cancelled).toMatchObject({ ok: true, pointsRefunded: 0 });
    expect((await giftsOf(viaCancel.memberId))[0]).toMatchObject({ status: 'expired', redemption_id: null });
    await expireRedemptions(db.server, { now: at(base, giftEnds + 15 * 60) });
    expect((await giftsOf(viaJob.memberId))[0]).toMatchObject({ status: 'expired', redemption_id: null });
    expect((await giftsOf(usedLate.memberId))[0]).toMatchObject({ status: 'redeemed' });
    expect(await redeemGift(viaCancel, viaCancel.giftId, at(base, giftEnds + 120))).toMatchObject({ ok: false, code: 'gift_expired' });
  });

  it('refuses an expired gift and marks it expired at once; the job marks the others', async () => {
    const base = '2027-03-04T08:00:00Z';
    const ends = 30 * 86_400;
    const member = await memberWithGift(at(base));
    const other = await memberWithGift(at(base));
    expect(await redeemGift(member, member.giftId, at(base, ends - 1))).toMatchObject({ ok: true });

    const late = await memberWithGift(at(base));
    expect(await redeemGift(late, late.giftId, at(base, ends))).toMatchObject({ ok: false, code: 'gift_expired' });
    expect((await giftsOf(late.memberId))[0]).toMatchObject({ status: 'expired' });
    const audits = await db.admin`select 1 from public.audit_log where action = 'gift.expire' and entity_id = ${late.giftId}`;
    expect(audits).toHaveLength(1);

    expect((await giftsOf(other.memberId))[0]).toMatchObject({ status: 'available' });
    const job = await expireRedemptions(db.server, { now: at(base, ends), batchSize: 2 });
    expect(job.giftIds).toContain(other.giftId);
    expect(job.giftIds).not.toContain(late.giftId);
    expect(job.giftsExpired).toBe(job.giftIds.length);
    expect((await giftsOf(other.memberId))[0]).toMatchObject({ status: 'expired' });
    const again = await expireRedemptions(db.server, { now: at(base, ends) });
    expect(again.giftIds).not.toContain(other.giftId);
    expect(await redeemGift(other, other.giftId, at(base, ends + 1))).toMatchObject({ ok: false, code: 'gift_expired' });
  });

  it("refuses someone else's gift, unknown gifts, and requests with both or neither of rewardId and giftId", async () => {
    const now = new Date('2027-03-05T08:00:00Z');
    const owner = await memberWithGift(now);
    const other = await newMember(db.server, db.admin);
    expect(await redeemGift(other, owner.giftId, now)).toMatchObject({ ok: false, code: 'gift_not_found' });
    expect(await redeemGift(owner, '70000000-0000-0000-0000-000000000999', now)).toMatchObject({ ok: false, code: 'gift_not_found' });
    expect(await redeemGift({ ...owner, userId: other.userId }, owner.giftId, now)).toMatchObject({ ok: false, code: 'forbidden' });
    const both = await createRedemption(db.server, {
      callerUserId: owner.userId,
      memberId: owner.memberId,
      rewardId: ids.croissant,
      giftId: owner.giftId,
      idempotencyKey: key(),
      now,
    });
    expect(both).toMatchObject({ ok: false, code: 'invalid_input' });
    const neither = await createRedemption(db.server, { callerUserId: owner.userId, memberId: owner.memberId, idempotencyKey: key(), now });
    expect(neither).toMatchObject({ ok: false, code: 'invalid_input' });
    expect((await giftsOf(owner.memberId))[0]).toMatchObject({ status: 'available' });
  });
});
