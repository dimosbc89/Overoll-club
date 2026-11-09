import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHandler } from '../src/index.js';
import { type TestDatabase, createTestDatabase } from '../../server/test/helpers/db.js';
import { ids, key, newMember, newUser, pins, seedWorld } from '../../server/test/helpers/world.js';

let db: TestDatabase;
let handle: (req: Request) => Promise<Response>;

const SERVICE = 'service-secret';
const tokenFor = (userId: string) => `user:${userId}`;

beforeAll(async () => {
  db = await createTestDatabase();
  await seedWorld(db.admin);
  handle = createHandler({
    sql: db.server,
    authenticate: async (token) => (token.startsWith('user:') ? token.slice(5) : null),
    isServiceToken: (token) => token === SERVICE,
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
      post('/api/join', { brandSlug: 'overoll', firstName: 'Anna', userId: spoofed, idempotencyKey: key() }, tokenFor(real)),
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
    expect(await res.json()).toMatchObject({ ok: true, expired: 0 });
  });
});
