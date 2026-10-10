import { describe, expect, it } from 'vitest';
import pg from 'pg';
import { runMigrations } from '../server/db/migrate.js';
import { pgStore } from '../server/db/store.js';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('migrations (postgres)', () => {
  const fresh = async () => {
    const pool = new pg.Pool({ connectionString: url });
    await pool.query('DROP SCHEMA IF EXISTS drizzle CASCADE; DROP TABLE IF EXISTS launches, settings CASCADE;');
    return pool;
  };
  const quiet = () => {};

  it('runs on an empty db and is idempotent', async () => {
    const pool = await fresh();
    await runMigrations(pool, undefined, quiet);
    await runMigrations(pool, undefined, quiet);
    const { rows } = await pool.query('SELECT count(*)::int n FROM drizzle.__drizzle_migrations');
    expect(rows[0].n).toBe(1);
    await pool.end();
  });

  it('baselines when tables exist without a journal', async () => {
    const pool = await fresh();
    await runMigrations(pool, undefined, quiet);
    await pool.query('DROP SCHEMA drizzle CASCADE');
    const logs: string[] = [];
    await runMigrations(pool, undefined, (m) => logs.push(m));
    expect(logs.join()).toMatch(/baselined/);
    const { rows } = await pool.query('SELECT count(*)::int n FROM drizzle.__drizzle_migrations');
    expect(rows[0].n).toBe(1);
    await pool.end();
  });

  it('store works against postgres', async () => {
    const pool = await fresh();
    await runMigrations(pool, undefined, quiet);
    const s = pgStore(pool);
    const base = { mint: 'M1', name: 'n', ticker: 'T', description: '', imageUri: null, metadataUri: 'https://x', website: null, twitter: null, telegram: null, creator: 'C', devBuySol: 0 };
    const id = '00000000-0000-4000-8000-000000000001';
    await s.upsertBuilding({ ...base, launchId: id });
    const [a, b] = await Promise.all([s.transition(id, ['building'], 'sent'), s.transition(id, ['building'], 'sent')]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    await s.transition(id, ['sent'], 'confirmed', { signature: 'S', placedAt: new Date().toISOString() });
    expect((await s.listPlaced({ includeSimulated: false }))[0].signature).toBe('S');
    await s.updateMarket([{ mint: 'M1', marketCapUsd: 1234, change24h: -5, belowSince: '2026-01-01T00:00:00.000Z' }]);
    await s.setHidden('M1', true);
    const r = await s.getByMint('M1');
    expect(r).toMatchObject({ marketCapUsd: 1234, hidden: true, belowSince: '2026-01-01T00:00:00.000Z' });
    await s.setSetting('PYRAMID_MINT', 'X');
    await s.setSetting('PYRAMID_MINT', 'Y');
    expect(await s.getSettings()).toEqual({ PYRAMID_MINT: 'Y' });
    await s.setSetting('PYRAMID_MINT', null);
    expect(await s.getSettings()).toEqual({});
    await pool.end();
  });
});
