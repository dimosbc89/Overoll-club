import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AwardPointsInput,
  awardPoints,
  createRedemption,
  deleteMember,
  expirePoints,
  expireRedemptions,
  joinMember,
  resolveMemberToken,
  useRedemption,
} from '../src/index.js';
import { type TestDatabase, createTestDatabase } from './helpers/db.js';
import {
  type TestMember,
  at,
  balanceOf,
  givePoints,
  ids,
  key,
  ledgerCount,
  newMember,
  newUser,
  pins,
  rotatingToken,
  seedWorld,
  setBrandConfig,
  walletToken,
} from './helpers/world.js';

let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
  await seedWorld(db.admin);
  await setBrandConfig(db.admin, ids.brand, { welcome: { rewardId: ids.croissant } });
});
afterAll(async () => {
  await db?.drop();
});

const T0 = '2027-02-01T09:00:00Z';

/** In production the server connects as `postgres`, which may delete auth users; here the service role stands in. */
async function allowAuthUserDeletion(allowed: boolean): Promise<void> {
  if (allowed) await db.admin`grant select, delete on auth.users to service_role`;
  else await db.admin`revoke select, delete on auth.users from service_role`;
}

const remove = (callerUserId: string, now: Date, o: Record<string, unknown> = {}) =>
  deleteMember(db.server, { callerUserId, confirm: true, idempotencyKey: key('delete'), now, ...o });

const award = (memberId: string, now: Date, o: Partial<AwardPointsInput> = {}) =>
  awardPoints(db.server, {
    callerUserId: ids.deviceA,
    storeId: ids.storeA,
    employeeId: ids.maria,
    pin: pins.maria,
    member: { memberId },
    amountCents: 6000,
    idempotencyKey: key('award'),
    now,
    ...o,
  });

const redeem = (member: TestMember, rewardId: string, now: Date) =>
  createRedemption(db.server, { callerUserId: member.userId, memberId: member.memberId, rewardId, idempotencyKey: key('redeem'), now });

/** A member who joined with every personal field, bought twice, used one code and has one pending. */
async function busyMember(email: string) {
  const userId = await newUser(db.admin);
  const joined = await joinMember(db.server, {
    userId,
    brandSlug: 'overoll',
    confirmsMinimumAge: true,
    firstName: 'Eleni',
    lastName: 'Papadopoulou',
    email,
    phone: `+30694${Math.floor(1_000_000 + Math.random() * 8_999_999)}`,
    birthday: '1990-05-17',
    consents: { email: true, sms: true, push: true },
    idempotencyKey: key('join'),
    now: at(T0),
  });
  if (!joined.ok) throw new Error(joined.code);
  const member: TestMember = { userId, memberId: joined.memberId, memberCode: joined.memberCode };
  expect(await award(member.memberId, at(T0, 60))).toMatchObject({ ok: true, points: 600, welcomeGiftUnlocked: true });
  expect(await award(member.memberId, at(T0, 600))).toMatchObject({ ok: true, points: 600 });
  const used = await redeem(member, ids.espresso, at(T0, 700));
  if (!used.ok) throw new Error(used.code);
  const usedAtTill = await useRedemption(db.server, {
    callerUserId: ids.deviceA,
    storeId: ids.storeA,
    employeeId: ids.maria,
    pin: pins.maria,
    code: used.code,
    idempotencyKey: key('use'),
    now: at(T0, 710),
  });
  expect(usedAtTill).toMatchObject({ ok: true, memberFirstName: 'Eleni' });
  const pending = await redeem(member, ids.croissant, at(T0, 800));
  if (!pending.ok) throw new Error(pending.code);
  return { member, pendingId: pending.redemptionId, usedId: used.redemptionId };
}

