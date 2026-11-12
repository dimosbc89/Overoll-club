import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deleteMember, reviewTiers } from '../src/index.js';
import { type TestDatabase, createTestDatabase } from './helpers/db.js';
import { type TestMember, key, newMember, seedWorld } from './helpers/world.js';

let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
  await seedWorld(db.admin);
});
afterAll(async () => {
  await db?.drop();
});

const t = (iso: string) => new Date(iso);
const run = (iso: string, batchSize?: number) => reviewTiers(db.server, { now: t(iso), ...(batchSize ? { batchSize } : {}) });

/** A member who joined at `joinedIso`, in `tier`, with tier points earned at the given times. */
async function memberJoined(joinedIso: string, tier: 'classic' | 'gold' | 'club', earned: [string, number][] = []): Promise<TestMember> {
  const member = await newMember(db.server, db.admin, { tier });
  await db.admin`update public.members set created_at = ${t(joinedIso)} where id = ${member.memberId}`;
  for (const [iso, points] of earned) {
    await db.admin`
      insert into public.ledger_entries (brand_id, member_id, kind, points, reason, idempotency_key, created_at)
      select brand_id, id, 'bonus', ${points}, 'test', ${key('bonus')}, ${t(iso)} from public.members where id = ${member.memberId}
    `;
  }
  return member;
}

async function state(memberId: string) {
  const [row] = await db.admin<{ tier: string; tier_reviewed_at: Date | null; tier_review_on: string | null }[]>`
    select tier, tier_reviewed_at, tier_review_on::text from public.members where id = ${memberId}
  `;
  return row!;
}

describe('reviewTiers (jobs/review-tiers)', () => {
  it('on the anniversary: drops one level at most, records the review, and runs once', async () => {
    const club = await memberJoined('2027-01-05T09:30:00Z', 'club', [['2027-02-01T10:00:00Z', 500]]);

    const early = await run('2028-01-05T09:29:59Z');
    expect(early.changedMemberIds).not.toContain(club.memberId);
    expect(await state(club.memberId)).toMatchObject({ tier: 'club', tier_reviewed_at: null });

    const due = await run('2028-01-05T09:30:00Z');
    expect(due.changedMemberIds).toContain(club.memberId);
    expect(await state(club.memberId)).toEqual({
      tier: 'gold', // 500 points qualify for classic, but one level a year
      tier_reviewed_at: t('2028-01-05T09:30:00Z'),
      tier_review_on: '2029-01-05',
    });
    const [log] = await db.admin<{ details: Record<string, unknown> }[]>`
      select details from public.audit_log where action = 'member.tier_review' and entity_id = ${club.memberId}
    `;
    expect(log!.details).toMatchObject({ from: 'club', to: 'gold', pointsEarned: 500 });

    // Again the next day, or twice the same day: nothing more until the next anniversary.
    expect((await run('2028-01-06T00:00:00Z')).changedMemberIds).not.toContain(club.memberId);
    expect((await state(club.memberId)).tier).toBe('gold');
    await run('2029-01-05T09:30:00Z');
    expect(await state(club.memberId)).toMatchObject({ tier: 'classic', tier_review_on: '2030-01-05' });
  });

  it('keeps the tier when the last 12 months still qualify; a review without change is recorded too', async () => {
    const gold = await memberJoined('2027-03-10T12:00:00Z', 'gold', [
      ['2027-04-01T10:00:00Z', 900], // older than 12 months at the review: does not count
      ['2027-09-01T10:00:00Z', 800],
      ['2028-02-01T10:00:00Z', 800],
    ]);
    const result = await run('2028-03-11T01:00:00Z');
    expect(result.changedMemberIds).not.toContain(gold.memberId);
    expect(await state(gold.memberId)).toEqual({ tier: 'gold', tier_reviewed_at: t('2028-03-10T12:00:00Z'), tier_review_on: '2029-03-10' });
    const logs = await db.admin`select 1 from public.audit_log where action = 'member.tier_review' and entity_id = ${gold.memberId}`;
    expect(logs).toHaveLength(0);
  });

  it('the next review date is in Athens time; deleted members and first-year members are left alone', async () => {
    // 23:30 Athens on 31 Jan = 21:30 UTC: the review day is 31 January there.
    const late = await memberJoined('2027-01-31T21:30:00Z', 'gold');
    const fresh = await memberJoined('2027-12-01T10:00:00Z', 'gold');
    const gone = await memberJoined('2027-01-02T10:00:00Z', 'gold');
    const deleted = await deleteMember(db.server, { callerUserId: gone.userId, confirm: true, idempotencyKey: key('delete'), now: t('2027-06-01T00:00:00Z') });
    expect(deleted.ok).toBe(true);

    await run('2028-02-01T00:00:00Z');
    expect(await state(late.memberId)).toMatchObject({ tier: 'classic', tier_review_on: '2029-01-31' });
    expect(await state(fresh.memberId)).toMatchObject({ tier: 'gold', tier_reviewed_at: null });
    expect(await state(gone.memberId)).toMatchObject({ tier: 'gold', tier_reviewed_at: null });
  });

  it('pages through many members with a small batch', async () => {
    const many = await Promise.all([1, 2, 3, 4, 5].map(() => memberJoined('2027-05-01T08:00:00Z', 'gold')));
    const result = await run('2028-05-02T00:00:00Z', 2);
    for (const m of many) expect(result.changedMemberIds).toContain(m.memberId);
    expect(result.lowered).toBeGreaterThanOrEqual(5);
    expect(result.reviewed).toBeGreaterThanOrEqual(5);
  });
});
