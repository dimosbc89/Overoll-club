-- The role checks used by row-level security are SECURITY DEFINER, so they must
-- not be callable through the API (/rest/v1/rpc/...). Move them out of the
-- exposed `public` schema into `private`. Policies keep working: they point at
-- the functions themselves, not at their names.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

alter function public.is_platform_admin() set schema private;
alter function public.has_brand_role(uuid, public.staff_role[]) set schema private;
alter function public.has_store_role(uuid, public.staff_role[]) set schema private;

-- Policies run as the calling role, so anon and authenticated still need EXECUTE.
revoke execute on function private.is_platform_admin() from public;
revoke execute on function private.has_brand_role(uuid, public.staff_role[]) from public;
revoke execute on function private.has_store_role(uuid, public.staff_role[]) from public;
grant execute on function private.is_platform_admin() to anon, authenticated, service_role;
grant execute on function private.has_brand_role(uuid, public.staff_role[]) to anon, authenticated, service_role;
grant execute on function private.has_store_role(uuid, public.staff_role[]) to anon, authenticated, service_role;
