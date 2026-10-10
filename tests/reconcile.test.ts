import { describe, expect, it } from 'vitest';
import bs58 from 'bs58';
import { VersionedTransaction } from '@solana/web3.js';
import { memoryStore, type Store } from '../server/db/store.js';
import { createLauncher } from '../server/services/launcher.js';
import type { LaunchRecord } from '../shared/launch.js';
import { creator, fakeCreateTx, mint } from './fixtures/keys.js';
import { buildReq, mockFetch, testEnv } from './helpers.js';

const signed = (b64: string) => {
  const tx = VersionedTransaction.deserialize(Buffer.from(b64, 'base64'));
  tx.sign([mint, creator]);
  return { b64: Buffer.from(tx.serialize()).toString('base64'), sig: bs58.encode(tx.signatures[0]) };
};
const pp = () => new Response(fakeCreateTx().serialize(), { status: 200 });

/** JSON-RPC mock with mutable answers; a function answer can throw/hang to simulate network trouble */
function rpcMock(answers: Record<string, unknown | (() => unknown)>) {
  const calls: string[] = [];
  const handler = async (_u: string, init?: RequestInit) => {
    const { method, params } = JSON.parse(String(init?.body));
    calls.push(method);
    const a = answers[method];
    if (a === undefined) return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -1, message: `no mock for ${method}` } }));
    const v = typeof a === 'function' ? await (a as (p: unknown) => unknown)(params) : a;
    if (v instanceof Response) return v;
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: v }));
  };
  return { handler, calls };
}

const statuses = (s: unknown) => ({ value: [s] });

async function liveLaunch(rpc: ReturnType<typeof rpcMock>, store: Store = memoryStore(), placed: LaunchRecord[] = []) {
  const { impl } = mockFetch({ 'https://pp.test': pp, 'https://rpc.test': rpc.handler });
  const l = createLauncher({ env: testEnv({ DRY_RUN: 'false' }), store, fetchImpl: impl, onPlaced: (x) => placed.push(x) });
  const req = buildReq();
  const b = (await l.build(req)) as { tx: string };
  const s = signed(b.tx);
  return { l, req, store, placed, s };
}

describe('send records the signature before broadcasting', () => {
  it('the row holds the signature by the time sendTransaction is called', async () => {
    let seenDuringSend: LaunchRecord | null = null;
    const store = memoryStore();
    const rpc = rpcMock({
      sendTransaction: async () => {
        seenDuringSend = await store.getLaunch(id);
        return expected;
      },
      getSignatureStatuses: statuses(null),
    });
    const { l, req, s } = await liveLaunch(rpc, store);
    const id = req.launchId;
    const expected = s.sig;
    const r = await l.send({ launchId: id, signedTx: s.b64 });
    expect(r.launch).toMatchObject({ status: 'sent', signature: s.sig });
    expect(seenDuringSend).toMatchObject({ status: 'sent', signature: s.sig });
  });

  it('if the signature cannot be recorded, nothing is broadcast', async () => {
    const base = memoryStore();
    let breakWrites = false;
    const store: Store = {
      ...base,
      kind: 'memory',
      transition: async (id, from, to, patch) => {
        if (breakWrites && patch?.signature) throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
        return base.transition(id, from, to, patch);
      },
    };
    const rpc = rpcMock({ sendTransaction: 'X' });
    const { l, req, s } = await liveLaunch(rpc, store);
    breakWrites = true;
    await expect(l.send({ launchId: req.launchId, signedTx: s.b64 })).rejects.toMatchObject({ status: 503 });
    expect(rpc.calls).not.toContain('sendTransaction');
    expect((await base.getLaunch(req.launchId))!.status).toBe('failed'); // unlocked: the user can retry
  });

  it('a definitive RPC rejection (preflight failed) marks the launch failed', async () => {
    const rpc = rpcMock({}); // JSON-RPC error for sendTransaction
    const { l, req, s, store } = await liveLaunch(rpc);
    await expect(l.send({ launchId: req.launchId, signedTx: s.b64 })).rejects.toThrow(/no mock for sendTransaction/);
    expect((await store.getLaunch(req.launchId))!.status).toBe('failed');
  });

  it('an ambiguous send error (5xx / timeout) keeps the launch sent + tracked, not failed', async () => {
    const rpc = rpcMock({ sendTransaction: () => new Response('bad gateway', { status: 502 }), getSignatureStatuses: statuses(null) });
    const { l, req, s, store } = await liveLaunch(rpc);
    const r = await l.send({ launchId: req.launchId, signedTx: s.b64 });
    expect(r.launch).toMatchObject({ status: 'sent', signature: s.sig });
    expect((await store.getLaunch(req.launchId))!.status).toBe('sent');
  });
});

