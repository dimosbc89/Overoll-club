import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type ExpoPushMessage,
  type ExpoPushTicket,
  type PushServices,
  awardPoints,
  createRedemption,
  deleteMember,
  expireRedemptions,
  pushReminders,
  registerPushDevice,
  sendPushMessage,
  sendPushes,
  undoEarn,
  unregisterPushDevice,
} from '../src/index.js';
import { type TestDatabase, createTestDatabase } from './helpers/db.js';
import { at, givePoints, ids, key, newMember, newUser, pins, seedWorld, setBrandConfig } from './helpers/world.js';

let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
  await seedWorld(db.admin);
});
afterAll(async () => {
  await db?.drop();
});

let tokenCounter = 0;
const newToken = () => `ExponentPushToken[test${++tokenCounter}-${Math.random().toString(36).slice(2, 10)}]`;

const names = (el: string, en = el) => ({ el, en });
const brands = {
  overoll: {
    programName: 'Overoll Club',
    tiers: { classic: names('Classic'), gold: names('Gold'), club: names('Club') },
  },
};

/** A fake Expo: records what was sent; tokens in `gone` answer DeviceNotRegistered. */
function fakeExpo(options: { gone?: string[]; down?: boolean } = {}) {
  const sent: ExpoPushMessage[] = [];
  const services: PushServices = {
    brands,
    async sendExpo(messages) {
      if (options.down) throw new Error('unreachable');
      sent.push(...messages);
      return messages.map(
        (m): ExpoPushTicket =>
          options.gone?.includes(m.to)
            ? { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } }
            : { status: 'ok', id: `ticket-${m.to}` },
      );
    },
  };
  return { services, sent, to: (token: string) => sent.filter((m) => m.to === token) };
}

/** A member with one registered phone. */
async function memberWithPhone(options: Parameters<typeof newMember>[2] = {}) {
  const member = await newMember(db.server, db.admin, options);
  const token = newToken();
  const registered = await registerPushDevice(db.server, { callerUserId: member.userId, token, platform: 'ios' });
  expect(registered).toEqual({ ok: true, registered: true });
  return { ...member, token };
}

const award = (memberId: string, now: Date, amountCents = 640) =>
  awardPoints(db.server, {
    callerUserId: ids.deviceA,
    storeId: ids.storeA,
    employeeId: ids.maria,
    pin: pins.maria,
    member: { memberId },
    amountCents,
    idempotencyKey: key('award'),
    now,
  });

const outbox = async (memberId: string) =>
  db.admin<{ kind: string; outcome: string | null; sent_at: Date | null; send_after: Date; attempts: number }[]>`
    select kind, outcome, sent_at, send_after, attempts from public.push_outbox where member_id = ${memberId} order by id
  `;

describe('push devices (push/register, push/unregister)', () => {
  it('accepts Expo tokens of members only', async () => {
    const member = await newMember(db.server, db.admin);
    expect(await registerPushDevice(db.server, { callerUserId: member.userId, token: 'not-a-token', platform: 'ios' })).toMatchObject({
      ok: false,
      code: 'invalid_input',
    });
    expect(
      await registerPushDevice(db.server, { callerUserId: member.userId, token: newToken(), platform: 'web' as never }),
    ).toMatchObject({ ok: false, code: 'invalid_input' });
    const stranger = await newUser(db.admin);
    expect(await registerPushDevice(db.server, { callerUserId: stranger, token: newToken(), platform: 'android' })).toMatchObject({
      ok: false,
      code: 'member_not_found',
    });
  });

  it('moves a phone to whoever signed in last, and forgets it on sign-out', async () => {
    const first = await memberWithPhone();
    const second = await newMember(db.server, db.admin);
    expect(await registerPushDevice(db.server, { callerUserId: second.userId, token: first.token, platform: 'android' })).toMatchObject({
      ok: true,
    });
    const rows = await db.admin<{ member_id: string; platform: string }[]>`
      select member_id, platform from public.push_devices where token = ${first.token}
    `;
    expect(rows).toEqual([{ member_id: second.memberId, platform: 'android' }]);
    // The first member can't remove what is no longer theirs.
    expect(await unregisterPushDevice(db.server, { callerUserId: first.userId, token: first.token })).toEqual({ ok: true, removed: 0 });
    expect(await unregisterPushDevice(db.server, { callerUserId: second.userId, token: first.token })).toEqual({ ok: true, removed: 1 });
  });
});

