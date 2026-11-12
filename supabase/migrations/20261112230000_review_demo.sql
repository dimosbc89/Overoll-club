-- App Store / Google Play review account (API contract v0.8).
--
-- Reviewers sign in with the brand's review email and a fixed code
-- (auth/review-sign-in). Their member is marked review_demo: it gets points to
-- try the app, and its reward codes are refused at the till, so the demo
-- account can never take a real coffee.

alter table public.members
  add column review_demo boolean not null default false;

comment on column public.members.review_demo is
  'App store review account: topped up with points on sign-in; its reward codes are refused at the till (review_demo).';
