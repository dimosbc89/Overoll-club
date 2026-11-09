import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type AwardPointsInput, type UndoEarnInput, awardPoints, undoEarn } from '../src/index.js';
import { type TestDatabase, createTestDatabase } from './helpers/db.js';
import {
  at,
  balanceOf,
  givePoints,
  ids,
  key,
  ledgerCount,
  newMember,
  pins,
  rotatingToken,
  seedWorld,
  walletToken,
} from './helpers/world.js';

let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
  await seedWorld(db.admin);
});
afterAll(async () => {
  await db?.drop();
});

type AwardOverrides = Partial<AwardPointsInput> & Pick<AwardPointsInput, 'member' | 'now'>;
const award = (o: AwardOverrides) =>
  awardPoints(db.server, {
    callerUserId: ids.deviceA,
    storeId: ids.storeA,
    employeeId: ids.maria,
    pin: pins.maria,
    amountCents: 640,
    idempotencyKey: key('award'),
    ...o,
  });

const undo = (o: Partial<UndoEarnInput> & Pick<UndoEarnInput, 'entryId' | 'now'>) =>
  undoEarn(db.server, {
    callerUserId: ids.deviceA,
    employee: { employeeId: ids.maria, pin: pins.maria },
    idempotencyKey: key('undo'),
    ...o,
  });

async function earnedEntry(entryId: string) {
  const [row] = await db.admin`
    select kind, points, amount_cents, multiplier_pct, bonus_multiplier_pct, store_id, employee_id, created_by, created_at,
      reverses_entry_id::text, idempotency_key
    from public.ledger_entries where id = ${entryId}
  `;
  return row!;
}