describe('points added at the till', () => {
  const base = '2027-02-01T10:00:00Z';

  it('queues nothing for a member without a phone', async () => {
    const member = await newMember(db.server, db.admin);
    expect(await award(member.memberId, at(base))).toMatchObject({ ok: true });
    expect(await outbox(member.memberId)).toEqual([]);
  });

  it('waits a minute, then says the points and the new balance in the member’s language', async () => {
    const member = await memberWithPhone();
    expect(await award(member.memberId, at(base))).toMatchObject({ ok: true, points: 64 });
    const [row] = await outbox(member.memberId);
    expect(row).toMatchObject({ kind: 'earn', sent_at: null });
    expect(row!.send_after.getTime()).toBe(at(base, 60).getTime());

    const expo = fakeExpo();
    await sendPushes(db.server, expo.services, { now: at(base, 30) });
    expect(expo.to(member.token)).toEqual([]);

    await sendPushes(db.server, expo.services, { now: at(base, 61) });
    expect(expo.to(member.token)).toEqual([
      {
        to: member.token,
        title: 'Overoll Club',
        body: '+64 πόντοι στο Chalandri. Σύνολο: 64. Ευχαριστούμε!',
        data: { kind: 'earn', screen: 'card' },
        sound: 'default',
        channelId: 'default',
        priority: 'high',
      },
    ]);
    expect(await outbox(member.memberId)).toMatchObject([{ outcome: 'sent' }]);
    // Sent once only.
    await sendPushes(db.server, expo.services, { now: at(base, 120) });
    expect(expo.to(member.token)).toHaveLength(1);
  });

  it('English members get English', async () => {
    const member = await memberWithPhone();
    await db.admin`update public.members set locale = 'en' where id = ${member.memberId}`;
    await givePoints(db.admin, member.memberId, 1500);
    await award(member.memberId, at(base));
    const expo = fakeExpo();
    await sendPushes(db.server, expo.services, { now: at(base, 61) });
    expect(expo.to(member.token)[0]).toMatchObject({
      title: 'Overoll Club',
      body: '+64 points at Chalandri. Total: 1,564. Thank you!',
    });
  });

  it('sends nothing when the cashier undid the purchase within the minute', async () => {
    const member = await memberWithPhone();
    const earned = await award(member.memberId, at(base));
    if (!earned.ok) throw new Error(earned.code);
    const undone = await undoEarn(db.server, {
      callerUserId: ids.deviceA,
      employee: { employeeId: ids.maria, pin: pins.maria },
      entryId: earned.entryId,
      idempotencyKey: key('undo'),
      now: at(base, 20),
    });
    expect(undone).toMatchObject({ ok: true });
    const expo = fakeExpo();
    await sendPushes(db.server, expo.services, { now: at(base, 61) });
    expect(expo.to(member.token)).toEqual([]);
    expect(await outbox(member.memberId)).toMatchObject([{ outcome: 'skipped' }]);
  });

  it('announces a reward that just came within reach', async () => {
    const member = await memberWithPhone();
    await givePoints(db.admin, member.memberId, 250);
    await award(member.memberId, at(base)); // 250 + 64 = 314: the espresso (300) is now affordable
    const expo = fakeExpo();
    await sendPushes(db.server, expo.services, { now: at(base, 61) });
    expect(expo.to(member.token)[0]).toMatchObject({
      title: 'Overoll Club',
      body: 'Έχεις αρκετούς πόντους για δώρο: Espresso. Πέρνα να το πάρεις!',
      data: { kind: 'earn', screen: 'rewards' },
    });
  });

  it('announces a new tier with the brand’s tier name and today’s numbers', async () => {
    const member = await memberWithPhone();
    await db.admin`
      insert into public.ledger_entries (brand_id, member_id, kind, points, reason, idempotency_key, created_at)
      values (${ids.brand}, ${member.memberId}, 'bonus', 1450, 'test', ${key('bonus')}, ${at(base, -3600)})
    `;
    expect(await award(member.memberId, at(base))).toMatchObject({ ok: true, tier: 'gold', tierChanged: true });
    const expo = fakeExpo();
    await sendPushes(db.server, expo.services, { now: at(base, 61) });
    expect(expo.to(member.token)[0]).toMatchObject({
      title: 'Overoll Club',
      body: 'Ανέβηκες στο Gold! Τώρα παίρνεις 25% περισσότερους πόντους και δώρα με 20% λιγότερους.',
      data: { kind: 'earn', screen: 'card' },
    });
  });

  it('announces the welcome gift on the first purchase', async () => {
    await setBrandConfig(db.admin, ids.brand, { welcome: { rewardId: ids.croissant } });
    try {
      const member = await memberWithPhone();
      expect(await award(member.memberId, at(base))).toMatchObject({ ok: true, welcomeGiftUnlocked: true });
      const expo = fakeExpo();
      await sendPushes(db.server, expo.services, { now: at(base, 61) });
      expect(expo.to(member.token)[0]).toMatchObject({
        title: 'Overoll Club',
        body: 'Καλή αρχή! Το δώρο καλωσορίσματος σε περιμένει κερασμένο στα Δώρα σου: Κρουασάν.',
        data: { kind: 'earn', screen: 'rewards' },
      });
    } finally {
      await setBrandConfig(db.admin, ids.brand, {});
    }
  });
});