describe('deleteMember', () => {
  it('wipes the member, keeps the ledger, cancels the pending code without a refund and deletes the auth user', async () => {
    await allowAuthUserDeletion(true);
    const { member, pendingId, usedId } = await busyMember('eleni.delete@example.com');
    const token = await rotatingToken(db.admin, member.memberId, at(T0, 900));
    const wallet = await walletToken(db.admin, member.memberId);
    const balanceBefore = await balanceOf(db.admin, member.memberId);
    expect(balanceBefore).toBe(1200 - 300 - 500);
    const entriesBefore = await ledgerCount(db.admin, member.memberId);

    const now = at(T0, 900);
    expect(await remove(member.userId, now)).toEqual({
      ok: true,
      memberIds: [member.memberId],
      codesCancelled: 1,
      authUserDeleted: true,
    });

    const [m] = await db.admin`
      select user_id, first_name, last_name, email, phone, birthday, referral_code, consent_email, consent_sms,
        consent_push, deleted_at, member_code, tier, last_purchase_at
      from public.members where id = ${member.memberId}
    `;
    expect(m).toMatchObject({
      user_id: null,
      first_name: '',
      last_name: null,
      email: null,
      phone: null,
      birthday: null,
      referral_code: null,
      consent_email: false,
      consent_sms: false,
      consent_push: false,
      deleted_at: now,
      member_code: member.memberCode,
      last_purchase_at: at(T0, 600),
    });
    expect((await db.admin`select 1 from public.member_secrets where member_id = ${member.memberId}`).length).toBe(0);
    expect((await db.admin`select 1 from auth.users where id = ${member.userId}`).length).toBe(0);

    // The pending code is cancelled, its points are not returned; the used one stays used.
    const codes = await db.admin<{ id: string; status: string; cancelled_at: Date | null }[]>`
      select id, status, cancelled_at from public.redemptions where member_id = ${member.memberId} order by created_at
    `;
    expect(codes).toEqual([
      { id: usedId, status: 'used', cancelled_at: null },
      { id: pendingId, status: 'cancelled', cancelled_at: now },
    ]);
    expect(await ledgerCount(db.admin, member.memberId, 'refund_redeem')).toBe(0);
    expect(await ledgerCount(db.admin, member.memberId)).toBe(entriesBefore);
    expect(await balanceOf(db.admin, member.memberId)).toBe(balanceBefore);

    // The unused welcome gift closes with the account.
    const [gift] = await db.admin`select status, redemption_id from public.member_gifts where member_id = ${member.memberId}`;
    expect(gift).toEqual({ status: 'expired', redemption_id: null });

    const [auditRow] = await db.admin`
      select actor_user_id, details from public.audit_log where action = 'member.delete' and entity_id = ${member.memberId}
    `;
    expect(auditRow).toEqual({
      actor_user_id: member.userId,
      details: { codesCancelled: 1, giftsClosed: 1, pointsLeft: balanceBefore },
    });

    // No personal data left in stored results: the member's own calls are gone, the till's keep no name.
    expect((await db.admin`select 1 from private.idempotency_keys where actor_user_id = ${member.userId}`).length).toBe(0);
    const names = await db.admin<{ operation: string; name: string }[]>`
      select operation, coalesce(result ->> 'memberFirstName', result ->> 'firstName') as name
      from private.idempotency_keys where result ->> 'memberId' = ${member.memberId}
        and (result ? 'memberFirstName' or result ? 'firstName')
    `;
    expect(names).toEqual([{ operation: 'use_redemption', name: '' }]);

    // The card, a screenshot, the Wallet pass and the typed code no longer work at the till.
    const scan = (o: { token?: string; memberCode?: string }) =>
      resolveMemberToken(db.server, { callerUserId: ids.deviceA, storeId: ids.storeA, now, ...o });
    expect(await scan({ token })).toMatchObject({ ok: false, code: 'member_deleted' });
    expect(await scan({ token: wallet })).toMatchObject({ ok: false, code: 'member_deleted' });
    expect(await scan({ memberCode: member.memberCode })).toMatchObject({ ok: false, code: 'member_deleted' });
    expect(await award(member.memberId, at(T0, 1000))).toMatchObject({ ok: false, code: 'member_deleted' });
    expect(await award(member.memberId, at(T0, 1000), { member: { token } })).toMatchObject({ ok: false, code: 'member_deleted' });
    expect(await redeem(member, ids.espresso, at(T0, 1000))).toMatchObject({ ok: false, code: 'member_deleted' });
  });

  it('answers ok again on a retry, with nothing left to do', async () => {
    await allowAuthUserDeletion(true);
    const member = await newMember(db.server, db.admin);
    const first = await remove(member.userId, at(T0));
    expect(first).toMatchObject({ ok: true, memberIds: [member.memberId] });
    const auditsAfterFirst = (await db.admin`select 1 from public.audit_log where action = 'member.delete'`).length;
    expect(await remove(member.userId, at(T0, 5), { idempotencyKey: 'same-key-or-not' })).toEqual({
      ok: true,
      memberIds: [],
      codesCancelled: 0,
      authUserDeleted: true,
    });
    expect((await db.admin`select 1 from public.audit_log where action = 'member.delete'`).length).toBe(auditsAfterFirst);
  });

  it('lets the same email join again later as a brand new member', async () => {
    await allowAuthUserDeletion(true);
    const email = 'comeback@example.com';
    const { member } = await busyMember(email);
    expect(await remove(member.userId, at(T0, 900))).toMatchObject({ ok: true, authUserDeleted: true });

    // Signing in again with the same email creates a new auth user.
    const userId = await newUser(db.admin);
    const again = await joinMember(db.server, {
      userId,
      brandSlug: 'overoll',
      confirmsMinimumAge: true,
      firstName: 'Eleni',
      email: 'Comeback@Example.com',
      idempotencyKey: key('join'),
      now: at(T0, 2000),
    });
    expect(again).toMatchObject({ ok: true, created: true });
    if (!again.ok) return;
    expect(again.memberId).not.toBe(member.memberId);
    expect(again.memberCode).not.toBe(member.memberCode);
    expect(await balanceOf(db.admin, again.memberId)).toBe(0);
    // A new member: the welcome gift comes again with the first purchase (rejoining decision).
    expect(await award(again.memberId, at(T0, 2100))).toMatchObject({ ok: true, welcomeGiftUnlocked: true });
  });

  it('leaves the auth user to the Edge Function when the database role may not delete it', async () => {
    await allowAuthUserDeletion(false);
    const member = await newMember(db.server, db.admin);
    await givePoints(db.admin, member.memberId, 400);
    expect(await redeem(member, ids.espresso, at(T0))).toMatchObject({ ok: true });
    expect(await remove(member.userId, at(T0, 60))).toEqual({
      ok: true,
      memberIds: [member.memberId],
      codesCancelled: 1,
      authUserDeleted: false,
    });
    // Everything else happened in the same transaction.
    const [m] = await db.admin`select user_id, first_name, deleted_at from public.members where id = ${member.memberId}`;
    expect(m).toEqual({ user_id: null, first_name: '', deleted_at: at(T0, 60) });
    expect((await db.admin`select 1 from auth.users where id = ${member.userId}`).length).toBe(1);
    // A retry still asks for the auth user to be deleted.
    expect(await remove(member.userId, at(T0, 70))).toMatchObject({ ok: true, memberIds: [], authUserDeleted: false });
  });

  it('needs the confirmation, refuses staff accounts and deletes a user who never joined', async () => {
    await allowAuthUserDeletion(true);
    const member = await newMember(db.server, db.admin);
    expect(await remove(member.userId, at(T0), { confirm: false })).toMatchObject({ ok: false, code: 'invalid_input' });
    expect(await remove(member.userId, at(T0), { confirm: 'yes' })).toMatchObject({ ok: false, code: 'invalid_input' });
    expect(await remove(member.userId, at(T0), { idempotencyKey: '' })).toMatchObject({ ok: false, code: 'invalid_input' });
    expect(await remove('not-a-uuid', at(T0))).toMatchObject({ ok: false, code: 'invalid_input' });
    const [still] = await db.admin`select deleted_at from public.members where id = ${member.memberId}`;
    expect(still).toEqual({ deleted_at: null });

    for (const staff of [ids.deviceA, ids.managerA, ids.hq, ids.platform]) {
      expect(await remove(staff, at(T0)), staff).toMatchObject({ ok: false, code: 'forbidden' });
      expect((await db.admin`select 1 from auth.users where id = ${staff}`).length).toBe(1);
    }

    const signedInOnly = await newUser(db.admin);
    expect(await remove(signedInOnly, at(T0))).toEqual({ ok: true, memberIds: [], codesCancelled: 0, authUserDeleted: true });
    expect((await db.admin`select 1 from auth.users where id = ${signedInOnly}`).length).toBe(0);
  });

  it('a deleted member is skipped by the code job and their balance still expires', async () => {
    await allowAuthUserDeletion(true);
    const member = await newMember(db.server, db.admin);
    await givePoints(db.admin, member.memberId, 800);
    const code = await redeem(member, ids.espresso, at(T0));
    expect(code.ok).toBe(true);
    await remove(member.userId, at(T0, 30));
    // The cancelled code is not refunded later by the expiry job.
    expect(await expireRedemptions(db.server, { now: at(T0, 3600) })).toMatchObject({ ok: true });
    expect(await ledgerCount(db.admin, member.memberId, 'refund_redeem')).toBe(0);
    expect(await balanceOf(db.admin, member.memberId)).toBe(500);
    // 12 months after joining (no purchase), the rest expires like anyone's.
    const job = await expirePoints(db.server, { now: new Date('2028-01-02T09:00:00Z') });
    expect(job.memberIds).toContain(member.memberId);
    expect(await balanceOf(db.admin, member.memberId)).toBe(0);
  });

  it('is safe next to a redemption made at the same moment', async () => {
    await allowAuthUserDeletion(true);
    for (let round = 0; round < 5; round++) {
      const member = await newMember(db.server, db.admin);
      await givePoints(db.admin, member.memberId, 400);
      const now = at(T0, round);
      const [redeemed, deleted] = await Promise.all([redeem(member, ids.espresso, now), remove(member.userId, now)]);
      expect(deleted).toMatchObject({ ok: true, memberIds: [member.memberId] });
      // Either the code came first (and was cancelled, points kept) or the deletion did.
      if (redeemed.ok) {
        expect(deleted).toMatchObject({ codesCancelled: 1 });
        expect(await balanceOf(db.admin, member.memberId)).toBe(100);
      } else {
        expect(redeemed.code).toBe('member_deleted');
        expect(await balanceOf(db.admin, member.memberId)).toBe(400);
      }
      const pending = await db.admin`select 1 from public.redemptions where member_id = ${member.memberId} and status = 'pending'`;
      expect(pending.length).toBe(0);
    }
  });
});
