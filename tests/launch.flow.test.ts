import { describe, expect, it } from 'vitest';
import { VersionedTransaction } from '@solana/web3.js';
import { memoryStore } from '../server/db/store.js';
import { createLauncher } from '../server/services/launcher.js';
import { creator, fakeCreateTx, mint } from './fixtures/keys.js';
import { buildReq, mockFetch, rpcRoute, testEnv } from './helpers.js';

const signedB64 = (b64: string) => {
  const tx = VersionedTransaction.deserialize(Buffer.from(b64, 'base64'));
  tx.sign([mint, creator]); // in the browser: mint locally, creator via wallet
  return Buffer.from(tx.serialize()).toString('base64');
};

const pp = () => new Response(fakeCreateTx().serialize(), { status: 200 });

describe('launch flow — DRY_RUN with live APIs (mocked)', () => {
  it('build → sign → simulate, never sends', async () => {
    const { impl, calls } = mockFetch({
      'https://pp.test': pp,
      'https://rpc.test': rpcRoute({ simulateTransaction: { value: { err: null, logs: ['Program log: Instruction: Create'], unitsConsumed: 123456 } } }),
    });
    const store = memoryStore();
    const l = createLauncher({ env: testEnv(), store, fetchImpl: impl });
    const req = buildReq();
    const built = await l.build(req);
    expect(built.mode).toBe('tx');
    const res = await l.send({ launchId: req.launchId, signedTx: signedB64((built as { tx: string }).tx) });
    expect(res.launch.status).toBe('simulated');
    expect(res.simulation?.unitsConsumed).toBe(123456);
    const rpcMethods = calls.filter((c) => c.url.startsWith('https://rpc.test')).map((c) => (c.body as { method: string }).method);
    expect(rpcMethods).toEqual(['simulateTransaction']);
  });

  it('simulation error marks launch failed and allows a rebuild (retry)', async () => {
    const { impl } = mockFetch({
      'https://pp.test': pp,
      'https://rpc.test': rpcRoute({ simulateTransaction: { value: { err: { InstructionError: [0, 'Custom'] }, logs: ['boom'] } } }),
    });
    const l = createLauncher({ env: testEnv(), store: memoryStore(), fetchImpl: impl });
    const req = buildReq();
    const b = await l.build(req);
    const r = await l.send({ launchId: req.launchId, signedTx: signedB64((b as { tx: string }).tx) });
    expect(r.launch.status).toBe('failed');
    expect(r.error).toMatch(/Simulation failed/);
    await expect(l.build(req)).resolves.toMatchObject({ mode: 'tx' });
  });

  it('rejects an unsigned tx', async () => {
    const { impl } = mockFetch({ 'https://pp.test': pp, 'https://rpc.test': rpcRoute({}) });
    const l = createLauncher({ env: testEnv(), store: memoryStore(), fetchImpl: impl });
    const req = buildReq();
    const b = (await l.build(req)) as { tx: string };
    await expect(l.send({ launchId: req.launchId, signedTx: b.tx })).rejects.toThrow(/missing a signature/);
  });
});

describe('launch flow — live mode', () => {
  it('sends via RPC, returns signature, double-submit is idempotent', async () => {
    const { impl, calls } = mockFetch({
      'https://pp.test': pp,
      'https://rpc.test': rpcRoute({ sendTransaction: 'SIG123', getSignatureStatuses: { value: [{ confirmationStatus: 'confirmed', err: null }] } }),
    });
    const store = memoryStore();
    const l = createLauncher({ env: testEnv({ DRY_RUN: 'false' }), store, fetchImpl: impl });
    const req = buildReq();
    const b = (await l.build(req)) as { tx: string };
    const signed = signedB64(b.tx);
    const [r1, r2] = await Promise.all([l.send({ launchId: req.launchId, signedTx: signed }), l.send({ launchId: req.launchId, signedTx: signed })]);
    const sends = calls.filter((c) => (c.body as { method?: string })?.method === 'sendTransaction');
    expect(sends).toHaveLength(1);
    expect([r1.launch.status, r2.launch.status]).toContain('sent');
    await new Promise((r) => setTimeout(r, 20));
    expect((await store.getLaunch(req.launchId))?.status).toBe('confirmed');
    expect((await store.getLaunch(req.launchId))?.signature).toBe('SIG123');
    await expect(l.build(req)).rejects.toThrow(/already submitted/);
  });

  it('never falls back to mock when DRY_RUN=false', async () => {
    const { impl } = mockFetch({});
    const l = createLauncher({ env: testEnv({ DRY_RUN: 'false' }), store: memoryStore(), fetchImpl: impl });
    await expect(l.build(buildReq())).rejects.toThrow(/Could not build/);
  });
});

describe('launch flow — offline mock (DRY_RUN fallback)', () => {
  it('build returns a sign-message, send records a simulated launch', async () => {
    const { impl } = mockFetch({});
    const store = memoryStore();
    const l = createLauncher({ env: testEnv(), store, fetchImpl: impl });
    const req = buildReq();
    const b = await l.build(req);
    expect(b.mode).toBe('mock');
    if (b.mode === 'mock') expect(b.message).toMatch(/does not send a transaction/);
    await expect(l.send({ launchId: req.launchId })).rejects.toThrow(/signature required/);
    // failed → retry
    const r = await l.send({ launchId: req.launchId, mockSignature: 'abc' });
    expect(r.launch.status).toBe('simulated');
    expect((await store.listPlaced({ includeSimulated: true })).length).toBe(1);
    expect((await store.listPlaced({ includeSimulated: false })).length).toBe(0);
  });

  it('rejects reuse of a mint across launches', async () => {
    const l = createLauncher({ env: testEnv(), store: memoryStore(), fetchImpl: mockFetch({}).impl });
    await l.build(buildReq());
    await expect(l.build(buildReq())).rejects.toThrow(/Mint address already used/);
  });
});
