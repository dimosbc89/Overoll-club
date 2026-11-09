/**
 * Throwaway Postgres for the integration tests, the same way as
 * supabase/tests/run-local.sh: initdb in a temp dir (as user `postgres` when
 * running as root), apply the Supabase stub and every migration in order into
 * a template database, hand the connection details to the tests, and delete
 * everything afterwards. Each test file clones its own database from the
 * template (see test/helpers/db.ts).
 */
import { execFileSync } from 'node:child_process';
import { chownSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestProject } from 'vitest/node';

export interface PgInfo {
  host: string;
  port: number;
  user: string;
  templateDatabase: string;
}

declare module 'vitest' {
  export interface ProvidedContext {
    pg: PgInfo;
  }
}

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const reservedPorts = new Set([55432, 55433]); // npm run test:db and the other worktree

function postgresBin(): string {
  const base = '/usr/lib/postgresql';
  const versions = readdirSync(base)
    .filter((v) => /^\d+$/.test(v))
    .sort((a, b) => Number(a) - Number(b));
  const latest = versions.at(-1);
  if (!latest) throw new Error(`No PostgreSQL found in ${base}`);
  return join(base, latest, 'bin');
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === 'object') resolve(address.port);
        else reject(new Error('Could not pick a port'));
      });
    });
  });
}

export default async function setup(project: TestProject): Promise<() => void> {
  const bin = postgresBin();
  const asRoot = process.getuid?.() === 0;
  const data = mkdtempSync(join(tmpdir(), 'overoll-server-pg-'));
  let port = await freePort();
  while (reservedPorts.has(port)) port = await freePort();

  if (asRoot) {
    const uid = Number(execFileSync('id', ['-u', 'postgres']).toString().trim());
    const gid = Number(execFileSync('id', ['-g', 'postgres']).toString().trim());
    chownSync(data, uid, gid);
  }
  const asPostgres = (cmd: string, args: string[]) =>
    asRoot
      ? execFileSync('runuser', ['-u', 'postgres', '--', cmd, ...args], { stdio: 'pipe' })
      : execFileSync(cmd, args, { stdio: 'pipe' });

  const stop = () => {
    try {
      asPostgres(join(bin, 'pg_ctl'), ['-D', data, '-m', 'immediate', 'stop']);
    } catch {
      // already stopped
    }
    rmSync(data, { recursive: true, force: true });
  };

  try {
    asPostgres(join(bin, 'initdb'), ['-D', data, '-A', 'trust', '-U', 'postgres', '--no-sync']);
    asPostgres(join(bin, 'pg_ctl'), [
      '-D', data, '-w', '-l', join(data, 'log'),
      '-o', `-p ${port} -k ${data} -c listen_addresses=127.0.0.1 -c fsync=off -c synchronous_commit=off -c full_page_writes=off -c max_connections=200`,
      'start',
    ]);

    const templateDatabase = 'overoll_template';
    const psql = (database: string, args: string[]) =>
      execFileSync(
        'psql',
        ['-X', '-q', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1', ...args],
        { stdio: 'pipe', env: { ...process.env, PGOPTIONS: '-c client_min_messages=warning' } },
      );
    psql('postgres', ['-c', `create database ${templateDatabase}`]);
    psql(templateDatabase, ['-f', join(root, 'supabase/tests/supabase-stub.sql')]);
    const migrations = readdirSync(join(root, 'supabase/migrations'))
      .filter((f) => f.endsWith('.sql'))
      .sort();
    for (const file of migrations) psql(templateDatabase, ['-f', join(root, 'supabase/migrations', file)]);

    project.provide('pg', { host: '127.0.0.1', port, user: 'postgres', templateDatabase });
  } catch (error) {
    stop();
    throw error;
  }
  return stop;
}
