-- "I am 15 or older" at sign-up (program spec: minimum age, core minimumAge):
-- the server refuses a new member without it and records when it was given.
-- Members created before this column existed keep null.

alter table public.members add column minimum_age_confirmed_at timestamptz;
