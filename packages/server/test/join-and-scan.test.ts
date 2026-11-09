import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { joinMember, resolveMemberToken } from '../src/index.js';
import { type TestDatabase, createTestDatabase } from './helpers/db.js';
import { at, givePoints, ids, key, newMember, newUser, rotatingToken, seedWorld, walletToken } from './helpers/world.js';

let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
  await seedWorld(db.admin);
});
afterAll(async () => {
  await db?.drop();
});

const now = new Date('2027-01-14T09:00:00Z');

describe('joinMember', () => {
  it('creates the member and its QR secret, and audits it', async () => {
    const userId = await newUser(db.admin);
    const result = await joinMember(db.server, {
      userId,
      brandSlug: 'overoll',
      firstName: '  Eleni ',
      lastName: 'Papadopoulou',
      email: 'Eleni@Example.com',
      phone: '+30 694 123 4567',
      birthday: '1990-05-17',
      joinedStoreCode: 'chalandri',
      consents: { email: true, push: true },
      idempotencyKey: key(),
      now,
    });
    expect(result).toMatchObject({ ok: true, firstName: 'Eleni', tier: 'classic', locale: 'el', created: true });
    if (!result.ok) return;
    expect(result.memberCode).toMatch(/^[A-Z2-9]{8}$/);
    const [m] = await db.admin`
      select m.joined_store_id, m.phone, m.birthday::text, m.consent_email, m.consent_sms, m.consent_push,
        m.consents_updated_at, m.created_at, (select count(*)::int from public.member_secrets s where s.member_id = m.id) as secrets,
        (select count(*)::int from public.audit_log a where a.entity_id = m.id::text and a.action = 'member.join') as audits
      from public.members m where m.id = ${result.memberId}
    `;
    expect(m).toMatchObject({
      joined_store_id: ids.storeA,
      phone: '+306941234567',
      birthday: '1990-05-17',
      consent_email: true,
      consent_sms: false,
      consent_push: true,
      consents_updated_at: now,
      created_at: now,
      secrets: 1,
      audits: 1,
    });
  });

  it('joining twice returns the same member (same key: same result; new key: created false)', async () => {
    const userId = await newUser(db.admin);
    const input = { userId, brandSlug: 'overoll', firstName: 'Kostas', locale: 'en' as const, idempotencyKey: key(), now };
    const first = await joinMember(db.server, input);
    const retry = await joinMember(db.server, input);
    const again = await joinMember(db.server, { ...input, idempotencyKey: key() });
    expect(first.ok && first.created).toBe(true);
    expect(retry).toEqual(first);
    expect(again).toEqual({ ...first, created: false });
    const [{ n }] = (await db.admin`select count(*)::int as n from public.members where user_id = ${userId}`) as unknown as [{ n: number }];
    expect(n).toBe(1);
  });

  it('refuses a reused key with a different request', async () => {
    const userId = await newUser(db.admin);
    const k = key();
    await joinMember(db.server, { userId, brandSlug: 'overoll', firstName: 'A', idempotencyKey: k, now });
    const other = await joinMember(db.server, { userId, brandSlug: 'overoll', firstName: 'B', idempotencyKey: k, now });
    expect(other).toMatchObject({ ok: false, code: 'idempotency_conflict' });
  });

  it('validates input and references', async () => {
    const userId = await newUser(db.admin);
    const base = { userId, brandSlug: 'overoll', firstName: 'Maria', idempotencyKey: key(), now };
    expect(await joinMember(db.server, { ...base, firstName: '   ' })).toMatchObject({ ok: false, code: 'invalid_input' });
    expect(await joinMember(db.server, { ...base, userId: 'nope' })).toMatchObject({ ok: false, code: 'invalid_input' });
    expect(await joinMember(db.server, { ...base, birthday: '1990-02-30' })).toMatchObject({ ok: false, code: 'invalid_input' });
    expect(await joinMember(db.server, { ...base, email: 'not-an-email' })).toMatchObject({ ok: false, code: 'invalid_input' });
    expect(await joinMember(db.server, { ...base, brandSlug: 'nope' })).toMatchObject({ ok: false, code: 'brand_not_found' });
    expect(await joinMember(db.server, { ...base, joinedStoreCode: 'closed' })).toMatchObject({ ok: false, code: 'store_not_found' });
    expect(await joinMember(db.server, { ...base, referralCode: 'ZZZZZZZZ' })).toMatchObject({ ok: false, code: 'referral_not_found' });
  });

  it('links a referral and refuses an email or phone already used in the brand', async () => {
    const referrer = await newMember(db.server, db.admin);
    const [{ referral_code }] = (await db.admin`select referral_code from public.members where id = ${referrer.memberId}`) as unknown as [{ referral_code: string }];
    await db.admin`update public.members set email = 'taken@example.com', phone = '+306900000001' where id = ${referrer.memberId}`;

    const userId = await newUser(db.admin);
    const base = { userId, brandSlug: 'overoll', firstName: 'Nikos', now };
    expect(await joinMember(db.server, { ...base, email: 'TAKEN@example.com', idempotencyKey: key() })).toMatchObject({ ok: false, code: 'email_taken' });
    expect(await joinMember(db.server, { ...base, phone: '+306900000001', idempotencyKey: key() })).toMatchObject({ ok: false, code: 'phone_taken' });
    const joined = await joinMember(db.server, { ...base, referralCode: referral_code.toLowerCase(), idempotencyKey: key() });
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;
    const [m] = await db.admin`select referred_by from public.members where id = ${joined.memberId}`;
    expect(m!.referred_by).toBe(referrer.memberId);
  });

  it('keeps brands apart: the same user can join another brand', async () => {
    const member = await newMember(db.server, db.admin);
    const other = await joinMember(db.server, { userId: member.userId, brandSlug: 'other', firstName: 'Eleni', idempotencyKey: key(), now });
    expect(other).toMatchObject({ ok: true, created: true });
    expect(other.ok && other.memberId).not.toBe(member.memberId);
  });
});

