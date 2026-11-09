import postgres from 'postgres';
import { inject } from 'vitest';

export type Sql = postgres.Sql<{}>;

export interface TestDatabase {
  /** Superuser connection, for fixtures and assertions. */
  admin: Sql;
  /** What the server functions get: the service role (bypasses RLS), pool of 10. */
  server: Sql;
  drop(): Promise<void>;
}

let counter = 0;
const quiet = () => {};

/** A fresh database cloned from the migrated template; one per test file. */
export async function createTestDatabase(): Promise<TestDatabase> {
  const pg = inject('pg');
  const base = { host: pg.host, port: pg.port, user: pg.user, onnotice: quiet };
  const name = `t_${process.pid}_${Date.now()}_${counter++}`;
  const maintenance = postgres({ ...base, database: 'postgres', max: 1 });
  await maintenance.unsafe(`create database ${name} template ${pg.templateDatabase}`);
  const admin = postgres({ ...base, database: name, max: 2 });
  const server = postgres({ ...base, database: name, max: 10, connection: { options: '-c role=service_role' } });
  return {
    admin,
    server,
    async drop() {
      await Promise.all([admin.end(), server.end()]);
      await maintenance.unsafe(`drop database ${name} with (force)`);
      await maintenance.end();
    },
  };
}
