import { afterEach, describe, expect, it } from 'vitest';
import { VersionedTransaction } from '@solana/web3.js';
import { buildApp } from '../server/app.js';
import { memoryStore } from '../server/db/store.js';
import { creator, fakeCreateTx, mint } from './fixtures/keys.js';
import { buildReq, mockFetch, testEnv } from './helpers.js';

const TOKEN = 'x'.repeat(32);
const apps: { close: () => Promise<unknown>; stop: () => void }[] = [];
afterEach(async () => {
  for (const a of apps.splice(0)) {
    a.stop();
    await a.close();
  }
});

async function make(over: Record<string, string> = {}) {
  const { impl } = mockFetch({ 'https://pp.test': () => new Response(fakeCreateTx().serialize(), { status: 200 }) });
  const env = testEnv({ ADMIN_TOKEN: TOKEN, MARKET_POLL_MS: '600000', ...over });
  const { app, runtime } = await buildApp({ env, store: memoryStore(), fetchImpl: impl, logger: false });
  await runtime.start();
  apps.push({ close: () => app.close(), stop: runtime.stop });
  return { app, runtime, env };
}

const auth = { authorization: `Bearer ${TOKEN}` };

describe('http', () => {
  it('a dry-run launch over the API becomes the next brick', async () => {
    const { app } = await make();
    const req = buildReq();
    const b = await app.inject({ method: 'POST', url: '/api/launch/build', payload: req });
    expect(b.statusCode).toBe(200);
    const tx = VersionedTransaction.deserialize(Buffer.from(b.json().tx, 'base64'));
    tx.sign([mint, creator]);
    const s = await app.inject({ method: 'POST', url: '/api/launch/send', payload: { launchId: req.launchId, signedTx: Buffer.from(tx.serialize()).toString('base64') } });
    expect(s.json().launch).toMatchObject({ status: 'simulated', brickNo: 1 });
    const p = (await app.inject({ url: '/api/pyramid' })).json();
    expect(p.bricks).toHaveLength(1);
    expect(p.bricks[0]).toMatchObject({ n: 1, ticker: 'SCAT', dryRun: true });
    expect((await app.inject({ url: `/api/bricks/${req.mint}` })).json().detail.description).toBe('just a brick');
  });

  it('content filter endpoint rejects with 422', async () => {
    const { app } = await make();
    const r = await app.inject({ method: 'POST', url: '/api/filter', payload: { name: 'n1gger', ticker: 'X', description: '' } });
    expect(r.statusCode).toBe(422);
    expect((await app.inject({ method: 'POST', url: '/api/filter', payload: { name: 'Sand Cat', ticker: 'SCAT', description: '' } })).statusCode).toBe(200);
  });

  it('admin requires the token; can hide a brick, set the CA and toggle sim', async () => {
    const { app, env } = await make({ SIM_MODE: 'true', SIM_SEED: '5', SIM_INTERVAL_MS: '0' });
    expect((await app.inject({ url: '/api/admin/status' })).statusCode).toBe(401);
    expect((await app.inject({ url: '/api/admin/status', headers: { authorization: 'Bearer nope' } })).statusCode).toBe(401);
    const st = (await app.inject({ url: '/api/admin/status', headers: auth })).json();
    expect(st.bricks).toBe(5);

    const h = await app.inject({ method: 'POST', url: '/api/admin/hide', headers: auth, payload: { ref: '#2', hidden: true } });
    expect(h.json().brick).toMatchObject({ n: 2, hidden: true });
    const pub = (await app.inject({ url: '/api/pyramid' })).json().bricks[1];
    expect(pub).toMatchObject({ n: 2, hidden: true, name: '', ticker: '', image: null });

    await app.inject({ method: 'POST', url: '/api/admin/settings', headers: auth, payload: { key: 'PYRAMID_MINT', value: '' } });
    expect((await app.inject({ url: '/api/config' })).json().pyramidMint).toBe(null);
    const bad = await app.inject({ method: 'POST', url: '/api/admin/settings', headers: auth, payload: { key: 'PYRAMID_MINT', value: 'not a mint' } });
    expect(bad.statusCode).toBe(400);

    await app.inject({ method: 'POST', url: '/api/admin/settings', headers: auth, payload: { key: 'SIM_MODE', value: false } });
    expect(env.SIM_MODE).toBe(false);
    expect((await app.inject({ url: '/api/pyramid' })).json().bricks).toHaveLength(0);
  });

  it('refuses to turn DRY_RUN off without an RPC', async () => {
    const { app } = await make({ HELIUS_RPC_URL: '' });
    const r = await app.inject({ method: 'POST', url: '/api/admin/settings', headers: auth, payload: { key: 'DRY_RUN', value: false } });
    expect(r.statusCode).toBe(400);
  });

  it('admin is disabled without ADMIN_TOKEN', async () => {
    const { app } = await make({ ADMIN_TOKEN: '' });
    expect((await app.inject({ url: '/api/admin/status', headers: auth })).statusCode).toBe(503);
  });
});