describe('resolveMemberToken', () => {
  it('resolves the rotating app code to name, tier and balance', async () => {
    const member = await newMember(db.server, db.admin, { firstName: 'Sofia', tier: 'gold' });
    await givePoints(db.admin, member.memberId, 420);
    const token = await rotatingToken(db.admin, member.memberId, now);
    const result = await resolveMemberToken(db.server, { callerUserId: ids.deviceA, storeId: ids.storeA, token, now });
    expect(result).toEqual({
      ok: true,
      memberId: member.memberId,
      memberCode: member.memberCode,
      firstName: 'Sofia',
      tier: 'gold',
      balance: 420,
    });
    // Clock drift of one step on either side is fine.
    const drift = await resolveMemberToken(db.server, { callerUserId: ids.deviceA, storeId: ids.storeA, token, now: at('2027-01-14T09:00:00Z', 30) });
    expect(drift.ok).toBe(true);
  });

  it('resolves the Wallet code until the pass is reissued', async () => {
    const member = await newMember(db.server, db.admin);
    const token = await walletToken(db.admin, member.memberId);
    const input = { callerUserId: ids.deviceA, storeId: ids.storeA, token, now };
    expect(await resolveMemberToken(db.server, input)).toMatchObject({ ok: true, memberId: member.memberId });
    await db.admin`update public.member_secrets set pass_version = pass_version + 1 where member_id = ${member.memberId}`;
    expect(await resolveMemberToken(db.server, input)).toMatchObject({ ok: false, code: 'old_pass' });
  });

  it('reports stale screenshots, garbage and forged codes', async () => {
    const member = await newMember(db.server, db.admin);
    const token = await rotatingToken(db.admin, member.memberId, now);
    const scan = (t: string, when = now) => resolveMemberToken(db.server, { callerUserId: ids.deviceA, storeId: ids.storeA, token: t, now: when });
    expect(await scan(token, at('2027-01-14T09:00:00Z', 5 * 60))).toMatchObject({ ok: false, code: 'expired_token' });
    expect(await scan('hello')).toMatchObject({ ok: false, code: 'invalid_token' });
    expect(await scan(`OC1.${member.memberCode}.00000000`)).toMatchObject({ ok: false, code: 'invalid_token' });
    expect(await scan('OC1.ZZZZZZZZ.12345678')).toMatchObject({ ok: false, code: 'member_not_found' });
  });

  it("does not find another brand's member", async () => {
    const stranger = await newMember(db.server, db.admin, { brandSlug: 'other' });
    const token = await rotatingToken(db.admin, stranger.memberId, now);
    expect(await resolveMemberToken(db.server, { callerUserId: ids.deviceA, storeId: ids.storeA, token, now })).toMatchObject({
      ok: false,
      code: 'member_not_found',
    });
  });

  it('lets devices and managers of the store, HQ and platform admins scan; nobody else', async () => {
    const member = await newMember(db.server, db.admin);
    const token = await rotatingToken(db.admin, member.memberId, now);
    const scan = (callerUserId: string, storeId: string = ids.storeA) => resolveMemberToken(db.server, { callerUserId, storeId, token, now });
    for (const caller of [ids.deviceA, ids.managerA, ids.hq, ids.platform]) {
      expect((await scan(caller)).ok, caller).toBe(true);
    }
    expect(await scan(ids.deviceB)).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await scan(ids.nobody)).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await scan(member.userId)).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await scan(ids.otherBrandDevice)).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await scan(ids.deviceA, '20000000-0000-0000-0000-000000000999')).toMatchObject({ ok: false, code: 'forbidden' });
  });
});