describe('awardPoints', () => {
  it('awards the exact points per tier (spec example: €6.40 → 64 / 80 / 96)', async () => {
    const now = new Date('2027-01-14T08:30:00Z');
    for (const [tier, points, pct] of [['classic', 64, 100], ['gold', 80, 125], ['club', 96, 150]] as const) {
      const member = await newMember(db.server, db.admin, { tier });
      const result = await award({ member: { memberId: member.memberId }, now });
      expect(result).toEqual({
        ok: true,
        entryId: expect.any(String),
        memberId: member.memberId,
        points,
        balance: points,
        tier,
        tierChanged: false,
        welcomeGiftUnlocked: false, // this brand has no welcome gift configured
      });
      if (!result.ok) return;
      expect(await earnedEntry(result.entryId)).toMatchObject({
        kind: 'earn',
        points,
        amount_cents: 640,
        multiplier_pct: pct,
        bonus_multiplier_pct: 100,
        store_id: ids.storeA,
        employee_id: ids.maria,
        created_by: ids.deviceA,
        created_at: now,
      });
      const [m] = await db.admin`select last_purchase_at from public.members where id = ${member.memberId}`;
      expect(m!.last_purchase_at).toEqual(now);
      const audits = await db.admin`select employee_id, details from public.audit_log where action = 'points.award' and entity_id = ${result.entryId}`;
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({ employee_id: ids.maria, details: { memberId: member.memberId, points, amountCents: 640 } });
    }
  });

  it('takes the member from a scanned app or Wallet code', async () => {
    const now = new Date('2027-01-14T09:00:00Z');
    const member = await newMember(db.server, db.admin);
    const byApp = await award({ member: { token: await rotatingToken(db.admin, member.memberId, now) }, now });
    expect(byApp).toMatchObject({ ok: true, memberId: member.memberId, points: 64 });
    const later = at('2027-01-14T09:00:00Z', 300);
    const byWallet = await award({ member: { token: await walletToken(db.admin, member.memberId) }, now: later });
    expect(byWallet).toMatchObject({ ok: true, memberId: member.memberId, balance: 128 });
    const stale = await award({ member: { token: await rotatingToken(db.admin, member.memberId, now) }, now: at('2027-01-14T09:00:00Z', 600) });
    expect(stale).toMatchObject({ ok: false, code: 'expired_token' });
  });

  it('refuses amounts above €80 and amounts that are not whole positive cents', async () => {
    const now = new Date('2027-01-14T10:00:00Z');
    const member = await newMember(db.server, db.admin);
    const m = { memberId: member.memberId };
    expect(await award({ member: m, now, amountCents: 8001 })).toMatchObject({ ok: false, code: 'amount_over_limit' });
    expect(await award({ member: m, now, amountCents: 0 })).toMatchObject({ ok: false, code: 'amount_not_positive' });
    expect(await award({ member: m, now, amountCents: 6.4 })).toMatchObject({ ok: false, code: 'amount_not_integer' });
    expect(await award({ member: m, now, amountCents: 5 })).toMatchObject({ ok: false, code: 'amount_too_small' });
    expect(await ledgerCount(db.admin, member.memberId)).toBe(0);
    expect(await award({ member: m, now, amountCents: 8000 })).toMatchObject({ ok: true, points: 800 });
  });

  it('refuses a second earn for the same member within 2 minutes, in any store', async () => {
    const base = '2027-01-14T11:00:00Z';
    const member = await newMember(db.server, db.admin);
    const m = { memberId: member.memberId };
    expect((await award({ member: m, now: at(base) })).ok).toBe(true);
    const otherStore = { callerUserId: ids.deviceB, storeId: ids.storeB, employeeId: ids.nikos, pin: pins.nikos };
    expect(await award({ member: m, now: at(base, 119), ...otherStore })).toMatchObject({ ok: false, code: 'too_soon_after_last_earn' });
    expect(await award({ member: m, now: at(base, 120), ...otherStore })).toMatchObject({ ok: true });
  });

  it('allows 5 earns per Athens calendar day: the 6th waits for midnight in Athens, not UTC', async () => {
    // 21:00Z = 23:00 in Athens (UTC+2 in January). Athens midnight is 22:00Z,
    // while the UTC day only ends two hours later.
    const member = await newMember(db.server, db.admin);
    const m = { memberId: member.memberId };
    for (let n = 0; n < 5; n++) {
      expect((await award({ member: m, now: at('2027-01-14T21:00:00Z', n * 180) })).ok).toBe(true);
    }
    expect(await award({ member: m, now: new Date('2027-01-14T21:30:00Z') })).toMatchObject({ ok: false, code: 'daily_earn_limit_reached' });
    expect(await award({ member: m, now: new Date('2027-01-14T21:59:59Z') })).toMatchObject({ ok: false, code: 'daily_earn_limit_reached' });
    expect(await award({ member: m, now: new Date('2027-01-14T22:00:00Z') })).toMatchObject({ ok: true });
    expect(await ledgerCount(db.admin, member.memberId, 'earn')).toBe(6);
  });

  it('checks the cashier: PIN, store and active employee', async () => {
    const now = new Date('2027-01-14T12:00:00Z');
    const member = await newMember(db.server, db.admin);
    const m = { memberId: member.memberId };
    expect(await award({ member: m, now, pin: '9999' })).toMatchObject({ ok: false, code: 'bad_pin' });
    expect(await award({ member: m, now, employeeId: ids.nikos, pin: pins.nikos })).toMatchObject({ ok: false, code: 'employee_not_found' });
    expect(await award({ member: m, now, employeeId: ids.retiredA, pin: pins.retiredA })).toMatchObject({ ok: false, code: 'employee_not_found' });
    expect(await award({ member: m, now, employeeId: ids.otherEmployee, pin: pins.otherEmployee })).toMatchObject({ ok: false, code: 'employee_not_found' });
    expect(await ledgerCount(db.admin, member.memberId)).toBe(0);
  });

  it('checks the caller: device or manager of that store, open store', async () => {
    const now = new Date('2027-01-14T12:30:00Z');
    const member = await newMember(db.server, db.admin);
    const m = { memberId: member.memberId };
    expect(await award({ member: m, now, callerUserId: ids.deviceB })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await award({ member: m, now, storeId: ids.storeB, employeeId: ids.nikos, pin: pins.nikos })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await award({ member: m, now, callerUserId: ids.hq })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await award({ member: m, now, callerUserId: member.userId })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(
      await award({ member: m, now, callerUserId: ids.deviceClosed, storeId: ids.closedStore, employeeId: ids.closedEmployee, pin: pins.closedEmployee }),
    ).toMatchObject({ ok: false, code: 'store_inactive' });
    expect(await ledgerCount(db.admin, member.memberId)).toBe(0);
    expect(await award({ member: m, now, callerUserId: ids.managerA })).toMatchObject({ ok: true, points: 64 });
  });

  it("refuses another brand's member, by id or by code", async () => {
    const now = new Date('2027-01-14T13:00:00Z');
    const stranger = await newMember(db.server, db.admin, { brandSlug: 'other' });
    expect(await award({ member: { memberId: stranger.memberId }, now })).toMatchObject({ ok: false, code: 'member_not_found' });
    const token = await rotatingToken(db.admin, stranger.memberId, now);
    expect(await award({ member: { token }, now })).toMatchObject({ ok: false, code: 'member_not_found' });
    const ours = await newMember(db.server, db.admin);
    expect(
      await award({
        member: { memberId: ours.memberId },
        now,
        callerUserId: ids.otherBrandDevice,
        storeId: ids.otherStore,
        employeeId: ids.otherEmployee,
        pin: pins.otherEmployee,
      }),
    ).toMatchObject({ ok: false, code: 'member_not_found' });
    expect(await ledgerCount(db.admin, stranger.memberId)).toBe(0);
    expect(await ledgerCount(db.admin, ours.memberId)).toBe(0);
  });

  it('a retry with the same key returns the same entry and adds nothing', async () => {
    const now = new Date('2027-01-14T14:00:00Z');
    const member = await newMember(db.server, db.admin);
    const input = { member: { memberId: member.memberId }, now, idempotencyKey: key('retry') };
    const first = await award(input);
    expect(first.ok).toBe(true);
    expect(await award(input)).toEqual(first);
    // Even a minute later, when a new earn would be "too soon", the retry answers the same.
    expect(await award({ ...input, now: at('2027-01-14T14:00:00Z', 60) })).toEqual(first);
    expect(await ledgerCount(db.admin, member.memberId)).toBe(1);
    expect(await balanceOf(db.admin, member.memberId)).toBe(64);
    expect(await award({ ...input, amountCents: 700 })).toMatchObject({ ok: false, code: 'idempotency_conflict' });
    expect(
      await award({ ...input, callerUserId: ids.deviceB, storeId: ids.storeB, employeeId: ids.nikos, pin: pins.nikos }),
    ).toMatchObject({ ok: false, code: 'idempotency_conflict' });
    expect(await ledgerCount(db.admin, member.memberId)).toBe(1);
  });

  it('moves up to Gold at 1,500 earned points, then earns ×1.25; adjustments do not count', async () => {
    const base = '2027-01-14T15:00:00Z';
    const member = await newMember(db.server, db.admin);
    const m = { memberId: member.memberId };
    await givePoints(db.admin, member.memberId, 5000); // HQ adjustment: balance, not tier
    expect(await award({ member: m, now: at(base, 0), amountCents: 8000 })).toMatchObject({ points: 800, tier: 'classic', tierChanged: false });
    expect(await award({ member: m, now: at(base, 180), amountCents: 6999 })).toMatchObject({ points: 699, tier: 'classic', tierChanged: false });
    expect(await award({ member: m, now: at(base, 360), amountCents: 10 })).toMatchObject({
      ok: true,
      points: 1,
      tier: 'gold',
      tierChanged: true,
      balance: 6500,
    });
    expect(await award({ member: m, now: at(base, 540), amountCents: 640 })).toMatchObject({ points: 80, tier: 'gold', tierChanged: false });
    const [row] = await db.admin`select tier from public.members where id = ${member.memberId}`;
    expect(row!.tier).toBe('gold');
  });
});

describe('undoEarn', () => {
  it('a store device undoes within 10 minutes, with the cashier PIN', async () => {
    const base = '2027-01-15T08:00:00Z';
    const member = await newMember(db.server, db.admin);
    const earned = await award({ member: { memberId: member.memberId }, now: at(base) });
    if (!earned.ok) throw new Error(earned.code);
    const result = await undo({ entryId: earned.entryId, now: at(base, 600) });
    expect(result).toEqual({
      ok: true,
      entryId: expect.any(String),
      reversedEntryId: earned.entryId,
      memberId: member.memberId,
      points: -64,
      balance: 0,
    });
    if (!result.ok) return;
    expect(await earnedEntry(result.entryId)).toMatchObject({
      kind: 'reverse',
      points: -64,
      reverses_entry_id: earned.entryId,
      store_id: ids.storeA,
      employee_id: ids.maria,
      created_by: ids.deviceA,
      created_at: at(base, 600),
    });
    const audits = await db.admin`select 1 from public.audit_log where action = 'points.undo' and entity_id = ${result.entryId}`;
    expect(audits).toHaveLength(1);
  });

  it('after 10 minutes the device is refused, the store manager can still undo', async () => {
    const base = '2027-01-15T09:00:00Z';
    const member = await newMember(db.server, db.admin);
    const earned = await award({ member: { memberId: member.memberId }, now: at(base) });
    if (!earned.ok) throw new Error(earned.code);
    expect(await undo({ entryId: earned.entryId, now: at(base, 601) })).toMatchObject({ ok: false, code: 'undo_window_passed' });
    expect(await balanceOf(db.admin, member.memberId)).toBe(64);
    const byManager = await undo({ entryId: earned.entryId, now: at(base, 86_400), callerUserId: ids.managerA, employee: null });
    expect(byManager).toMatchObject({ ok: true, points: -64, balance: 0 });
  });

  it('a second undo is already_undone; a retry with the same key returns the first result', async () => {
    const base = '2027-01-15T10:00:00Z';
    const member = await newMember(db.server, db.admin);
    const earned = await award({ member: { memberId: member.memberId }, now: at(base) });
    if (!earned.ok) throw new Error(earned.code);
    const input = { entryId: earned.entryId, now: at(base, 60), idempotencyKey: key('undo') };
    const first = await undo(input);
    expect(first.ok).toBe(true);
    // The retry arrives after the window: still the same answer, nothing written.
    expect(await undo({ ...input, now: at(base, 3600) })).toEqual(first);
    expect(await undo({ entryId: earned.entryId, now: at(base, 120) })).toMatchObject({ ok: false, code: 'already_undone' });
    expect(await undo({ entryId: earned.entryId, now: at(base, 120), callerUserId: ids.hq, employee: null })).toMatchObject({
      ok: false,
      code: 'already_undone',
    });
    expect(await ledgerCount(db.admin, member.memberId, 'reverse')).toBe(1);
    expect(await balanceOf(db.admin, member.memberId)).toBe(0);
  });

  it('checks who undoes: PIN for devices, own store only, HQ and platform any time, earns only', async () => {
    const base = '2027-01-15T11:00:00Z';
    const member = await newMember(db.server, db.admin);
    const earned = await award({ member: { memberId: member.memberId }, now: at(base) });
    if (!earned.ok) throw new Error(earned.code);
    const entryId = earned.entryId;
    const now = at(base, 30);
    expect(await undo({ entryId, now, employee: null })).toMatchObject({ ok: false, code: 'employee_required' });
    expect(await undo({ entryId, now, employee: { employeeId: ids.maria, pin: '0000' } })).toMatchObject({ ok: false, code: 'bad_pin' });
    expect(await undo({ entryId, now, callerUserId: ids.deviceB, employee: { employeeId: ids.nikos, pin: pins.nikos } })).toMatchObject({
      ok: false,
      code: 'forbidden',
    });
    expect(await undo({ entryId, now, callerUserId: ids.nobody, employee: null })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await undo({ entryId, now, callerUserId: ids.otherBrandDevice, employee: null })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await undo({ entryId: '999999999', now })).toMatchObject({ ok: false, code: 'not_found' });
    expect(await undo({ entryId: 'abc', now })).toMatchObject({ ok: false, code: 'invalid_input' });
    expect(await undo({ entryId, now: at(base, 30 * 86_400), callerUserId: ids.platform, employee: null })).toMatchObject({ ok: true });

    await givePoints(db.admin, member.memberId, 100);
    const [adjust] = await db.admin<{ id: string }[]>`
      select id from public.ledger_entries where member_id = ${member.memberId} and kind = 'adjust'
    `;
    expect(await undo({ entryId: adjust!.id, now, callerUserId: ids.hq, employee: null })).toMatchObject({ ok: false, code: 'not_undoable' });
  });

  it('an undone earn does not count towards the fraud limits (so typos can be fixed at once)', async () => {
    const base = '2027-01-15T12:00:00Z';
    const member = await newMember(db.server, db.admin);
    const m = { memberId: member.memberId };
    const typo = await award({ member: m, now: at(base), amountCents: 6400 });
    if (!typo.ok) throw new Error(typo.code);
    expect((await undo({ entryId: typo.entryId, now: at(base, 20) })).ok).toBe(true);
    expect(await award({ member: m, now: at(base, 40), amountCents: 640 })).toMatchObject({ ok: true, balance: 64 });
    // 4 more earns make 5 counted today (6 earn entries, one undone); the next one is refused.
    for (let n = 1; n <= 4; n++) expect((await award({ member: m, now: at(base, 40 + n * 180) })).ok).toBe(true);
    expect(await award({ member: m, now: at(base, 40 + 5 * 180) })).toMatchObject({ ok: false, code: 'daily_earn_limit_reached' });
  });

  it('keeps the tier when an earn is undone', async () => {
    const base = '2027-01-15T13:00:00Z';
    const member = await newMember(db.server, db.admin);
    const m = { memberId: member.memberId };
    const big = await award({ member: m, now: at(base), amountCents: 8000 });
    await award({ member: m, now: at(base, 180), amountCents: 7000 });
    const [row] = await db.admin`select tier from public.members where id = ${member.memberId}`;
    expect(row!.tier).toBe('gold');
    if (!big.ok) throw new Error(big.code);
    expect(await undo({ entryId: big.entryId, now: at(base, 240) })).toMatchObject({ ok: true, balance: 700 });
    const [after] = await db.admin`select tier from public.members where id = ${member.memberId}`;
    expect(after!.tier).toBe('gold');
  });
});
