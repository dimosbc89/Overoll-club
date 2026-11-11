/**
 * Supabase Edge Function `api`: the HTTP entry point for everything that moves
 * points. `start()` receives the two npm libraries from the entry file, so this
 * module bundles into plain JavaScript with no imports at all
 * (`npm run functions:build` → dist/app.js).
 *
 * Environment (provided by Supabase): SUPABASE_URL, SUPABASE_ANON_KEY,
 * SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_URL. Optional: ALLOWED_ORIGINS
 * (comma separated, default *).
 *
 * The jobs/* routes accept the service key or the scheduler's token: the
 * Vault secret `jobs_token`, created inside the database by
 * scripts/configure-project.ts and sent by pg_cron, so no key leaves Supabase.
 *
 * `staff/add` (back office) finds or creates the Auth user of a staff email
 * (`ensureAuthUser`): a database lookup first, the Auth admin API otherwise.
 *
 * `account/delete` deletes the Supabase Auth user inside its database
 * transaction (SUPABASE_DB_URL connects as `postgres`). If that role may not
 * delete from `auth.users`, the server says so (`authUserDeleted: false`) and
 * the user is deleted here with the Auth admin API and the service key.
 */
import type { createClient as CreateClient } from '@supabase/supabase-js';
import type postgresType from 'postgres';
import { createHandler } from '@overoll/api';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

export interface Libraries {
  postgres: typeof postgresType;
  createClient: typeof CreateClient;
}

function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function start({ postgres, createClient }: Libraries): void {
  const serviceKey = required('SUPABASE_SERVICE_ROLE_KEY');
  const auth = createClient(required('SUPABASE_URL'), required('SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // Auth admin API (service key): only for deleting a member's auth user.
  const admin = createClient(required('SUPABASE_URL'), serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // Transaction-pooler friendly: no prepared statements; a small pool per instance.
  const sql = postgres(required('SUPABASE_DB_URL'), { prepare: false, max: 3, idle_timeout: 20 });

  // Read once per instance; null while the scheduler is not set up.
  let jobsTokenCache: Promise<string | null> | undefined;
  const jobsToken = () =>
    (jobsTokenCache ??= sql<{ decrypted_secret: string }[]>`
      select decrypted_secret from vault.decrypted_secrets where name = 'jobs_token'
    `
      .then((rows) => rows[0]?.decrypted_secret ?? null)
      .catch(() => {
        jobsTokenCache = undefined; // try again on the next job call
        return null;
      }));

  const handler = createHandler({
    sql,
    async authenticate(token) {
      const { data, error } = await auth.auth.getClaims(token);
      if (error || !data?.claims?.sub || data.claims.role !== 'authenticated') return null;
      return data.claims.sub;
    },
    async isServiceToken(token) {
      if (sameSecret(token, serviceKey)) return true;
      const jobs = await jobsToken();
      return jobs !== null && sameSecret(token, jobs);
    },
    async deleteAuthUser(userId) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      // Already gone (an earlier attempt got through): nothing to do.
      if (error && error.status !== 404) throw error;
    },
    // staff/add (back office): the Auth user with this email, created when missing.
    // Looked up in the database first (SUPABASE_DB_URL connects as `postgres`);
    // created with the Auth admin API, confirmed, without sending any email.
    async ensureAuthUser(email) {
      const find = async () =>
        (await sql<{ id: string }[]>`select id from auth.users where lower(email) = ${email} limit 1`)[0]?.id ?? null;
      const existing = await find();
      if (existing) return existing;
      const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
      if (data?.user?.id) return data.user.id;
      // Created at the same moment by another request: read it back.
      const raced = await find();
      if (raced) return raced;
      throw error ?? new Error('Auth user not created');
    },
    allowedOrigins: (Deno.env.get('ALLOWED_ORIGINS') ?? '*')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  });

  Deno.serve(handler);
}
