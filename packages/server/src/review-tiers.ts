import {
  addMonthsUtc,
  isTierReviewDue,
  latestTierReview,
  nextTierReview,
  pointsEarnedForTier,
  type TierId,
  tierAfterAnnualReview,
  tierRank,
  tierWindowStart,
} from '@grow-loyalty/core';
import { audit } from './internal/audit.js';
import { loadBrand } from './internal/brand.js';
import * as input from './internal/input.js';
import { lockMember } from './internal/members.js';
import type { Db } from './result.js';

export interface ReviewTiersInput {
  now?: Date;
  /** Members fetched per round (default 100). */
  batchSize?: number;
}

export interface ReviewedTiers {
  ok: true;
  /** Members whose anniversary was reviewed this run (tier changed or not). */
  reviewed: number;
  /** Members whose tier went down (one level at most). */
  lowered: number;
  /** Members whose tier went up at the review (e.g. after HQ lowered a tier threshold). */
  raised: number;
  changedMemberIds: string[];
}

/** addMonthsUtc clamps month ends, so an anniversary can come up to 3 days early against "12 months ago". */
const PREFILTER_MARGIN_MS = 4 * 86_400_000;
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

/** "2028-01-05" in the brand's time zone. */
function localDate(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

/**
 * Job (once a day, all brands): the yearly tier review on each member's join
 * anniversary (program spec §5). The tier is set from the points earned in the
 * last `tierWindowMonths` (core `pointsEarnedForTier`), dropping at most one
 * level (core `tierAfterAnnualReview`).
 *
 * - Once per anniversary: `members.tier_reviewed_at` records the anniversary
 *   reviewed, so running again (or twice at once) changes nothing. If the job
 *   was down for more than a year, the member gets one review, for the latest
 *   anniversary.
 * - `members.tier_review_on` is set to the next review day (brand time zone).
 * - Deleted members are left alone. Each member in its own transaction, under
 *   the member lock (the same lock earning takes, so a purchase can't race it).
 * - A changed tier is in the audit log (`member.tier_review`).
 */
export async function reviewTiers(sql: Db, options: ReviewTiersInput = {}): Promise<ReviewedTiers> {
  const now = input.now(options.now);
  const batchSize = options.batchSize ?? 100;
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new TypeError('batchSize must be a positive integer');

  let reviewed = 0;
  let lowered = 0;
  let raised = 0;
  const changedMemberIds: string[] = [];
  const brands = await sql<{ id: string }[]>`select id from public.brands order by id`;
  for (const { id: brandId } of brands) {
    const brand = await sql.begin((tx) => loadBrand(tx, brandId));
    const { config } = brand;
    // Generous prefilter in SQL; the exact rule is core isTierReviewDue below.
    const cutoff = new Date(addMonthsUtc(now, -12).getTime() + PREFILTER_MARGIN_MS);

    let after = NIL_UUID;
    for (;;) {
      const candidates = await sql<{ id: string }[]>`
        select m.id
        from public.members m
        where m.brand_id = ${brand.id}
          and m.deleted_at is null
          and m.created_at <= ${cutoff}
          and (m.tier_reviewed_at is null or m.tier_reviewed_at <= ${cutoff})
          and m.id > ${after}
        order by m.id
        limit ${batchSize}
      `;
      for (const candidate of candidates) {
        const outcome = await sql.begin(async (tx): Promise<{ from: TierId; to: TierId } | null> => {
          const member = await lockMember(tx, candidate.id);
          if (!member) return null;
          const [row] = await tx<{ created_at: Date; tier_reviewed_at: Date | null; tier: TierId; deleted_at: Date | null }[]>`
            select created_at, tier_reviewed_at, tier, deleted_at from public.members where id = ${member.id}
          `;
          if (!row || row.deleted_at) return null;
          if (!isTierReviewDue(row.created_at, row.tier_reviewed_at, now)) return null;
          const anniversary = latestTierReview(row.created_at, now)!;

          const window = await tx<{ kind: string; points: number; created_at: Date }[]>`
            select kind, points, created_at from public.ledger_entries
            where member_id = ${member.id} and created_at > ${tierWindowStart(now, config)}
          `;
          const earned = pointsEarnedForTier(
            window.map((e) => ({ kind: e.kind, points: e.points, createdAt: e.created_at })),
            now,
            config,
          );
          const tier = tierAfterAnnualReview(row.tier, earned, config);
          await tx`
            update public.members set
              tier = ${tier},
              tier_reviewed_at = ${anniversary},
              tier_review_on = ${localDate(nextTierReview(row.created_at, now), brand.timeZone)}
            where id = ${member.id}
          `;
          if (tier !== row.tier) {
            await audit(tx, {
              brandId: brand.id,
              actorUserId: null,
              action: 'member.tier_review',
              entity: 'members',
              entityId: member.id,
              details: { from: row.tier, to: tier, pointsEarned: earned, anniversary: anniversary.toISOString() },
              at: now,
            });
          }
          return { from: row.tier, to: tier };
        });
        if (!outcome) continue;
        reviewed += 1;
        if (outcome.from !== outcome.to) {
          changedMemberIds.push(candidate.id);
          if (tierRank(outcome.to, config) < tierRank(outcome.from, config)) lowered += 1;
          else raised += 1;
        }
      }
      const last = candidates.at(-1);
      if (!last || candidates.length < batchSize) break;
      after = last.id;
    }
  }
  return { ok: true, reviewed, lowered, raised, changedMemberIds };
}
