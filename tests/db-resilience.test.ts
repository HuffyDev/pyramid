import { afterEach, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import type pg from 'pg';
import { createDbConnector, dbHint, switchableStore, type DbStatus } from '../server/db/connect.js';
import { memoryStore } from '../server/db/store.js';
import { buildApp } from '../server/app.js';
import { buildReq, mockFetch, testEnv } from './helpers.js';

const fakePool = () => Object.assign(new EventEmitter(), { end: async () => {} }) as unknown as pg.Pool;
const enotfound = Object.assign(new Error('getaddrinfo ENOTFOUND helium'), { code: 'ENOTFOUND' });

describe('dbHint', () => {
  it("names Replit's dev database when a deployment points at helium", () => {
    expect(dbHint('postgres://u:p@helium/heliumdb', enotfound, { REPLIT_DEPLOYMENT: '1' })).toMatch(/production database/);
  });
  it('explains common failures without leaking the password', () => {
    const h = dbHint('postgres://u:secret@db.example.com/x', enotfound, {});
    expect(h).toMatch(/does not resolve/);
    expect(h).not.toContain('secret');
    expect(dbHint('postgres://u:p@h/x', { code: 'ECONNREFUSED' }, {})).toMatch(/Nothing is listening/);
    expect(dbHint('postgres://u:p@h/x', { code: '28P01' }, {})).toMatch(/password/);
    expect(dbHint('postgres://u:p@h/x', { code: '3D000' }, {})).toMatch(/does not exist/);
  });
});

describe('db connector', () => {
  it('without DATABASE_URL stays on memory and reports none', async () => {
    const store = switchableStore(memoryStore());
    const c = createDbConnector({ url: undefined, store, log: () => {} });
    await c.start();
    expect(c.status.state).toBe('none');
    expect(store.kind).toBe('memory');
  });

  it('a failed first attempt keeps serving from memory, retries, then swaps postgres in', async () => {
    const store = switchableStore(memoryStore());
    let calls = 0;
    const states: string[] = [];
    let ready = 0;
    const c = createDbConnector({
      url: 'postgres://u:p@helium/db',
      store,
      log: () => {},
      retryMs: [5],
      makePool: fakePool,
      migrate: async () => {
        if (++calls < 3) throw enotfound;
      },
      onReady: () => {
        ready++;
      },
      onStatus: (s: DbStatus) => states.push(s.state),
    });
    await c.start();
    expect(c.status.state).toBe('failed');
    expect(c.status.hint).toBeTruthy();
    expect(store.kind).toBe('memory');
    await new Promise((r) => setTimeout(r, 80));
    expect(c.status).toMatchObject({ state: 'ready', attempts: 3, error: null });
    expect(store.kind).toBe('postgres');
    expect(ready).toBe(1);
    expect(states).toEqual(['failed', 'ready']);
    await c.stop();
  });

  it('a failing reload after connect does not flip the state back to failed', async () => {
    const store = switchableStore(memoryStore());
    const c = createDbConnector({
      url: 'postgres://x',
      store,
      log: () => {},
      makePool: fakePool,
      migrate: async () => {},
      onReady: () => {
        throw new Error('boom');
      },
    });
    await c.start();
    expect(c.status.state).toBe('ready');
    await c.stop();
  });

  it('stop() cancels pending retries', async () => {
    let calls = 0;
    const c = createDbConnector({
      url: 'postgres://x',
      store: switchableStore(memoryStore()),
      log: () => {},
      retryMs: [10],
      makePool: fakePool,
      migrate: async () => {
        calls++;
        throw enotfound;
      },
    });
    await c.start();
    await c.stop();
    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toBe(1);
  });
});

describe('launch gating while the database is down', () => {
  const apps: { close: () => Promise<unknown>; stop: () => void }[] = [];
  afterEach(async () => {
    for (const a of apps.splice(0)) {
      a.stop();
      await a.close();
    }
  });
  const make = async (state: DbStatus['state'], over: Record<string, string> = {}) => {
    const status: DbStatus = { state, error: 'x', hint: 'h', attempts: 1, since: '' };
    const env = testEnv({ ADMIN_TOKEN: 't'.repeat(30), MARKET_POLL_MS: '600000', ...over });
    const { app, runtime } = await buildApp({ env, store: memoryStore(), fetchImpl: mockFetch({}).impl, logger: false, db: { status } });
    await runtime.start();
    apps.push({ close: () => app.close(), stop: runtime.stop });
    return { app, status };
  };

  it('live mode refuses launches (503) instead of recording them only in memory', async () => {
    const { app } = await make('failed', { DRY_RUN: 'false' });
    const r = await app.inject({ method: 'POST', url: '/api/launch/build', payload: buildReq() });
    expect(r.statusCode).toBe(503);
    expect(r.json().code).toBe('launches_paused');
    expect((await app.inject({ url: '/api/config' })).json().launchesPaused).toMatch(/paused/);
    expect((await app.inject({ method: 'POST', url: '/api/launch/send', payload: { launchId: crypto.randomUUID() } })).statusCode).toBe(503);
  });

  it('dry runs may continue in memory once the first attempt failed', async () => {
    const { app } = await make('failed');
    const r = await app.inject({ method: 'POST', url: '/api/launch/build', payload: buildReq() });
    expect(r.statusCode).toBe(200);
    expect((await app.inject({ url: '/api/config' })).json().launchesPaused).toBe(null);
  });

  it('everything waits while the first connection is still in flight', async () => {
    const { app } = await make('connecting');
    expect((await app.inject({ method: 'POST', url: '/api/launch/build', payload: buildReq() })).statusCode).toBe(503);
  });

  it('launches reopen as soon as the database is ready', async () => {
    const { app, status } = await make('failed', { DRY_RUN: 'false' });
    status.state = 'ready';
    expect((await app.inject({ url: '/api/config' })).json().launchesPaused).toBe(null);
  });

  it('health stays 200 and public output carries the state only; admin sees the hint; settings refuse to save', async () => {
    const { app } = await make('failed');
    const h = await app.inject({ url: '/api/health' });
    expect(h.statusCode).toBe(200);
    expect(h.json().db).toBe('failed');
    expect(JSON.stringify(h.json())).not.toContain('"h"');
    const auth = { authorization: `Bearer ${'t'.repeat(30)}` };
    expect((await app.inject({ url: '/api/admin/status', headers: auth })).json().db).toMatchObject({ state: 'failed', hint: 'h' });
    const s = await app.inject({ method: 'POST', url: '/api/admin/settings', headers: auth, payload: { key: 'SIM_MODE', value: true } });
    expect(s.statusCode).toBe(503);
  });
});

describe('boot (real process)', () => {
  it('stays up and serves when DATABASE_URL points at an unreachable host (the Replit "helium" crash)', async () => {
    const port = 5600 + Math.floor(Math.random() * 300);
    const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
      env: { ...process.env, DATABASE_URL: 'postgres://u:p@helium:5432/heliumdb', REPLIT_DEPLOYMENT: '1', PORT: String(port), MEDIA_DIR: '/tmp/pyramid-test-media', DRY_RUN: 'false' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    try {
      let health: { ok: boolean; db: string } | null = null;
      for (let i = 0; i < 60 && !health; i++) {
        await new Promise((r) => setTimeout(r, 250));
        if (child.exitCode !== null) break;
        health = await fetch(`http://127.0.0.1:${port}/api/health`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);
        if (health?.db === 'connecting') health = null;
      }
      expect(child.exitCode, out).toBe(null);
      expect(health).toMatchObject({ ok: true, db: 'failed' });
      expect(out).toMatch(/production database/);
    } finally {
      child.kill('SIGTERM');
    }
  }, 30_000);
});
