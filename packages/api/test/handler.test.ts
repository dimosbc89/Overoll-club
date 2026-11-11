import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHandler } from '../src/index.js';
import { type TestDatabase, createTestDatabase } from '../../server/test/helpers/db.js';
import { ids, key, newMember, newUser, pins, seedWorld } from '../../server/test/helpers/world.js';

let db: TestDatabase;
let handle: (req: Request) => Promise<Response>;

const SERVICE = 'service-secret';
const JOBS = 'jobs-token-from-vault';
const tokenFor = (userId: string) => `user:${userId}`;

beforeAll(async () => {
  db = await createTestDatabase();
  await seedWorld(db.admin);
  handle = createHandler({
    sql: db.server,
    authenticate: async (token) => (token.startsWith('user:') ? token.slice(5) : null),
    // Async like the Edge Function, which looks the scheduler's token up in Vault.
    isServiceToken: async (token) => token === SERVICE || token === JOBS,
    allowedOrigins: ['https://club.example'],
  });
});
afterAll(async () => {
  await db.drop();
});

function post(path: string, body: unknown, token?: string, extra: Record<string, string> = {}): Request {
  return new Request(`https://x.supabase.co${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...extra,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('HTTP layer', () => {
  it('answers CORS preflight for allowed origins only', async () => {
    const ok = await handle(
      new Request('https://x.supabase.co/api/award', { method: 'OPTIONS', headers: { origin: 'https://club.example' } }),
    );
    expect(ok.status).toBe(204);
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://club.example');
    const other = await handle(
      new Request('https://x.supabase.co/api/award', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }),
    );
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('refuses other methods, unknown routes, missing or bad tokens, non-JSON bodies', async () => {
    expect((await handle(new Request('https://x.supabase.co/api/award'))).status).toBe(405);
    expect((await handle(post('/api/nope', {}, tokenFor(ids.deviceA)))).status).toBe(404);
    expect((await handle(post('/api/award', {}))).status).toBe(401);
    expect((await handle(post('/api/award', {}, 'garbage'))).status).toBe(401);
    const text = await handle(
      new Request('https://x.supabase.co/api/award', {
        method: 'POST',
        headers: { authorization: `Bearer ${tokenFor(ids.deviceA)}`, 'content-type': 'text/plain' },
        body: 'hi',
      }),
    );
    expect(text.status).toBe(415);
    const broken = await handle(post('/api/award', '{not json', tokenFor(ids.deviceA)));
    expect(broken.status).toBe(400);
    expect(await broken.json()).toMatchObject({ ok: false, code: 'invalid_input' });
  });

  it('takes identity from the token, never from the body', async () => {
    const real = await newUser(db.admin);
    const spoofed = await newUser(db.admin);
    const res = await handle(
      post('/api/join', { brandSlug: 'overoll', confirmsMinimumAge: true, firstName: 'Anna', userId: spoofed, idempotencyKey: key() }, tokenFor(real)),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { memberId: string };
    const [row] = await db.admin<{ user_id: string }[]>`select user_id from public.members where id = ${body.memberId}`;
    expect(row?.user_id).toBe(real);
  });

  it('awards points at the till and maps business errors to status codes', async () => {
    const member = await newMember(db.server, db.admin);
    const award = (amountCents: number, device: string = ids.deviceA) =>
      handle(
        post(
          '/functions/v1/api/award',
          {
            storeId: ids.storeA,
            employeeId: ids.maria,
            pin: pins.maria,
            member: { memberId: member.memberId },
            amountCents,
            idempotencyKey: key(),
            now: '2020-01-01T00:00:00Z', // ignored: the server sets the clock
          },
          tokenFor(device),
        ),
      );

    const ok = await award(640);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true, points: 64, balance: 64 });

    const tooBig = await award(9000);
    expect(tooBig.status).toBe(422);
    expect(await tooBig.json()).toMatchObject({ ok: false, code: 'amount_over_limit' });

    const wrongStore = await award(500, ids.deviceB);
    expect(wrongStore.status).toBe(403);
    expect(await wrongStore.json()).toMatchObject({ ok: false, code: 'forbidden' });
  });

  it('runs scheduled jobs only with the service token', async () => {
    expect((await handle(post('/api/jobs/expire-redemptions', {}, tokenFor(ids.hq)))).status).toBe(403);
    const res = await handle(post('/api/jobs/expire-redemptions', {}, SERVICE));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, expired: 0, giftsExpired: 0 });
  });

  it('jobs/*: the scheduler token works like the service key; anything else is refused', async () => {
    const ok = await handle(post('/api/jobs/expire-redemptions', {}, JOBS));
    expect(ok.status).toBe(200);
    expect((await ok.json()).ok).toBe(true);
    expect((await handle(post('/api/jobs/expire-redemptions', {}, 'jobs-token-guess'))).status).toBe(403);
  });

  it('jobs/expire-points: service token only; a bad batchSize falls back to the default', async () => {
    expect((await handle(post('/api/jobs/expire-points', {}, tokenFor(ids.hq)))).status).toBe(403);
    expect((await handle(post('/api/jobs/expire-points', {}))).status).toBe(401);
    for (const body of [{}, { batchSize: 50 }, { batchSize: 0 }, { batchSize: 'x' }]) {
      const res = await handle(post('/functions/v1/api/jobs/expire-points', body, SERVICE));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, expired: 0, memberIds: [], pointsExpired: 0 });
    }
  });

  it('staff/verify-pin: the employee on success, 422 for a wrong or locked PIN, 403 for another store', async () => {
    const [row] = await db.admin<{ id: string }[]>`
      insert into public.employees (brand_id, store_id, display_name, pin_hash)
      values (${ids.brand}, ${ids.storeA}, 'Sofia', extensions.crypt('2468', extensions.gen_salt('bf')))
      returning id
    `;
    const employeeId = row!.id;
    const verify = (pin: string, device: string = ids.deviceA) =>
      handle(post('/api/staff/verify-pin', { storeId: ids.storeA, employeeId, pin }, tokenFor(device)));

    const ok = await verify('2468');
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true, employee: { id: employeeId, displayName: 'Sofia' } });
    const other = await verify('2468', ids.deviceB);
    expect(other.status).toBe(403);
    expect((await handle(post('/api/staff/verify-pin', { storeId: ids.storeA, employeeId, pin: '2468' }))).status).toBe(401);

    for (let n = 0; n < 4; n++) {
      const wrong = await verify('0000');
      expect(wrong.status).toBe(422);
      expect(await wrong.json()).toMatchObject({ ok: false, code: 'bad_pin' });
    }
    const locked = await verify('0000');
    expect(locked.status).toBe(422);
    expect(await locked.json()).toMatchObject({ ok: false, code: 'pin_locked' });
    expect(await (await verify('2468')).json()).toMatchObject({ ok: false, code: 'pin_locked' });
  });

  it('award with a receipt number, and the welcome gift redeemed through redemptions/create', async () => {
    await db.admin`update public.brands set config = ${db.admin.json({ welcome: { rewardId: ids.croissant } })} where id = ${ids.brand}`;
    try {
      const member = await newMember(db.server, db.admin);
      const awardBody = (receiptNumber: string) => ({
        storeId: ids.storeA,
        employeeId: ids.maria,
        pin: pins.maria,
        member: { memberId: member.memberId },
        amountCents: 640,
        receiptNumber,
        idempotencyKey: key(),
      });
      const first = await handle(post('/api/award', awardBody('API-1'), tokenFor(ids.deviceA)));
      expect(first.status).toBe(200);
      expect(await first.json()).toMatchObject({ ok: true, points: 64, welcomeGiftUnlocked: true });

      const other = await newMember(db.server, db.admin);
      const reused = await handle(post('/api/award', { ...awardBody('api-1'), member: { memberId: other.memberId } }, tokenFor(ids.deviceA)));
      expect(reused.status).toBe(422);
      expect(await reused.json()).toMatchObject({ ok: false, code: 'receipt_already_used' });
      const badReceipt = await handle(post('/api/award', { ...awardBody('no spaces'), member: { memberId: other.memberId } }, tokenFor(ids.deviceA)));
      expect(badReceipt.status).toBe(400);

      const [gift] = await db.admin<{ id: string }[]>`select id from public.member_gifts where member_id = ${member.memberId}`;
      const both = await handle(
        post('/api/redemptions/create', { memberId: member.memberId, giftId: gift!.id, rewardId: ids.croissant, idempotencyKey: key() }, tokenFor(member.userId)),
      );
      expect(both.status).toBe(400);
      const created = await handle(
        post('/api/redemptions/create', { memberId: member.memberId, giftId: gift!.id, idempotencyKey: key() }, tokenFor(member.userId)),
      );
      expect(created.status).toBe(200);
      expect(await created.json()).toMatchObject({ ok: true, rewardId: ids.croissant, pointsSpent: 0, balance: 64 });
      const twice = await handle(
        post('/api/redemptions/create', { memberId: member.memberId, giftId: gift!.id, idempotencyKey: key() }, tokenFor(member.userId)),
      );
      expect(twice.status).toBe(422);
      expect(await twice.json()).toMatchObject({ ok: false, code: 'gift_used' });
    } finally {
      await db.admin`update public.brands set config = '{}'::jsonb where id = ${ids.brand}`;
    }
  });
});

describe('account/delete (v0.4)', () => {
  const remove = (h: typeof handle, userId: string, body: Record<string, unknown> = { confirm: true, idempotencyKey: key() }) =>
    h(post('/functions/v1/api/account/delete', body, tokenFor(userId)));

  it('deletes the caller\'s account; the Auth admin API removes the user when the database may not', async () => {
    const deleted: string[] = [];
    let failNext = false;
    const withAdmin = createHandler({
      sql: db.server,
      authenticate: async (token) => (token.startsWith('user:') ? token.slice(5) : null),
      isServiceToken: async () => false,
      async deleteAuthUser(userId) {
        if (failNext) {
          failNext = false;
          throw new Error('auth admin API down');
        }
        deleted.push(userId);
      },
    });

    const member = await newMember(db.server, db.admin);
    const body = { confirm: true, idempotencyKey: key(), userId: ids.hq };
    const res = await remove(withAdmin, member.userId, body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, memberIds: [member.memberId], codesCancelled: 0, authUserDeleted: true });
    // Identity from the token: the HQ id in the body was dropped.
    expect(deleted).toEqual([member.userId]);
    const [row] = await db.admin`select deleted_at is not null as deleted, user_id from public.members where id = ${member.memberId}`;
    expect(row).toEqual({ deleted: true, user_id: null });

    // The admin API fails: 500, the member is already wiped, and a retry finishes the job.
    const other = await newMember(db.server, db.admin);
    failNext = true;
    const again = { confirm: true, idempotencyKey: key() };
    const failed = await remove(withAdmin, other.userId, again);
    expect(failed.status).toBe(500);
    expect(await failed.json()).toMatchObject({ ok: false, code: 'internal_error' });
    const retry = await remove(withAdmin, other.userId, again);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual({ ok: true, memberIds: [], codesCancelled: 0, authUserDeleted: true });
    expect(deleted).toEqual([member.userId, other.userId]);
  });

  it('needs confirm: true and refuses staff accounts', async () => {
    const member = await newMember(db.server, db.admin);
    const unconfirmed = await remove(handle, member.userId, { idempotencyKey: key() });
    expect(unconfirmed.status).toBe(400);
    expect(await unconfirmed.json()).toMatchObject({ ok: false, code: 'invalid_input' });
    const staff = await remove(handle, ids.deviceA);
    expect(staff.status).toBe(403);
    expect(await staff.json()).toMatchObject({ ok: false, code: 'forbidden' });
    expect((await handle(post('/api/account/delete', { confirm: true, idempotencyKey: key() }))).status).toBe(401);
  });

  it('a deleted member scanned at the till is member_deleted (422)', async () => {
    const member = await newMember(db.server, db.admin);
    expect((await remove(handle, member.userId)).status).toBe(200);
    const scan = await handle(post('/api/scan', { storeId: ids.storeA, memberCode: member.memberCode }, tokenFor(ids.deviceA)));
    expect(scan.status).toBe(422);
    expect(await scan.json()).toMatchObject({ ok: false, code: 'member_deleted' });
  });
});

describe('scan with a typed member code (v0.4)', () => {
  it('finds the member from the code under the QR', async () => {
    const member = await newMember(db.server, db.admin, { firstName: 'Anna' });
    const typed = `${member.memberCode.slice(0, 4).toLowerCase()} ${member.memberCode.slice(4)}`;
    const res = await handle(post('/api/scan', { storeId: ids.storeA, memberCode: typed }, tokenFor(ids.deviceA)));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, memberId: member.memberId, firstName: 'Anna' });
    const unknown = await handle(post('/api/scan', { storeId: ids.storeA, memberCode: 'ZZZZ2222' }, tokenFor(ids.deviceA)));
    expect(unknown.status).toBe(422);
    expect(await unknown.json()).toMatchObject({ ok: false, code: 'member_not_found' });
  });
});

describe('error copy (data/copy/errors.*.json)', () => {
  it('has the same codes in Greek and English, including every v0.2 code', async () => {
    const { readFileSync } = await import('node:fs');
    const load = (lang: string) =>
      JSON.parse(readFileSync(new URL(`../../../data/copy/errors.${lang}.json`, import.meta.url), 'utf8')) as Record<string, string>;
    const el = load('el');
    const en = load('en');
    expect(Object.keys(el).sort()).toEqual(Object.keys(en).sort());
    for (const code of ['gift_not_found', 'gift_used', 'gift_expired', 'receipt_already_used', 'pin_locked']) {
      expect(el[code], code).toBeTruthy();
      expect(en[code], code).toBeTruthy();
    }
  });
});

describe('back office routes (v0.5)', () => {
  const made: string[] = [];
  let office: typeof handle;
  beforeAll(() => {
    office = createHandler({
      sql: db.server,
      authenticate: async (token) => (token.startsWith('user:') ? token.slice(5) : null),
      isServiceToken: async () => false,
      async ensureAuthUser(email) {
        made.push(email);
        return newUser(db.admin);
      },
    });
  });

  it('HQ adds a cashier, gives a new PIN and switches them off; the PIN never comes back', async () => {
    const created = await office(
      post('/api/staff/employees/create', { storeId: ids.storeA, displayName: 'Eva', pin: '2580', idempotencyKey: key() }, tokenFor(ids.hq)),
    );
    expect(created.status).toBe(200);
    const body = (await created.json()) as { ok: true; employee: { id: string } };
    expect(body).toMatchObject({ ok: true, employee: { displayName: 'Eva', active: true } });
    expect(JSON.stringify(body)).not.toContain('2580');

    const weak = await office(post('/api/staff/employees/update', { employeeId: body.employee.id, pin: '1111' }, tokenFor(ids.hq)));
    expect(weak.status).toBe(422);
    expect(await weak.json()).toMatchObject({ ok: false, code: 'pin_too_simple' });
    const off = await office(post('/api/staff/employees/update', { employeeId: body.employee.id, active: false }, tokenFor(ids.managerA)));
    expect(await off.json()).toMatchObject({ ok: true, employee: { active: false } });
    // A till device cannot manage cashiers.
    const device = await office(post('/api/staff/employees/update', { employeeId: body.employee.id, active: true }, tokenFor(ids.deviceA)));
    expect(device.status).toBe(403);
  });

  it('HQ adds and removes a till device by email; the caller comes from the token', async () => {
    const added = await office(
      post('/api/staff/add', { role: 'store_device', storeId: ids.storeA, email: 'Till-A9@example.com', callerUserId: ids.platform }, tokenFor(ids.hq)),
    );
    expect(added.status).toBe(200);
    const body = (await added.json()) as { ok: true; staff: { id: string } };
    expect(body).toMatchObject({ ok: true, created: true, staff: { role: 'store_device', email: 'till-a9@example.com' } });
    expect(made).toEqual(['till-a9@example.com']);
    const byManager = await office(post('/api/staff/add', { role: 'store_device', storeId: ids.storeA, email: 'm@example.com' }, tokenFor(ids.managerA)));
    expect(byManager.status).toBe(403);
    expect(made).toEqual(['till-a9@example.com']);
    const removed = await office(post('/api/staff/remove', { staffId: body.staff.id }, tokenFor(ids.hq)));
    expect(await removed.json()).toMatchObject({ ok: true, removed: { id: body.staff.id } });
    // Without the Auth admin API, staff/add says so.
    const plain = await handle(post('/api/staff/add', { role: 'store_device', storeId: ids.storeA, email: 'x@example.com' }, tokenFor(ids.hq)));
    expect(plain.status).toBe(501);
    expect(await plain.json()).toMatchObject({ ok: false, code: 'not_configured' });
  });

  it('HQ corrects points with a reason; others cannot', async () => {
    const member = await newMember(db.server, db.admin);
    const adjust = (userId: string, points: number) =>
      office(post('/api/points/adjust', { memberId: member.memberId, points, reason: 'Missed scan', idempotencyKey: key() }, tokenFor(userId)));
    const ok = await adjust(ids.hq, 75);
    expect(await ok.json()).toMatchObject({ ok: true, points: 75, balance: 75 });
    const member2 = await adjust(member.userId, 1000);
    expect(member2.status).toBe(422);
    expect(await member2.json()).toMatchObject({ ok: false, code: 'member_not_found' });
  });
});
