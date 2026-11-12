-- Yearly tier review (program spec §5): on each anniversary of joining, a
-- member's tier is set from the points earned in the last 12 months, dropping
-- at most one level (core tierAfterAnnualReview). Done by the daily job
-- jobs/review-tiers (packages/server/src/review-tiers.ts).
--
-- members.tier_reviewed_at: the anniversary the last review was for, so the job
-- reviews each anniversary once (null: no review yet). members.tier_review_on
-- (from the first schema, unused until now) becomes the date of the next review
-- in the brand's time zone, for the app's profile screen.

alter table public.members add column tier_reviewed_at timestamptz;

comment on column public.members.tier_reviewed_at is 'Join anniversary the last yearly tier review was for (jobs/review-tiers); null before the first review.';
comment on column public.members.tier_review_on is 'Date of the next yearly tier review, in the brand''s time zone (jobs/review-tiers).';

-- The job looks for members whose anniversary has come.
create index members_tier_review on public.members (brand_id, created_at) where deleted_at is null;
