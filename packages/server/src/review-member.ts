import { joinMember } from './join-member.js';
import { audit } from './internal/audit.js';
import * as input from './internal/input.js';
import { lockMember, memberBalance } from './internal/members.js';
import { type Db, type Failure, fail } from './result.js';

/** Points the review account always has when a reviewer signs in. */
export const REVIEW_POINTS_FLOOR = 1000;
export const REVIEW_POINTS_TOP_UP_TO = 1500;

export interface PrepareReviewMemberInput {
  /** The review account's Supabase Auth user. */
  userId: string;
  email: string;
  /** Default: the project's only brand. */
  brandSlug?: string;
  now?: Date;
}

export type PrepareReviewMemberResult =
  | { ok: true; memberId: string; created: boolean; pointsAdded: number }
  | Failure<'invalid_input' | 'brand_not_found' | 'member_deleted' | 'email_taken'>;

/**
 * App store review account (API contract v0.8), run by `auth/review-sign-in`
 * before the reviewer gets a session:
 * - joins the review user as a member of the project's brand the first time
 *   (first name "App Review", English, no marketing consents);
 * - marks the member `review_demo`, so its reward codes are refused at the
 *   till (`use-redemption` answers `review_demo`);
 * - tops the balance up to 1,500 points when it is under 1,000 (an `adjust`
 *   entry "App store review account", once a day at most), so the reviewer can
 *   try rewards and redemption codes.
 * Each project holds one brand, which is the one used (tests name it).
 */
export async function prepareReviewMember(sql: Db, raw: PrepareReviewMemberInput): Promise<PrepareReviewMemberResult> {
  const parsed = input.parseInput(() => ({
    userId: input.uuid(raw.userId, 'userId'),
    email: input.text(raw.email, 'email', 254).toLowerCase(),
    brandSlug: raw.brandSlug === undefined ? null : input.text(raw.brandSlug, 'brandSlug', 64),
    now: input.now(raw.now),
  }));
  if ('failure' in parsed) return parsed.failure;
  const i = parsed.input;

  const brands = i.brandSlug
    ? await sql<{ id: string; slug: string }[]>`select id, slug from public.brands where slug = ${i.brandSlug}`
    : await sql<{ id: string; slug: string }[]>`select id, slug from public.brands order by created_at limit 2`;
  if (brands.length !== 1) return fail('brand_not_found');
  const brand = brands[0]!;

  const find = async () =>
    (
      await sql<{ id: string; deleted_at: Date | null }[]>`
        select id, deleted_at from public.members where brand_id = ${brand.id} and user_id = ${i.userId}
        order by created_at desc limit 1
      `
    )[0];
  let found = await find();
  let created = false;
  if (!found || found.deleted_at) {
    const joined = await joinMember(sql, {
      userId: i.userId,
      brandSlug: brand.slug,
      firstName: 'App Review',
      email: i.email,
      locale: 'en',
      consents: { email: false, sms: false, push: false },
      confirmsMinimumAge: true,
      idempotencyKey: `review-join-${i.userId}-${found?.id ?? 'first'}`,
      now: i.now,
    });
    if (!joined.ok) {
      if (joined.code === 'email_taken' || joined.code === 'member_deleted') return fail(joined.code);
      throw new Error(`review member: join failed (${joined.code})`);
    }
    created = true;
    found = await find();
  }
  if (!found) throw new Error('review member: not found after joining');
  const memberId = found.id;
  const day = i.now.toISOString().slice(0, 10);

  return sql.begin(async (tx) => {
    const member = await lockMember(tx, memberId);
    if (!member || member.deleted_at) return fail('member_deleted');
    if (!member.review_demo) {
      await tx`update public.members set review_demo = true where id = ${memberId}`;
      await audit(tx, {
        brandId: member.brand_id,
        actorUserId: null,
        action: 'member.review_demo',
        entity: 'member',
        entityId: memberId,
        details: {},
        at: i.now,
      });
    }
    const balance = await memberBalance(tx, memberId);
    let pointsAdded = 0;
    if (balance < REVIEW_POINTS_FLOOR) {
      const rows = await tx<{ points: number }[]>`
        insert into public.ledger_entries (brand_id, member_id, kind, points, reason, idempotency_key, created_at)
        values (${member.brand_id}, ${memberId}, 'adjust', ${REVIEW_POINTS_TOP_UP_TO - balance},
          'App store review account', ${`review-topup-${memberId}-${day}`}, ${i.now})
        on conflict (brand_id, idempotency_key) do nothing
        returning points
      `;
      pointsAdded = rows[0]?.points ?? 0;
    }
    return { ok: true as const, memberId, created, pointsAdded };
  });
}
