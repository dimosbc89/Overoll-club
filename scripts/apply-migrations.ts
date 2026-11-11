/**
 * Applies new database migrations (supabase/migrations/<version>_<name>.sql) to every hosted
 * project (one per brand, supabase/projects/*.json). CI runs it on main after all tests pass,
 * before the Edge Function deploy.
 *
 * Each pending file runs in one transaction together with its row in
 * supabase_migrations.schema_migrations (the record `supabase db push` and the Supabase MCP
 * keep), so the file name's version is the version Supabase records: no renaming afterwards.
 *
 *   npm run migrations:apply              needs SUPABASE_ACCESS_TOKEN
 *   npm run migrations:apply -- --dry-run lists what would run
 *   ... -- --project koala                only that brand's project (repeatable)
 *
 * Refuses to run when Supabase has a migration this repo doesn't (the histories differ).
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { root, selectedProjects } from './projects.js';

const dir = join(root, 'supabase/migrations');

/** A new project has no migration history yet; this is the table the Supabase CLI keeps. */
const historyTable = `create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);`;

interface Migration {
  version: string;
  name: string;
  sql: string;
}

export function localMigrations(files: string[], read: (file: string) => string): Migration[] {
  return files
    .filter((f) => f.endsWith('.sql'))
    .map((f) => {
      const m = /^(\d{14})_([a-z0-9_]+)\.sql$/.exec(f);
      if (!m) throw new Error(`supabase/migrations/${f}: expected <14-digit version>_<snake_name>.sql`);
      return { version: m[1]!, name: m[2]!, sql: read(f) };
    })
    .sort((a, b) => a.version.localeCompare(b.version));
}

/** The migration and its history row, in one transaction. */
export function migrationQuery(m: Migration): string {
  const tag = `$m${createHash('sha256').update(m.sql).digest('hex').slice(0, 12)}$`;
  if (m.sql.includes(tag)) throw new Error(`${m.version}_${m.name}: contains its own quoting tag`);
  return [
    'begin;',
    m.sql,
    ';',
    `insert into supabase_migrations.schema_migrations (version, name, statements) values ('${m.version}', '${m.name}', array[${tag}${m.sql}${tag}]);`,
    'commit;',
  ].join('\n');
}

async function query(token: string, ref: string, sql: string): Promise<unknown> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`database/query: HTTP ${res.status} ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error('SUPABASE_ACCESS_TOKEN is not set');
  const local = localMigrations(readdirSync(dir), (f) => readFileSync(join(dir, f), 'utf8'));
  for (const { brand, projectRef } of selectedProjects()) {
    console.log(`== ${brand} (${projectRef})`);
    await migrate(token, projectRef, local, dryRun);
  }
}

async function migrate(token: string, projectRef: string, local: Migration[], dryRun: boolean) {
  if (!dryRun) await query(token, projectRef, historyTable);
  const remote = (await query(
    token,
    projectRef,
    'select version, name from supabase_migrations.schema_migrations order by version',
  )) as { version: string; name: string }[];

  const localVersions = new Set(local.map((m) => m.version));
  const unknown = remote.filter((r) => !localVersions.has(r.version));
  if (unknown.length) {
    throw new Error(
      `Supabase has migrations this repo doesn't: ${unknown.map((r) => `${r.version}_${r.name}`).join(', ')}. ` +
        'Bring the file into supabase/migrations under that version first.',
    );
  }

  const applied = new Set(remote.map((r) => r.version));
  const pending = local.filter((m) => !applied.has(m.version));
  if (!pending.length) {
    console.log(`migrations: up to date (${remote.length} applied)`);
    return;
  }
  for (const m of pending) {
    if (dryRun) {
      console.log(`would apply ${m.version}_${m.name}`);
      continue;
    }
    await query(token, projectRef, migrationQuery(m));
    console.log(`applied ${m.version}_${m.name}`);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