describe('reconcile()', () => {
  it('places a launch whose confirmation was missed (DB blip during confirm)', async () => {
    const base = memoryStore();
    let dbDown = false;
    const store: Store = {
      ...base,
      kind: 'memory',
      transition: async (...a) => {
        if (dbDown) throw Object.assign(new Error('Connection terminated unexpectedly'), {});
        return base.transition(...a);
      },
    };
    let confirmed = false;
    const rpc = rpcMock({
      sendTransaction: async () => {
        dbDown = true; // the database drops right after broadcast
        return expectedSig;
      },
      getSignatureStatuses: () => statuses(confirmed ? { confirmationStatus: 'confirmed', err: null } : null),
    });
    const placed: LaunchRecord[] = [];
    const { l, req, s } = await liveLaunch(rpc, store, placed);
    const expectedSig = s.sig;
    confirmed = true;
    await l.send({ launchId: req.launchId, signedTx: s.b64 });
    await new Promise((r) => setTimeout(r, 30)); // background confirm runs and fails to write
    expect(placed).toHaveLength(0);
    expect((await base.getLaunch(req.launchId))!.status).toBe('sent');

    dbDown = false; // database is back → reconcile finishes it
    const res = await l.reconcile();
    expect(res.placed).toBe(1);
    expect(placed).toHaveLength(1);
    expect((await base.getLaunch(req.launchId))!.status).toBe('confirmed');
    // idempotent
    expect((await l.reconcile()).placed).toBe(0);
    expect(placed).toHaveLength(1);
  });

  it('fails on-chain errors, expires unknown signatures after 15 min, and unbroadcast rows after 5 min', async () => {
    const store = memoryStore();
    const mk = async (id: string, sig: string | null, minutesAgo: number) => {
      await store.upsertBuilding({ ...buildReq().fields, launchId: id, mint: id, creator: 'C', imageUri: null, metadataUri: 'x', website: null, twitter: null, telegram: null, devBuySol: 0, description: '' });
      await store.transition(id, ['building'], 'sent', sig ? { signature: sig } : {});
      const cur = (await store.getLaunch(id))!; // memory store hands back its own row: age it in place
      cur.createdAt = new Date(Date.now() - minutesAgo * 60_000).toISOString();
    };
    await mk('00000000-0000-4000-8000-00000000000a', 'ERRSIG', 1);
    await mk('00000000-0000-4000-8000-00000000000b', 'LOSTSIG', 20);
    await mk('00000000-0000-4000-8000-00000000000c', 'FRESHSIG', 1);
    await mk('00000000-0000-4000-8000-00000000000d', null, 10);
    const rpc = rpcMock({
      getSignatureStatuses: (params: unknown) => {
        const sig = (params as [string[]])[0][0];
        return statuses(sig === 'ERRSIG' ? { confirmationStatus: 'confirmed', err: { InstructionError: [0, 'x'] } } : null);
      },
    });
    const { impl } = mockFetch({ 'https://rpc.test': rpc.handler });
    const l = createLauncher({ env: testEnv({ DRY_RUN: 'false' }), store, fetchImpl: impl });
    const r = await l.reconcile();
    expect(r).toEqual({ placed: 0, failed: 3, pending: 1 });
    expect((await store.getLaunch('00000000-0000-4000-8000-00000000000c'))!.status).toBe('sent');
  });

  it('keeps launches pending when the RPC is unreachable', async () => {
    const store = memoryStore();
    await store.upsertBuilding({ ...buildReq().fields, launchId: '00000000-0000-4000-8000-0000000000ee', mint: 'M', creator: 'C', imageUri: null, metadataUri: 'x', website: null, twitter: null, telegram: null, devBuySol: 0, description: '' });
    await store.transition('00000000-0000-4000-8000-0000000000ee', ['building'], 'sent', { signature: 'S' });
    const l = createLauncher({ env: testEnv({ DRY_RUN: 'false' }), store, fetchImpl: mockFetch({}).impl });
    expect(await l.reconcile()).toEqual({ placed: 0, failed: 0, pending: 1 });
  });
});
