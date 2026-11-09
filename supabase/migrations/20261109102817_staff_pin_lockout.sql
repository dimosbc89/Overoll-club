-- Staff PIN guessing protection (docs/api-contract.md v0.2): limits.pinMaxAttempts
-- (5) wrong PINs for one employee within limits.pinLockMinutes (15) lock that
-- employee for limits.pinLockMinutes, in every operation that checks a PIN
-- (packages/core staff-pin.ts decides; packages/server stores).
--
-- One row per wrong PIN. The row that reached the limit carries locked_until.
-- The right PIN deletes the employee's rows (counting starts again). Server
-- only: `private` schema (not exposed by the API), RLS on, no policies, no
-- grants to clients.

create table private.employee_pin_failures (
  id bigint generated always as identity primary key,
  brand_id uuid not null,
  employee_id uuid not null,
  -- The store device or manager that sent the PIN.
  caller_user_id uuid references auth.users (id) on delete set null,
  failed_at timestamptz not null,
  locked_until timestamptz,
  foreign key (employee_id, brand_id) references public.employees (id, brand_id) on delete cascade,
  constraint pin_lock_after_failure check (locked_until is null or locked_until > failed_at)
);
create index employee_pin_failures_recent on private.employee_pin_failures (employee_id, failed_at);

alter table private.employee_pin_failures enable row level security;
revoke all on private.employee_pin_failures from public, anon, authenticated;
grant select, insert, delete on private.employee_pin_failures to service_role;