describe('the sender', () => {
  const base = '2027-03-01T10:00:00Z';

  it('without push set up claims nothing', async () => {
    const member = await memberWithPhone();
    await award(member.memberId, at(base));
    expect(await sendPushes(db.server, undefined, { now: at(base, 61) })).toMatchObject({ ok: true, sent: 0 });
    expect(await outbox(member.memberId)).toMatchObject([{ sent_at: null, attempts: 0 }]);
  });

  it('removes devices Expo no longer knows, and tries again later when Expo is down', async () => {
    const member = await memberWithPhone();
    const second = newToken();
    await registerPushDevice(db.server, { callerUserId: member.userId, token: second, platform: 'android' });
    await award(member.memberId, at(base, 200));

    const down = fakeExpo({ down: true });
    await sendPushes(db.server, down.services, { now: at(base, 261) });
    expect(await outbox(member.memberId)).toMatchObject([{ sent_at: null, attempts: 1 }]);

    const expo = fakeExpo({ gone: [member.token] });
    const result = await sendPushes(db.server, expo.services, { now: at(base, 262) });
    expect(result.devicesRemoved).toBeGreaterThanOrEqual(1);
    expect(expo.to(second)).toHaveLength(1);
    expect(await outbox(member.memberId)).toMatchObject([{ outcome: 'sent', attempts: 2 }]);
    const left = await db.admin<{ token: string }[]>`select token from public.push_devices where member_id = ${member.memberId}`;
    expect(left).toEqual([{ token: second }]);
  });

  it('gives up after five tries', async () => {
    const member = await memberWithPhone();
    await award(member.memberId, at(base, 400));
    const down = fakeExpo({ down: true });
    for (let n = 0; n < 5; n++) await sendPushes(db.server, down.services, { now: at(base, 461 + n) });
    expect(await outbox(member.memberId)).toMatchObject([{ outcome: 'failed', attempts: 5 }]);
  });
});

describe('codes that expired unused', () => {
  it('tells the member the points are back', async () => {
    const base = '2027-04-01T10:00:00Z';
    const member = await memberWithPhone();
    await givePoints(db.admin, member.memberId, 400);
    const code = await createRedemption(db.server, {
      callerUserId: member.userId,
      memberId: member.memberId,
      rewardId: ids.espresso,
      idempotencyKey: key('redeem'),
      now: at(base),
    });
    expect(code).toMatchObject({ ok: true });
    await expireRedemptions(db.server, { now: at(base, 16 * 60) });
    const expo = fakeExpo();
    await sendPushes(db.server, expo.services, { now: at(base, 16 * 60 + 1) });
    expect(expo.to(member.token)[0]).toMatchObject({
      title: 'Overoll Club',
      body: 'Ο κωδικός δώρου έληξε, αλλά μην ανησυχείς: οι 300 πόντοι γύρισαν στην κάρτα σου.',
      data: { kind: 'code_expired', screen: 'rewards' },
    });
  });
});

describe('points-expiry reminders (jobs/push-reminders)', () => {
  // Members join on 2027-01-01 08:00Z and never buy: the points expire on 2028-01-01 08:00Z.
  const thirtyDaysBefore = new Date('2027-12-01T08:30:00Z');

  it('queues the 30-day reminder once and says when and how many', async () => {
    const member = await memberWithPhone();
    await givePoints(db.admin, member.memberId, 120);
    const nobody = await newMember(db.server, db.admin); // points but no phone
    await givePoints(db.admin, nobody.memberId, 120);

    const first = await pushReminders(db.server, { now: thirtyDaysBefore });
    expect(first.queued).toBeGreaterThanOrEqual(1);
    await pushReminders(db.server, { now: new Date(thirtyDaysBefore.getTime() + 3600_000) });
    expect(await outbox(member.memberId)).toHaveLength(1);
    expect(await outbox(nobody.memberId)).toEqual([]);

    const expo = fakeExpo();
    await sendPushes(db.server, expo.services, { now: thirtyDaysBefore });
    expect(expo.to(member.token)[0]).toMatchObject({
      title: 'Overoll Club',
      body: 'Οι 120 πόντοι σου λήγουν σε 30 μέρες. Μία αγορά τους κρατάει για άλλους 12 μήνες.',
      data: { kind: 'points_expiring', screen: 'card' },
    });
  });

  it('drops a reminder when a purchase moved the date before it went out', async () => {
    const member = await memberWithPhone();
    await givePoints(db.admin, member.memberId, 120);
    await pushReminders(db.server, { now: thirtyDaysBefore });
    await db.admin`update public.members set last_purchase_at = ${thirtyDaysBefore} where id = ${member.memberId}`;
    const expo = fakeExpo();
    await sendPushes(db.server, expo.services, { now: thirtyDaysBefore });
    expect(expo.to(member.token)).toEqual([]);
    expect(await outbox(member.memberId)).toMatchObject([{ outcome: 'skipped' }]);
  });
});

