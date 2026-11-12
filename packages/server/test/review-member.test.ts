import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRedemption, prepareReviewMember, useRedemption } from '../src/index.js';
import { type TestDatabase, createTestDatabase } from './helpers/db.js';
import { balanceOf, ids, key, newMember, newUser, pins, seedWorld } from './helpers/world.js';

let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
  await seedWorld(db.admin);
});
afterAll(async () => {
  await db?.drop();
});

const now = new Date('2027-02-01T10:00:00Z');

describe('app store review account (v0.8)', () => {
  it('joins the review user once, marks it, and keeps at least 1,000 points (topped up to 1,500)', async () => {
    const userId = await newUser(db.admin);
    const first = await prepareReviewMember(db.server, { userId, email: 'AppReview@Example.com', brandSlug: 'overoll', now });
    expect(first).toMatchObject({ ok: true, created: true, pointsAdded: 1500 });
    if (!first.ok) throw new Error(first.code);
    const [member] = await db.admin<{ review_demo: boolean; first_name: string; email: string; locale: string }[]>`
      select review_demo, first_name, email, locale from public.members where id = ${first.memberId}
    `;
    expect(member).toEqual({ review_demo: true, first_name: 'App Review', email: 'appreview@example.com', locale: 'en' });
    expect(await balanceOf(db.admin, first.memberId)).toBe(1500);

    // Again the same day: nothing new.
    const again = await prepareReviewMember(db.server, { userId, email: 'appreview@example.com', brandSlug: 'overoll', now });
    expect(again).toMatchObject({ ok: true, created: false, pointsAdded: 0, memberId: first.memberId });

    // Spent below 1,000: the next day it is topped up to 1,500 again, once.
    await db.admin`
      insert into public.ledger_entries (brand_id, member_id, kind, points, reason, idempotency_key)
      values (${ids.brand}, ${first.memberId}, 'adjust', -800, 'spent in review', ${key('spend')})
    `;
    const nextDay = new Date('2027-02-02T10:00:00Z');
    expect(await prepareReviewMember(db.server, { userId, email: 'appreview@example.com', brandSlug: 'overoll', now: nextDay })).toMatchObject({
      pointsAdded: 800,
    });
    expect(await prepareReviewMember(db.server, { userId, email: 'appreview@example.com', brandSlug: 'overoll', now: nextDay })).toMatchObject({
      pointsAdded: 0,
    });
    expect(await balanceOf(db.admin, first.memberId)).toBe(1500);
  });

  it('lets the review member make a reward code but refuses it at the till', async () => {
    const userId = await newUser(db.admin);
    const prepared = await prepareReviewMember(db.server, { userId, email: 'review2@example.com', brandSlug: 'overoll', now });
    if (!prepared.ok) throw new Error(prepared.code);
    const code = await createRedemption(db.server, {
      callerUserId: userId,
      memberId: prepared.memberId,
      rewardId: ids.espresso,
      idempotencyKey: key('redeem'),
      now,
    });
    if (!code.ok) throw new Error(code.code);
    const used = await useRedemption(db.server, {
      callerUserId: ids.deviceA,
      storeId: ids.storeA,
      employeeId: ids.maria,
      pin: pins.maria,
      code: code.code,
      idempotencyKey: key('use'),
      now: new Date(now.getTime() + 60_000),
    });
    expect(used).toMatchObject({ ok: false, code: 'review_demo' });

    // An ordinary member's code still works.
    const member = await newMember(db.server, db.admin);
    await db.admin`
      insert into public.ledger_entries (brand_id, member_id, kind, points, reason, idempotency_key)
      values (${ids.brand}, ${member.memberId}, 'adjust', 500, 'test', ${key('adjust')})
    `;
    const other = await createRedemption(db.server, {
      callerUserId: member.userId,
      memberId: member.memberId,
      rewardId: ids.espresso,
      idempotencyKey: key('redeem'),
      now,
    });
    if (!other.ok) throw new Error(other.code);
    expect(
      await useRedemption(db.server, {
        callerUserId: ids.deviceA,
        storeId: ids.storeA,
        employeeId: ids.maria,
        pin: pins.maria,
        code: other.code,
        idempotencyKey: key('use'),
        now: new Date(now.getTime() + 60_000),
      }),
    ).toMatchObject({ ok: true });
  });

  it('refuses bad input and an unknown brand', async () => {
    expect(await prepareReviewMember(db.server, { userId: 'x', email: 'a@b.c', brandSlug: 'overoll' })).toMatchObject({ code: 'invalid_input' });
    const userId = await newUser(db.admin);
    expect(await prepareReviewMember(db.server, { userId, email: 'a@b.c', brandSlug: 'nope' })).toMatchObject({ code: 'brand_not_found' });
    // Two brands in this database and none named: refused rather than guessed.
    expect(await prepareReviewMember(db.server, { userId, email: 'a@b.c' })).toMatchObject({ code: 'brand_not_found' });
  });
});
