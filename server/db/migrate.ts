import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

interface Journal {
  entries: { idx: number; when: number; tag: string }[];
}

export function findMigrationsDir(): string {
  const candidates = [path.resolve('drizzle'), path.resolve(process.cwd(), '..', 'drizzle')];
  const dir = candidates.find((d) => existsSync(path.join(d, 'meta', '_journal.json')));
  if (!dir) throw new Error('drizzle migrations folder not found');
  return dir;
}

/**
 * Idempotent boot migration.
 * If app tables already exist but drizzle's journal table is empty/missing
 * (e.g. created by hand or by `drizzle-kit push`), the initial migration is
 * recorded as applied ("baseline") instead of re-run. Later migrations then run normally.
 */
export async function runMigrations(pool: Pool, dir = findMigrationsDir(), log: (m: string) => void = console.log) {
  const journal: Journal = JSON.parse(readFileSync(path.join(dir, 'meta', '_journal.json'), 'utf8'));
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(727301)');
    const { rows: t } = await client.query(`SELECT to_regclass('public.launches') AS l`);
    const tablesExist = !!t[0].l;
    await client.query('CREATE SCHEMA IF NOT EXISTS drizzle');
    await client.query(
      'CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)',
    );
    const { rows: applied } = await client.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations');
    if (tablesExist && applied[0].n === 0 && journal.entries.length) {
      const first = journal.entries[0];
      const sql = readFileSync(path.join(dir, `${first.tag}.sql`), 'utf8');
      const hash = createHash('sha256').update(sql).digest('hex');
      await client.query('INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)', [hash, first.when]);
      log(`[db] baselined existing schema at ${first.tag}`);
    }
    await migrate(drizzle(client), { migrationsFolder: dir });
    log('[db] migrations up to date');
  } finally {
    await client.query('SELECT pg_advisory_unlock(727301)').catch(() => {});
    client.release();
  }
}