describe('HQ messages (messages/send)', () => {
  const now = new Date('2027-05-01T09:00:00Z');
  const text = { titleEl: 'Νέο κρουασάν', bodyEl: 'Δοκίμασέ το αυτή την εβδομάδα.', titleEn: 'New croissant', bodyEn: 'Try it this week.' };

  it('only HQ of the brand (or the platform) can send', async () => {
    for (const callerUserId of [ids.deviceA, ids.managerA, ids.nobody]) {
      expect(await sendPushMessage(db.server, { callerUserId, brandId: ids.brand, ...text, dryRun: true })).toMatchObject({
        ok: false,
        code: 'forbidden',
      });
    }
    expect(
      await sendPushMessage(db.server, { callerUserId: ids.hq, brandId: ids.brand, titleEl: '', bodyEl: 'x', dryRun: true }),
    ).toMatchObject({ ok: false, code: 'invalid_input' });
    expect(
      await sendPushMessage(db.server, { callerUserId: ids.hq, brandId: ids.brand, ...text, titleEn: null, dryRun: true }),
    ).toMatchObject({ ok: false, code: 'invalid_input' });
  });

  it('reaches members who said yes to offers, in their language; once per key', async () => {
    const yes = await memberWithPhone();
    const english = await memberWithPhone();
    const no = await memberWithPhone();
    await db.admin`update public.members set consent_push = true where id in ${db.admin([yes.memberId, english.memberId])}`;
    await db.admin`update public.members set locale = 'en' where id = ${english.memberId}`;

    const preview = await sendPushMessage(db.server, { callerUserId: ids.hq, brandId: ids.brand, ...text, dryRun: true });
    expect(preview).toMatchObject({ ok: true, campaignId: null });
    const expected = (preview as { recipients: number }).recipients;
    expect(expected).toBeGreaterThanOrEqual(2);

    const idempotencyKey = key('message');
    const sent = await sendPushMessage(db.server, { callerUserId: ids.hq, brandId: ids.brand, ...text, idempotencyKey, now });
    expect(sent).toMatchObject({ ok: true, recipients: expected });
    expect(await sendPushMessage(db.server, { callerUserId: ids.hq, brandId: ids.brand, ...text, idempotencyKey, now })).toEqual(sent);
    expect(await outbox(no.memberId)).toEqual([]);

    const expo = fakeExpo();
    await sendPushes(db.server, expo.services, { now });
    expect(expo.to(yes.token)[0]).toMatchObject({ title: 'Νέο κρουασάν', body: 'Δοκίμασέ το αυτή την εβδομάδα.' });
    expect(expo.to(english.token)[0]).toMatchObject({ title: 'New croissant', body: 'Try it this week.' });
    const [campaign] = await db.admin<{ recipients: number }[]>`
      select recipients from public.push_campaigns where id = ${(sent as { campaignId: string }).campaignId}
    `;
    expect(campaign!.recipients).toBe(expected);
  });

  it('skips a member who withdrew consent before it went out', async () => {
    const member = await memberWithPhone();
    await db.admin`update public.members set consent_push = true where id = ${member.memberId}`;
    await sendPushMessage(db.server, { callerUserId: ids.platform, brandId: ids.brand, ...text, idempotencyKey: key('message'), now });
    await db.admin`update public.members set consent_push = false where id = ${member.memberId}`;
    const expo = fakeExpo();
    await sendPushes(db.server, expo.services, { now });
    expect(expo.to(member.token)).toEqual([]);
  });
});

describe('account deletion', () => {
  it('forgets the phones and drops what was still waiting', async () => {
    const member = await memberWithPhone();
    await award(member.memberId, new Date('2027-06-01T10:00:00Z'));
    const deleted = await deleteMember(db.server, {
      callerUserId: member.userId,
      confirm: true,
      idempotencyKey: key('delete'),
      now: new Date('2027-06-01T10:00:30Z'),
    });
    expect(deleted).toMatchObject({ ok: true });
    expect(await db.admin`select 1 from public.push_devices where member_id = ${member.memberId}`).toHaveLength(0);
    expect(await outbox(member.memberId)).toEqual([]);
  });
});
